"use client";

import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const utils = trpc.useUtils();
  const unread = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const list = trpc.notification.list.useQuery();
  const markAll = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  const count = unread.data ?? 0;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notifications" />
        }
      >
        <span className="relative">
          <Bell className="size-4" />
          {count > 0 ? (
            <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[0.6rem] leading-4 font-semibold text-background">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 ? (
            <button
              onClick={() => markAll.mutate()}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          ) : null}
        </div>
        <ScrollArea className="max-h-80">
          {list.data && list.data.length > 0 ? (
            <ul className="divide-y divide-border">
              {list.data.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "px-3 py-2.5",
                    !n.read && "bg-muted/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1.5 size-1.5 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-foreground",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body ? (
                        <p className="text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                        {relativeTime(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&rsquo;re all caught up.
            </p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
