// Outreach CRM scoring.
//
// The schema keeps a lead lean — no lastTouchedAt, no activity log on the
// target itself — so "when was this lead last worked?" is derived from what the
// room already writes: the day it was pulled into an agent's run, and any OTP
// fired at its number. Recording a touch writes the same two fields back, so
// the derivation and the mutation agree without a migration.

export const LEAD_STATUSES = [
  "pending",
  "contacted",
  "hot",
  "converted",
  "dropped",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  contacted: "Contacted",
  hot: "Hot",
  converted: "Converted",
  dropped: "Dropped",
};

/** How a lead's last touch was established — drives the wording in the UI. */
export type TouchSource = "otp" | "worked" | "none";

export type LastTouch = { at: Date; source: TouchSource };

/** Parses a YYYY-MM-DD day key into a local Date, or null if it isn't one. */
export function parseDayKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The most recent moment we can prove somebody worked this lead. Falls back to
 * the day it entered the pool, flagged `none` so the UI can say "never worked"
 * rather than pretending the intake was a conversation.
 */
export function deriveLastTouch(target: {
  status: string;
  assignedDate?: string | null;
  createdAt: Date;
  latestOtpAt?: Date | null;
}): LastTouch {
  const worked =
    target.status !== "pending" ? parseDayKey(target.assignedDate) : null;
  const otp = target.latestOtpAt ?? null;
  if (otp && (!worked || otp.getTime() >= worked.getTime())) {
    return { at: otp, source: "otp" };
  }
  if (worked) return { at: worked, source: "worked" };
  return { at: target.createdAt, source: "none" };
}

export function daysSince(at: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000));
}

/** Everything the urgency call needs, with no Prisma types attached. */
export type LeadSignal = {
  status: string;
  /** An OTP is out and still inside its window — the lead is mid-handshake. */
  otpPending: boolean;
  /** An OTP went out and expired without the lead reading it back. */
  otpExpired: boolean;
  daysSinceTouch: number;
  touchSource: TouchSource;
  hasPhone: boolean;
  assigned: boolean;
  ownerName?: string | null;
};

export type FollowUp = {
  /** Higher is more urgent. */
  urgency: number;
  why: string;
  nextAction: string;
  /** Rough banding for the badge colour. */
  tier: "now" | "today" | "soon";
};

/** A lead goes stale after this long with nothing recorded against it. */
export const STALE_AFTER_DAYS = 3;

function tierOf(urgency: number): FollowUp["tier"] {
  if (urgency >= 80) return "now";
  if (urgency >= 55) return "today";
  return "soon";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Why this lead needs chasing and what to do about it — or null when it needs
 * nothing (already converted, dropped, or worked recently enough to leave be).
 */
export function assessFollowUp(
  signal: LeadSignal,
  staleAfterDays: number = STALE_AFTER_DAYS,
): FollowUp | null {
  const { status, daysSinceTouch: days } = signal;
  if (status === "converted" || status === "dropped") return null;

  const ago =
    signal.touchSource === "none"
      ? `sitting untouched for ${plural(days, "day", "days")}`
      : days === 0
        ? "worked today"
        : `last worked ${plural(days, "day", "days")} ago`;
  const stale = days >= staleAfterDays;
  const age = Math.min(days, 30);

  if (signal.otpPending) {
    return {
      urgency: 100 + age,
      why: "OTP is out and still unconfirmed — the code expires in minutes.",
      nextAction: signal.hasPhone
        ? "Call back now and read the code with them."
        : "Get a number on file and re-send the code.",
      tier: "now",
    };
  }

  if (signal.otpExpired) {
    return {
      urgency: 88 + age,
      why: `The OTP expired without the lead confirming — ${ago}.`,
      nextAction: "Re-send the code while the pitch is still fresh.",
      tier: tierOf(88),
    };
  }

  if (status === "hot") {
    return {
      urgency: 78 + age * 2,
      why: `Marked hot but not closed — ${ago}.`,
      nextAction: signal.hasPhone
        ? "Send the OTP and close them into the CRM."
        : "Chase a contact number, then run the OTP handshake.",
      tier: tierOf(78 + age * 2),
    };
  }

  if (status === "contacted" && stale) {
    return {
      urgency: 55 + age,
      why: `Contacted and then nothing — ${ago}.`,
      nextAction: "Second call: reference the first pitch and ask for the meeting.",
      tier: tierOf(55 + age),
    };
  }

  if (status === "pending" && signal.assigned && stale) {
    return {
      urgency: 38 + age,
      why: `On ${signal.ownerName ?? "an agent"}'s run but never called — ${ago}.`,
      nextAction: "Work the lead today or hand it back to the pending pool.",
      tier: tierOf(38 + age),
    };
  }

  if (status === "pending" && !signal.assigned && stale) {
    return {
      urgency: 25 + age,
      why: `Unclaimed in the pending pool — ${ago}.`,
      nextAction: "Push the sector to an agent so it gets a first call.",
      tier: tierOf(25 + age),
    };
  }

  return null;
}

/** Most urgent first, oldest first inside a tie, then alphabetical. */
export function compareFollowUps(
  a: { urgency: number; daysSinceTouch: number; name: string },
  b: { urgency: number; daysSinceTouch: number; name: string },
): number {
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;
  if (a.daysSinceTouch !== b.daysSinceTouch)
    return b.daysSinceTouch - a.daysSinceTouch;
  return a.name.localeCompare(b.name);
}
