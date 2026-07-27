// Miro-style whiteboard templates. Pure data (no tldraw import) so the picker can
// render metadata; the canvas turns `shapes` into real tldraw shapes on first open.

export type GeoKind =
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "cloud"
  | "oval";

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
      geo?: GeoKind;
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
      { kind: "note", x: 180, y: 200, text: "Energised", color: "yellow" },
      { kind: "note", x: 780, y: 200, text: "Focused", color: "green" },
      { kind: "note", x: 180, y: 470, text: "Stretched", color: "blue" },
      { kind: "note", x: 780, y: 470, text: "Curious", color: "orange" },
    ],
  },

  // ---- More frameworks (original layouts) ----
  {
    key: "six-hats",
    name: "Six thinking hats",
    category: "Ideation & brainstorming",
    thumb: "grid3",
    description: "Look at a topic from six angles.",
    shapes: [
      title("Six thinking hats"),
      ...grid(120, 150, 300, 170, 24, 3, [
        { title: "Facts", color: "blue" },
        { title: "Feelings", color: "red" },
        { title: "Cautions", color: "grey" },
        { title: "Benefits", color: "green" },
        { title: "Creativity", color: "orange" },
        { title: "Process", color: "black" },
      ]),
    ],
  },
  {
    key: "crazy8s",
    name: "Crazy 8s",
    category: "Ideation & brainstorming",
    thumb: "sections",
    description: "Eight quick ideas, one per box.",
    shapes: [
      title("Crazy 8s"),
      ...grid(
        120,
        150,
        200,
        150,
        16,
        4,
        Array.from({ length: 8 }, (_, i) => ({ title: `Idea ${i + 1}` })),
      ),
    ],
  },
  {
    key: "how-might-we",
    name: "How might we",
    category: "Ideation & brainstorming",
    thumb: "rows",
    description: "Reframe problems as opportunities.",
    shapes: [
      title("How might we…"),
      { kind: "geo", x: 140, y: 150, w: 760, h: 90, color: "black", fill: "semi", text: "Problem statement" },
      { kind: "note", x: 160, y: 280, text: "HMW …?", color: "yellow" },
      { kind: "note", x: 420, y: 280, text: "HMW …?", color: "green" },
      { kind: "note", x: 680, y: 280, text: "HMW …?", color: "blue" },
    ],
  },
  {
    key: "story-map",
    name: "User story map",
    category: "Agile workflows",
    thumb: "columns4",
    description: "Activities across the top, stories below.",
    shapes: [
      title("User story map"),
      ...["Discover", "Sign up", "Use", "Retain"].flatMap((t, i) => [
        { kind: "geo", x: 120 + i * 230, y: 150, w: 200, h: 56, color: "black", fill: "semi", text: t } as TemplateShape,
        { kind: "note", x: 130 + i * 230, y: 230, text: "Story…", color: "yellow" } as TemplateShape,
        { kind: "note", x: 130 + i * 230, y: 350, text: "Story…", color: "blue" } as TemplateShape,
      ]),
    ],
  },
  {
    key: "team-charter",
    name: "Team charter",
    category: "Agile workflows",
    thumb: "grid2x2",
    description: "Mission, values, roles, norms.",
    shapes: [
      title("Team charter"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Mission", color: "black" },
        { title: "Values", color: "green" },
        { title: "Roles", color: "blue" },
        { title: "Working norms", color: "orange" },
      ]),
    ],
  },
  {
    key: "weekly-planner",
    name: "Weekly planner",
    category: "Agile workflows",
    thumb: "columns4",
    description: "Mon–Fri with 2-hour time slots.",
    shapes: [
      title("Weekly planner"),
      ...["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((day, i) => {
        const x = 120 + i * 240;
        return [
          { kind: "geo", x, y: 150, w: 210, h: 560, color: "grey", fill: "none" } as TemplateShape,
          { kind: "text", x: x + 14, y: 162, text: day, size: "l" } as TemplateShape,
          ...["9–11", "11–1", "2–4", "4–6"].map(
            (slot, j) =>
              ({ kind: "note", x: x + 16, y: 220 + j * 120, text: slot, color: ["yellow", "green", "blue", "orange"][j] }) as TemplateShape,
          ),
        ];
      }),
    ],
  },
  {
    key: "lean-canvas",
    name: "Lean canvas",
    category: "Strategy & planning",
    thumb: "sections",
    description: "One-page startup model.",
    shapes: [
      title("Lean canvas"),
      ...grid(120, 150, 250, 200, 16, 3, [
        { title: "Problem", color: "red" },
        { title: "Solution", color: "green" },
        { title: "Unique value", color: "black" },
        { title: "Key metrics" },
        { title: "Channels" },
        { title: "Customer segments" },
        { title: "Cost structure", color: "orange" },
        { title: "Revenue streams", color: "green" },
        { title: "Unfair advantage" },
      ]),
    ],
  },
  {
    key: "five-forces",
    name: "Porter's five forces",
    category: "Strategy & planning",
    thumb: "central",
    description: "Competitive analysis.",
    shapes: [
      { kind: "geo", x: 440, y: 320, w: 240, h: 110, geo: "ellipse", color: "black", fill: "semi", text: "Rivalry" },
      { kind: "geo", x: 460, y: 120, w: 200, h: 80, color: "blue", text: "New entrants" },
      { kind: "geo", x: 460, y: 560, w: 200, h: 80, color: "orange", text: "Substitutes" },
      { kind: "geo", x: 150, y: 330, w: 200, h: 80, color: "green", text: "Buyer power" },
      { kind: "geo", x: 780, y: 330, w: 200, h: 80, color: "red", text: "Supplier power" },
    ],
  },
  {
    key: "risk-matrix",
    name: "Risk matrix",
    category: "Strategy & planning",
    thumb: "grid2x2",
    description: "Likelihood vs impact.",
    shapes: [
      title("Risk matrix"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Monitor", color: "grey" },
        { title: "Mitigate", color: "orange" },
        { title: "Accept", color: "green" },
        { title: "Act now", color: "red" },
      ]),
    ],
  },
  {
    key: "persona",
    name: "User persona",
    category: "Research & design",
    thumb: "grid2x2",
    description: "Goals, frustrations, bio, behaviours.",
    shapes: [
      title("User persona"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Bio", color: "black" },
        { title: "Goals", color: "green" },
        { title: "Frustrations", color: "red" },
        { title: "Behaviours", color: "blue" },
      ]),
    ],
  },
  {
    key: "feedback-grid",
    name: "Feedback grid",
    category: "Research & design",
    thumb: "grid2x2",
    description: "Likes, criticisms, questions, ideas.",
    shapes: [
      title("Feedback grid"),
      ...grid(140, 150, 360, 240, 24, 2, [
        { title: "Likes", color: "green" },
        { title: "Criticisms", color: "red" },
        { title: "Questions", color: "blue" },
        { title: "Ideas", color: "orange" },
      ]),
    ],
  },
  {
    key: "project-kickoff",
    name: "Project kickoff",
    category: "Meetings & workshops",
    thumb: "rows",
    description: "Goals, scope, timeline, risks.",
    shapes: [
      title("Project kickoff"),
      { kind: "geo", x: 140, y: 150, w: 760, h: 90, color: "black", fill: "semi", text: "Goals" },
      { kind: "geo", x: 140, y: 260, w: 760, h: 90, color: "blue", text: "Scope" },
      { kind: "geo", x: 140, y: 370, w: 760, h: 90, color: "green", text: "Timeline" },
      { kind: "geo", x: 140, y: 480, w: 760, h: 90, color: "red", text: "Risks" },
    ],
  },

  // ---- Diagrams & flows ----
  {
    key: "flowchart",
    name: "Flowchart",
    category: "Strategy & planning",
    thumb: "rows",
    description: "Start, steps, a decision and outcomes.",
    shapes: [
      title("Flowchart"),
      { kind: "geo", x: 380, y: 150, w: 200, h: 70, geo: "oval", color: "green", fill: "semi", text: "Start" },
      { kind: "geo", x: 380, y: 270, w: 200, h: 80, color: "blue", text: "Do the thing" },
      { kind: "geo", x: 360, y: 400, w: 240, h: 130, geo: "diamond", color: "orange", fill: "semi", text: "OK?" },
      { kind: "geo", x: 120, y: 600, w: 200, h: 80, color: "red", text: "Fix it" },
      { kind: "geo", x: 640, y: 600, w: 200, h: 70, geo: "oval", color: "black", fill: "semi", text: "Done" },
    ],
  },
  {
    key: "timeline",
    name: "Timeline",
    category: "Strategy & planning",
    thumb: "columns4",
    description: "Milestones across a horizontal line.",
    shapes: [
      title("Timeline"),
      { kind: "geo", x: 120, y: 400, w: 1080, h: 8, color: "black", fill: "solid" },
      ...["Kickoff", "Milestone 1", "Milestone 2", "Launch"].flatMap((t, i) => {
        const x = 160 + i * 340;
        const up = i % 2 === 0;
        return [
          { kind: "geo", x: x - 10, y: 388, w: 32, h: 32, geo: "ellipse", color: "blue", fill: "solid" } as TemplateShape,
          { kind: "note", x: x - 60, y: up ? 200 : 470, text: t, color: ["yellow", "green", "blue", "orange"][i] } as TemplateShape,
        ];
      }),
    ],
  },
  {
    key: "fishbone",
    name: "Fishbone (Ishikawa)",
    category: "Research & design",
    thumb: "central",
    description: "Root-cause analysis of a problem.",
    shapes: [
      title("Fishbone diagram"),
      { kind: "geo", x: 120, y: 380, w: 780, h: 8, color: "black", fill: "solid" },
      { kind: "geo", x: 940, y: 330, w: 240, h: 110, color: "red", fill: "semi", text: "Problem" },
      { kind: "note", x: 180, y: 200, text: "People", color: "blue" },
      { kind: "note", x: 460, y: 200, text: "Process", color: "green" },
      { kind: "note", x: 740, y: 200, text: "Tools", color: "violet" },
      { kind: "note", x: 180, y: 470, text: "Environment", color: "orange" },
      { kind: "note", x: 460, y: 470, text: "Materials", color: "yellow" },
      { kind: "note", x: 740, y: 470, text: "Measurement", color: "grey" },
    ],
  },
  {
    key: "content-calendar",
    name: "Content calendar",
    category: "Meetings & workshops",
    thumb: "columns4",
    description: "Plan posts across the week.",
    shapes: [
      title("Content calendar"),
      ...["Mon", "Tue", "Wed", "Thu", "Fri"].flatMap((day, i) => {
        const x = 120 + i * 240;
        return [
          { kind: "geo", x, y: 150, w: 210, h: 520, color: "grey", fill: "none" } as TemplateShape,
          { kind: "text", x: x + 14, y: 162, text: day, size: "l" } as TemplateShape,
          { kind: "note", x: x + 16, y: 220, text: "Idea…", color: ["yellow", "green", "blue", "orange", "violet"][i] } as TemplateShape,
          { kind: "note", x: x + 16, y: 430, text: "Channel…", color: "grey" } as TemplateShape,
        ];
      }),
    ],
  },
  {
    key: "org-chart",
    name: "Org chart",
    category: "Strategy & planning",
    thumb: "central",
    description: "Reporting lines for a team.",
    shapes: [
      title("Org chart"),
      { kind: "geo", x: 500, y: 150, w: 220, h: 80, color: "black", fill: "semi", text: "Founder" },
      { kind: "geo", x: 200, y: 330, w: 200, h: 80, color: "blue", text: "Lead A" },
      { kind: "geo", x: 500, y: 330, w: 200, h: 80, color: "green", text: "Lead B" },
      { kind: "geo", x: 800, y: 330, w: 200, h: 80, color: "orange", text: "Lead C" },
      { kind: "geo", x: 200, y: 500, w: 200, h: 70, color: "grey", text: "Member" },
      { kind: "geo", x: 500, y: 500, w: 200, h: 70, color: "grey", text: "Member" },
      { kind: "geo", x: 800, y: 500, w: 200, h: 70, color: "grey", text: "Member" },
    ],
  },
  {
    key: "moodboard",
    name: "Moodboard",
    category: "Research & design",
    thumb: "grid3",
    description: "Collect visual references & vibes.",
    shapes: [
      title("Moodboard"),
      ...grid(120, 150, 260, 200, 24, 3, [
        { title: "Reference", color: "blue" },
        { title: "Palette", color: "green" },
        { title: "Type", color: "orange" },
        { title: "Texture", color: "violet" },
        { title: "Layout", color: "red" },
        { title: "Inspo", color: "grey" },
      ]),
    ],
  },
  {
    key: "start-stop-continue",
    name: "Start / Stop / Continue",
    category: "Agile workflows",
    thumb: "columns3",
    description: "Fast, focused team retro.",
    shapes: [
      title("Start · Stop · Continue"),
      ...lane(120, "Start", "green", [{ text: "Begin doing…", color: "green" }]),
      ...lane(430, "Stop", "red", [{ text: "Stop doing…", color: "red" }]),
      ...lane(740, "Continue", "blue", [{ text: "Keep doing…", color: "blue" }]),
    ],
  },
  {
    key: "pros-cons",
    name: "Pros & cons",
    category: "Ideation & brainstorming",
    thumb: "columns3",
    description: "Weigh a decision quickly.",
    shapes: [
      title("Pros & cons"),
      ...lane(220, "Pros", "green", [{ text: "Upside…", color: "green" }, { text: "Upside…", color: "green" }]),
      ...lane(620, "Cons", "red", [{ text: "Downside…", color: "red" }, { text: "Downside…", color: "red" }]),
    ],
  },
];

// The creative room's infinite board scaffold: brand kit pinned top-left,
// reference rail, competitor moat box, and a green-zone planning strip.
const CREATIVE_SPACE: Template = {
  key: "creative-space",
  name: "Creative space",
  category: "Research & design",
  thumb: "sections",
  description:
    "Brand kit pinned, reference rail, competitor moat and the advance-content green zone.",
  shapes: [
    { kind: "text", x: 60, y: 60, text: "Brand kit", size: "l" },
    { kind: "geo", x: 60, y: 110, w: 360, h: 300, color: "violet", fill: "semi", text: "Logos · colours · fonts\n(pinned — keep updated)" },
    { kind: "text", x: 480, y: 60, text: "References — statics & carousels", size: "l" },
    { kind: "geo", x: 480, y: 110, w: 640, h: 300, color: "blue", fill: "none", text: "" },
    { kind: "note", x: 500, y: 130, text: "Drop reference links here", color: "blue" },
    { kind: "note", x: 720, y: 130, text: "Reel refs — drag from the rail", color: "light-blue" },
    { kind: "text", x: 60, y: 470, text: "Competitor research & moat", size: "l" },
    { kind: "geo", x: 60, y: 520, w: 500, h: 280, color: "red", fill: "semi", text: "Done once, pinned forever" },
    { kind: "text", x: 620, y: 470, text: "Green zone — next month planned", size: "l" },
    { kind: "geo", x: 620, y: 520, w: 500, h: 280, color: "green", fill: "semi", text: "Advance content lives here" },
    { kind: "note", x: 1180, y: 130, text: "Select shapes and press Make task", color: "yellow" },
  ],
};
TEMPLATES.push(CREATIVE_SPACE);

export function getTemplate(key: string): Template | undefined {
  return TEMPLATES.find((t) => t.key === key);
}
