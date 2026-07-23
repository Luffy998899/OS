// Miro-style whiteboard templates. Pure data (no tldraw import) so the picker can
// use the metadata; the canvas converts `shapes` into tldraw shapes on first open.

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
  description: string;
  shapes: TemplateShape[];
};

function lane(
  x: number,
  title: string,
  color: string,
  notes: { text: string; color?: string }[],
): TemplateShape[] {
  const shapes: TemplateShape[] = [
    { kind: "geo", x, y: 150, w: 280, h: 520, color, fill: "none" },
    { kind: "text", x: x + 16, y: 165, text: title, size: "l" },
  ];
  notes.forEach((n, i) => {
    shapes.push({
      kind: "note",
      x: x + 20,
      y: 230 + i * 130,
      text: n.text,
      color: n.color ?? "yellow",
    });
  });
  return shapes;
}

export const TEMPLATES: Template[] = [
  { key: "blank", name: "Blank", description: "Start from an empty canvas.", shapes: [] },
  {
    key: "brainstorm",
    name: "Brainstorm",
    description: "Central idea with sticky notes to riff on.",
    shapes: [
      { kind: "text", x: 120, y: 70, text: "Brainstorm", size: "xl" },
      {
        kind: "geo",
        x: 460,
        y: 300,
        w: 220,
        h: 130,
        geo: "ellipse",
        color: "black",
        fill: "semi",
        text: "Central idea",
      },
      { kind: "note", x: 160, y: 180, text: "Idea", color: "yellow" },
      { kind: "note", x: 760, y: 180, text: "What if…", color: "green" },
      { kind: "note", x: 150, y: 470, text: "Question?", color: "blue" },
      { kind: "note", x: 780, y: 470, text: "Risk", color: "orange" },
      { kind: "note", x: 470, y: 560, text: "Next step", color: "yellow" },
    ],
  },
  {
    key: "kanban",
    name: "Kanban",
    description: "To do · Doing · Done columns.",
    shapes: [
      { kind: "text", x: 120, y: 70, text: "Kanban board", size: "xl" },
      ...lane(120, "To do", "grey", [
        { text: "Task 1" },
        { text: "Task 2" },
        { text: "Task 3" },
      ]),
      ...lane(430, "Doing", "blue", [{ text: "In progress", color: "blue" }]),
      ...lane(740, "Done", "green", [{ text: "Shipped ✓", color: "green" }]),
    ],
  },
  {
    key: "retro",
    name: "Sprint retro",
    description: "What went well / to improve / actions.",
    shapes: [
      { kind: "text", x: 120, y: 70, text: "Sprint retrospective", size: "xl" },
      ...lane(120, "What went well", "green", [
        { text: "Add a win…", color: "green" },
      ]),
      ...lane(430, "What to improve", "orange", [
        { text: "Add a gap…", color: "orange" },
      ]),
      ...lane(740, "Action items", "blue", [
        { text: "Owner + date…", color: "blue" },
      ]),
    ],
  },
  {
    key: "roadmap",
    name: "Quarterly roadmap",
    description: "Q1–Q4 planning lanes.",
    shapes: [
      { kind: "text", x: 120, y: 70, text: "Roadmap", size: "xl" },
      ...lane(120, "Q1", "grey", [{ text: "Theme…" }]),
      ...lane(430, "Q2", "grey", [{ text: "Theme…" }]),
      ...lane(740, "Q3", "grey", [{ text: "Theme…" }]),
      ...lane(1050, "Q4", "grey", [{ text: "Theme…" }]),
    ],
  },
  {
    key: "mindmap",
    name: "Mind map",
    description: "Central topic with branches.",
    shapes: [
      {
        kind: "geo",
        x: 470,
        y: 320,
        w: 200,
        h: 110,
        geo: "ellipse",
        color: "black",
        fill: "semi",
        text: "Topic",
      },
      { kind: "geo", x: 150, y: 150, w: 180, h: 80, color: "blue", text: "Branch A" },
      { kind: "geo", x: 820, y: 150, w: 180, h: 80, color: "green", text: "Branch B" },
      { kind: "geo", x: 150, y: 520, w: 180, h: 80, color: "orange", text: "Branch C" },
      { kind: "geo", x: 820, y: 520, w: 180, h: 80, color: "red", text: "Branch D" },
    ],
  },
];

export function getTemplate(key: string): Template | undefined {
  return TEMPLATES.find((t) => t.key === key);
}
