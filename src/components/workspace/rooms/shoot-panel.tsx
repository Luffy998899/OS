"use client";

// The shoot room: everything planned in front of a camera today and this week,
// filterable by indoor/outdoor and client/internal, priority first.

import { useState } from "react";
import { Camera, Check, Loader2, MapPin, Plus, Sun, Trash2, X } from "lucide-react";
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
import type { RouterOutputs } from "@/lib/trpc/types";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type LocationFilter = "all" | "indoor" | "outdoor";
type ScopeFilter = "all" | "client" | "internal";

const PRIORITY_CLS: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-warning/10 text-warning",
  medium: "bg-muted text-muted-foreground",
  low: "bg-muted text-muted-foreground",
};

export function ShootPanel() {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const [location, setLocation] = useState<LocationFilter>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [addOpen, setAddOpen] = useState(false);

  const list = trpc.shoot.list.useQuery({
    location: location === "all" ? undefined : location,
    scope: scope === "all" ? undefined : scope,
  });
  const refresh = () => utils.shoot.list.invalidate();
  const setStatus = trpc.shoot.setStatus.useMutation({ onSuccess: refresh });
  const remove = trpc.shoot.remove.useMutation({ onSuccess: refresh });

  const shoots = list.data ?? [];
  const today = shoots.filter((s) => s.isToday);
  const upcoming = shoots.filter((s) => !s.isToday && !s.isPast);
  const past = shoots.filter((s) => s.isPast);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <FilterGroup
            value={location}
            options={[
              ["all", "All"],
              ["indoor", "Indoor"],
              ["outdoor", "Outdoor"],
            ]}
            onChange={(v) => setLocation(v as LocationFilter)}
          />
          <FilterGroup
            value={scope}
            options={[
              ["all", "All"],
              ["client", "Client"],
              ["internal", "Internal"],
            ]}
            onChange={(v) => setScope(v as ScopeFilter)}
          />
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Plan a shoot
          </Button>
        ) : null}
      </div>

      {list.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : shoots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Nothing on the call sheet. Plan a shoot and it shows here for the whole team.
        </p>
      ) : (
        <>
          {today.length > 0 ? <ShootGroup title="Today" shoots={today} canManage={canManage} onDone={(id) => setStatus.mutate({ id, status: "done" })} onCancel={(id) => setStatus.mutate({ id, status: "cancelled" })} onRemove={(id) => remove.mutate({ id })} /> : null}
          {upcoming.length > 0 ? <ShootGroup title="This week & later" shoots={upcoming} canManage={canManage} onDone={(id) => setStatus.mutate({ id, status: "done" })} onCancel={(id) => setStatus.mutate({ id, status: "cancelled" })} onRemove={(id) => remove.mutate({ id })} /> : null}
          {past.length > 0 ? <ShootGroup title="Slipped" shoots={past} canManage={canManage} onDone={(id) => setStatus.mutate({ id, status: "done" })} onCancel={(id) => setStatus.mutate({ id, status: "cancelled" })} onRemove={(id) => remove.mutate({ id })} /> : null}
        </>
      )}

      {canManage ? <PlanDialog open={addOpen} onOpenChange={setAddOpen} onPlanned={refresh} /> : null}
    </div>
  );
}

function FilterGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            value === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

type ShootRow = RouterOutputs["shoot"]["list"][number];

function ShootGroup({
  title,
  shoots,
  canManage,
  onDone,
  onCancel,
  onRemove,
}: {
  title: string;
  shoots: ShootRow[];
  canManage: boolean;
  onDone: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <ul className="space-y-1.5">
        {shoots.map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 rounded-lg border border-border p-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              {s.location === "outdoor" ? <Sun className="size-4 text-warning" /> : <Camera className="size-4 text-muted-foreground" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-mono">{s.date}</span>
                {s.timeNote ? <span>{s.timeNote}</span> : null}
                <span className="flex items-center gap-0.5">
                  <MapPin className="size-3" />
                  {s.location}
                </span>
                <span>{s.scope === "client" ? (s.client?.companyName ?? "client") : "internal"}</span>
              </p>
            </div>
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase", PRIORITY_CLS[s.priority])}>
              {s.priority}
            </span>
            {canManage ? (
              <span className="flex shrink-0 gap-1">
                <Button size="icon-xs" variant="ghost" title="Shot" onClick={() => onDone(s.id)}>
                  <Check className="size-3" />
                </Button>
                <Button size="icon-xs" variant="ghost" title="Cancel" onClick={() => onCancel(s.id)}>
                  <X className="size-3" />
                </Button>
                <Button size="icon-xs" variant="ghost" title="Remove" onClick={() => onRemove(s.id)}>
                  <Trash2 className="size-3" />
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function PlanDialog({
  open,
  onOpenChange,
  onPlanned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPlanned: () => void;
}) {
  const clients = trpc.clients.list.useQuery(undefined, { enabled: open });
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [timeNote, setTimeNote] = useState("");
  const [location, setLocation] = useState("indoor");
  const [scope, setScope] = useState("internal");
  const [clientId, setClientId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [notes, setNotes] = useState("");
  const create = trpc.shoot.create.useMutation({
    onSuccess: () => {
      toast.success("On the call sheet.");
      onOpenChange(false);
      setTitle("");
      setNotes("");
      onPlanned();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan a shoot</DialogTitle>
          <DialogDescription>Day, place, and who it's for — the room shows it to everyone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="shoot-title">What are we shooting?</Label>
            <Input id="shoot-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Founder story — b-roll day" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shoot-date">Date</Label>
              <Input id="shoot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shoot-time">Time</Label>
              <Input id="shoot-time" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} placeholder="10:30 – 13:00" />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <FormSelect
                value={location}
                onValueChange={setLocation}
                options={[
                  { value: "indoor", label: "Indoor" },
                  { value: "outdoor", label: "Outdoor" },
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <FormSelect value={priority} onValueChange={setPriority} options={PRIORITIES} />
            </div>
            <div className="space-y-1.5">
              <Label>For</Label>
              <FormSelect
                value={scope}
                onValueChange={setScope}
                options={[
                  { value: "internal", label: "Internal" },
                  { value: "client", label: "Client" },
                ]}
              />
            </div>
            {scope === "client" ? (
              <div className="space-y-1.5">
                <Label>Client</Label>
                <FormSelect
                  value={clientId}
                  onValueChange={setClientId}
                  placeholder="Pick one"
                  options={(clients.data ?? []).map((c) => ({ value: c.id, label: c.companyName }))}
                />
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shoot-notes">Notes</Label>
            <Textarea id="shoot-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gear, references, call time…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 2 || !date || create.isPending}
            onClick={() =>
              create.mutate({
                title: title.trim(),
                date,
                timeNote: timeNote.trim() || undefined,
                location: location as "indoor",
                scope: scope as "internal",
                clientId: clientId || undefined,
                priority: priority as "medium",
                notes: notes.trim() || undefined,
              })
            }
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
