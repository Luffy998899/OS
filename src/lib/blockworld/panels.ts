// What a block in the office can be wired to.
//
// A placed block is scenery until it carries a panel binding. This is the
// catalogue the in-game wiring dialog offers: every route from the world into
// the Work OS, and what each one needs pointing at. Without it the office is
// decoration; with it, a wall you built is the way into the work.

import type { PanelKind } from "./types";

/** What `refId` means for a binding, and therefore what the dialog must ask. */
export type PanelTarget = "none" | "room" | "client" | "project" | "creativeDoor";

export type PanelMeta = {
  panel: PanelKind;
  label: string;
  blurb: string;
  target: PanelTarget;
  /** The block key this binding reads best on — used to suggest a material. */
  block: string;
  /** Only admins may aim at it, let alone open it. */
  adminOnly?: boolean;
};

export const PANEL_CATALOG: PanelMeta[] = [
  {
    panel: "bounties",
    label: "Bounty board",
    blurb: "Open missions anyone eligible can claim.",
    target: "none",
    block: "corkboard",
  },
  {
    panel: "missions",
    label: "Room mission board",
    blurb: "The open missions filed against one room.",
    target: "room",
    block: "whiteboard",
  },
  {
    panel: "tasks",
    label: "Task wall",
    blurb: "Your missions and the squad's work.",
    target: "none",
    block: "whiteboard",
  },
  {
    panel: "skills",
    label: "Skill tree",
    blurb: "Craft levels and what each tier unlocks.",
    target: "none",
    block: "books",
  },
  {
    panel: "video",
    label: "Edit bay terminal",
    blurb: "Render queue, timers and what's cutting now.",
    target: "none",
    block: "monitor",
  },
  {
    panel: "city",
    label: "Project desk",
    blurb: "A project's floor: code, links and audits.",
    target: "project",
    block: "monitor",
  },
  {
    panel: "conference",
    label: "Lectern / notice board",
    blurb: "Call meetings and post announcements.",
    target: "none",
    block: "tv",
  },
  {
    panel: "approvals",
    label: "Approvals counter",
    blurb: "Leave, sign-offs and queries.",
    target: "none",
    block: "desk_dark",
  },
  {
    panel: "outreach",
    label: "Outreach desk",
    blurb: "Sectors, the day plan and lead OTP.",
    target: "none",
    block: "phone",
  },
  {
    panel: "creative",
    label: "Studio door",
    blurb: "Client or internal creative boards.",
    target: "creativeDoor",
    block: "whiteboard",
  },
  {
    panel: "shoot",
    label: "Call sheet",
    blurb: "This week's shoots, indoor and outdoor.",
    target: "none",
    block: "camera",
  },
  {
    panel: "timetable",
    label: "Bell schedule",
    blurb: "Today's blocks and the check-in bell.",
    target: "none",
    block: "clock",
  },
  {
    panel: "docs",
    label: "Writing desk",
    blurb: "Scripts, notes and whiteboards.",
    target: "none",
    block: "desk",
  },
  {
    panel: "client",
    label: "Client booth",
    blurb: "One client's missions and contacts.",
    target: "client",
    block: "corkboard",
  },
  {
    panel: "chat",
    label: "Chat terminal",
    blurb: "Servers, channels and voice.",
    target: "none",
    block: "monitor",
  },
  {
    panel: "lair",
    label: "Vecna's desk",
    blurb: "Watch the floor and send demogorgons.",
    target: "none",
    block: "vecna_flesh",
    adminOnly: true,
  },
];

/** The two doors of the creative studio, which is a wing rather than a record. */
export const CREATIVE_DOORS = [
  { id: "internal", name: "Internal wing" },
  { id: "clients", name: "Clients wing" },
];

export function panelMeta(panel: string): PanelMeta | null {
  return PANEL_CATALOG.find((p) => p.panel === panel) ?? null;
}

/** Can a builder wire a block to this panel? `rift` is generated, not bound. */
export function isBindablePanel(panel: string): boolean {
  return PANEL_CATALOG.some((p) => p.panel === panel);
}

/**
 * The binding a builder has assembled, ready for world.setPoi. Returns null
 * while it is still incomplete — a panel that needs a target isn't a binding
 * until it has one, and saving it would make a block that opens nothing.
 */
export function bindingToPoi(
  cell: { x: number; y: number; z: number },
  panel: string,
  refId: string | null,
  label: string,
):
  | {
      x: number;
      y: number;
      z: number;
      panel: string;
      refId: string | null;
      label: string;
      sublabel: string | null;
      adminOnly: boolean;
    }
  | null {
  const meta = panelMeta(panel);
  if (!meta) return null;
  if (meta.target !== "none" && !refId) return null;
  const trimmed = label.trim().slice(0, 48);
  return {
    x: cell.x,
    y: cell.y,
    z: cell.z,
    panel: meta.panel,
    refId: meta.target === "none" ? null : refId,
    label: trimmed || meta.label,
    sublabel: meta.blurb,
    adminOnly: meta.adminOnly ?? false,
  };
}

/** Stable id for a POI at a cell, so local edits and server rows agree. */
export const poiIdAt = (x: number, y: number, z: number): string => `poi-${x}-${y}-${z}`;
