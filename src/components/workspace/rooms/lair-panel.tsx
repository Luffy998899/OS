"use client";

// Vecna's desk, inside the Upside Down. Admin-only: the whole floor's pulse —
// who's present, what block they should be in, what's actually moving — and the
// button that drops a demogorgon on a slacker's screen.

import { Clock, Eye, Ghost, Loader2, Skull } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESENCE_CLS: Record<string, string> = {
  online: "bg-success/10 text-success",
  busy: "bg-warning/10 text-warning",
  away: "bg-muted text-muted-foreground",
  offline: "bg-muted text-muted-foreground",
};

export function LairPanel() {
  const utils = trpc.useUtils();
  const lair = trpc.workspace.lair.useQuery(undefined, { refetchInterval: 15_000 });
  const scare = trpc.workspace.scare.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.already
          ? "A demogorgon is already waiting on their screen."
          : "👹 Demogorgon dispatched. It arrives on their next heartbeat.",
      );
      utils.workspace.lair.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (lair.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const roster = lair.data ?? [];
  const slackers = roster.filter((r) => r.slacking);

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Eye className="mt-0.5 size-3.5 shrink-0 text-destructive" />
        You are watching from the Upside Down. A demogorgon lands on the victim&apos;s screen the
        next time their app breathes — one live demogorgon per person, use it like a bell, not a
        hammer.
      </p>

      {slackers.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <Skull className="size-3.5" />
          {slackers.length} possibly slacking — away during a work block with nothing moving.
        </p>
      ) : null}

      {roster.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          Nobody else on the floor to watch.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {roster.map((u) => (
            <li
              key={u.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-2.5",
                u.slacking ? "border-destructive/40 bg-destructive/5" : "border-border",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {u.name}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold capitalize",
                      PRESENCE_CLS[u.presence] ?? PRESENCE_CLS.offline,
                    )}
                  >
                    {u.presence}
                  </span>
                  {u.slacking ? (
                    <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-destructive uppercase">
                      slacking?
                    </span>
                  ) : null}
                </p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {u.currentSlot ? (
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {u.currentSlot.label}
                    </span>
                  ) : (
                    <span>no timetable block</span>
                  )}
                  <span>· {u.inProgress} in progress</span>
                  <span>· {u.doneToday} done today</span>
                  {u.lastMoveAt ? <span>· moved {relativeTime(u.lastMoveAt)}</span> : null}
                </p>
              </div>
              <Button
                size="xs"
                variant={u.slacking ? "destructive" : "outline"}
                disabled={scare.isPending}
                onClick={() => scare.mutate({ userId: u.id })}
              >
                <Ghost className="size-3" />
                Send demogorgon
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
