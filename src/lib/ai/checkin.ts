// The conversational daily check-in.
//
// An interviewer walks the employee through their day one question at a time,
// then turns the transcript into a report the admin receives. Everything here
// is pure so the flow is testable and so the feature still works end-to-end
// when no ANTHROPIC_API_KEY is configured — the scripted interviewer asks the
// same questions and the report is assembled deterministically.

export type Turn = { role: "assistant" | "user"; content: string };

/** Marker the model emits once it has enough to write the report. */
export const REPORT_READY = "REPORT_READY";

/** Hard ceiling on questions so a rambling conversation still terminates. */
export const MAX_QUESTIONS = 6;

/**
 * The scripted interview, used verbatim when there's no model available and as
 * the shape the model is told to follow when there is.
 */
export const SCRIPTED_QUESTIONS = [
  "Hey — let's log your day. What did you actually get done today?",
  "Good. Did anything block you or slip behind?",
  "Anything you need from someone else to keep moving?",
  "What's first on your list tomorrow?",
  "Last one: how was the load today — sustainable, light, or too much?",
] as const;

export function openingQuestion(): string {
  return SCRIPTED_QUESTIONS[0];
}

/** How many questions the interviewer has already asked. */
export function askedCount(history: Turn[]): number {
  return history.filter((t) => t.role === "assistant").length;
}

export function answeredCount(history: Turn[]): number {
  return history.filter((t) => t.role === "user" && t.content.trim().length > 0).length;
}

/**
 * The interview ends when the model says it's ready, when the script runs out,
 * or when we hit the ceiling — whichever comes first.
 */
export function isComplete(history: Turn[]): boolean {
  const last = [...history].reverse().find((t) => t.role === "assistant");
  if (last && last.content.includes(REPORT_READY)) return true;
  return answeredCount(history) >= Math.min(MAX_QUESTIONS, SCRIPTED_QUESTIONS.length);
}

/** Next scripted question, or null when the script is exhausted. */
export function nextScriptedQuestion(history: Turn[]): string | null {
  const asked = askedCount(history);
  return asked < SCRIPTED_QUESTIONS.length ? SCRIPTED_QUESTIONS[asked] : null;
}

export type CheckinContext = {
  userName: string;
  /** Titles of tasks the person moved today. */
  tasksToday: string[];
  /** Their timetable block right now, if any. */
  currentSlot: string | null;
};

export function interviewSystemPrompt(ctx: CheckinContext): string {
  const tasks = ctx.tasksToday.length
    ? ctx.tasksToday.map((t) => `- ${t}`).join("\n")
    : "- (nothing recorded in the tracker today)";
  return [
    `You are the daily check-in interviewer for ${ctx.userName} at Auxa, a creative agency.`,
    "Interview them about their working day so their manager gets an accurate report.",
    "",
    "Rules:",
    "- Ask exactly ONE question per reply. Keep it to one or two sentences.",
    "- Be warm and direct, like a good team lead. No corporate filler.",
    "- Follow up on vague answers with a specific probe, but never interrogate.",
    `- Cover: what got done, blockers, help needed, tomorrow's priority, workload.`,
    `- After at most ${MAX_QUESTIONS} questions, reply with exactly "${REPORT_READY}" and nothing else.`,
    "",
    "What the tracker already shows for them today:",
    tasks,
    ctx.currentSlot ? `Their current timetable block: ${ctx.currentSlot}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function reportSystemPrompt(ctx: CheckinContext): string {
  return [
    `Write ${ctx.userName}'s end-of-day report from the check-in transcript.`,
    "Return STRICT JSON only, no prose or code fences, with these keys:",
    '{"summary": string, "blockers": string|null, "tomorrow": string|null, "mood": "good"|"ok"|"strained"}',
    "- summary: 2-4 sentences, third person, concrete about what was delivered.",
    "- blockers: what is actually blocked, or null if nothing is.",
    "- tomorrow: their stated next priority, or null.",
    "- mood: how sustainable their workload sounded.",
  ].join("\n");
}

export type CheckinReport = {
  summary: string;
  blockers: string | null;
  tomorrow: string | null;
  mood: "good" | "ok" | "strained";
};

/** Parse the model's JSON report, tolerating stray fences or surrounding text. */
export function parseReport(raw: string | null): CheckinReport | null {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Partial<CheckinReport>;
    if (typeof obj.summary !== "string" || obj.summary.trim().length === 0) return null;
    const mood = obj.mood === "good" || obj.mood === "strained" ? obj.mood : "ok";
    return {
      summary: obj.summary.trim(),
      blockers: typeof obj.blockers === "string" && obj.blockers.trim() ? obj.blockers.trim() : null,
      tomorrow: typeof obj.tomorrow === "string" && obj.tomorrow.trim() ? obj.tomorrow.trim() : null,
      mood,
    };
  } catch {
    return null;
  }
}

const STRAIN = ["too much", "overloaded", "burn", "swamped", "stressed", "heavy", "exhaust"];
const LIGHT = ["light", "easy", "fine", "good", "sustainable", "manageable"];

/**
 * Build the report from the transcript alone. Answers land in the order the
 * scripted questions were asked, so each one maps to a known field.
 */
export function fallbackReport(history: Turn[], ctx: CheckinContext): CheckinReport {
  const answers = history.filter((t) => t.role === "user").map((t) => t.content.trim());
  const [done, blocked, help, tomorrow, load] = answers;

  const parts: string[] = [];
  if (done) parts.push(`${ctx.userName} reported: ${done}`);
  else parts.push(`${ctx.userName} checked in without listing specific work.`);
  if (ctx.tasksToday.length > 0) {
    parts.push(`Tracker shows movement on: ${ctx.tasksToday.slice(0, 5).join(", ")}.`);
  }
  if (help && !/^(no|none|nothing|nope|n\/a)\b/i.test(help)) {
    parts.push(`Needs: ${help}`);
  }

  const blockers =
    blocked && !/^(no|none|nothing|nope|n\/a)\b/i.test(blocked) ? blocked : null;

  const loadText = (load ?? "").toLowerCase();
  let mood: CheckinReport["mood"] = "ok";
  if (STRAIN.some((w) => loadText.includes(w))) mood = "strained";
  else if (LIGHT.some((w) => loadText.includes(w))) mood = "good";

  return {
    summary: parts.join(" "),
    blockers,
    tomorrow: tomorrow && tomorrow.length > 1 ? tomorrow : null,
    mood,
  };
}

/** The transcript, rendered for storage in the journal. */
export function transcriptText(history: Turn[]): string {
  return history
    .map((t) => `${t.role === "assistant" ? "Check-in" : "Me"}: ${t.content.trim()}`)
    .join("\n\n");
}
