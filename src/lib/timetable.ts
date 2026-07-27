// The school-bell timetable.
//
// The AI (or its deterministic fallback here) splits everyone's working day
// into blocks — planning, client work, lunch, scripting, follow-ups, journaling
// and posting confirmation — and the bell rings on every block change. After
// lunch the team logs back in, so tracking has no silent gaps.
//
// Pure functions only; the router persists what this produces.

export type SlotKind =
  | "planning"
  | "work"
  | "lunch"
  | "scripting"
  | "followup"
  | "journal"
  | "posting"
  | "outreach";

export type PlanSlot = {
  startMin: number;
  endMin: number;
  label: string;
  kind: SlotKind;
  clientId?: string | null;
};

export type PlanTask = {
  id: string;
  title: string;
  clientId?: string | null;
  clientName?: string | null;
  priority: string;
  dueAt?: Date | string | null;
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function minToLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ampm = h24 < 12 ? "am" : "pm";
  return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

export function slotRangeLabel(s: { startMin: number; endMin: number }): string {
  return `${minToLabel(s.startMin)} – ${minToLabel(s.endMin)}`;
}

/** Order tasks the way the day should eat them: urgency first, then deadline. */
export function rankTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return da - db;
  });
}

/**
 * A creative/ops day: the school template — 10 to 12 planning & shooting, client
 * blocks, lunch at 2, scripting, follow-ups, journaling, posting confirmation.
 * Work blocks are filled from the person's open missions, grouped by client.
 */
export function generateDayPlan(tasks: PlanTask[], opts?: { developer?: boolean }): PlanSlot[] {
  const ranked = rankTasks(tasks);
  const slots: PlanSlot[] = [];

  if (opts?.developer) {
    // Developers run project-basis: two deep-work feature blocks around lunch.
    const [first, second, third] = [ranked[0], ranked[1], ranked[2]];
    slots.push(block(600, 720, first, "Feature work", "work"));
    slots.push(block(720, 840, second ?? first, "Feature work", "work"));
    slots.push({ startMin: 840, endMin: 900, label: "Lunch break", kind: "lunch" });
    slots.push(block(900, 1020, third ?? second ?? first, "Build & review", "work"));
    slots.push({ startMin: 1020, endMin: 1080, label: "Code review & follow-ups", kind: "followup" });
    slots.push({ startMin: 1080, endMin: 1140, label: "Journal & wind-up report", kind: "journal" });
    slots.push({ startMin: 1140, endMin: 1200, label: "Deploy / staging confirmation", kind: "posting" });
    return slots;
  }

  const [first, second] = [ranked[0], ranked[1]];
  slots.push({ startMin: 600, endMin: 720, label: "Planning & shooting for Auxa", kind: "planning" });
  slots.push(block(720, 840, first, "Client content", "work"));
  slots.push({ startMin: 840, endMin: 900, label: "Lunch break", kind: "lunch" });
  slots.push(block(900, 960, second ?? first, "Scripting", "scripting"));
  slots.push({ startMin: 960, endMin: 1020, label: "Follow-ups & outreach", kind: "followup" });
  slots.push({ startMin: 1020, endMin: 1080, label: "Journal & wind-up report", kind: "journal" });
  slots.push({ startMin: 1080, endMin: 1140, label: "Posting confirmation on socials", kind: "posting" });
  return slots;
}

function block(
  startMin: number,
  endMin: number,
  task: PlanTask | undefined,
  fallback: string,
  kind: SlotKind,
): PlanSlot {
  if (!task) return { startMin, endMin, label: fallback, kind };
  const who = task.clientName ? `${task.clientName} — ` : "";
  return {
    startMin,
    endMin,
    label: `${who}${task.title}`,
    kind,
    clientId: task.clientId ?? null,
  };
}

export function currentSlot<T extends { startMin: number; endMin: number }>(
  slots: T[],
  nowMin: number,
): T | null {
  return slots.find((s) => nowMin >= s.startMin && nowMin < s.endMin) ?? null;
}

export function nextSlot<T extends { startMin: number; endMin: number }>(
  slots: T[],
  nowMin: number,
): T | null {
  const upcoming = slots.filter((s) => s.startMin > nowMin).sort((a, b) => a.startMin - b.startMin);
  return upcoming[0] ?? null;
}

/** The post-lunch gate: true when lunch is over and the person hasn't logged back in. */
export function needsRelogin(
  slots: { endMin: number; kind: string }[],
  nowMin: number,
  reloggedToday: boolean,
): boolean {
  if (reloggedToday) return false;
  const lunch = slots.find((s) => s.kind === "lunch");
  return !!lunch && nowMin >= lunch.endMin;
}

export function minutesNow(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
