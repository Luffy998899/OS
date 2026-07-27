// The campus — a hand-authored office floor plan in top-down world coordinates.
//
// v1 packed every room into an identical grid cell, which is why the floor read
// as a maze of samey cubicles. v2 lays the campus out like a real studio: zones
// with sizes that match their job, wide corridors between the bands, a central
// plaza with the bounty board, a city block of towers for the developers, and a
// client wing that grows as areas are added. Movement/collision stays top-down;
// the first-person renderer casts it.
//
// Everything here is pure and testable. The renderer decides how it looks; this
// file decides where everything IS.

export type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };

const WALL_T = 12;
const DOOR_W = 120;

export const PLAYER_RADIUS = 11;
export const INTERACT_RADIUS = 78;

export type RoomInput = {
  id: string;
  key: string;
  name: string;
  kind: string;
  clientName?: string | null;
  posX: number;
  posY: number;
  missionCount: number;
};

/** Semantic zone id — what the renderer themes and the panels bind to. */
export type ZoneKey =
  | "developer"
  | "video-editing"
  | "conference"
  | "creative"
  | "tasks"
  | "managing-heads"
  | "timetable"
  | "outreach"
  | "shoot"
  | "client";

export type PropKind =
  | "mission-board"
  | "queue-board"
  | "screen-desk"
  | "npc-editor"
  | "conference-screen"
  | "chair"
  | "door-clients"
  | "door-internal"
  | "infinite-board"
  | "task-wall"
  | "approval-desk"
  | "outreach-desk"
  | "phone-booth"
  | "camera-rig"
  | "light-rig"
  | "big-clock"
  | "school-bell"
  | "plant"
  | "cooler"
  | "monitor"
  | "rug";

export type CampusProp = { kind: PropKind; x: number; y: number };

export type RoomGeom = RoomInput & {
  zone: ZoneKey;
  rect: Rect;
  board: Vec;
  desks: Rect[];
  props: CampusProp[];
  accent: string;
};

export type Building = {
  key: "tower-pipeline" | "tower-complete" | "bungalow";
  label: string;
  rect: Rect;
  door: Vec; // where you stand to enter
  tint: string;
  /** Fraction of ceiling height — the bungalow is squat, the towers are full. */
  tall: boolean;
};

export type Layout = {
  world: { w: number; h: number };
  rooms: RoomGeom[];
  buildings: Building[];
  /** Movement blockers: shell, partitions, desks, buildings, tables. */
  solids: Rect[];
  spawn: Vec;
  /** The open plaza between the bands — the bounty board stands here. */
  plaza: { board: Vec };
};

// ---------------------------------------------------------------------------
// The plan. Zones are placed by hand; sizes match their function.
// ---------------------------------------------------------------------------

const BASE_W = 2320;
const BASE_H = 1500;

type ZonePlan = {
  zone: ZoneKey;
  /** DB room keys that bind to this slot, in preference order. */
  keys: string[];
  fallbackName: string;
  rect: Rect;
  accent: string;
};

export const ZONE_PLANS: ZonePlan[] = [
  {
    zone: "developer",
    keys: ["developer"],
    fallbackName: "Developer City",
    rect: { x: 80, y: 80, w: 860, h: 460 },
    accent: "#6f9ff0",
  },
  {
    zone: "video-editing",
    keys: ["video-editing"],
    fallbackName: "Video Editing Bay",
    rect: { x: 1020, y: 80, w: 460, h: 380 },
    accent: "#e0a862",
  },
  {
    zone: "conference",
    keys: ["common-board"],
    fallbackName: "Conference Hall",
    rect: { x: 1560, y: 80, w: 560, h: 400 },
    accent: "#c9bfa6",
  },
  {
    zone: "creative",
    keys: ["creative"],
    fallbackName: "Creative Studio",
    rect: { x: 80, y: 660, w: 560, h: 400 },
    accent: "#63c98a",
  },
  {
    zone: "tasks",
    keys: ["tasks"],
    fallbackName: "Task Room",
    rect: { x: 740, y: 660, w: 420, h: 340 },
    accent: "#8f9fb3",
  },
  {
    zone: "managing-heads",
    keys: ["managing-heads"],
    fallbackName: "Managing Heads",
    rect: { x: 1260, y: 660, w: 420, h: 340 },
    accent: "#d98a8a",
  },
  {
    zone: "timetable",
    keys: ["timetable"],
    fallbackName: "Timetable Room",
    rect: { x: 1780, y: 660, w: 380, h: 340 },
    accent: "#e6cf6a",
  },
  {
    zone: "outreach",
    keys: ["outreach", "client"],
    fallbackName: "Outreach Room",
    rect: { x: 80, y: 1140, w: 460, h: 290 },
    accent: "#b18fe0",
  },
  {
    zone: "shoot",
    keys: ["shoot", "creativity"],
    fallbackName: "Shoot Room",
    rect: { x: 640, y: 1140, w: 420, h: 290 },
    accent: "#5bb9c9",
  },
];

// Client wing: row of areas along the south-east, growing eastward.
const CLIENT_WING = { x: 1160, y: 1140, w: 320, h: 290, gap: 48 };
const CLIENT_ACCENTS = ["#5bb9c9", "#c98fb0", "#8fb46a", "#d0a05a", "#7f9be0"];

export const SPAWN: Vec = { x: 1180, y: 560 };
const PLAZA_BOARD: Vec = { x: 1252, y: 566 };

export const BUILDINGS_PLAN: Omit<Building, "door">[] = [
  {
    key: "tower-pipeline",
    label: "Pipeline Tower",
    rect: { x: 150, y: 150, w: 220, h: 190 },
    tint: "#7f95b8",
    tall: true,
  },
  {
    key: "tower-complete",
    label: "Completed Tower",
    rect: { x: 470, y: 150, w: 220, h: 190 },
    tint: "#8ba889",
    tall: true,
  },
  {
    key: "bungalow",
    label: "Internal Tools Bungalow",
    rect: { x: 230, y: 415, w: 320, h: 95 },
    tint: "#c2a476",
    tall: false,
  },
];

function buildingDoor(rect: Rect): Vec {
  // Stand a step south of the south face, centred.
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h + 26 };
}

// ---------------------------------------------------------------------------
// Zone furnishing — desks, boards and props per theme
// ---------------------------------------------------------------------------

function furnish(zone: ZoneKey, r: Rect): { board: Vec; desks: Rect[]; props: CampusProp[] } {
  const cx = r.x + r.w / 2;
  const props: CampusProp[] = [];
  const desks: Rect[] = [];
  let board: Vec = { x: r.x + r.w - 46, y: r.y + r.h / 2 };

  switch (zone) {
    case "developer": {
      // The city: buildings are added separately; the mission board stands by
      // the east exit, plants soften the block corners.
      board = { x: r.x + r.w - 44, y: r.y + 300 };
      props.push({ kind: "plant", x: r.x + 40, y: r.y + r.h - 40 });
      props.push({ kind: "plant", x: r.x + r.w - 40, y: r.y + 44 });
      break;
    }
    case "video-editing": {
      // Editing desks in a row against the north wall, screens glowing; the
      // editor NPC lives at the middle desk. Queue whiteboard on the east wall.
      const dw = 96;
      const dh = 44;
      for (let i = 0; i < 3; i++) {
        desks.push({ x: r.x + 52 + i * (dw + 34), y: r.y + 46, w: dw, h: dh });
      }
      props.push({ kind: "npc-editor", x: r.x + 52 + dw + 34 + dw / 2, y: r.y + 46 + dh + 20 });
      props.push({ kind: "queue-board", x: r.x + r.w - 46, y: r.y + 130 });
      board = { x: r.x + r.w - 46, y: r.y + 260 };
      props.push({ kind: "plant", x: r.x + 40, y: r.y + r.h - 44 });
      props.push({ kind: "cooler", x: r.x + r.w - 44, y: r.y + r.h - 44 });
      break;
    }
    case "conference": {
      // One long table, chairs all round, the announcement screen at the head.
      const tw = 280;
      const th = 96;
      const tx = cx - tw / 2;
      const ty = r.y + r.h / 2 - th / 2;
      desks.push({ x: tx, y: ty, w: tw, h: th });
      const seats = 5;
      for (let i = 0; i < seats; i++) {
        const sx = tx + 24 + (i * (tw - 48)) / (seats - 1);
        props.push({ kind: "chair", x: sx, y: ty - 26 });
        props.push({ kind: "chair", x: sx, y: ty + th + 26 });
      }
      props.push({ kind: "chair", x: tx - 26, y: ty + th / 2 });
      props.push({ kind: "chair", x: tx + tw + 26, y: ty + th / 2 });
      props.push({ kind: "conference-screen", x: cx, y: r.y + 42 });
      board = { x: cx, y: r.y + 60 };
      props.push({ kind: "plant", x: r.x + 42, y: r.y + 44 });
      props.push({ kind: "plant", x: r.x + r.w - 42, y: r.y + 44 });
      break;
    }
    case "creative": {
      // Two doors on the north wall — Clients and Internal — plus the infinite
      // board along the west wall and a work desk.
      props.push({ kind: "door-clients", x: r.x + r.w * 0.3, y: r.y + 30 });
      props.push({ kind: "door-internal", x: r.x + r.w * 0.7, y: r.y + 30 });
      props.push({ kind: "infinite-board", x: r.x + 44, y: r.y + r.h / 2 });
      desks.push({ x: cx - 48, y: r.y + r.h - 120, w: 96, h: 44 });
      board = { x: r.x + r.w - 46, y: r.y + r.h / 2 };
      props.push({ kind: "rug", x: cx, y: r.y + r.h / 2 });
      props.push({ kind: "plant", x: r.x + r.w - 44, y: r.y + r.h - 44 });
      break;
    }
    case "tasks": {
      // Four workstations and the task wall.
      const dw = 84;
      const dh = 42;
      for (const [ix, iy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        desks.push({
          x: r.x + 64 + ix * (dw + 80),
          y: r.y + 76 + iy * (dh + 84),
          w: dw,
          h: dh,
        });
      }
      props.push({ kind: "task-wall", x: r.x + r.w - 44, y: r.y + r.h / 2 });
      board = { x: r.x + r.w - 44, y: r.y + r.h / 2 - 90 };
      props.push({ kind: "plant", x: r.x + 40, y: r.y + r.h - 42 });
      break;
    }
    case "managing-heads": {
      // The approvals counter faces the door; two head desks behind it.
      desks.push({ x: cx - 110, y: r.y + 60, w: 90, h: 42 });
      desks.push({ x: cx + 24, y: r.y + 60, w: 90, h: 42 });
      props.push({ kind: "approval-desk", x: cx, y: r.y + r.h - 84 });
      board = { x: r.x + 44, y: r.y + r.h / 2 };
      props.push({ kind: "plant", x: r.x + r.w - 42, y: r.y + r.h - 44 });
      props.push({ kind: "cooler", x: r.x + 42, y: r.y + 46 });
      break;
    }
    case "timetable": {
      // The school clock wall and the bell.
      props.push({ kind: "big-clock", x: cx, y: r.y + 34 });
      props.push({ kind: "school-bell", x: r.x + r.w - 44, y: r.y + 60 });
      board = { x: r.x + 44, y: r.y + r.h / 2 };
      props.push({ kind: "rug", x: cx, y: r.y + r.h / 2 + 30 });
      props.push({ kind: "plant", x: r.x + 42, y: r.y + r.h - 44 });
      break;
    }
    case "outreach": {
      // Call desks and the phone booth for OTP moments.
      desks.push({ x: r.x + 56, y: r.y + 64, w: 90, h: 42 });
      desks.push({ x: r.x + 56, y: r.y + 176, w: 90, h: 42 });
      props.push({ kind: "outreach-desk", x: r.x + r.w - 46, y: r.y + r.h / 2 });
      props.push({ kind: "phone-booth", x: r.x + r.w - 52, y: r.y + 56 });
      board = { x: r.x + r.w / 2, y: r.y + 40 };
      break;
    }
    case "shoot": {
      // A set: camera rig, light rigs, clear floor.
      props.push({ kind: "camera-rig", x: cx - 60, y: r.y + r.h / 2 + 40 });
      props.push({ kind: "light-rig", x: r.x + 52, y: r.y + 52 });
      props.push({ kind: "light-rig", x: r.x + r.w - 52, y: r.y + 52 });
      props.push({ kind: "rug", x: cx + 30, y: r.y + 96 });
      board = { x: r.x + 44, y: r.y + r.h / 2 };
      break;
    }
    case "client": {
      desks.push({ x: r.x + 36, y: r.y + r.h - 76, w: 84, h: 40 });
      desks.push({ x: r.x + r.w - 120, y: r.y + r.h - 76, w: 84, h: 40 });
      board = { x: r.x + r.w / 2, y: r.y + 40 };
      props.push({ kind: "plant", x: r.x + 36, y: r.y + 40 });
      break;
    }
  }
  return { board, desks, props };
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

/** Zone partition walls with a centred door gap on each side. */
export function roomWalls(r: Rect): Rect[] {
  const t = WALL_T;
  const segs: Rect[] = [];
  const gx = r.x + r.w / 2 - DOOR_W / 2;
  const gy = r.y + r.h / 2 - DOOR_W / 2;
  for (const wy of [r.y - t, r.y + r.h]) {
    segs.push({ x: r.x - t, y: wy, w: gx - (r.x - t), h: t });
    segs.push({ x: gx + DOOR_W, y: wy, w: r.x + r.w + t - (gx + DOOR_W), h: t });
  }
  for (const wx of [r.x - t, r.x + r.w]) {
    segs.push({ x: wx, y: r.y - t, w: t, h: gy - (r.y - t) });
    segs.push({ x: wx, y: gy + DOOR_W, w: t, h: r.y + r.h + t - (gy + DOOR_W) });
  }
  return segs;
}

export function outerWalls(world: { w: number; h: number }): Rect[] {
  return [
    { x: 0, y: 0, w: world.w, h: WALL_T },
    { x: 0, y: world.h - WALL_T, w: world.w, h: WALL_T },
    { x: 0, y: 0, w: WALL_T, h: world.h },
    { x: world.w - WALL_T, y: 0, w: WALL_T, h: world.h },
  ];
}

// ---------------------------------------------------------------------------
// Layout assembly
// ---------------------------------------------------------------------------

export function buildLayout(rooms: RoomInput[]): Layout {
  const byKey = new Map(rooms.map((r) => [r.key, r]));
  const used = new Set<string>();
  const geoms: RoomGeom[] = [];

  for (const plan of ZONE_PLANS) {
    const key = plan.keys.find((k) => byKey.has(k));
    if (!key) continue; // zone renders only when its room exists in the DB
    const room = byKey.get(key)!;
    used.add(key);
    const { board, desks, props } = furnish(plan.zone, plan.rect);
    geoms.push({
      ...room,
      zone: plan.zone,
      rect: plan.rect,
      board,
      desks,
      props,
      accent: plan.accent,
    });
  }

  // Client areas (and any unknown legacy keys) go to the client wing.
  const rest = rooms.filter((r) => !used.has(r.key));
  rest.sort((a, b) => (a.posY - b.posY) || (a.posX - b.posX));
  let worldW = BASE_W;
  rest.forEach((room, i) => {
    const rect: Rect = {
      x: CLIENT_WING.x + i * (CLIENT_WING.w + CLIENT_WING.gap),
      y: CLIENT_WING.y,
      w: CLIENT_WING.w,
      h: CLIENT_WING.h,
    };
    worldW = Math.max(worldW, rect.x + rect.w + 100);
    const { board, desks, props } = furnish("client", rect);
    geoms.push({
      ...room,
      zone: "client",
      rect,
      board,
      desks,
      props,
      accent: CLIENT_ACCENTS[i % CLIENT_ACCENTS.length],
    });
  });

  const world = { w: worldW, h: BASE_H };

  const buildings: Building[] =
    geoms.some((g) => g.zone === "developer")
      ? BUILDINGS_PLAN.map((b) => ({ ...b, door: buildingDoor(b.rect) }))
      : [];

  const solids: Rect[] = [
    ...outerWalls(world),
    ...geoms.flatMap((g) => roomWalls(g.rect)),
    ...geoms.flatMap((g) => g.desks),
    ...buildings.map((b) => b.rect),
  ];

  return { world, rooms: geoms, buildings, solids, spawn: { ...SPAWN }, plaza: { board: { ...PLAZA_BOARD } } };
}

// ---------------------------------------------------------------------------
// Queries & movement (unchanged contracts)
// ---------------------------------------------------------------------------

export function roomIdAt(rooms: RoomGeom[], x: number, y: number): string | null {
  for (const r of rooms) {
    if (x >= r.rect.x && x <= r.rect.x + r.rect.w && y >= r.rect.y && y <= r.rect.y + r.rect.h) {
      return r.id;
    }
  }
  return null;
}

export function nearestBoard(
  rooms: RoomGeom[],
  x: number,
  y: number,
): (RoomGeom & { dist: number }) | null {
  let best: (RoomGeom & { dist: number }) | null = null;
  for (const r of rooms) {
    const d = Math.hypot(r.board.x - x, r.board.y - y);
    if (d <= INTERACT_RADIUS && (!best || d < best.dist)) best = { ...r, dist: d };
  }
  return best;
}

function circleRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Slide along solids: try the full move, then each axis independently. */
export function resolveCollision(
  solids: Rect[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  world: { w: number; h: number },
): Vec {
  const R = PLAYER_RADIUS;
  const clampedX = Math.max(R + WALL_T, Math.min(world.w - R - WALL_T, toX));
  const clampedY = Math.max(R + WALL_T, Math.min(world.h - R - WALL_T, toY));
  const hits = (x: number, y: number) => solids.some((s) => circleRect(x, y, R, s));
  if (!hits(clampedX, clampedY)) return { x: clampedX, y: clampedY };
  if (!hits(clampedX, fromY)) return { x: clampedX, y: fromY };
  if (!hits(fromX, clampedY)) return { x: fromX, y: clampedY };
  return { x: fromX, y: fromY };
}

/** Stable per-user hue for fallback tinting. */
export function userHue(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
  return h;
}
