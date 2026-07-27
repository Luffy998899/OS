"use client";

// The developer city, inside the doors. Tower 1 (pipeline) stacks in-flight
// projects floor by floor with deadlines and per-floor task assignment; Tower 2
// (complete) holds shipped sites with code/live links and the AI audit; the
// bungalow lists the internal tools. Each floor carries a client share link and
// an interactive data board for the site's facts.

import { useState } from "react";
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Code2,
  ExternalLink,
  Home,
  Landmark,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/app/form-select";
import { TaskStatusBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type BuildingKey = "pipeline" | "complete" | "tools";

const BUILDING_META: Record<BuildingKey, { label: string; icon: typeof Building2; blurb: string }> = {
  pipeline: {
    label: "Tower 1 — Pipeline",
    icon: Building2,
    blurb: "Always on. Every floor is a project being built; the deadline is the floor's interior hand-over.",
  },
  complete: {
    label: "Tower 2 — Completed",
    icon: Landmark,
    blurb: "Shipped sites, ten floors. AI re-stacks it by niche monthly and keeps auditing the task lists.",
  },
  tools: {
    label: "The Bungalow — Internal tools",
    icon: Home,
    blurb: "Sync AI, the prompt library, the portfolio site and the niche research packs.",
  },
};

const AUDIT_STYLE: Record<string, string> = {
  pass: "bg-success/10 text-success",
  warn: "bg-warning/10 text-warning",
  fail: "bg-destructive/10 text-destructive",
  unaudited: "bg-muted text-muted-foreground",
};

export function DevCityPanel({ initialBuilding = "pipeline" }: { initialBuilding?: BuildingKey }) {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const city = trpc.project.city.useQuery();
  const [building, setBuilding] = useState<BuildingKey>(initialBuilding);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => utils.project.city.invalidate();
  const rearrange = trpc.project.rearrange.useMutation({
    onSuccess: () => {
      toast.success("Tower re-stacked by niche.");
      refresh();
    },
  });
  const audit = trpc.project.auditSweep.useMutation({
    onSuccess: (r) => {
      toast.success(`Audit sweep: ${r.checked} floors checked, ${r.flagged} flagged.`);
      refresh();
    },
  });

  if (floorId) {
    return <FloorDetail id={floorId} onBack={() => setFloorId(null)} canManage={canManage} />;
  }

  const floors = city.data?.[building] ?? [];
  const Icon = BUILDING_META[building].icon;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(BUILDING_META) as BuildingKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setBuilding(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              building === key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {BUILDING_META[key].label}
            <span className="font-mono opacity-60">{city.data?.[key].length ?? 0}</span>
          </button>
        ))}
        <span className="ml-auto flex gap-1.5">
          {canManage && building === "complete" ? (
            <>
              <Button size="xs" variant="outline" disabled={audit.isPending} onClick={() => audit.mutate()}>
                <ShieldCheck className="size-3" />
                AI audit sweep
              </Button>
              <Button size="xs" variant="outline" disabled={rearrange.isPending} onClick={() => rearrange.mutate()}>
                <RefreshCw className="size-3" />
                Re-stack by niche
              </Button>
            </>
          ) : null}
          {canManage ? (
            <Button size="xs" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3" />
              New floor
            </Button>
          ) : null}
        </span>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Icon className="mt-0.5 size-3.5 shrink-0" />
        {BUILDING_META[building].blurb}
      </p>

      {city.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : floors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {building === "pipeline"
            ? "No projects in flight — add the first floor."
            : building === "complete"
              ? "Nothing topped out yet. Complete a pipeline floor to move it here."
              : "No internal tools listed."}
        </p>
      ) : (
        // The tower reads top floor first, like a lift panel.
        <ul className="space-y-1.5">
          {[...floors].reverse().map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setFloorId(p.id)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-foreground/25"
              >
                <span className="flex size-8 shrink-0 flex-col items-center justify-center rounded bg-muted font-mono text-[0.6rem] leading-none font-bold">
                  <span className="opacity-50">F</span>
                  {p.floor}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.name}
                    {p.client ? <span className="ml-1.5 text-xs text-muted-foreground">· {p.client.companyName}</span> : null}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {p.niche ? <span>{p.niche}</span> : null}
                    {building === "pipeline" && p.deadline ? (
                      <span className={cn("flex items-center gap-1", new Date(p.deadline) < new Date() && "font-medium text-destructive")}>
                        <Timer className="size-3" />
                        interior due {relativeTime(p.deadline)}
                      </span>
                    ) : null}
                    {building === "tools" && p.toolDesc ? <span>{p.toolDesc}</span> : null}
                  </p>
                </div>
                {building !== "tools" ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="w-24">
                      <div className="mb-0.5 flex justify-between font-mono text-[0.6rem] text-muted-foreground">
                        <span>
                          {p.progress.done}/{p.progress.total}
                        </span>
                        <span>tasks</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground transition-all"
                          style={{ width: `${p.progress.total ? (p.progress.done / p.progress.total) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    {building === "complete" ? (
                      <span className={cn("rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase", AUDIT_STYLE[p.auditStatus])}>
                        {p.auditStatus}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <CreateFloorDialog open={createOpen} onOpenChange={setCreateOpen} building={building} onCreated={refresh} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FloorDetail({ id, onBack, canManage }: { id: string; onBack: () => void; canManage: boolean }) {
  const utils = trpc.useUtils();
  const floor = trpc.project.floor.useQuery({ id });
  const refresh = () => {
    utils.project.floor.invalidate({ id });
    utils.project.city.invalidate();
  };
  const update = trpc.project.update.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const complete = trpc.project.complete.useMutation({
    onSuccess: () => {
      toast.success("Topped out — moved to the completed tower.");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const convert = trpc.project.convertRequest.useMutation({
    onSuccess: () => {
      toast.success("Converted into a floor task.");
      refresh();
    },
  });
  const dismiss = trpc.project.dismissRequest.useMutation({ onSuccess: refresh });

  const p = floor.data;
  if (floor.isLoading || !p) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/f/${p.shareToken}` : `/f/${p.shareToken}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Back to the tower
        </button>
        <div className="flex items-center gap-1.5">
          {p.siteUrl ? (
            <Button size="xs" variant="outline" nativeButton={false} render={<a href={p.siteUrl} target="_blank" rel="noreferrer" />}>
              <ExternalLink className="size-3" />
              Live site
            </Button>
          ) : null}
          {p.repoUrl ? (
            <Button size="xs" variant="outline" nativeButton={false} render={<a href={p.repoUrl} target="_blank" rel="noreferrer" />}>
              <Code2 className="size-3" />
              Code base
            </Button>
          ) : null}
          {canManage && p.buildingKey === "pipeline" ? (
            <Button size="xs" disabled={complete.isPending} onClick={() => complete.mutate({ id: p.id })}>
              <Check className="size-3" />
              Top out
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <p className="font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase">
          Floor {p.floor} · {BUILDING_META[p.buildingKey as BuildingKey]?.label ?? p.buildingKey}
        </p>
        <h3 className="font-display text-lg font-semibold">{p.name}</h3>
        <p className="text-xs text-muted-foreground">
          {p.client?.companyName ?? "Internal"}
          {p.niche ? ` · ${p.niche}` : ""}
          {p.deadline ? ` · interior due ${relativeTime(p.deadline)}` : ""}
        </p>
        {p.auditNote ? (
          <p className={cn("mt-1.5 flex items-center gap-1.5 rounded px-2 py-1 text-xs", AUDIT_STYLE[p.auditStatus])}>
            <ShieldCheck className="size-3" />
            {p.auditNote}
          </p>
        ) : null}
      </div>

      {/* Client share link */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2.5">
        <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{shareUrl}</code>
        <Button
          size="xs"
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(shareUrl).then(
              () => toast.success("Share link copied — send it to the client."),
              () => toast.error("Couldn't copy."),
            )
          }
        >
          <Copy className="size-3" />
          Copy
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Tasks on this floor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              Floor tasks{" "}
              <span className="font-mono text-xs text-muted-foreground">
                {p.progress.done}/{p.progress.total}
              </span>
            </h4>
            {canManage ? <AddFloorTask projectId={p.id} onAdded={refresh} /> : null}
          </div>
          {p.tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              Nothing assigned on this floor yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {p.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {t.assignee?.name ?? "Unassigned"}
                    <TaskStatusBadge status={t.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Data board */}
        <DataBoard
          projectId={p.id}
          entries={p.dataBoard}
          canManage={canManage}
          onSaved={refresh}
        />
      </div>

      {/* Client requests */}
      {p.requests.length > 0 ? (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Client requests from the share page</h4>
          <ul className="space-y-1.5">
            {p.requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p>
                    <span className="font-medium">{r.author}:</span> {r.body}
                  </p>
                  {canManage && r.status === "pending" ? (
                    <span className="flex shrink-0 gap-1">
                      <Button size="xs" onClick={() => convert.mutate({ id: r.id })}>
                        <Check className="size-3" />
                        Make task
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => dismiss.mutate({ id: r.id })}>
                        <X className="size-3" />
                      </Button>
                    </span>
                  ) : (
                    <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground uppercase">{r.status}</span>
                  )}
                </div>
                {r.reply ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="mt-0.5 size-3 shrink-0" />
                    {r.reply}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? <FloorMeta project={p} onSave={(data) => update.mutate({ id: p.id, ...data })} saving={update.isPending} /> : null}
    </div>
  );
}

function DataBoard({
  projectId,
  entries,
  canManage,
  onSaved,
}: {
  projectId: string;
  entries: { label: string; value: string }[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(entries);
  const [dirty, setDirty] = useState(false);
  const save = trpc.project.setDataBoard.useMutation({
    onSuccess: () => {
      toast.success("Data board pinned.");
      setDirty(false);
      onSaved();
    },
  });

  const set = (i: number, patch: Partial<{ label: string; value: string }>) => {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Data board</h4>
        {canManage ? (
          <span className="flex gap-1.5">
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setRows((r) => [...r, { label: "", value: "" }]);
                setDirty(true);
              }}
            >
              <Plus className="size-3" />
              Row
            </Button>
            <Button size="xs" disabled={!dirty || save.isPending} onClick={() => save.mutate({ id: projectId, entries: rows.filter((r) => r.label.trim()) })}>
              <Check className="size-3" />
              Save
            </Button>
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          Pin the site's facts here — client address, contact, gmail id, hosting…
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {canManage ? (
                <>
                  <Input value={row.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label" className="h-8 w-32 text-xs" />
                  <Input value={row.value} onChange={(e) => set(i, { value: e.target.value })} placeholder="Value" className="h-8 flex-1 text-xs" />
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      setRows((r) => r.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </>
              ) : (
                <p className="flex flex-1 items-baseline gap-2 rounded border border-border px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-muted-foreground">{row.label}</span>
                  <span className="truncate">{row.value}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddFloorTask({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const users = trpc.user.list.useQuery(undefined, { enabled: open });
  const [assigneeId, setAssigneeId] = useState("");
  const create = trpc.task.create.useMutation({
    onSuccess: () => {
      toast.success("Feature added to the floor.");
      setOpen(false);
      setTitle("");
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });
  const floor = trpc.project.floor.useQuery({ id: projectId });

  return (
    <>
      <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-3" />
        Feature
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a feature to this floor</DialogTitle>
            <DialogDescription>Which feature is required in the building — assigned right here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="feat-title">Feature</Label>
              <Input id="feat-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checkout flow with UPI" />
            </div>
            <div className="space-y-1.5">
              <Label>Assign to</Label>
              <FormSelect
                value={assigneeId}
                onValueChange={setAssigneeId}
                placeholder="Unassigned"
                options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={title.trim().length < 3 || create.isPending}
              onClick={() =>
                create.mutate({
                  title: title.trim(),
                  vertical: "website-dev",
                  skill: "dev",
                  assigneeId: assigneeId || undefined,
                  clientId: floor.data?.clientId ?? undefined,
                  projectId,
                } as Parameters<typeof create.mutate>[0])
              }
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FloorMeta({
  project,
  onSave,
  saving,
}: {
  project: { name: string; niche: string | null; repoUrl: string | null; siteUrl: string | null; deadline: Date | null };
  onSave: (data: { niche?: string | null; repoUrl?: string | null; siteUrl?: string | null; deadline?: Date | null }) => void;
  saving: boolean;
}) {
  const [niche, setNiche] = useState(project.niche ?? "");
  const [repoUrl, setRepoUrl] = useState(project.repoUrl ?? "");
  const [siteUrl, setSiteUrl] = useState(project.siteUrl ?? "");
  const [deadline, setDeadline] = useState(
    project.deadline ? new Date(project.deadline).toISOString().slice(0, 10) : "",
  );
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Floor settings</h4>
      <div className="grid grid-cols-2 gap-2">
        <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Niche (salon, D2C, …)" className="h-8 text-xs" />
        <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-8 text-xs" />
        <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="Repo URL" className="h-8 text-xs" />
        <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="Live site URL" className="h-8 text-xs" />
      </div>
      <div className="flex justify-end">
        <Button
          size="xs"
          disabled={saving}
          onClick={() =>
            onSave({
              niche: niche.trim() || null,
              repoUrl: repoUrl.trim() || null,
              siteUrl: siteUrl.trim() || null,
              deadline: deadline ? new Date(`${deadline}T18:00:00`) : null,
            })
          }
        >
          <Check className="size-3" />
          Save settings
        </Button>
      </div>
    </div>
  );
}

function CreateFloorDialog({
  open,
  onOpenChange,
  building,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  building: BuildingKey;
  onCreated: () => void;
}) {
  const clients = trpc.clients.list.useQuery(undefined, { enabled: open });
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [niche, setNiche] = useState("");
  const [deadline, setDeadline] = useState("");
  const [toolDesc, setToolDesc] = useState("");
  const create = trpc.project.create.useMutation({
    onSuccess: () => {
      toast.success("Floor added.");
      onOpenChange(false);
      setName("");
      setNiche("");
      setDeadline("");
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New floor in {BUILDING_META[building].label}</DialogTitle>
          <DialogDescription>{BUILDING_META[building].blurb}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="floor-name">Project name</Label>
            <Input id="floor-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Zen Salon website" />
          </div>
          {building === "tools" ? (
            <div className="space-y-1.5">
              <Label htmlFor="tool-desc">What it does</Label>
              <Input id="tool-desc" value={toolDesc} onChange={(e) => setToolDesc(e.target.value)} placeholder="One line on the tool" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Client</Label>
                  <FormSelect
                    value={clientId}
                    onValueChange={setClientId}
                    placeholder="Internal"
                    options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.companyName }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="floor-niche">Niche</Label>
                  <Input id="floor-niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="salon / D2C / clinic" />
                </div>
              </div>
              {building === "pipeline" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="floor-deadline">Interior deadline</Label>
                  <Input id="floor-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
              ) : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={name.trim().length < 2 || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                buildingKey: building,
                clientId: clientId || undefined,
                niche: niche.trim() || undefined,
                deadline: deadline ? new Date(`${deadline}T18:00:00`) : undefined,
                toolDesc: toolDesc.trim() || undefined,
              })
            }
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add floor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
