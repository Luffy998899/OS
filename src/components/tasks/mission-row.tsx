import Link from "next/link";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TaskStatusBadge,
  PriorityBadge,
  VerticalBadge,
} from "@/components/app/status-badge";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MissionRowData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  vertical: string;
  points: number;
  dueAt: Date | string | null;
  client?: { companyName: string } | null;
  assignee?: { name: string; avatarUrl: string | null } | null;
};

export function MissionRow({
  task,
  href,
  showAssignee = false,
  onClick,
}: {
  task: MissionRowData;
  href?: string;
  showAssignee?: boolean;
  onClick?: () => void;
}) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = due && due < new Date() && task.status !== "done";

  const content = (
    <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          <VerticalBadge vertical={task.vertical} />
          {task.client ? (
            <span className="text-xs text-muted-foreground">
              · {task.client.companyName}
            </span>
          ) : null}
          {due ? (
            <span
              className={cn(
                "text-xs",
                overdue ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              · {overdue ? "overdue " : "due "}
              {format(due, "MMM d")}
            </span>
          ) : null}
        </div>
      </div>
      {showAssignee && task.assignee ? (
        <Avatar className="size-6">
          {task.assignee.avatarUrl ? (
            <AvatarImage src={task.assignee.avatarUrl} alt="" />
          ) : null}
          <AvatarFallback className="text-[0.6rem]">
            {initials(task.assignee.name)}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
        {task.points} pts
      </span>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    );
  }
  return content;
}
