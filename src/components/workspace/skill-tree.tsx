"use client";

// The Skill Tree — XP as a career path rather than a score.
//
// Every completed mission credits the craft it belongs to. Craft levels are
// visible here and are what the bounty board checks before letting someone claim
// work, so the ladder has a consequence instead of being decoration.

import { Check, Loader2, Lock, Sparkles, Trophy } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { MAX_SKILL_LEVEL, SKILL_TIERS, type SkillKey } from "@/lib/skills";
import { cn } from "@/lib/utils";

export function SkillTreePanel({ compact = false }: { compact?: boolean }) {
  const tree = trpc.skill.tree.useQuery();

  if (tree.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!tree.data) return null;

  const { tracks, overall, points, speciality, totalCraftXp } = tree.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">
            {overall.level}
          </span>
          <div>
            <p className="text-sm font-semibold">
              {speciality ? `${speciality.tier} ${speciality.label}` : "Unspecialised"}
            </p>
            <p className="text-xs text-muted-foreground">
              {speciality
                ? `Level ${overall.level} overall · ${totalCraftXp} craft XP earned`
                : "Finish a mission to start a craft track"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Trophy className="size-4 text-muted-foreground" />
          <span className="font-semibold tabular-nums">{points}</span>
          <span className="text-xs text-muted-foreground">lifetime XP</span>
        </div>
      </div>

      {/* Compact stays single-column: it lives in narrow sidebars. */}
      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {tracks.map((track) => (
          <CraftTrack key={track.key} track={track} compact={compact} />
        ))}
      </div>
    </div>
  );
}

type Track = RouterOutputs["skill"]["tree"]["tracks"][number];

function CraftTrack({ track, compact }: { track: Track; compact: boolean }) {
  const maxed = track.level >= MAX_SKILL_LEVEL;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 items-center justify-center rounded-lg text-sm font-bold"
            style={{ background: `${track.color}22`, color: track.color }}
          >
            {track.level}
          </span>
          <div>
            <p className="text-sm font-semibold">{track.label}</p>
            <p className="text-xs text-muted-foreground">
              {track.tier}
              {track.missionsCompleted > 0
                ? ` · ${track.missionsCompleted} mission${track.missionsCompleted === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
        </div>
        {track.openBounties > 0 ? (
          <span
            className="rounded-full px-2 py-0.5 text-[0.65rem] font-semibold whitespace-nowrap"
            style={{ background: `${track.color}1f`, color: track.color }}
            title={`${track.eligibleBounties} of ${track.openBounties} open bounties are within your level`}
          >
            {track.eligibleBounties}/{track.openBounties} open
          </span>
        ) : null}
      </div>

      {/* Tier rail — the whole ladder at a glance, with where you stand on it. */}
      <div className="flex items-center gap-1">
        {SKILL_TIERS.map((tier) => (
          <div
            key={tier.level}
            title={`${tier.name} — ${tier.at} XP`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width:
                  track.level > tier.level
                    ? "100%"
                    : track.level === tier.level
                      ? `${Math.round(track.progress * 100)}%`
                      : "0%",
                background: track.color,
              }}
            />
          </div>
        ))}
      </div>

      <p className="font-mono text-[0.65rem] tracking-wide text-muted-foreground">
        {maxed ? (
          <>{track.xp} XP · mastered</>
        ) : (
          <>
            {track.xp} XP · {track.toNext} to {track.next}
          </>
        )}
      </p>

      {!compact ? (
        <ul className="space-y-1 border-t border-border pt-2.5">
          {track.unlocks.map((unlock) => (
            <li
              key={unlock.level}
              className={cn(
                "flex items-start gap-1.5 text-xs",
                unlock.earned ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {unlock.earned ? (
                <Check className="mt-0.5 size-3 shrink-0" style={{ color: track.color }} />
              ) : (
                <Lock className="mt-0.5 size-3 shrink-0 opacity-60" />
              )}
              <span className={cn(!unlock.earned && "opacity-80")}>{unlock.label}</span>
            </li>
          ))}
        </ul>
      ) : track.nextUnlock ? (
        <p className="flex items-start gap-1.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3 shrink-0" />
          Next: {track.nextUnlock.label}
        </p>
      ) : null}
    </div>
  );
}

/** Compact craft chips for headers and the lobby. */
export function CraftChips({
  levels,
  className,
}: {
  levels: Partial<Record<SkillKey, number>> | undefined;
  className?: string;
}) {
  const tree = trpc.skill.tree.useQuery(undefined, { enabled: !levels });
  const tracks = tree.data?.tracks;
  if (!tracks) return null;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {tracks.map((t) => (
        <span
          key={t.key}
          title={`${t.label} — ${t.tier} (${t.xp} XP)`}
          className="flex size-6 items-center justify-center rounded font-mono text-[0.65rem] font-bold"
          style={{ background: `${t.color}22`, color: t.color }}
        >
          {levels?.[t.key] ?? t.level}
        </span>
      ))}
    </div>
  );
}
