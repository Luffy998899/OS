"use client";

// The managing heads' desk: raise a leave application, ask for a sign-off, or
// drop any query — and watch it get a visible yes/no with a note.

import { useState } from "react";
import {
  CalendarDays,
  Check,
  FileQuestion,
  Loader2,
  Plus,
  Stamp,
  ThumbsDown,
  ThumbsUp,
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

const KIND_META: Record<string, { label: string; icon: typeof Stamp }> = {
  leave: { label: "Leave", icon: CalendarDays },
  approval: { label: "Approval", icon: Stamp },
  query: { label: "Query", icon: FileQuestion },
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

export function ApprovalsPanel() {
  const currentUser = useCurrentUser();
  const isHead = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const mine = trpc.approval.mine.useQuery();
  const desk = trpc.approval.desk.useQuery(undefined, { enabled: isHead });
  const [raiseOpen, setRaiseOpen] = useState(false);

  const refresh = () => {
    utils.approval.mine.invalidate();
    utils.approval.desk.invalidate();
  };
  const decide = trpc.approval.decide.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const withdraw = trpc.approval.withdraw.useMutation({ onSuccess: refresh });

  return (
    <div className="space-y-5">
      {isHead ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Waiting on you{" "}
            <span className="font-mono text-xs text-muted-foreground">{desk.data?.pending.length ?? 0}</span>
          </h3>
          {(desk.data?.pending.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              Desk clear — nothing waiting for a decision.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {desk.data?.pending.map((r) => {
                const Icon = (KIND_META[r.kind] ?? KIND_META.query).icon;
                return (
                  <li key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.user.name} · {KIND_META[r.kind]?.label ?? r.kind}
                            {r.fromDate ? ` · ${r.fromDate}${r.toDate && r.toDate !== r.fromDate ? ` → ${r.toDate}` : ""}` : ""}
                            {` · ${relativeTime(r.createdAt)}`}
                          </p>
                          {r.detail ? <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p> : null}
                        </div>
                      </div>
                      <DecisionButtons
                        busy={decide.isPending}
                        onDecide={(decision, note) => decide.mutate({ id: r.id, decision, note })}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your requests</h3>
          <Button size="sm" onClick={() => setRaiseOpen(true)}>
            <Plus className="size-3.5" />
            Raise a request
          </Button>
        </div>
        {(mine.data?.length ?? 0) === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Leave, approvals, queries — anything the heads should decide lands here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mine.data?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_META[r.kind]?.label ?? r.kind}
                    {r.fromDate ? ` · ${r.fromDate}${r.toDate && r.toDate !== r.fromDate ? ` → ${r.toDate}` : ""}` : ""}
                    {r.decisionNote ? ` · “${r.decisionNote}”` : ""}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold capitalize", STATUS_CLS[r.status])}>
                    {r.status}
                  </span>
                  {r.status === "pending" ? (
                    <Button size="xs" variant="ghost" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ id: r.id })}>
                      Withdraw
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isHead && (desk.data?.decided.length ?? 0) > 0 ? (
        <section>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent decisions</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {desk.data?.decided.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="truncate">
                  {r.user.name} — {r.title}
                </span>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-medium capitalize", STATUS_CLS[r.status])}>{r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RaiseDialog open={raiseOpen} onOpenChange={setRaiseOpen} onRaised={refresh} />
    </div>
  );
}

function DecisionButtons({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (decision: "approved" | "rejected", note?: string) => void;
}) {
  const [note, setNote] = useState("");
  const [noting, setNoting] = useState(false);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex gap-1.5">
        <Button size="xs" disabled={busy} onClick={() => onDecide("approved", note.trim() || undefined)}>
          <ThumbsUp className="size-3" />
          Approve
        </Button>
        <Button size="xs" variant="destructive" disabled={busy} onClick={() => onDecide("rejected", note.trim() || undefined)}>
          <ThumbsDown className="size-3" />
          Decline
        </Button>
      </div>
      {noting ? (
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="h-7 w-48 text-xs" />
      ) : (
        <button className="text-[0.65rem] text-muted-foreground hover:text-foreground" onClick={() => setNoting(true)}>
          + note
        </button>
      )}
    </div>
  );
}

const KIND_OPTIONS = [
  { value: "leave", label: "Apply for leave" },
  { value: "approval", label: "Get something approved" },
  { value: "query", label: "Raise a query" },
];

function RaiseDialog({
  open,
  onOpenChange,
  onRaised,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRaised: () => void;
}) {
  const [kind, setKind] = useState("leave");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const create = trpc.approval.create.useMutation({
    onSuccess: () => {
      toast.success("On the heads' desk.");
      onOpenChange(false);
      setTitle("");
      setDetail("");
      setFromDate("");
      setToDate("");
      onRaised();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Raise a request</DialogTitle>
          <DialogDescription>It goes straight to the managing heads' queue.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <FormSelect value={kind} onValueChange={setKind} options={KIND_OPTIONS} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-title">Title</Label>
            <Input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "leave" ? "2 days off — family function" : "What needs a decision?"}
            />
          </div>
          {kind === "leave" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="req-from">From</Label>
                <Input id="req-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="req-to">To</Label>
                <Input id="req-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="req-detail">Detail</Label>
            <Textarea id="req-detail" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 3 || create.isPending || (kind === "leave" && !fromDate)}
            onClick={() =>
              create.mutate({
                kind: kind as "leave",
                title: title.trim(),
                detail: detail.trim() || undefined,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
              })
            }
          >
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
