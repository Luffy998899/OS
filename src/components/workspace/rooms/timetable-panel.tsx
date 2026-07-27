"use client";

// The timetable room: your day split into school periods with a time graph, the
// bell on every change, and the post-lunch re-login gate. Managers see the
// whole team's wall and can regenerate everyone at once.

import { useState } from "react";
import { AlarmClock, Loader2, RefreshCw, Sparkles, UtensilsCrossed, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { useCurrentUser } from "@/components/app/user-context";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { minToLabel, minutesNow, slotRangeLabel } from "@/lib/timetable";
import { cn } from "@/lib/utils";

const KIND_COLOR: Record<string, string> = {
  planning: "#6f9ff0",
  work: "#63c98a",
  lunch: "#e0a862",
  scripting: "#a76ad6",
  followup: "#5bb9c9",
  journal: "#d98a8a",
  posting: "#e6cf6a",
  outreach: "#c98fb0",
};

const DAY_START = 600; // 10am
const DAY_END = 1200; // 8pm

export function TimetablePanel() {
  const currentUser = useCurrentUser();
  const isManager = hasPermission(currentUser.permissions, PERMISSIONS.TASKS_ASSIGN);
  const utils = trpc.useUtils();
  const [view, setView] = useState<"me" | "team">("me");
  const today = trpc.timetable.today.useQuery(undefined, { refetchInterval: 30_000 });
  const team = trpc.timetable.team.useQuery(undefined, { enabled: isManager && view === "team" });

  const refresh = () => {
    utils.timetable.today.invalidate();
    utils.timetable.team.invalidate();
    utils.workspace.state.invalidate();
  };
  const generate = trpc.timetable.generate.useMutation({
    onSuccess: () => {
      toast.success("Day laid out — the bell takes it from here.");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const generateAll = trpc.timetable.generateAll.useMutation({
    onSuccess: (r) => {
      toast.success(`Timetables generated for ${r.users} people.`);
      refresh();
    },
  });
  const relogin = trpc.timetable.relogin.useMutation({
    onSuccess: () => {
      toast.success("Logged back in — afternoon tracked.");
      refresh();
    },
  });

  const slots = today.data?.slots ?? [];
  const nowMin = minutesNow();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isManager ? (
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            {(
              [
                ["me", "My day"],
                ["team", "Team wall"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlarmClock className="size-3.5" />
            The AI seeks your workload and splits the day; the bell rings on every change.
          </p>
        )}
        <div className="flex gap-1.5">
          <Button size="xs" variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>
            <Sparkles className="size-3" />
            {slots.length > 0 ? "Regenerate my day" : "Generate my day"}
          </Button>
          {isManager ? (
            <Button size="xs" variant="outline" disabled={generateAll.isPending} onClick={() => generateAll.mutate()}>
              <RefreshCw className="size-3" />
              Whole team
            </Button>
          ) : null}
        </div>
      </div>

      {today.data?.needsRelogin ? (
        <button
          onClick={() => relogin.mutate()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-warning/15 px-3 py-2.5 text-sm font-semibold text-warning transition-colors hover:bg-warning/25"
        >
          <UtensilsCrossed className="size-4" />
          Lunch is over — log back in so the afternoon is tracked
        </button>
      ) : null}

      {view === "me" ? (
        today.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : slots.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            No timetable for today yet — generate it and the AI splits your day from your open missions.
          </p>
        ) : (
          <DayGraph slots={slots} nowMin={nowMin} />
        )
      ) : (
        <TeamWall rows={team.data ?? []} loading={team.isLoading} nowMin={nowMin} />
      )}
    </div>
  );
}

function DayGraph({
  slots,
  nowMin,
}: {
  slots: { id: string; startMin: number; endMin: number; label: string; kind: string }[];
  nowMin: number;
}) {
  return (
    <div className="space-y-3">
      {/* The time graph: one bar, blocks in proportion. */}
      <div>
        <div className="relative flex h-9 w-full overflow-hidden rounded-lg ring-1 ring-foreground/10">
          {slots.map((s) => {
            const w = ((s.endMin - s.startMin) / (DAY_END - DAY_START)) * 100;
            const active = nowMin >= s.startMin && nowMin < s.endMin;
            return (
              <div
                key={s.id}
                title={`${s.label} · ${slotRangeLabel(s)}`}
                className={cn("relative h-full", active && "ring-2 ring-foreground ring-inset")}
                style={{ width: `${w}%`, background: `${KIND_COLOR[s.kind] ?? "#9a9384"}55` }}
              >
                <span
                  className="absolute inset-x-0 bottom-0 h-1"
                  style={{ background: KIND_COLOR[s.kind] ?? "#9a9384" }}
                />
              </div>
            );
          })}
          {nowMin >= DAY_START && nowMin <= DAY_END ? (
            <span
              className="absolute top-0 bottom-0 w-0.5 bg-foreground"
              style={{ left: `${((nowMin - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
            />
          ) : null}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[0.6rem] text-muted-foreground">
          <span>{minToLabel(DAY_START)}</span>
          <span>{minToLabel((DAY_START + DAY_END) / 2)}</span>
          <span>{minToLabel(DAY_END)}</span>
        </div>
      </div>

      {/* Period list */}
      <ul className="space-y-1">
        {slots.map((s) => {
          const active = nowMin >= s.startMin && nowMin < s.endMin;
          const past = nowMin >= s.endMin;
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                active ? "border-foreground/40 bg-muted/50 font-medium" : "border-border",
                past && "opacity-50",
              )}
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[s.kind] ?? "#9a9384" }} />
              <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{slotRangeLabel(s)}</span>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {active ? <AlarmClock className="size-3.5 shrink-0 text-foreground" /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TeamWall({
  rows,
  loading,
  nowMin,
}: {
  rows: {
    id: string;
    name: string;
    department: string | null;
    slots: { id: string; startMin: number; endMin: number; label: string; kind: string }[];
    current: { label: string } | null;
  }[];
  loading: boolean;
  nowMin: number;
}) {
  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        No team members yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((u) => (
        <li key={u.id} className="rounded-lg border border-border p-2.5">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Users className="size-3.5 text-muted-foreground" />
              {u.name}
              <span className="text-xs font-normal text-muted-foreground">{u.department ?? ""}</span>
            </span>
            <span className="text-xs text-muted-foreground">{u.current ? u.current.label : "off the clock"}</span>
          </div>
          {u.slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">No timetable generated.</p>
          ) : (
            <div className="relative flex h-4 w-full overflow-hidden rounded ring-1 ring-foreground/10">
              {u.slots.map((s) => (
                <div
                  key={s.id}
                  title={`${s.label} · ${slotRangeLabel(s)}`}
                  style={{
                    width: `${((s.endMin - s.startMin) / (DAY_END - DAY_START)) * 100}%`,
                    background: `${KIND_COLOR[s.kind] ?? "#9a9384"}88`,
                  }}
                />
              ))}
              {nowMin >= DAY_START && nowMin <= DAY_END ? (
                <span
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground"
                  style={{ left: `${((nowMin - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
                />
              ) : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
