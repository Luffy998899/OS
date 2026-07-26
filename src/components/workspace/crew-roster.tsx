"use client";

// Who's on the floor and what they're levelled in. Shows the crewmate each
// person is assigned, so the roster and the first-person view agree on identity.

import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { characterFor } from "@/lib/characters";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  online: "bg-success",
  busy: "bg-warning",
  away: "bg-muted-foreground",
};

export function CrewRosterPanel() {
  const roster = trpc.skill.roster.useQuery();
  const state = trpc.workspace.state.useQuery(undefined, { refetchInterval: 10_000 });

  if (roster.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const presence = new Map(
    (state.data?.players ?? []).map((p) => [p.userId, p]),
  );

  return (
    <ul className="divide-y divide-border">
      {(roster.data ?? []).map((member) => {
        const live = presence.get(member.id);
        const character = characterFor(live?.characterId ?? null, member.id);
        const room = state.data?.rooms.find((r) => r.id === live?.roomId);
        return (
          <li key={member.id} className="flex items-center gap-3 py-2.5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[0.6rem] font-bold"
              style={{ background: character.suit, color: "#12110f" }}
              title={character.trait}
            >
              {character.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {member.name}
                {live ? (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      STATUS_DOT[live.status] ?? STATUS_DOT.away,
                    )}
                    title={live.status}
                  />
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {character.name}
                {member.speciality ? ` · ${member.speciality.tier} ${member.speciality.label}` : ""}
                {room ? ` · in ${room.name}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {member.crafts.map((craft) => (
                <span
                  key={craft.key}
                  title={`${craft.label} — ${craft.tier} (${craft.xp} XP)`}
                  className="flex size-6 items-center justify-center rounded font-mono text-[0.65rem] font-bold"
                  style={{
                    background: craft.level > 0 ? `${craft.color}22` : "transparent",
                    color: craft.level > 0 ? craft.color : "var(--color-muted-foreground)",
                  }}
                >
                  {craft.level}
                </span>
              ))}
              <span className="ml-1.5 w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {member.points}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
