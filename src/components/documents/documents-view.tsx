"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { TEMPLATES, CATEGORIES } from "@/lib/whiteboard-templates";
import { cn } from "@/lib/utils";

type DocRow = RouterOutputs["document"]["list"][number];

const VIS = {
  private: { icon: Lock, label: "Private" },
  team: { icon: Users, label: "Team" },
  public: { icon: Globe, label: "Public" },
} as const;

export function DocumentsView() {
  const router = useRouter();
  const docs = trpc.document.list.useQuery();
  const [newOpen, setNewOpen] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
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

  const createFromTemplate = trpc.document.create.useMutation({
    onSuccess: (doc) => {
      utils.document.list.invalidate();
      router.push(`/documents/${doc.id}`);
    },
    onError: (e) => {
      setCreatingKey(null);
      toast.error(e.message);
    },
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

      {/* Miro-style: pick a template to spin up a board instantly. */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">
            Start from a template
          </h2>
          <button
            onClick={() => setNewOpen(true)}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Browse all {TEMPLATES.length} →
          </button>
        </div>
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {TEMPLATES.filter((t) => t.key !== "blank")
            .slice(0, 12)
            .map((t) => (
              <button
                key={t.key}
                disabled={createFromTemplate.isPending}
                onClick={() => {
                  setCreatingKey(t.key);
                  createFromTemplate.mutate({
                    title: t.name,
                    type: "whiteboard",
                    visibility: "private",
                    template: t.key,
                  });
                }}
                className="w-40 shrink-0 rounded-lg border border-border p-2 text-left transition-colors hover:border-foreground/40"
              >
                <div className="relative">
                  <TemplatePreview thumb={t.thumb} />
                  {creatingKey === t.key ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/60">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  ) : null}
                </div>
                <p className="mt-1.5 truncate text-xs font-medium">{t.name}</p>
                <p className="truncate text-[0.7rem] text-muted-foreground">{t.category}</p>
              </button>
            ))}
        </div>
      </div>

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

      <TemplateGalleryDialog open={newOpen} onOpenChange={setNewOpen} />
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

function TemplatePreview({ thumb }: { thumb: string }) {
  const box = "rounded-[3px] border border-border/70 bg-background";
  const bar = "rounded-[2px] bg-muted-foreground/40";

  const cols = (n: number, notes = 2) => (
    <div className="flex h-full w-full items-stretch gap-1">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={cn("flex flex-1 flex-col gap-1 p-1", box)}>
          {Array.from({ length: notes }).map((__, j) => (
            <div key={j} className={cn("h-1.5", bar)} />
          ))}
        </div>
      ))}
    </div>
  );

  const gridN = (cols: number, rows: number) => (
    <div
      className="grid h-full w-full gap-1"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {Array.from({ length: cols * rows }).map((_, i) => (
        <div key={i} className={box} />
      ))}
    </div>
  );

  let inner: React.ReactNode;
  switch (thumb) {
    case "columns3":
      inner = cols(3);
      break;
    case "columns4":
      inner = cols(4, 1);
      break;
    case "grid2x2":
      inner = gridN(2, 2);
      break;
    case "grid3":
      inner = gridN(3, 2);
      break;
    case "sections":
      inner = gridN(3, 3);
      break;
    case "rows":
      inner = (
        <div className="flex h-full w-full flex-col gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={cn("flex-1", box)} />
          ))}
        </div>
      );
      break;
    case "central":
    default:
      inner = (
        <div className="relative h-full w-full">
          <div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />
          {["left-1 top-1", "right-1 top-1", "bottom-1 left-1", "bottom-1 right-1"].map(
            (pos) => (
              <div
                key={pos}
                className={cn("absolute size-2.5 rounded-[3px] bg-muted-foreground/50", pos)}
              />
            ),
          )}
        </div>
      );
  }

  return <div className="h-20 w-full overflow-hidden rounded-md bg-muted/50 p-2">{inner}</div>;
}

function TemplateGalleryDialog({
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
  const [template, setTemplate] = useState("blank");
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");

  const create = trpc.document.create.useMutation({
    onSuccess: () => {
      utils.document.list.invalidate();
      toast.success("Document created.");
      onOpenChange(false);
      setTitle("");
      setTemplate("blank");
      setSearch("");
      setCategory("All");
    },
    onError: (e) => toast.error(e.message),
  });

  const visible = TEMPLATES.filter((t) => {
    const inCat = category === "All" || t.category === category || t.key === "blank";
    const inSearch = t.name.toLowerCase().includes(search.trim().toLowerCase());
    return inCat && inSearch;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-3xl!">
        <div className="flex max-h-[82vh] flex-col">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>
              Pick a template to start — you can change sharing anytime.
            </DialogDescription>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                aria-label="Title"
              />
              <FormSelect
                value={type}
                onValueChange={setType}
                className="w-full sm:w-36"
                options={[
                  { value: "whiteboard", label: "Whiteboard" },
                  { value: "doc", label: "Doc" },
                ]}
              />
              <FormSelect
                value={visibility}
                onValueChange={setVisibility}
                className="w-full sm:w-32"
                options={[
                  { value: "private", label: "Private" },
                  { value: "team", label: "Team" },
                  { value: "public", label: "Public" },
                ]}
              />
            </div>
          </DialogHeader>

          {type === "doc" ? (
            <div className="flex-1 p-8 text-center text-sm text-muted-foreground">
              A blank document will be created. Give it a title and click Create.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* Category sidebar (desktop) */}
              <aside className="hidden w-48 shrink-0 border-r border-border p-3 sm:block">
                <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                  Categories
                </p>
                <nav className="space-y-0.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={cn(
                        "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        category === c
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </nav>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="border-b border-border p-3">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search templates…"
                    className="h-9"
                  />
                  {/* Category chips (mobile) */}
                  <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 sm:hidden">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c}
                        onClick={() => setCategory(c)}
                        className={cn(
                          "shrink-0 rounded-full border px-2.5 py-1 text-xs",
                          category === c
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {c === "All" ? "All" : c.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {visible.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTemplate(t.key)}
                        className={cn(
                          "rounded-lg border p-2 text-left transition-colors",
                          template === t.key
                            ? "border-foreground ring-2 ring-foreground/20"
                            : "border-border hover:border-foreground/40",
                        )}
                      >
                        <TemplatePreview thumb={t.thumb} />
                        <p className="mt-1.5 text-xs font-medium">{t.name}</p>
                        <p className="line-clamp-1 text-[0.7rem] text-muted-foreground">
                          {t.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-border p-4">
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
                  template: type === "whiteboard" ? template : undefined,
                })
              }
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
