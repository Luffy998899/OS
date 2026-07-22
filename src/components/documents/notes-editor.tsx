"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Textarea } from "@/components/ui/textarea";

export default function NotesEditor({
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
  const [value, setValue] = useState(content ?? "");
  const save = trpc.document.updateContent.useMutation();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChange = (v: string) => {
    setValue(v);
    if (!canEdit) return;
    onSaving?.(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate(
        { id: docId, content: v },
        { onSettled: () => onSaving?.(false) },
      );
    }, 1000);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!canEdit}
        placeholder={canEdit ? "Start writing…" : "This document is empty."}
        className="min-h-[60vh] resize-none border-0 bg-transparent p-0 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
