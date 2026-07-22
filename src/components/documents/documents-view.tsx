"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Frame,
  FileText,
  Lock,
  Users,
  Globe,
  MoreHorizontal,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { FormSelect } from "@/components/app/form-select";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { relativeTime } from "@/lib/format";

type DocRow = RouterOutputs["document"]["list"][number];

const VIS = {
  private: { icon: Lock, label: "Private" },
  team: { icon: Users, label: "Team" },
  public: { icon: Globe, label: "Public" },
} as const;

export function DocumentsView() {
  const docs = trpc.document.list.useQuery();
  const [newOpen, setNewOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<DocRow | null>(null);
  const utils = trpc.useUtils();

  const remove = trpc.document.remove.useMutation({
    onSuccess: () => {
      utils.document.list.invalidate();
      setRemoveTarget(null);
      toast.success("Document deleted.");
    },
    onError: (e) => toast.error(e.message),
  });

  const mine = docs.data?.filter((d) => d.isOwner) ?? [];
  const team = docs.data?.filter((d) => !d.isOwner) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Documents"
        description="Whiteboards and docs. Keep yours private, or share with the team."
      >
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="size-4" />
          New
        </Button>
      </PageHeader>

      <Section
        title="Your documents"
        docs={mine}
        onRemove={setRemoveTarget}
        empty="You haven't created any documents yet."
      />
      <div className="mt-8">
        <Section
          title="Shared with the team"
          docs={team}
          empty="Nothing shared with you yet."
        />
      </div>

      <NewDocDialog open={newOpen} onOpenChange={setNewOpen} />
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Delete "${removeTarget?.title ?? ""}"?`}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() => removeTarget && remove.mutate({ id: removeTarget.id })}
      />
    </>
  );
}

function Section({
  title,
  docs,
  onRemove,
  empty,
}: {
  title: string;
  docs: DocRow[];
  onRemove?: (d: DocRow) => void;
  empty: string;
}) {
  return (
    <div>
      <h2 className="mb-3 font-heading text-sm font-semibold text-muted-foreground">
        {title}
      </h2>
      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => (
            <DocCard key={d.id} doc={d} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocCard({
  doc,
  onRemove,
}: {
  doc: DocRow;
  onRemove?: (d: DocRow) => void;
}) {
  const TypeIcon = doc.type === "whiteboard" ? Frame : FileText;
  const vis = VIS[doc.visibility as keyof typeof VIS] ?? VIS.private;
  const VisIcon = vis.icon;

  return (
    <div className="group relative">
      <Link href={`/documents/${doc.id}`}>
        <Card className="gap-0 transition-shadow hover:ring-foreground/20">
          <div className="flex items-start justify-between px-4">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <TypeIcon className="size-5 text-foreground" />
            </div>
            <Badge variant="outline">
              <VisIcon className="size-3" />
              {vis.label}
            </Badge>
          </div>
          <div className="px-4 pt-3">
            <p className="truncate font-medium">{doc.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doc.isOwner ? "You" : doc.owner.name} ·{" "}
              {relativeTime(doc.updatedAt)}
            </p>
          </div>
        </Card>
      </Link>
      {doc.isOwner && onRemove ? (
        <div className="absolute top-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded bg-background/80 p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onRemove(doc)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

function NewDocDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [type, setType] = useState("whiteboard");
  const [visibility, setVisibility] = useState("private");

  const create = trpc.document.create.useMutation({
    onSuccess: () => {
      utils.document.list.invalidate();
      toast.success("Document created.");
      onOpenChange(false);
      setTitle("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Create a whiteboard or a doc. You can change sharing later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="d-title">Title</Label>
          <Input
            id="d-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Type</Label>
            <FormSelect
              value={type}
              onValueChange={setType}
              options={[
                { value: "whiteboard", label: "Whiteboard" },
                { value: "doc", label: "Doc" },
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <FormSelect
              value={visibility}
              onValueChange={setVisibility}
              options={[
                { value: "private", label: "Private" },
                { value: "team", label: "Team" },
                { value: "public", label: "Public" },
              ]}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 1 || create.isPending}
            onClick={() =>
              create.mutate({
                title,
                type: type as "whiteboard" | "doc",
                visibility: visibility as "private" | "team" | "public",
              })
            }
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
