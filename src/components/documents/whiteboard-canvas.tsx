"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Tldraw,
  getSnapshot,
  type Editor,
  type TLEditorSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";
import { trpc } from "@/lib/trpc/client";

function safeParse(content: string | null): TLEditorSnapshot | undefined {
  if (!content) return undefined;
  try {
    return JSON.parse(content) as TLEditorSnapshot;
  } catch {
    return undefined;
  }
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
  const snapshot = useMemo(() => safeParse(content), [content]);

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
  };

  return (
    <div className="h-[74vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-border">
      <Tldraw snapshot={snapshot} onMount={handleMount} />
    </div>
  );
}
