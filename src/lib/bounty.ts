// Bounty board economics.
//
// An unclaimed mission on the open board pays its base XP plus an urgency bonus.
// The bonus is what makes someone walk over and grab the fire instead of the
// comfortable ticket: urgent priority and a closing deadline stack, capped at
// double XP. The bonus is computed live for the board and frozen onto the task
// at claim time, so nobody loses the reward they signed up for when a deadline
// slips past.

export type UrgencyTier = "critical" | "urgent" | "soon" | "standard";

export type BountyReward = {
  base: number;
  /** Bonus as a fraction of base, 0..1. */
  bonusPct: number;
  bonus: number;
  total: number;
  tier: UrgencyTier;
  /** Hours until the deadline; negative when overdue, null when there isn't one. */
  hoursLeft: number | null;
};

export const URGENCY_META: Record<
  UrgencyTier,
  { label: string; color: string; short: string }
> = {
  critical: { label: "Critical", color: "#e0574f", short: "CRIT" },
  urgent: { label: "Urgent", color: "#e0a13a", short: "URG" },
  soon: { label: "Time-boxed", color: "#5fa4d0", short: "SOON" },
  standard: { label: "Standard", color: "#9a9384", short: "STD" },
};

const PRIORITY_BONUS: Record<string, number> = {
  urgent: 0.5,
  high: 0.25,
  medium: 0,
  low: 0,
};

/** Bonus stacked on top of priority for a deadline that is closing in. */
function deadlineBonus(hoursLeft: number | null): number {
  if (hoursLeft === null) return 0;
  if (hoursLeft <= 6) return 0.3; // overdue or same-shift
  if (hoursLeft <= 24) return 0.15;
  if (hoursLeft <= 72) return 0.05;
  return 0;
}

export const MAX_BONUS_PCT = 1;

export function hoursUntil(dueAt: Date | string | null | undefined, now: Date): number | null {
  if (!dueAt) return null;
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  return (due.getTime() - now.getTime()) / 3_600_000;
}

export function bountyReward(input: {
  points: number;
  priority: string;
  dueAt?: Date | string | null;
  now?: Date;
}): BountyReward {
  const base = Math.max(0, Math.floor(input.points));
  const now = input.now ?? new Date();
  const hoursLeft = hoursUntil(input.dueAt, now);
  const bonusPct = Math.min(
    MAX_BONUS_PCT,
    (PRIORITY_BONUS[input.priority] ?? 0) + deadlineBonus(hoursLeft),
  );
  const bonus = Math.round(base * bonusPct);
  return {
    base,
    bonusPct,
    bonus,
    total: base + bonus,
    tier: tierFor(bonusPct),
    hoursLeft,
  };
}

export function tierFor(bonusPct: number): UrgencyTier {
  if (bonusPct >= 0.5) return "critical";
  if (bonusPct >= 0.25) return "urgent";
  if (bonusPct > 0) return "soon";
  return "standard";
}

/** Board ordering: hottest bounty first, then the biggest payout. */
export function compareBounties(
  a: { bonusPct: number; total: number; createdAt?: Date | string },
  b: { bonusPct: number; total: number; createdAt?: Date | string },
): number {
  if (b.bonusPct !== a.bonusPct) return b.bonusPct - a.bonusPct;
  if (b.total !== a.total) return b.total - a.total;
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return at - bt;
}
