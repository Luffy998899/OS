"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Plus,
  Check,
  X,
  Wand2,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { FormSelect } from "@/components/app/form-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PriorityBadge, VerticalBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { VERTICALS, PRIORITIES } from "@/lib/constants";

type Draft = RouterOutputs["assign"]["plan"]["drafts"][number];

const verticalOptions = VERTICALS.map((v) => ({ value: v.value, label: v.label }));
const priorityOptions = PRIORITIES.map((p) => ({ value: p.value, label: p.label }));

export function AssignPlanView() {
  const utils = trpc.useUtils();
  const aiStatus = trpc.assign.aiStatus.useQuery();
  const assignable = trpc.user.assignable.useQuery();
  const pending = trpc.task.pendingReview.useQuery();

  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const assigneeOptions = (assignable.data ?? []).map((u) => ({
    value: u.id,
    label: u.name,
  }));

  const plan = trpc.assign.plan.useMutation({
    onSuccess: (res) => {
      setDrafts(res.drafts);
      setUsedAi(res.usedAi);
    },
    onError: (e) => toast.error(e.message),
  });

  const create = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.dashboard.overview.invalidate();
      utils.task.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const commitDraft = (index: number) => {
    const d = drafts[index];
    create.mutate(
      {
        title: d.title,
        description: d.description,
        vertical: d.vertical as never,
        priority: d.priority as never,
        points: d.points,
        assigneeId: d.assigneeId ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Assigned: ${d.title}`);
          setDrafts((cur) => cur.filter((_, i) => i !== index));
        },
      },
    );
  };

  const patchDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((cur) =>
      cur.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );

  const assignAll = async () => {
    const toAssign = [...drafts];
    for (const d of toAssign) {
      await create.mutateAsync({
        title: d.title,
        description: d.description,
        vertical: d.vertical as never,
        priority: d.priority as never,
        points: d.points,
        assigneeId: d.assigneeId ?? undefined,
      });
    }
    setDrafts([]);
    toast.success(`Assigned ${toAssign.length} missions.`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Assign & Plan"
        description="Describe the work in plain language. The AI senior manager drafts missions and routes them — you review before anything is assigned."
      >
        <Button variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" />
          New mission
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="gap-3">
            <div className="flex items-center gap-2 px-4">
              <Sparkles className="size-4" />
              <h2 className="font-heading text-sm font-semibold">
                Plan with AI
              </h2>
              <Badge variant="secondary" className="ml-auto">
                {aiStatus.data?.enabled
                  ? "Claude connected"
                  : "Offline heuristics"}
              </Badge>
            </div>
            <div className="px-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. We're launching the AI product next week — get the dev team on a landing page and have marketing plan the social campaign."
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {aiStatus.data?.enabled
                    ? "Claude will draft & route missions."
                    : "Add ANTHROPIC_API_KEY to enable Claude — using keyword routing for now."}
                </p>
                <Button
                  onClick={() => plan.mutate({ prompt })}
                  disabled={prompt.trim().length < 3 || plan.isPending}
                >
                  {plan.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  Draft missions
                </Button>
              </div>
            </div>
          </Card>

          {drafts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {drafts.length} draft{drafts.length === 1 ? "" : "s"} ·{" "}
                  {usedAi ? "drafted by Claude" : "keyword-routed"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={assignAll}
                >
                  Assign all
                </Button>
              </div>
              {drafts.map((d, i) => (
                <Card key={i} className="gap-3">
                  <div className="space-y-3 px-4">
                    <Input
                      value={d.title}
                      onChange={(e) =>
                        patchDraft(i, { title: e.target.value })
                      }
                      className="font-medium"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <FormSelect
                        value={d.assigneeId ?? ""}
                        onValueChange={(v) => patchDraft(i, { assigneeId: v })}
                        placeholder="Assignee"
                        options={assigneeOptions}
                      />
                      <FormSelect
                        value={d.vertical}
                        onValueChange={(v) => patchDraft(i, { vertical: v })}
                        options={verticalOptions}
                      />
                      <FormSelect
                        value={d.priority}
                        onValueChange={(v) => patchDraft(i, { priority: v })}
                        options={priorityOptions}
                      />
                      <Input
                        type="number"
                        value={d.points}
                        onChange={(e) =>
                          patchDraft(i, { points: Number(e.target.value) })
                        }
                      />
                    </div>
                    {d.rationale ? (
                      <p className="flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                        <Sparkles className="mt-0.5 size-3 shrink-0" />
                        {d.rationale}
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDrafts((cur) => cur.filter((_, x) => x !== i))
                        }
                      >
                        <X className="size-4" />
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        disabled={create.isPending}
                        onClick={() => commitDraft(i)}
                      >
                        <Check className="size-4" />
                        Assign
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : null}
        </div>

        {/* Review + completions */}
        <div className="space-y-6 lg:col-span-2">
          <CompletionsQueue />
          <Card className="gap-0 py-0">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Inbox className="size-4" />
              <h2 className="font-heading text-sm font-semibold">
                Review queue
              </h2>
              {(pending.data?.length ?? 0) > 0 ? (
                <Badge className="ml-auto">{pending.data?.length}</Badge>
              ) : null}
            </div>
            {pending.data && pending.data.length > 0 ? (
              <div className="divide-y divide-border">
                {pending.data.map((t) => (
                  <ReviewItem key={t.id} task={t} assigneeOptions={assigneeOptions} />
                ))}
              </div>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing to review. AI &amp; WhatsApp drafts land here for your
                approval.
              </p>
            )}
          </Card>
        </div>
      </div>

      <NewMissionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        assigneeOptions={assigneeOptions}
      />
    </>
  );
}

function CompletionsQueue() {
  const utils = trpc.useUtils();
  const completions = trpc.task.completions.useQuery();
  const approve = trpc.task.approveCompletion.useMutation({
    onSuccess: (_r, v) => {
      utils.task.completions.invalidate();
      utils.dashboard.overview.invalidate();
      utils.report.data.invalidate();
      toast.success(v.approve ? "Approved — XP awarded." : "Sent back.");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = completions.data ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Check className="size-4" />
        <h2 className="font-heading text-sm font-semibold">Completions to approve</h2>
        <Badge className="ml-auto">{items.length}</Badge>
      </div>
      <div className="divide-y divide-border">
        {items.map((t) => (
          <div key={t.id} className="space-y-2 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{t.title}</p>
              <span className="shrink-0 text-xs text-muted-foreground">{t.points} XP</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={t.priority} />
              <VerticalBadge vertical={t.vertical} />
              <span className="text-xs text-muted-foreground">
                {t.assignee ? t.assignee.name : "Unassigned"}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={approve.isPending}
                onClick={() => approve.mutate({ id: t.id, approve: false })}
              >
                <X className="size-4" />
                Send back
              </Button>
              <Button
                size="sm"
                disabled={approve.isPending}
                onClick={() => approve.mutate({ id: t.id, approve: true })}
              >
                <Check className="size-4" />
                Approve
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReviewItem({
  task,
  assigneeOptions,
}: {
  task: RouterOutputs["task"]["pendingReview"][number];
  assigneeOptions: { value: string; label: string }[];
}) {
  const utils = trpc.useUtils();
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");

  const review = trpc.task.review.useMutation({
    onSuccess: (_r, vars) => {
      utils.task.pendingReview.invalidate();
      utils.dashboard.overview.invalidate();
      utils.notification.list.invalidate();
      toast.success(
        vars.decision === "approve" ? "Approved & assigned." : "Rejected.",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{task.title}</p>
        <Badge variant="outline" className="shrink-0 capitalize">
          {task.source}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <VerticalBadge vertical={task.vertical} />
        <span className="text-xs text-muted-foreground">{task.points} pts</span>
      </div>
      {task.aiRationale ? (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {task.aiRationale}
        </p>
      ) : null}
      <FormSelect
        value={assigneeId}
        onValueChange={setAssigneeId}
        placeholder="Assignee"
        options={assigneeOptions}
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={review.isPending}
          onClick={() => review.mutate({ id: task.id, decision: "reject" })}
        >
          <X className="size-4" />
          Reject
        </Button>
        <Button
          size="sm"
          disabled={review.isPending}
          onClick={() =>
            review.mutate({
              id: task.id,
              decision: "approve",
              assigneeId: assigneeId || undefined,
            })
          }
        >
          <Check className="size-4" />
          Approve
        </Button>
      </div>
    </div>
  );
}

function NewMissionDialog({
  open,
  onOpenChange,
  assigneeOptions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  assigneeOptions: { value: string; label: string }[];
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [vertical, setVertical] = useState("roadmap");
  const [priority, setPriority] = useState("medium");
  const [points, setPoints] = useState("20");
  const [assigneeId, setAssigneeId] = useState("");

  const create = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.dashboard.overview.invalidate();
      utils.task.list.invalidate();
      toast.success("Mission created.");
      onOpenChange(false);
      setTitle("");
      setDescription("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New mission</DialogTitle>
          <DialogDescription>
            Create and assign a mission directly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="m-title">Title</Label>
          <Input
            id="m-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="m-desc">Description</Label>
          <Textarea
            id="m-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Vertical</Label>
            <FormSelect
              value={vertical}
              onValueChange={setVertical}
              options={verticalOptions}
            />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <FormSelect
              value={priority}
              onValueChange={setPriority}
              options={priorityOptions}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Assignee</Label>
            <FormSelect
              value={assigneeId}
              onValueChange={setAssigneeId}
              placeholder="Unassigned"
              options={assigneeOptions}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-points">XP reward</Label>
            <Input
              id="m-points"
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={title.trim().length < 3 || create.isPending}
            onClick={() =>
              create.mutate({
                title,
                description,
                vertical: vertical as never,
                priority: priority as never,
                points: Number(points),
                assigneeId: assigneeId || undefined,
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
