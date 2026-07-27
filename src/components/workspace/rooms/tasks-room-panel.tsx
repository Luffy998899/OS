"use client";

// The task room: your own missions grouped by state, and the co-assigned wall —
// work you share with a squad, with everyone on the card.

import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TaskStatusBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { initials, relativeTime } from "@/lib/format";
import { SKILL_META, type SkillKey } from "@/lib/skills";
import { cn } from "@/lib/utils";

type Row = RouterOutputs["task"]["taskRoom"]["mine"][number];

export function TasksRoomPanel() {
  const utils = trpc.useUtils();
  const room = trpc.task.taskRoom.useQuery();
  const update = trpc.task.updateStatus.useMutation({
    onSuccess: () => {
      utils.task.taskRoom.invalidate();
      utils.task.myWork.invalidate();
      utils.workspace.state.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (room.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mine = room.data?.mine ?? [];
  const coAssigned = room.data?.coAssigned ?? [];

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Your wall <span className="font-mono text-xs text-muted-foreground">{mine.length}</span>
        </h3>
        {mine.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nothing assigned — grab a bounty from the plaza board.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mine.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                own
                busy={update.isPending}
                onAdvance={(status, msg) =>
                  update.mutate({ id: t.id, status }, { onSuccess: () => toast.success(msg) })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Users className="size-3.5" />
          Co-assigned with your squad{" "}
          <span className="font-mono text-xs text-muted-foreground">{coAssigned.length}</span>
        </h3>
        {coAssigned.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            When a mission is co-assigned to you, it shows here with the whole team on it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {coAssigned.map((t) => (
              <TaskRow key={t.id} task={t} busy={false} onAdvance={() => {}} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TaskRow({
  task,
  own,
  busy,
  onAdvance,
}: {
  task: Row;
  own?: boolean;
  busy: boolean;
  onAdvance: (status: "in_progress" | "review", msg: string) => void;
}) {
  const skill = task.skill as SkillKey;
  const overdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== "done";
  const squad = [
    ...(task.assignee ? [task.assignee] : []),
    ...task.collaborators.map((c) => c.user),
  ];
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span
              className="rounded px-1.5 py-0.5 font-medium"
              style={{ background: `${SKILL_META[skill].color}1f`, color: SKILL_META[skill].color }}
            >
              {SKILL_META[skill].label}
            </span>
            {task.client ? <span>{task.client.companyName}</span> : null}
            {task.dueAt ? (
              <span className={cn(overdue && "font-medium text-destructive")}>
                {overdue ? "overdue" : "due"} {relativeTime(task.dueAt)}
              </span>
            ) : null}
            <span>· {task.points + task.bountyBonus} XP</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* The squad, stacked */}
          {squad.length > 1 || !own ? (
            <span className="flex -space-x-1.5">
              {squad.slice(0, 4).map((u) => (
                <Avatar key={u.id} className="size-5 ring-2 ring-card">
                  <AvatarImage src={u.avatarUrl ?? undefined} />
                  <AvatarFallback className="text-[0.5rem]">{initials(u.name)}</AvatarFallback>
                </Avatar>
              ))}
            </span>
          ) : null}
          <TaskStatusBadge status={task.status} />
        </div>
      </div>
      {own ? (
        <div className="mt-2 flex justify-end gap-1.5">
          {task.status === "todo" ? (
            <Button size="xs" disabled={busy} onClick={() => onAdvance("in_progress", "Started — timer running.")}>
              Start
            </Button>
          ) : null}
          {task.status === "in_progress" ? (
            <Button size="xs" disabled={busy} onClick={() => onAdvance("review", "Published for review.")}>
              Publish for review
            </Button>
          ) : null}
          {task.status === "review" ? (
            <span className="text-xs font-medium text-warning">Awaiting review</span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
