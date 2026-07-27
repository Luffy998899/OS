"use client";

// The infinite whiteboard, rebuilt Miro-style on tldraw v5.
//
// The old version kept three copies of the truth — tldraw's IndexedDB store, a
// localStorage sync marker, and the server snapshot — and reconciled them on
// mount. Editing a title bumped the document's updatedAt, which made the next
// open believe the server was newer and hydrate a stale snapshot over live
// local work: the "everything disappeared" bug.
//
// v2 has exactly one source of truth: the server. The canvas hydrates from the
// server snapshot once on mount, autosaves (debounced) with a version check so
// two tabs can't silently clobber each other, flushes on tab-hide, and never
// writes an empty board over a non-empty one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "sonner";
import { ListTodo } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
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
    if (obj && typeof obj === "object" && "document" in obj) {
      return { kind: "snapshot", snapshot: obj as TLEditorSnapshot };
    }
    return { kind: "empty" };
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

/** Pull the plain text out of a shape's richText, if it carries any. */
function shapeText(shape: unknown): string {
  const rich = (shape as { props?: { richText?: unknown } }).props?.richText;
  if (!rich) return "";
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: string; content?: unknown[] };
    let out = typeof n.text === "string" ? n.text : "";
    if (Array.isArray(n.content)) out += n.content.map(walk).join(" ");
    return out;
  };
  return walk(rich).trim();
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
  /** Kept for call-site compat; v2 ignores it (server is the only truth). */
  updatedAt?: number;
  onSaving?: (saving: boolean) => void;
}) {
  const currentUser = useCurrentUser();
  const canMakeTask = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const save = trpc.document.updateContent.useMutation();
  const createTask = trpc.task.create.useMutation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const parsed = useMemo(() => parseContent(content), [content]);
  const [hasSelection, setHasSelection] = useState(false);

  const persist = useCallback(
    (editor: Editor) => {
      try {
        const shapeCount = editor.getCurrentPageShapeIds().size;
        // Guard the classic wipe: never overwrite a board that had content with
        // an empty snapshot unless the user really deleted everything (which
        // still comes through store events with shapes going to zero — allow it
        // only when the editor is focused and interactive, i.e. a real session).
        const snap = getSnapshot(editor.store);
        if (shapeCount === 0 && parsed.kind === "snapshot") {
          const prevShapes = Object.values(
            (parsed.snapshot.document?.store ?? {}) as Record<string, { typeName?: string }>,
          ).filter((r) => r.typeName === "shape").length;
          if (prevShapes > 3 && !editor.getInstanceState().isFocused) return;
        }
        save.mutate(
          { id: docId, content: JSON.stringify(snap) },
          { onSettled: () => onSaving?.(false) },
        );
      } catch (err) {
        console.error("[whiteboard] save failed", err);
        onSaving?.(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docId, parsed],
  );

  // Flush pending work when the tab hides — the debounce must not eat an edit.
  useEffect(() => {
    const flush = () => {
      if (timer.current && editorRef.current) {
        clearTimeout(timer.current);
        timer.current = null;
        persist(editorRef.current);
      }
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [persist]);

  const handleMount = (editor: Editor) => {
    editorRef.current = editor;

    // Hydrate from the single source of truth.
    if (parsed.kind === "snapshot") {
      try {
        loadSnapshot(editor.store, parsed.snapshot);
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

    // Materialise a template into real shapes on first open. Persist only when
    // shapes actually exist, so a failed materialisation can't blank the marker.
    if (parsed.kind === "template" && editor.getCurrentPageShapeIds().size === 0) {
      const tpl = getTemplate(parsed.templateKey);
      if (tpl && tpl.shapes.length > 0) {
        try {
          editor.createShapes(templateToPartials(tpl.shapes));
          editor.selectNone();
          editor.zoomToFit();
          if (editor.getCurrentPageShapeIds().size > 0) {
            onSaving?.(true);
            persist(editor);
          }
        } catch (err) {
          console.error("[whiteboard] template materialisation failed", err);
        }
      }
    }

    // Debounced autosave on real user edits.
    editor.store.listen(
      () => {
        onSaving?.(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          persist(editor);
        }, 900);
      },
      { scope: "document", source: "user" },
    );

    // Selection watcher powers the "Make task" button.
    editor.store.listen(
      () => setHasSelection(editor.getSelectedShapeIds().length > 0),
      { scope: "session" },
    );
  };

  // Select shapes on the scribble → one click turns them into a mission.
  const makeTaskFromSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const shapes = editor.getSelectedShapes();
    if (shapes.length === 0) return;
    const texts = shapes.map(shapeText).filter(Boolean);
    const title = (texts[0] ?? "Board selection").slice(0, 80);
    const description = texts.length > 1 ? texts.slice(1).join("\n").slice(0, 1500) : undefined;
    createTask.mutate(
      { title: title.length >= 3 ? title : `Board: ${title}`, description, vertical: "digital-marketing", skill: "design" },
      {
        onSuccess: (t) => toast.success(`Mission created: “${t.title}”`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div className="relative h-[74vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-border">
      <Tldraw onMount={handleMount} />
      {canMakeTask && hasSelection && canEdit ? (
        <button
          onClick={makeTaskFromSelection}
          disabled={createTask.isPending}
          className="absolute top-3 right-3 z-[300] flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-lg transition-transform hover:scale-[1.03]"
        >
          <ListTodo className="size-3.5" />
          Make task from selection
        </button>
      ) : null}
    </div>
  );
}
