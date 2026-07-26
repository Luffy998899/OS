"use client";

// A room's board: everything assigned to that part of the floor, plus any
// unclaimed bounties sitting in it. Used by the in-world board you walk up to
// and by the lobby's room list.

import { Check, Hand, Loader2, Lock, Play, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TaskStatusBadge } from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { SKILL_META, tierName, type SkillKey } from "@/lib/skills";
import { bountyReward } from "@/lib/bounty";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UrgencyBadge } from "./bounty-board";

export function RoomMissionsPanel({
  roomId,
  onChanged,
}: {
  roomId: string;
  onChanged?: () => void;
}) {
  const currentUser = useCurrentUser();
  const canManage = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const missions = trpc.workspace.roomMissions.useQuery({ roomId }, { enabled: !!roomId });

  const refresh = () => {
    utils.workspace.roomMissions.invalidate({ roomId });
    utils.bounty.board.invalidate();
    utils.bounty.mine.invalidate();
    onChanged?.();
  };

  const update = trpc.task.updateStatus.useMutation({
    onSuccess: refresh,
    onError: (e) => toast.error(e.message),
  });
  const claim = trpc.bounty.claim.useMutation({
    onSuccess: (res) => {
      toast.success(`Claimed “${res.title}” — ${res.reward.total} XP`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const act = (
    id: string,
    status: "todo" | "in_progress" | "review" | "done",
    msg: string,
  ) => update.mutate({ id, status }, { onSuccess: () => toast.success(msg) });

  if (missions.isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if ((missions.data?.length ?? 0) === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No missions in this room yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {missions.data?.map((m) => {
        const mine = m.assignee?.id === currentUser.id;
        const overdue = m.dueAt && new Date(m.dueAt) < new Date() && m.status !== "done";
        const claimable = m.isBounty && !m.assignee && m.status !== "done";
        const reward = bountyReward({
          points: m.points,
          priority: m.priority,
          dueAt: m.dueAt,
        });
        const skill = m.skill as SkillKey;
        return (
          <li key={m.id} className="rounded-lg border border-border p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{m.title}</p>
              {claimable ? (
                <UrgencyBadge tier={reward.tier} />
              ) : (
                <TaskStatusBadge status={m.status} />
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{m.assignee ? m.assignee.name : claimable ? "Unclaimed" : "Unassigned"}</span>
              <span>· {claimable ? reward.total : m.points + m.bountyBonus} XP</span>
              <span
                className="rounded px-1.5 py-0.5 font-medium"
                style={{
                  background: `${SKILL_META[skill].color}1f`,
                  color: SKILL_META[skill].color,
                }}
              >
                {SKILL_META[skill].label}
              </span>
              {m.priority === "urgent" || m.priority === "high" ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium",
                    m.priority === "urgent"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning",
                  )}
                >
                  {m.priority}
                </span>
              ) : null}
              {(m.status === "in_progress" || claimable) && m.dueAt ? (
                <span
                  className={cn(
                    "flex items-center gap-1",
                    overdue && "font-medium text-destructive",
                  )}
                >
                  <Timer className="size-3" />
                  {overdue ? "overdue " : "due "}
                  {relativeTime(m.dueAt)}
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
              {claimable ? (
                m.eligible ? (
                  <Button
                    size="xs"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate({ id: m.id })}
                  >
                    <Hand className="size-3" />
                    Claim bounty
                  </Button>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" />
                    Needs {SKILL_META[skill].label} {tierName(m.minSkillLevel)} — you&apos;re{" "}
                    {tierName(m.yourLevel)}
                  </span>
                )
              ) : null}
              {mine && m.status === "todo" ? (
                <Button
                  size="xs"
                  disabled={update.isPending}
                  onClick={() => act(m.id, "in_progress", "Started — timer running.")}
                >
                  <Play className="size-3" />
                  Start
                </Button>
              ) : null}
              {mine && m.status === "in_progress" ? (
                <Button
                  size="xs"
                  disabled={update.isPending}
                  onClick={() => act(m.id, "review", "Published for review.")}
                >
                  <Check className="size-3" />
                  Publish for review
                </Button>
              ) : null}
              {mine && m.status === "review" ? (
                <span className="text-xs font-medium text-warning">Awaiting review</span>
              ) : null}
              {mine && m.status === "done" ? (
                <span className="text-xs font-medium text-success">Completed</span>
              ) : null}
              {canManage && m.status === "review" ? (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => act(m.id, "in_progress", "Sent back.")}
                  >
                    Send back
                  </Button>
                  <Button
                    size="xs"
                    disabled={update.isPending}
                    onClick={() => act(m.id, "done", "Approved — XP awarded.")}
                  >
                    <Check className="size-3" />
                    Approve
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
