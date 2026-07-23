"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Tldraw,
  getSnapshot,
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

export default function WhiteboardCanvas({
  docId,
  content,
  canEdit,
  onSaving,
}: {
  docId: string;
  content: string | null;
  canEdit: boolean;
  onSaving?: (saving: boolean) => void;
}) {
  const save = trpc.document.updateContent.useMutation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parsed = useMemo(() => parseContent(content), [content]);
  const snapshot = parsed.kind === "snapshot" ? parsed.snapshot : undefined;

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleMount = (editor: Editor) => {
    if (!canEdit) {
      editor.updateInstanceState({ isReadonly: true });
      return;
    }

    // Save on any user edit (debounced).
    editor.store.listen(
      () => {
        onSaving?.(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const snap = getSnapshot(editor.store);
          save.mutate(
            { id: docId, content: JSON.stringify(snap) },
            { onSettled: () => onSaving?.(false) },
          );
        }, 1200);
      },
      { scope: "document", source: "user" },
    );

    // Materialize a template into real shapes the first time it's opened.
    if (parsed.kind === "template") {
      const tpl = getTemplate(parsed.templateKey);
      if (tpl && tpl.shapes.length > 0) {
        editor.createShapes(templateToPartials(tpl.shapes));
        editor.selectNone();
        editor.zoomToFit();
        // Persist immediately so viewers see the materialized board.
        onSaving?.(true);
        const snap = getSnapshot(editor.store);
        save.mutate(
          { id: docId, content: JSON.stringify(snap) },
          { onSettled: () => onSaving?.(false) },
        );
      }
    }
  };

  return (
    <div className="h-[74vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-border">
      <Tldraw snapshot={snapshot} onMount={handleMount} />
    </div>
  );
}
