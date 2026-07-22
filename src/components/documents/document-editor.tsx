"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Lock, Users, Globe, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormSelect } from "@/components/app/form-select";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

const WhiteboardCanvas = dynamic(() => import("./whiteboard-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[74vh] min-h-[520px] items-center justify-center rounded-xl border border-border">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
});
const NotesEditor = dynamic(() => import("./notes-editor"), { ssr: false });

type Doc = RouterOutputs["document"]["byId"];

const VIS_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "team", label: "Team" },
  { value: "public", label: "Public" },
];

const VIS_ICON = { private: Lock, team: Users, public: Globe } as const;

export function DocumentEditor({ initial }: { initial: Doc }) {
  const [title, setTitle] = useState(initial.title);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [saving, setSaving] = useState(false);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateMeta = trpc.document.updateMeta.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const onTitle = (v: string) => {
    setTitle(v);
    if (!initial.isOwner) return;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      updateMeta.mutate({ id: initial.id, title: v });
    }, 800);
  };

  const onVisibility = (v: string) => {
    setVisibility(v);
    updateMeta.mutate({
      id: initial.id,
      visibility: v as "private" | "team" | "public",
    });
  };

  const VisIcon = VIS_ICON[visibility as keyof typeof VIS_ICON] ?? Lock;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/documents" aria-label="Back to documents" />}
        >
          <ArrowLeft className="size-4" />
        </Button>

        {initial.isOwner ? (
          <Input
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            className="h-9 max-w-sm border-transparent bg-transparent px-2 font-display text-lg font-semibold shadow-none hover:border-border focus-visible:border-ring"
          />
        ) : (
          <h1 className="font-display text-lg font-semibold">{title}</h1>
        )}

        <div className="ml-auto flex items-center gap-2">
          {saving ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Saving…
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3" /> Saved
            </span>
          )}

          {!initial.canEdit ? (
            <Badge variant="secondary">Read-only</Badge>
          ) : null}

          {initial.isOwner ? (
            <FormSelect
              value={visibility}
              onValueChange={onVisibility}
              options={VIS_OPTIONS}
              className="w-32"
            />
          ) : (
            <Badge variant="outline" className="capitalize">
              <VisIcon className="size-3" />
              {visibility}
            </Badge>
          )}
        </div>
      </div>

      {initial.type === "whiteboard" ? (
        <WhiteboardCanvas
          docId={initial.id}
          content={initial.content}
          canEdit={initial.canEdit}
          onSaving={setSaving}
        />
      ) : (
        <NotesEditor
          docId={initial.id}
          content={initial.content}
          canEdit={initial.canEdit}
          onSaving={setSaving}
        />
      )}
    </>
  );
}
