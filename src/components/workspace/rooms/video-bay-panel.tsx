"use client";

// The video editing bay: what's on the timeline right now (everyone can see),
// the delivery countdown, the pending queue in whiteboard order, and the script
// drawer with one-tap copy for the editor.

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Loader2,
  Play,
  Plus,
  ScrollText,
  Timer,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/app/form-select";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function Countdown({ to }: { to: Date | string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(to).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return (
    <span className={cn("font-mono text-xs tabular-nums", overdue ? "text-destructive" : "text-warning")}>
      {overdue ? "overdue " : "due in "}
      {h > 0 ? `${h}h ` : ""}
      {m}m
    </span>
  );
}

export function VideoBayPanel() {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const bay = trpc.video.state.useQuery(undefined, { refetchInterval: 8000 });
  const [addOpen, setAddOpen] = useState(false);
  const [scriptFor, setScriptFor] = useState<string | null>(null);

  const refresh = () => {
    utils.video.state.invalidate();
    utils.workspace.state.invalidate();
  };
  const start = trpc.video.start.useMutation({
    onSuccess: () => {
      toast.success("On the timeline — the bay shows you're cutting.");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const deliver = trpc.video.deliver.useMutation({
    onSuccess: () => {
      toast.success("Delivered. 🎬");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const requeue = trpc.video.requeue.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const reorder = trpc.video.reorder.useMutation({ onSuccess: refresh });
  const remove = trpc.video.remove.useMutation({ onSuccess: refresh });

  const editing = bay.data?.editing;
  const queued = bay.data?.queued ?? [];

  if (bay.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Now editing */}
      <div
        className={cn(
          "rounded-xl border p-4",
          editing ? "border-warning/40 bg-warning/5" : "border-border bg-muted/30",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Clapperboard className={cn("size-4", editing ? "text-warning" : "text-muted-foreground")} />
            <div>
              <p className="text-sm font-semibold">
                {editing ? editing.title : "The timeline is idle"}
              </p>
              <p className="text-xs text-muted-foreground">
                {editing
                  ? `${editing.client?.companyName ?? "Internal"} · ${editing.editor?.name ?? "—"} in the chair${editing.startedAt ? ` · started ${relativeTime(editing.startedAt)}` : ""}`
                  : "Pull the next video off the whiteboard to start cutting."}
              </p>
            </div>
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              {editing.deliverBy ? <Countdown to={editing.deliverBy} /> : null}
              <Button
                size="xs"
                variant="outline"
                onClick={() => setScriptFor(scriptFor === editing.id ? null : editing.id)}
              >
                <ScrollText className="size-3" />
                Script
              </Button>
              <Button size="xs" variant="outline" disabled={requeue.isPending} onClick={() => requeue.mutate({ id: editing.id })}>
                <Undo2 className="size-3" />
                Requeue
              </Button>
              <Button size="xs" disabled={deliver.isPending} onClick={() => deliver.mutate({ id: editing.id })}>
                <Check className="size-3" />
                Delivered
              </Button>
            </div>
          ) : null}
        </div>
        {editing && scriptFor === editing.id ? (
          <ScriptDrawer jobId={editing.id} script={editing.script} onSaved={refresh} />
        ) : null}
      </div>

      {/* Queue */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Pending on the whiteboard{" "}
            <span className="font-mono text-xs text-muted-foreground">{queued.length}</span>
          </h3>
          {canManage ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              Queue a video
            </Button>
          ) : null}
        </div>
        {queued.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Queue clear — nothing pending in line.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {queued.map((job, i) => (
              <li key={job.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-2.5 p-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted font-mono text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.client?.companyName ?? "Internal"}
                      {job.priority === "urgent" || job.priority === "high" ? (
                        <span className={cn("ml-1.5 font-medium", job.priority === "urgent" ? "text-destructive" : "text-warning")}>
                          {job.priority}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {job.deliverBy ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Timer className="size-3" />
                      <Countdown to={job.deliverBy} />
                    </span>
                  ) : null}
                  <Button size="icon-xs" variant="ghost" onClick={() => setScriptFor(scriptFor === job.id ? null : job.id)} title="Script">
                    {scriptFor === job.id ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  </Button>
                  {canManage ? (
                    <>
                      <Button size="icon-xs" variant="ghost" disabled={i === 0} onClick={() => reorder.mutate({ id: job.id, direction: "up" })}>
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" disabled={i === queued.length - 1} onClick={() => reorder.mutate({ id: job.id, direction: "down" })}>
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => remove.mutate({ id: job.id })}>
                        <Trash2 className="size-3" />
                      </Button>
                    </>
                  ) : null}
                  <Button size="xs" disabled={start.isPending || !!editing} title={editing ? "Timeline busy" : "Start editing"} onClick={() => start.mutate({ id: job.id })}>
                    <Play className="size-3" />
                    Edit
                  </Button>
                </div>
                {scriptFor === job.id ? (
                  <div className="border-t border-border p-2.5">
                    <ScriptDrawer jobId={job.id} script={job.script} onSaved={refresh} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent deliveries */}
      {(bay.data?.delivered.length ?? 0) > 0 ? (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recently delivered
          </h3>
          <ul className="space-y-1 text-sm">
            {bay.data?.delivered.map((d) => (
              <li key={d.id} className="flex items-center justify-between text-muted-foreground">
                <span className="truncate">{d.title}</span>
                <span className="shrink-0 font-mono text-xs">
                  {d.deliveredAt ? relativeTime(d.deliveredAt) : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? <AddVideoDialog open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} /> : null}
    </div>
  );
}

function ScriptDrawer({
  jobId,
  script,
  onSaved,
}: {
  jobId: string;
  script: string | null;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(script ?? "");
  const save = trpc.video.updateScript.useMutation({
    onSuccess: () => {
      toast.success("Script saved.");
      onSaved();
    },
  });
  return (
    <div className="mt-2 space-y-2">
      <Textarea
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste or write the script here — the editor copies it straight from the bay."
        className="font-mono text-xs"
      />
      <div className="flex justify-end gap-1.5">
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => toast.success("Script copied."),
              () => toast.error("Couldn't copy — select and copy manually."),
            );
          }}
        >
          <Copy className="size-3" />
          Copy script
        </Button>
        <Button size="xs" disabled={save.isPending || value === (script ?? "")} onClick={() => save.mutate({ id: jobId, script: value })}>
          <Check className="size-3" />
          Save
        </Button>
      </div>
    </div>
  );
}

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function AddVideoDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: () => void;
}) {
  const clients = trpc.clients.list.useQuery(undefined, { enabled: open });
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [deliverBy, setDeliverBy] = useState("");
  const [script, setScript] = useState("");
  const add = trpc.video.add.useMutation({
    onSuccess: () => {
      toast.success("On the whiteboard.");
      onOpenChange(false);
      setTitle("");
      setScript("");
      setDeliverBy("");
      onAdded();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Queue a video</DialogTitle>
          <DialogDescription>
            It lands on the bay's whiteboard with a delivery timer the whole team can see.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="vid-title">Title</Label>
            <Input id="vid-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Client hero reel — v2" />
          </div>
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
              <Label>Priority</Label>
              <FormSelect value={priority} onValueChange={setPriority} options={PRIORITIES} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vid-due">Deliver by</Label>
            <Input id="vid-due" type="datetime-local" value={deliverBy} onChange={(e) => setDeliverBy(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vid-script">Script (optional)</Label>
            <Textarea id="vid-script" rows={4} value={script} onChange={(e) => setScript(e.target.value)} className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 2 || add.isPending}
            onClick={() =>
              add.mutate({
                title: title.trim(),
                clientId: clientId || undefined,
                priority: priority as "medium",
                deliverBy: deliverBy ? new Date(deliverBy) : undefined,
                script: script || undefined,
              })
            }
          >
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Queue it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
