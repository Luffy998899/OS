// Pure, dependency-free planning heuristics. Used as the fallback when no
// Claude API key is configured, and unit-tested in isolation.

export type RosterMember = {
  id: string;
  name: string;
  department: string | null;
  role: string;
};

export type MissionDraft = {
  title: string;
  description: string;
  vertical: string;
  priority: string;
  points: number;
  assigneeId: string | null;
  assigneeName: string | null;
  rationale: string;
};

export const VERTICAL_DEPARTMENT: Record<string, string> = {
  "website-dev": "Engineering",
  "digital-marketing": "Design & Marketing",
  "client-outreach": "Client Success",
  billing: "Operations",
  roadmap: "Leadership",
};

export function detectVertical(text: string): string {
  const t = text.toLowerCase();
  if (/\b(invoice|billing|payment|refund|reconcile|ledger|accounts?)\b/.test(t))
    return "billing";
  if (
    /\b(client|lead|follow.?up|outreach|prospect|demo|proposal|cold call|pipeline)\b/.test(
      t,
    )
  )
    return "client-outreach";
  if (
    /\b(website|web ?app|landing|frontend|front-end|backend|back-end|app dev|software|api|deploy|bug|feature|component|ui)\b/.test(
      t,
    )
  )
    return "website-dev";
  if (
    /\b(content|marketing|social|seo|campaign|blog|copy|ads?|video|creative|design|brand)\b/.test(
      t,
    )
  )
    return "digital-marketing";
  return "roadmap";
}

export function detectPriority(text: string): string {
  const t = text.toLowerCase();
  if (/\b(urgent|asap|immediately|critical|right now|today)\b/.test(t))
    return "urgent";
  if (/\b(important|high priority|priority|soon|by (tomorrow|eod))\b/.test(t))
    return "high";
  if (/\b(low priority|whenever|someday|minor|nice to have)\b/.test(t))
    return "low";
  return "medium";
}

export function pointsForPriority(priority: string): number {
  return { urgent: 40, high: 30, medium: 20, low: 10 }[priority] ?? 20;
}

function toTitle(prompt: string): string {
  const firstLine = prompt.split(/[\n.]/)[0].trim();
  const trimmed = firstLine.length > 90 ? firstLine.slice(0, 90) + "…" : firstLine;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function pickAssignee(
  vertical: string,
  roster: RosterMember[],
): RosterMember | null {
  const dept = VERTICAL_DEPARTMENT[vertical];
  const match = roster.find(
    (m) =>
      m.department &&
      dept &&
      m.department.toLowerCase().includes(dept.toLowerCase()),
  );
  if (match) return match;
  // fall back to any non-admin member
  return roster.find((m) => m.role !== "Admin") ?? roster[0] ?? null;
}

export function heuristicPlan(
  prompt: string,
  roster: RosterMember[],
): MissionDraft {
  const vertical = detectVertical(prompt);
  const priority = detectPriority(prompt);
  const assignee = pickAssignee(vertical, roster);
  const dept = VERTICAL_DEPARTMENT[vertical];
  return {
    title: toTitle(prompt),
    description: prompt.trim(),
    vertical,
    priority,
    points: pointsForPriority(priority),
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    rationale: assignee
      ? `${dept} work → routed to ${assignee.name} (${assignee.department ?? assignee.role}).`
      : `Classified as ${vertical.replace("-", " ")} work.`,
  };
}
