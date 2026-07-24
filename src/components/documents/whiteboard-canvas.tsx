"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Tldraw,
  getSnapshot,
  loadSnapshot,
  toRichText,
  createShapeId,
  type Editor,
  type TLEditorSnapshot,
  type TLShapePartial,
} from "tldraw";
import "tldraw/tldraw.css";
import { trpc } from "@/lib/trpc/client";
import { getTemplate, type TemplateShape } from "@/lib/whiteboard-templates";

type ParsedContent =
  | { kind: "snapshot"; snapshot: TLEditorSnapshot }
  | { kind: "template"; templateKey: string }
  | { kind: "empty" };

function parseContent(content: string | null): ParsedContent {
  if (!content) return { kind: "empty" };
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === "object" && "__auxaTemplate" in obj) {
      return { kind: "template", templateKey: String(obj.__auxaTemplate) };
    }
    return { kind: "snapshot", snapshot: obj as TLEditorSnapshot };
  } catch {
    return { kind: "empty" };
  }
}

function templateToPartials(shapes: TemplateShape[]): TLShapePartial[] {
  return shapes.map((s) => {
    const id = createShapeId();
    if (s.kind === "text") {
      return {
        id,
        type: "text",
        x: s.x,
        y: s.y,
        props: { richText: toRichText(s.text), size: s.size ?? "m" },
      } as TLShapePartial;
    }
    if (s.kind === "note") {
      return {
        id,
        type: "note",
        x: s.x,
        y: s.y,
        props: { richText: toRichText(s.text), color: s.color ?? "yellow" },
      } as TLShapePartial;
    }
    return {
      id,
      type: "geo",
      x: s.x,
      y: s.y,
      props: {
        geo: s.geo ?? "rectangle",
        w: s.w,
        h: s.h,
        color: s.color ?? "grey",
        fill: s.fill ?? "none",
        richText: toRichText(s.text ?? ""),
      },
    } as TLShapePartial;
  });
}

// Per-browser record of the last server revision we've reconciled for a doc.
// Lets us keep local edits (durable via persistenceKey) while still pulling in
// changes made on another device. Wrapped so private-mode / SSR never throws.
function readSynced(docId: string): number {
  try {
    return Number(localStorage.getItem(`auxa-wb-sync-${docId}`)) || 0;
  } catch {
    return 0;
  }
}
function writeSynced(docId: string, ts: number) {
  try {
    localStorage.setItem(`auxa-wb-sync-${docId}`, String(ts));
  } catch {
    /* ignore */
  }
}

export default function WhiteboardCanvas({
  docId,
  content,
  canEdit,
  updatedAt,
  onSaving,
}: {
  docId: string;
  content: string | null;
  canEdit: boolean;
  /** Server revision time (ms) of `content`, for cross-device reconciliation. */
  updatedAt: number;
  onSaving?: (saving: boolean) => void;
}) {
  const save = trpc.document.updateContent.useMutation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = useMemo(() => parseContent(content), [content]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const persist = (editor: Editor) => {
    try {
      const snap = getSnapshot(editor.store);
      save.mutate(
        { id: docId, content: JSON.stringify(snap) },
        {
          onSuccess: (res) => {
            // Remember this revision so a later reload trusts the local copy
            // instead of re-hydrating the (identical) server snapshot.
            if (res?.updatedAt) writeSynced(docId, res.updatedAt);
          },
          onSettled: () => onSaving?.(false),
        },
      );
    } catch (err) {
      console.error("[whiteboard] save failed", err);
      onSaving?.(false);
    }
  };

  // All snapshot loading & template materialisation happens here (never in
  // render), each guarded, so a bad payload can't blank the canvas. The store
  // is also persisted to the browser's IndexedDB via `persistenceKey`, so work
  // survives reloads and flaky networks even if a server save doesn't land.
  const handleMount = (editor: Editor) => {
    const localCount = editor.getCurrentPageShapeIds().size;
    const synced = readSynced(docId);
    // The server has content this browser hasn't reconciled yet (first open on
    // this device, or someone edited it elsewhere).
    const serverAhead = updatedAt > synced;

    if (parsed.kind === "snapshot" && (localCount === 0 || serverAhead)) {
      try {
        loadSnapshot(editor.store, parsed.snapshot);
        writeSynced(docId, updatedAt);
      } catch (err) {
        console.error("[whiteboard] could not load snapshot", err);
      }
    }

    if (!canEdit) {
      try {
        editor.updateInstanceState({ isReadonly: true });
      } catch {
        /* ignore */
      }
      return;
    }

    // Materialize a template into real shapes the first time it's opened on this
    // browser. Only persist when shapes were actually created — otherwise a
    // failed materialization would overwrite the template marker with an empty
    // board (the classic "it disappeared" bug).
    if (parsed.kind === "template" && localCount === 0) {
      const tpl = getTemplate(parsed.templateKey);
      if (tpl && tpl.shapes.length > 0) {
        let created = false;
        try {
          editor.createShapes(templateToPartials(tpl.shapes));
          editor.selectNone();
          editor.zoomToFit();
          created = editor.getCurrentPageShapeIds().size > 0;
        } catch (err) {
          console.error("[whiteboard] template materialisation failed", err);
        }
        if (created) {
          onSaving?.(true);
          persist(editor);
        }
      }
    }

    // Debounced autosave on user edits.
    editor.store.listen(
      () => {
        onSaving?.(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => persist(editor), 1000);
      },
      { scope: "document", source: "user" },
    );
  };

  return (
    <div className="h-[74vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-border">
      <Tldraw persistenceKey={`auxa-wb-${docId}`} onMount={handleMount} />
    </div>
  );
}
