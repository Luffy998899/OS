"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { LayoutGrid, List, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { MissionRow } from "@/components/tasks/mission-row";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { Card } from "@/components/ui/card";
import {
  PriorityBadge,
  VerticalBadge,
} from "@/components/app/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { TASK_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Task = RouterOutputs["task"]["myWork"][number];

const BOARD_ORDER = ["todo", "in_progress", "review", "blocked", "done"] as const;
const BOARD_COLUMNS = BOARD_ORDER.map(
  (v) => TASK_STATUSES.find((s) => s.value === v)!,
);

export function MyWorkView() {
  const utils = trpc.useUtils();
  const myWork = trpc.task.myWork.useQuery();
  const [view, setView] = useState<"board" | "list">("board");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const updateStatus = trpc.task.updateStatus.useMutation({
    onSuccess: (_r, vars) => {
      utils.task.myWork.invalidate();
      utils.dashboard.overview.invalidate();
      utils.me.invalidate();
      if (vars.status === "done") toast.success("Nice — mission complete.");
    },
    onError: (e) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const rank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const map: Record<string, Task[]> = {};
    for (const s of TASK_STATUSES) map[s.value] = [];
    for (const t of myWork.data ?? []) (map[t.status] ??= []).push(t);
    // Urgent/critical first, then by due date.
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const r = (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2);
        if (r !== 0) return r;
        const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return da - db;
      });
    }
    return map;
  }, [myWork.data]);

  const open = (id: string) => {
    setSelected(id);
    setSheetOpen(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="For you"
        title="My Work"
        description="Missions assigned to you. Move them across the board as you go — completing a mission earns points."
      >
        <div className="flex rounded-md border border-border p-0.5">
          <button
            onClick={() => setView("board")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors",
              view === "board"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-4" /> Board
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium transition-colors",
              view === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="size-4" /> List
          </button>
        </div>
      </PageHeader>

      {myWork.isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (myWork.data?.length ?? 0) === 0 ? (
        <Card className="py-16">
          <p className="text-center text-sm text-muted-foreground">
            No missions assigned yet. Check back soon.
          </p>
        </Card>
      ) : view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_COLUMNS.map((col) => (
            <div key={col.value} className="w-[280px] shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {grouped[col.value]?.length ?? 0}
                </span>
              </div>
              <div className="space-y-2">
                {(grouped[col.value] ?? []).map((t) => (
                  <BoardCard
                    key={t.id}
                    task={t}
                    onOpen={() => open(t.id)}
                    onMove={(status) =>
                      updateStatus.mutate({ id: t.id, status })
                    }
                  />
                ))}
                {(grouped[col.value]?.length ?? 0) === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                    Nothing here
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="gap-0 py-0">
          <div className="divide-y divide-border">
            {(myWork.data ?? []).map((t) => (
              <MissionRow key={t.id} task={t} onClick={() => open(t.id)} />
            ))}
          </div>
        </Card>
      )}

      <TaskDetailSheet
        taskId={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}

function BoardCard({
  task,
  onOpen,
  onMove,
}: {
  task: Task;
  onOpen: () => void;
  onMove: (status: (typeof TASK_STATUSES)[number]["value"]) => void;
}) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = due && due < new Date() && task.status !== "done";
  const urgent = task.priority === "urgent";
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 ring-1 ring-transparent transition-shadow hover:ring-foreground/10",
        urgent ? "border-l-4 border-l-destructive border-border" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onOpen}
          className="line-clamp-3 flex-1 text-left text-[0.95rem] leading-snug font-semibold hover:underline"
        >
          {task.title}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {TASK_STATUSES.filter((s) => s.value !== task.status).map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => onMove(s.value)}>
                Move to {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <VerticalBadge vertical={task.vertical} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
        <span className={cn(overdue && "font-medium text-destructive")}>
          {due ? format(due, "MMM d") : "No due date"}
        </span>
        <span className="font-medium tabular-nums">{task.points} XP</span>
      </div>
    </div>
  );
}
