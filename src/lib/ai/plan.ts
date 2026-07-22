import "server-only";
import { callClaude, extractJson, isAiEnabled } from "./client";
import {
  heuristicPlan,
  pointsForPriority,
  type MissionDraft,
  type RosterMember,
} from "./heuristics";

const VERTICALS = [
  "website-dev",
  "digital-marketing",
  "roadmap",
  "client-outreach",
  "billing",
];
const PRIORITIES = ["low", "medium", "high", "urgent"];

export type PlanResult = {
  aiEnabled: boolean;
  usedAi: boolean;
  drafts: MissionDraft[];
};

export async function planMissions(
  prompt: string,
  roster: RosterMember[],
): Promise<PlanResult> {
  if (isAiEnabled()) {
    const ai = await tryClaude(prompt, roster);
    if (ai && ai.length > 0) {
      return { aiEnabled: true, usedAi: true, drafts: ai };
    }
  }
  // Deterministic fallback.
  return {
    aiEnabled: isAiEnabled(),
    usedAi: false,
    drafts: [heuristicPlan(prompt, roster)],
  };
}

async function tryClaude(
  prompt: string,
  roster: RosterMember[],
): Promise<MissionDraft[] | null> {
  const rosterText = roster
    .map((m) => `- ${m.id} | ${m.name} | ${m.role} | ${m.department ?? "—"}`)
    .join("\n");

  const system = `You are Auxa's AI senior operations manager. You break a request into 1-4 concrete missions and route each to the best-fit teammate.
Verticals: ${VERTICALS.join(", ")}.
Priorities: ${PRIORITIES.join(", ")}.
Team roster (id | name | role | department):
${rosterText}

Return ONLY a JSON array. Each item:
{"title": string, "description": string, "vertical": one of the verticals, "priority": one of the priorities, "points": integer 10-50, "assigneeId": a roster id or null, "rationale": one sentence explaining the routing}`;

  const text = await callClaude(system, [
    { role: "user", content: prompt },
  ]);
  if (!text) return null;

  type RawDraft = {
    title?: string;
    description?: string;
    vertical?: string;
    priority?: string;
    points?: number;
    assigneeId?: string | null;
    rationale?: string;
  };
  const parsed = extractJson<RawDraft[]>(text);
  if (!Array.isArray(parsed)) return null;

  const byId = new Map(roster.map((m) => [m.id, m]));
  return parsed.slice(0, 4).map((d) => {
    const vertical = VERTICALS.includes(d.vertical ?? "")
      ? (d.vertical as string)
      : "roadmap";
    const priority = PRIORITIES.includes(d.priority ?? "")
      ? (d.priority as string)
      : "medium";
    const assignee = d.assigneeId ? byId.get(d.assigneeId) : undefined;
    return {
      title: (d.title ?? "Untitled mission").slice(0, 120),
      description: d.description ?? "",
      vertical,
      priority,
      points:
        typeof d.points === "number" && d.points > 0
          ? Math.min(50, Math.round(d.points))
          : pointsForPriority(priority),
      assigneeId: assignee?.id ?? null,
      assigneeName: assignee?.name ?? null,
      rationale: d.rationale ?? "",
    };
  });
}
