// Miro-style whiteboard templates. Pure data (no tldraw import) so the picker can
// render metadata; the canvas turns `shapes` into real tldraw shapes on first open.

export type TemplateShape =
  | { kind: "text"; x: number; y: number; text: string; size?: "m" | "l" | "xl" }
  | { kind: "note"; x: number; y: number; text: string; color?: string }
  | {
      kind: "geo";
      x: number;
      y: number;
      w: number;
      h: number;
      text?: string;
      color?: string;
      fill?: "none" | "semi" | "solid" | "pattern";
      geo?: "rectangle" | "ellipse";
    };

export type Template = {
  key: string;
  name: string;
  category: string;
  thumb: "central" | "columns3" | "columns4" | "grid2x2" | "grid3" | "sections" | "rows";
  description: string;
  shapes: TemplateShape[];
};

export const CATEGORIES = [
  "All",
  "Ideation & brainstorming",
  "Agile workflows",
  "Strategy & planning",
  "Research & design",
  "Meetings & workshops",
] as const;

function lane(x: number, title: string, color: string, notes: { text: string; color?: string }[]): TemplateShape[] {
  const shapes: TemplateShape[] = [
    { kind: "geo", x, y: 150, w: 280, h: 520, color, fill: "none" },
    { kind: "text", x: x + 16, y: 165, text: title, size: "l" },
  ];
  notes.forEach((n, i) => {
    shapes.push({ kind: "note", x: x + 20, y: 235 + i * 130, text: n.text, color: n.color ?? "yellow" });
  });
  return shapes;
}

function grid(
  x0: number,
  y0: number,
  cellW: number,
  cellH: number,
  gap: number,
  cols: number,
  cells: { title: string; color?: string }[],
): TemplateShape[] {
  const shapes: TemplateShape[] = [];
  cells.forEach((c, i) => {
    const cx = x0 + (i % cols) * (cellW + gap);
    const cy = y0 + Math.floor(i / cols) * (cellH + gap);
    shapes.push({ kind: "geo", x: cx, y: cy, w: cellW, h: cellH, color: c.color ?? "grey", fill: "none" });
    shapes.push({ kind: "text", x: cx + 14, y: cy + 12, text: c.title, size: "m" });
  });
  return shapes;
}

const title = (t: string): TemplateShape => ({ kind: "text", x: 120, y: 64, text: t, size: "xl" });

export const TEMPLATES: Template[] = [
  {
    key: "blank",
    name: "Blank",
    category: "All",
    thumb: "sections",
    description: "Start from an empty canvas.",
    shapes: [],
  },

  // Ideation & brainstorming
  {
    key: "brainstorm",
    name: "Brainstorm",
    category: "Ideation & brainstorming",
    thumb: "central",
    description: "Central idea with sticky notes.",
    shapes: [
      title("Brainstorm"),
      { kind: "geo", x: 460, y: 300, w: 220, h: 130, geo: "ellipse", color: "black", fill: "semi", text: "Central idea" },
      { kind: "note", x: 160, y: 180, text: "Idea", color: "yellow" },
      { kind: "note", x: 760, y: 180, text: "What if…", color: "green" },
      { kind: "note", x: 150, y: 470, text: "Question?", color: "blue" },
      { kind: "note", x: 780, y: 470, text: "Risk", color: "orange" },
      { kind: "note", x: 470, y: 560, text: "Next step", color: "yellow" },
    ],
  },
  {
    key: "mindmap",
    name: "Mind map",
    category: "Ideation & brainstorming",
    thumb: "central",
    description: "Central topic with branches.",
    shapes: [
      { kind: "geo", x: 470, y: 320, w: 200, h: 110, geo: "ellipse", color: "black", fill: "semi", text: "Topic" },
      { kind: "geo", x: 150, y: 150, w: 180, h: 80, color: "blue", text: "Branch A" },
      { kind: "geo", x: 820, y: 150, w: 180, h: 80, color: "green", text: "Branch B" },
      { kind: "geo", x: 150, y: 520, w: 180, h: 80, color: "orange", text: "Branch C" },
      { kind: "geo", x: 820, y: 520, w: 180, h: 80, color: "red", text: "Branch D" },
    ],
  },
  {
    key: "affinity",
    name: "Affinity map",
    category: "Ideation & brainstorming",
    thumb: "columns4",
    description: "Cluster ideas into themes.",
    shapes: [
      title("Affinity map"),
      ...["Theme 1", "Theme 2", "Theme 3", "Theme 4"].flatMap((t, i) => [
        { kind: "text", x: 130 + i * 230, y: 150, text: t, size: "l" } as TemplateShape,
        { kind: "note", x: 130 + i * 230, y: 200, text: "…", color: ["yellow", "green", "blue", "orange"][i] } as TemplateShape,
        { kind: "note", x: 130 + i * 230, y: 320, text: "…", color: ["yellow", "green", "blue", "orange"][i] } as TemplateShape,
      ]),
    ],
  },

  // Agile workflows
  {
    key: "kanban",
    name: "Kanban",
    category: "Agile workflows",
    thumb: "columns3",
    description: "To do · Doing · Done.",
    shapes: [
      title("Kanban board"),
      ...lane(120, "To do", "grey", [{ text: "Task 1" }, { text: "Task 2" }, { text: "Task 3" }]),
      ...lane(430, "Doing", "blue", [{ text: "In progress", color: "blue" }]),
      ...lane(740, "Done", "green", [{ text: "Shipped ✓", color: "green" }]),
    ],
  },
  {
    key: "retro",
    name: "Sprint retro",
    category: "Agile workflows",
    thumb: "columns3",
    description: "What went well / improve / actions.",
    shapes: [
      title("Sprint retrospective"),
      ...lane(120, "What went well", "green", [{ text: "Add a win…", color: "green" }]),
      ...lane(430, "What to improve", "orange", [{ text: "Add a gap…", color: "orange" }]),
      ...lane(740, "Action items", "blue", [{ text: "Owner + date…", color: "blue" }]),
    ],
  },
  {
    key: "sprint-planning",
    name: "Sprint planning",
    category: "Agile workflows",
    thumb: "columns3",
    description: "Backlog → this sprint → stretch.",
    shapes: [
      title("Sprint planning"),
      ...lane(120, "Backlog", "grey", [{ text: "Story…" }, { text: "Story…" }]),
      ...lane(430, "This sprint", "blue", [{ text: "Committed", color: "blue" }]),
      ...lane(740, "Stretch", "violet", [{ text: "If time…" }]),
    ],
  },
  {
    key: "standup",
    name: "Daily standup",
    category: "Agile workflows",
    thumb: "columns3",
    description: "Yesterday · Today · Blockers.",
    shapes: [
      title("Daily standup"),
      ...lane(120, "Yesterday", "grey", [{ text: "…" }]),
      ...lane(430, "Today", "green", [{ text: "…", color: "green" }]),
      ...lane(740, "Blockers", "red", [{ text: "…", color: "red" }]),
    ],
  },

  // Strategy & planning
  {
    key: "roadmap",
    name: "Quarterly roadmap",
    category: "Strategy & planning",
    thumb: "columns4",
    description: "Q1–Q4 planning lanes.",
    shapes: [
      title("Roadmap"),
      ...lane(120, "Q1", "grey", [{ text: "Theme…" }]),
      ...lane(430, "Q2", "grey", [{ text: "Theme…" }]),
      ...lane(740, "Q3", "grey", [{ text: "Theme…" }]),
      ...lane(1050, "Q4", "grey", [{ text: "Theme…" }]),
    ],
  },
  {
    key: "swot",
    name: "SWOT analysis",
    category: "Strategy & planning",
    thumb: "grid2x2",
    description: "Strengths · Weaknesses · Opps · Threats.",
    shapes: [
      title("SWOT analysis"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Strengths", color: "green" },
        { title: "Weaknesses", color: "orange" },
        { title: "Opportunities", color: "blue" },
        { title: "Threats", color: "red" },
      ]),
    ],
  },
  {
    key: "okrs",
    name: "OKR planning",
    category: "Strategy & planning",
    thumb: "rows",
    description: "Objective with key results.",
    shapes: [
      title("OKRs"),
      { kind: "geo", x: 140, y: 150, w: 760, h: 70, color: "black", fill: "semi", text: "Objective" },
      { kind: "geo", x: 140, y: 250, w: 760, h: 60, color: "blue", text: "KR1 — measurable result" },
      { kind: "geo", x: 140, y: 330, w: 760, h: 60, color: "blue", text: "KR2 — measurable result" },
      { kind: "geo", x: 140, y: 410, w: 760, h: 60, color: "blue", text: "KR3 — measurable result" },
    ],
  },
  {
    key: "bmc",
    name: "Business model canvas",
    category: "Strategy & planning",
    thumb: "sections",
    description: "9-box business model.",
    shapes: [
      title("Business model canvas"),
      ...grid(120, 150, 250, 200, 16, 3, [
        { title: "Key partners" },
        { title: "Key activities" },
        { title: "Value propositions", color: "black" },
        { title: "Customer relationships" },
        { title: "Channels" },
        { title: "Customer segments" },
        { title: "Cost structure", color: "orange" },
        { title: "Revenue streams", color: "green" },
        { title: "Resources" },
      ]),
    ],
  },

  // Research & design
  {
    key: "empathy",
    name: "Empathy map",
    category: "Research & design",
    thumb: "grid2x2",
    description: "Says · Thinks · Does · Feels.",
    shapes: [
      title("Empathy map"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Says", color: "blue" },
        { title: "Thinks", color: "violet" },
        { title: "Does", color: "green" },
        { title: "Feels", color: "orange" },
      ]),
    ],
  },
  {
    key: "journey",
    name: "User journey",
    category: "Research & design",
    thumb: "columns4",
    description: "Stages across the experience.",
    shapes: [
      title("User journey"),
      ...["Awareness", "Consideration", "Purchase", "Retention"].flatMap((t, i) => [
        { kind: "geo", x: 120 + i * 230, y: 150, w: 200, h: 60, color: "black", fill: "semi", text: t } as TemplateShape,
        { kind: "note", x: 130 + i * 230, y: 240, text: "Action…", color: "yellow" } as TemplateShape,
        { kind: "note", x: 130 + i * 230, y: 360, text: "Feeling…", color: "orange" } as TemplateShape,
      ]),
    ],
  },
  {
    key: "prioritization",
    name: "2×2 prioritization",
    category: "Research & design",
    thumb: "grid2x2",
    description: "Impact vs effort matrix.",
    shapes: [
      title("Impact / Effort"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Quick wins", color: "green" },
        { title: "Big bets", color: "blue" },
        { title: "Fill-ins", color: "grey" },
        { title: "Time sinks", color: "red" },
      ]),
    ],
  },

  // Meetings & workshops
  {
    key: "meeting-notes",
    name: "Meeting notes",
    category: "Meetings & workshops",
    thumb: "rows",
    description: "Agenda, notes, actions.",
    shapes: [
      title("Meeting notes"),
      { kind: "geo", x: 140, y: 150, w: 760, h: 90, color: "grey", text: "Agenda" },
      { kind: "geo", x: 140, y: 260, w: 760, h: 200, color: "grey", text: "Notes" },
      { kind: "geo", x: 140, y: 480, w: 760, h: 110, color: "blue", text: "Action items" },
    ],
  },
  {
    key: "icebreaker",
    name: "Icebreaker",
    category: "Meetings & workshops",
    thumb: "central",
    description: "Warm up the room.",
    shapes: [
      { kind: "geo", x: 440, y: 300, w: 260, h: 130, geo: "ellipse", color: "black", fill: "semi", text: "How are you arriving today?" },
      { kind: "note", x: 180, y: 200, text: "😀", color: "yellow" },
      { kind: "note", x: 780, y: 200, text: "🚀", color: "green" },
      { kind: "note", x: 180, y: 470, text: "🌧️", color: "blue" },
      { kind: "note", x: 780, y: 470, text: "☕", color: "orange" },
    ],
  },
];

export function getTemplate(key: string): Template | undefined {
  return TEMPLATES.find((t) => t.key === key);
}
