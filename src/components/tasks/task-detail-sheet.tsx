"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Loader2, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  PriorityBadge,
  VerticalBadge,
} from "@/components/app/status-badge";
import { trpc } from "@/lib/trpc/client";
import { TASK_STATUSES } from "@/lib/constants";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [comment, setComment] = useState("");

  const query = trpc.task.byId.useQuery(
    { id: taskId ?? "" },
    { enabled: open && !!taskId },
  );
  const task = query.data;

  const invalidateAll = () => {
    utils.task.byId.invalidate({ id: taskId ?? "" });
    utils.task.myWork.invalidate();
    utils.task.list.invalidate();
    utils.dashboard.overview.invalidate();
    utils.me.invalidate();
  };

  const updateStatus = trpc.task.updateStatus.useMutation({
    onSuccess: (_res, vars) => {
      invalidateAll();
      if (vars.status === "done") toast.success("Mission complete — points awarded.");
    },
    onError: (e) => toast.error(e.message),
  });

  const addComment = trpc.task.addComment.useMutation({
    onSuccess: () => {
      utils.task.byId.invalidate({ id: taskId ?? "" });
      setComment("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg!">
        <SheetTitle className="sr-only">Mission details</SheetTitle>
        {!task ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-border p-5 pr-12">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={task.priority} />
                <VerticalBadge vertical={task.vertical} />
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Trophy className="size-3.5" />
                  {task.points} pts
                </span>
              </div>
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {task.title}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {task.assignee ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar className="size-5">
                      {task.assignee.avatarUrl ? (
                        <AvatarImage src={task.assignee.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-[0.55rem]">
                        {initials(task.assignee.name)}
                      </AvatarFallback>
                    </Avatar>
                    {task.assignee.name}
                  </span>
                ) : (
                  <span>Unassigned</span>
                )}
                {task.client ? <span>· {task.client.companyName}</span> : null}
                {task.room ? <span>· {task.room.name}</span> : null}
                {task.dueAt ? (
                  <span>· due {format(new Date(task.dueAt), "MMM d")}</span>
                ) : null}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-6 p-5">
                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          updateStatus.mutate({
                            id: task.id,
                            status: s.value,
                          })
                        }
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                          task.status === s.value
                            ? "border-foreground bg-foreground text-background"
                            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {task.aiGenerated && task.aiRationale ? (
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      AI rationale
                    </p>
                    <p className="text-sm">{task.aiRationale}</p>
                  </div>
                ) : null}

                {task.description ? (
                  <div>
                    <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Description
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-foreground/90">
                      {task.description}
                    </p>
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Comments
                  </p>
                  <div className="space-y-3">
                    {task.comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No comments yet.
                      </p>
                    ) : (
                      task.comments.map((c) => (
                        <div key={c.id} className="flex gap-2.5">
                          <Avatar className="size-6 shrink-0">
                            {c.author.avatarUrl ? (
                              <AvatarImage src={c.author.avatarUrl} alt="" />
                            ) : null}
                            <AvatarFallback className="text-[0.6rem]">
                              {initials(c.author.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs">
                              <span className="font-medium">
                                {c.author.name}
                              </span>{" "}
                              <span className="text-muted-foreground">
                                {relativeTime(c.createdAt)}
                              </span>
                            </p>
                            <p className="text-sm whitespace-pre-wrap">
                              {c.body}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="border-t border-border p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment…"
                  rows={1}
                  className="min-h-9 resize-none"
                />
                <Button
                  size="icon"
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() =>
                    addComment.mutate({ taskId: task.id, body: comment })
                  }
                >
                  {addComment.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
