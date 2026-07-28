// The campus — v3.
//
// v2 proved the layout idea but packed it tight. v3 uses the space a game
// actually has: a 3400×2460 world with wide corridors, two parks with trees, a
// fountain plaza at the centre, buildings you physically walk INTO through
// their doors (interiors live in a vault band to the south, reached by portal),
// and — behind an admin-only rift in the managing heads' office — the Upside
// Down, where the admin watches the floor and sends demogorgons to slackers.
//
// Everything here is pure geometry; the renderer decides how it looks.

export type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };

const WALL_T = 12;
const DOOR_W = 140;

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
  | "rug"
  | "tree"
  | "fountain"
  | "writing-desk"
  | "script-terminal"
  | "lift-panel"
  | "gallery-board"
  | "library-shelf"
  | "exit-door"
  | "vine"
  | "rift"
  | "hive-desk";

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
  door: Vec;
  tint: string;
  tall: boolean;
};

/** A sealed indoor space reached by portal: tower lobbies, the library, the lair. */
export type InteriorGeom = {
  key: string;
  label: string;
  theme: "lobby" | "gallery" | "library" | "lair";
  rect: Rect;
  spawn: Vec;
  props: CampusProp[];
  /** Floor tint for the renderer's palette. */
  floor: [number, number, number];
};

export type Portal = {
  id: string;
  /** Prompt title at the entry point. */
  label: string;
  subtitle: string;
  at: Vec;
  to: Vec;
  toYaw: number;
  adminOnly?: boolean;
};

export type Layout = {
  world: { w: number; h: number };
  rooms: RoomGeom[];
  buildings: Building[];
  interiors: InteriorGeom[];
  portals: Portal[];
  parks: Rect[];
  trees: Vec[];
  fountain: Vec;
  /** Movement + render blockers. */
  solids: Rect[];
  spawn: Vec;
  plaza: { board: Vec };
};

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const BASE_W = 3400;
const BASE_H = 2460;

type ZonePlan = {
  zone: ZoneKey;
  keys: string[];
  fallbackName: string;
  rect: Rect;
  accent: string;
};

export const ZONE_PLANS: ZonePlan[] = [
  { zone: "developer", keys: ["developer"], fallbackName: "Developer City", rect: { x: 120, y: 120, w: 1160, h: 660 }, accent: "#6f9ff0" },
  { zone: "video-editing", keys: ["video-editing"], fallbackName: "Video Editing Bay", rect: { x: 1420, y: 120, w: 640, h: 500 }, accent: "#e0a862" },
  { zone: "conference", keys: ["common-board"], fallbackName: "Conference Hall", rect: { x: 2200, y: 120, w: 760, h: 560 }, accent: "#c9bfa6" },
  { zone: "creative", keys: ["creative"], fallbackName: "Creative Studio", rect: { x: 120, y: 1000, w: 780, h: 560 }, accent: "#63c98a" },
  { zone: "tasks", keys: ["tasks"], fallbackName: "Task Room", rect: { x: 1040, y: 1000, w: 560, h: 460 }, accent: "#8f9fb3" },
  { zone: "managing-heads", keys: ["managing-heads"], fallbackName: "Managing Heads", rect: { x: 1740, y: 1000, w: 560, h: 460 }, accent: "#d98a8a" },
  { zone: "timetable", keys: ["timetable"], fallbackName: "Timetable Room", rect: { x: 2440, y: 1000, w: 520, h: 460 }, accent: "#e6cf6a" },
  { zone: "outreach", keys: ["outreach", "client"], fallbackName: "Outreach Room", rect: { x: 120, y: 1720, w: 640, h: 420 }, accent: "#b18fe0" },
  { zone: "shoot", keys: ["shoot", "creativity"], fallbackName: "Shoot Room", rect: { x: 900, y: 1720, w: 600, h: 420 }, accent: "#5bb9c9" },
];

const CLIENT_WING = { x: 1640, y: 1720, w: 400, h: 360, gap: 60 };
const CLIENT_ACCENTS = ["#5bb9c9", "#c98fb0", "#8fb46a", "#d0a05a", "#7f9be0"];

// The central park holds the plaza: fountain + bounty board + spawn.
const PARK_CENTRAL: Rect = { x: 1240, y: 700, w: 900, h: 260 };
const PARK_BELT: Rect = { x: 1740, y: 1540, w: 1220, h: 140 };
export const FOUNTAIN: Vec = { x: 1780, y: 830 };
const PLAZA_BOARD: Vec = { x: 1580, y: 826 };
export const SPAWN: Vec = { x: 1450, y: 832 };

const TREES: Vec[] = [
  { x: 1350, y: 748 },
  { x: 1330, y: 900 },
  { x: 2020, y: 740 },
  { x: 2090, y: 900 },
  { x: 1800, y: 1580 },
  { x: 2150, y: 1640 },
  { x: 2520, y: 1580 },
  { x: 2870, y: 1640 },
  { x: 350, y: 900 },
  { x: 2900, y: 780 },
  { x: 640, y: 1640 },
  { x: 3060, y: 1180 },
];

export const BUILDINGS_PLAN: Omit<Building, "door">[] = [
  { key: "tower-pipeline", label: "Pipeline Tower", rect: { x: 220, y: 260, w: 300, h: 280 }, tint: "#7f95b8", tall: true },
  { key: "tower-complete", label: "Completed Tower", rect: { x: 660, y: 260, w: 300, h: 280 }, tint: "#8ba889", tall: true },
  { key: "bungalow", label: "Internal Tools Bungalow", rect: { x: 340, y: 620, w: 420, h: 120 }, tint: "#c2a476", tall: false },
];

function buildingDoor(b: Omit<Building, "door">): Vec {
  if (b.key === "bungalow") return { x: b.rect.x + b.rect.w / 2, y: b.rect.y - 28 };
  return { x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h + 28 };
}

// ---- interiors (the vault band, y ≥ 2180) --------------------------------

const INTERIOR_PLANS: Omit<InteriorGeom, "spawn">[] = [
  {
    key: "int-pipeline",
    label: "Pipeline Tower — Lobby",
    theme: "lobby",
    rect: { x: 200, y: 2180, w: 560, h: 240 },
    floor: [148, 158, 176],
    props: [
      { kind: "lift-panel", x: 480, y: 2210 },
      { kind: "plant", x: 230, y: 2210 },
      { kind: "plant", x: 730, y: 2210 },
      { kind: "cooler", x: 230, y: 2390 },
      { kind: "exit-door", x: 480, y: 2394 },
    ],
  },
  {
    key: "int-complete",
    label: "Completed Tower — Gallery",
    theme: "gallery",
    rect: { x: 900, y: 2180, w: 560, h: 240 },
    floor: [150, 168, 150],
    props: [
      { kind: "gallery-board", x: 1080, y: 2210 },
      { kind: "gallery-board", x: 1290, y: 2210 },
      { kind: "plant", x: 930, y: 2390 },
      { kind: "exit-door", x: 1180, y: 2394 },
    ],
  },
  {
    key: "int-tools",
    label: "Internal Tools Bungalow",
    theme: "library",
    rect: { x: 1600, y: 2180, w: 500, h: 240 },
    floor: [176, 158, 132],
    props: [
      { kind: "library-shelf", x: 1700, y: 2210 },
      { kind: "library-shelf", x: 1850, y: 2210 },
      { kind: "writing-desk", x: 2010, y: 2270 },
      { kind: "rug", x: 1850, y: 2300 },
      { kind: "exit-door", x: 1850, y: 2394 },
    ],
  },
  {
    key: "lair",
    label: "The Upside Down",
    theme: "lair",
    rect: { x: 2400, y: 2180, w: 760, h: 260 },
    floor: [30, 24, 34],
    props: [
      { kind: "vine", x: 2440, y: 2210 },
      { kind: "vine", x: 3120, y: 2210 },
      { kind: "vine", x: 2700, y: 2200 },
      { kind: "hive-desk", x: 2780, y: 2250 },
      { kind: "vine", x: 3060, y: 2410 },
      { kind: "rift", x: 2480, y: 2408 },
    ],
  },
];

function interiorSpawn(i: Omit<InteriorGeom, "spawn">): Vec {
  // Just inside the south wall, in front of the exit.
  return { x: i.rect.x + i.rect.w / 2, y: i.rect.y + i.rect.h - 60 };
}

/** The admin rift sits against the managing-heads back wall. */
export const RIFT_AT: Vec = { x: 2020, y: 1052 };

export function inLair(x: number, y: number): boolean {
  const lair = INTERIOR_PLANS.find((i) => i.key === "lair")!.rect;
  return x >= lair.x && x <= lair.x + lair.w && y >= lair.y && y <= lair.y + lair.h;
}

// ---------------------------------------------------------------------------
// Zone furnishing
// ---------------------------------------------------------------------------

function furnish(zone: ZoneKey, r: Rect): { board: Vec; desks: Rect[]; props: CampusProp[] } {
  const cx = r.x + r.w / 2;
  const props: CampusProp[] = [];
  const desks: Rect[] = [];
  let board: Vec = { x: r.x + r.w - 50, y: r.y + r.h / 2 };

  switch (zone) {
    case "developer": {
      board = { x: r.x + r.w - 50, y: r.y + 420 };
      props.push({ kind: "plant", x: r.x + 50, y: r.y + r.h - 50 });
      props.push({ kind: "plant", x: r.x + r.w - 50, y: r.y + 54 });
      props.push({ kind: "tree", x: r.x + 90, y: r.y + 90 });
      break;
    }
    case "video-editing": {
      const dw = 110;
      const dh = 48;
      for (let i = 0; i < 4; i++) {
        desks.push({ x: r.x + 60 + i * (dw + 34), y: r.y + 52, w: dw, h: dh });
      }
      props.push({ kind: "npc-editor", x: r.x + 60 + dw + 34 + dw / 2, y: r.y + 52 + dh + 24 });
      props.push({ kind: "queue-board", x: r.x + r.w - 52, y: r.y + 160 });
      props.push({ kind: "script-terminal", x: r.x + r.w - 52, y: r.y + 320 });
      board = { x: r.x + 52, y: r.y + r.h - 120 };
      props.push({ kind: "plant", x: r.x + 50, y: r.y + r.h - 52 });
      props.push({ kind: "cooler", x: r.x + r.w - 50, y: r.y + r.h - 52 });
      break;
    }
    case "conference": {
      const tw = 380;
      const th = 120;
      const tx = cx - tw / 2;
      const ty = r.y + r.h / 2 - th / 2 + 20;
      desks.push({ x: tx, y: ty, w: tw, h: th });
      const seats = 6;
      for (let i = 0; i < seats; i++) {
        const sx = tx + 30 + (i * (tw - 60)) / (seats - 1);
        props.push({ kind: "chair", x: sx, y: ty - 30 });
        props.push({ kind: "chair", x: sx, y: ty + th + 30 });
      }
      props.push({ kind: "chair", x: tx - 32, y: ty + th / 2 });
      props.push({ kind: "chair", x: tx + tw + 32, y: ty + th / 2 });
      props.push({ kind: "conference-screen", x: cx, y: r.y + 46 });
      board = { x: cx, y: r.y + 70 };
      props.push({ kind: "plant", x: r.x + 52, y: r.y + 54 });
      props.push({ kind: "plant", x: r.x + r.w - 52, y: r.y + 54 });
      break;
    }
    case "creative": {
      props.push({ kind: "door-clients", x: r.x + r.w * 0.3, y: r.y + 34 });
      props.push({ kind: "door-internal", x: r.x + r.w * 0.7, y: r.y + 34 });
      props.push({ kind: "infinite-board", x: r.x + 50, y: r.y + r.h / 2 - 60 });
      props.push({ kind: "writing-desk", x: r.x + 50, y: r.y + r.h / 2 + 120 });
      desks.push({ x: cx - 55, y: r.y + r.h - 160, w: 110, h: 48 });
      board = { x: r.x + r.w - 52, y: r.y + r.h / 2 };
      props.push({ kind: "plant", x: r.x + r.w - 52, y: r.y + r.h - 54 });
      break;
    }
    case "tasks": {
      const dw = 96;
      const dh = 46;
      for (const [ix, iy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        desks.push({ x: r.x + 80 + ix * (dw + 110), y: r.y + 100 + iy * (dh + 120), w: dw, h: dh });
      }
      props.push({ kind: "task-wall", x: r.x + r.w - 52, y: r.y + r.h / 2 });
      board = { x: r.x + r.w - 52, y: r.y + r.h / 2 - 120 };
      props.push({ kind: "plant", x: r.x + 50, y: r.y + r.h - 52 });
      break;
    }
    case "managing-heads": {
      desks.push({ x: cx - 130, y: r.y + 80, w: 104, h: 48 });
      desks.push({ x: cx + 30, y: r.y + 80, w: 104, h: 48 });
      props.push({ kind: "approval-desk", x: cx, y: r.y + r.h - 100 });
      // The rift to the Upside Down hides against the back wall.
      props.push({ kind: "rift", x: RIFT_AT.x, y: RIFT_AT.y - 12 });
      board = { x: r.x + 52, y: r.y + r.h / 2 };
      props.push({ kind: "plant", x: r.x + r.w - 52, y: r.y + r.h - 54 });
      props.push({ kind: "cooler", x: r.x + 52, y: r.y + 56 });
      break;
    }
    case "timetable": {
      props.push({ kind: "big-clock", x: cx, y: r.y + 38 });
      props.push({ kind: "school-bell", x: r.x + r.w - 52, y: r.y + 70 });
      board = { x: r.x + 52, y: r.y + r.h / 2 };
      props.push({ kind: "rug", x: cx, y: r.y + r.h / 2 + 40 });
      props.push({ kind: "plant", x: r.x + 50, y: r.y + r.h - 52 });
      break;
    }
    case "outreach": {
      desks.push({ x: r.x + 70, y: r.y + 84, w: 104, h: 46 });
      desks.push({ x: r.x + 70, y: r.y + 230, w: 104, h: 46 });
      props.push({ kind: "outreach-desk", x: r.x + r.w - 54, y: r.y + r.h / 2 });
      props.push({ kind: "phone-booth", x: r.x + r.w - 60, y: r.y + 64 });
      board = { x: cx, y: r.y + 44 };
      break;
    }
    case "shoot": {
      props.push({ kind: "camera-rig", x: cx - 80, y: r.y + r.h / 2 + 60 });
      props.push({ kind: "light-rig", x: r.x + 64, y: r.y + 64 });
      props.push({ kind: "light-rig", x: r.x + r.w - 64, y: r.y + 64 });
      props.push({ kind: "rug", x: cx + 40, y: r.y + 120 });
      board = { x: r.x + 52, y: r.y + r.h / 2 };
      break;
    }
    case "client": {
      desks.push({ x: r.x + 44, y: r.y + r.h - 92, w: 96, h: 44 });
      desks.push({ x: r.x + r.w - 140, y: r.y + r.h - 92, w: 96, h: 44 });
      board = { x: cx, y: r.y + 44 };
      props.push({ kind: "plant", x: r.x + 44, y: r.y + 46 });
      break;
    }
  }
  return { board, desks, props };
}

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

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

/** Sealed box — interiors have no wall gaps; you arrive and leave by portal. */
export function vaultWalls(r: Rect): Rect[] {
  const t = WALL_T;
  return [
    { x: r.x - t, y: r.y - t, w: r.w + t * 2, h: t },
    { x: r.x - t, y: r.y + r.h, w: r.w + t * 2, h: t },
    { x: r.x - t, y: r.y, w: t, h: r.h },
    { x: r.x + r.w, y: r.y, w: t, h: r.h },
  ];
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
    if (!key) continue;
    const room = byKey.get(key)!;
    used.add(key);
    const { board, desks, props } = furnish(plan.zone, plan.rect);
    geoms.push({ ...room, zone: plan.zone, rect: plan.rect, board, desks, props, accent: plan.accent });
  }

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
    worldW = Math.max(worldW, rect.x + rect.w + 120);
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
  const hasDev = geoms.some((g) => g.zone === "developer");
  const buildings: Building[] = hasDev
    ? BUILDINGS_PLAN.map((b) => ({ ...b, door: buildingDoor(b) }))
    : [];

  const interiors: InteriorGeom[] = INTERIOR_PLANS.filter(
    (i) => i.key === "lair" || hasDev,
  ).map((i) => ({ ...i, spawn: interiorSpawn(i) }));

  const portals: Portal[] = [];
  const interiorByKey = new Map(interiors.map((i) => [i.key, i]));
  const link = (
    id: string,
    label: string,
    subtitle: string,
    at: Vec,
    interiorKey: string,
    adminOnly?: boolean,
    /** Which way "out" faces at the door: +1 walks south on exit, -1 north. */
    outward = 1,
  ) => {
    const interior = interiorByKey.get(interiorKey);
    if (!interior) return;
    portals.push({ id, label, subtitle, at, to: interior.spawn, toYaw: -Math.PI / 2, adminOnly });
    // Matching exit: the interior's exit-door / rift prop teleports back.
    const exit = interior.props.find((p) => p.kind === "exit-door" || p.kind === "rift");
    if (exit) {
      portals.push({
        id: `${id}-exit`,
        label: interior.theme === "lair" ? "Back through the rift" : "Exit to campus",
        subtitle: interior.theme === "lair" ? "Return to the right side up" : "Back to the floor",
        at: { x: exit.x, y: exit.y - 14 },
        to: { x: at.x, y: at.y + 26 * outward },
        toYaw: (Math.PI / 2) * outward,
      });
    }
  };

  for (const b of buildings) {
    const interiorKey =
      b.key === "tower-pipeline" ? "int-pipeline" : b.key === "tower-complete" ? "int-complete" : "int-tools";
    link(
      `enter-${b.key}`,
      `Enter ${b.label}`,
      b.key === "bungalow" ? "Library, tools & writing desks" : "Walk into the lobby",
      b.door,
      interiorKey,
      undefined,
      // The bungalow's door faces north, so leaving it walks north; the
      // towers' doors face south of their slabs.
      b.key === "bungalow" ? -1 : 1,
    );
  }
  if (geoms.some((g) => g.zone === "managing-heads")) {
    link("enter-lair", "Enter the rift", "The Upside Down — admins only", RIFT_AT, "lair", true);
  }

  const solids: Rect[] = [
    ...outerWalls(world),
    ...geoms.flatMap((g) => roomWalls(g.rect)),
    ...geoms.flatMap((g) => g.desks),
    ...buildings.map((b) => b.rect),
    ...interiors.flatMap((i) => vaultWalls(i.rect)),
    // Trees and the fountain block movement (drawn as billboards, not boxes).
    ...TREES.map((t) => ({ x: t.x - 9, y: t.y - 7, w: 18, h: 14 })),
    { x: FOUNTAIN.x - 34, y: FOUNTAIN.y - 26, w: 68, h: 52 },
  ];

  return {
    world,
    rooms: geoms,
    buildings,
    interiors,
    portals,
    parks: [PARK_CENTRAL, PARK_BELT],
    trees: [...TREES],
    fountain: { ...FOUNTAIN },
    solids,
    spawn: { ...SPAWN },
    plaza: { board: { ...PLAZA_BOARD } },
  };
}

// ---------------------------------------------------------------------------
// Queries & movement
// ---------------------------------------------------------------------------

export function roomIdAt(rooms: RoomGeom[], x: number, y: number): string | null {
  for (const r of rooms) {
    if (x >= r.rect.x && x <= r.rect.x + r.rect.w && y >= r.rect.y && y <= r.rect.y + r.rect.h) {
      return r.id;
    }
  }
  return null;
}

/** Display name for wherever the player is standing. */
export function placeName(layout: Layout, x: number, y: number): string {
  for (const i of layout.interiors) {
    if (x >= i.rect.x && x <= i.rect.x + i.rect.w && y >= i.rect.y && y <= i.rect.y + i.rect.h) {
      return i.label;
    }
  }
  for (const r of layout.rooms) {
    if (x >= r.rect.x && x <= r.rect.x + r.rect.w && y >= r.rect.y && y <= r.rect.y + r.rect.h) {
      return r.name;
    }
  }
  for (const p of layout.parks) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return "The Park";
  }
  return "Campus";
}

// ---------------------------------------------------------------------------
// Navigation — walkable grid + A*, so click-to-walk can cross the whole campus
// ---------------------------------------------------------------------------

export type NavGrid = {
  cell: number;
  cols: number;
  rows: number;
  /** 1 = a player circle fits at this cell's centre. */
  walk: Uint8Array;
};

export function buildNavGrid(layout: Layout, cell = 20): NavGrid {
  const cols = Math.max(1, Math.ceil(layout.world.w / cell));
  const rows = Math.max(1, Math.ceil(layout.world.h / cell));
  const walk = new Uint8Array(cols * rows).fill(1);
  const pad = PLAYER_RADIUS + 2;
  const block = (r: Rect) => {
    const x0 = Math.max(0, Math.floor((r.x - pad) / cell));
    const x1 = Math.min(cols - 1, Math.floor((r.x + r.w + pad) / cell));
    const y0 = Math.max(0, Math.floor((r.y - pad) / cell));
    const y1 = Math.min(rows - 1, Math.floor((r.y + r.h + pad) / cell));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const px = cx * cell + cell / 2;
        const py = cy * cell + cell / 2;
        if (circleRect(px, py, PLAYER_RADIUS + 2, r)) walk[cy * cols + cx] = 0;
      }
    }
  };
  for (const s of layout.solids) block(s);
  return { cell, cols, rows, walk };
}

/** Nearest walkable cell to a world point, searching outward a few rings. */
function snapCell(nav: NavGrid, x: number, y: number): { cx: number; cy: number } | null {
  const cx0 = Math.max(0, Math.min(nav.cols - 1, Math.floor(x / nav.cell)));
  const cy0 = Math.max(0, Math.min(nav.rows - 1, Math.floor(y / nav.cell)));
  for (let ring = 0; ring <= 8; ring++) {
    let best: { cx: number; cy: number; d: number } | null = null;
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = cx0 + dx;
        const cy = cy0 + dy;
        if (cx < 0 || cy < 0 || cx >= nav.cols || cy >= nav.rows) continue;
        if (!nav.walk[cy * nav.cols + cx]) continue;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { cx, cy, d };
      }
    }
    if (best) return { cx: best.cx, cy: best.cy };
  }
  return null;
}

/** Every grid cell a segment passes through is walkable (conservative LOS). */
function lineWalkable(nav: NavGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (nav.cell / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = Math.floor((x0 + (x1 - x0) * t) / nav.cell);
    const cy = Math.floor((y0 + (y1 - y0) * t) / nav.cell);
    if (cx < 0 || cy < 0 || cx >= nav.cols || cy >= nav.rows) return false;
    if (!nav.walk[cy * nav.cols + cx]) return false;
  }
  return true;
}

/**
 * A* over the walkable grid, smoothed to a short chain of world waypoints.
 * Returns [] when no route exists (e.g. into a sealed vault — use a portal).
 * The final waypoint is the exact target so arrival distance stays honest.
 */
export function findPath(nav: NavGrid, sx: number, sy: number, tx: number, ty: number): Vec[] {
  const s = snapCell(nav, sx, sy);
  const t = snapCell(nav, tx, ty);
  if (!s || !t) return [];
  const { cols, rows, cell, walk } = nav;
  const n = cols * rows;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const start = s.cy * cols + s.cx;
  const goal = t.cy * cols + t.cx;
  g[start] = 0;
  const hf = (i: number) => {
    const dx = (i % cols) - t.cx;
    const dy = ((i / cols) | 0) - t.cy;
    return Math.hypot(dx, dy);
  };
  // Small binary min-heap on f.
  const open: { f: number; i: number }[] = [{ f: hf(start), i: start }];
  const bubbleUp = (c: number) => {
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (open[p].f <= open[c].f) break;
      [open[p], open[c]] = [open[c], open[p]];
      c = p;
    }
  };
  const bubbleDown = () => {
    let c = 0;
    for (;;) {
      const l = c * 2 + 1;
      const r = l + 1;
      let m = c;
      if (l < open.length && open[l].f < open[m].f) m = l;
      if (r < open.length && open[r].f < open[m].f) m = r;
      if (m === c) break;
      [open[m], open[c]] = [open[c], open[m]];
      c = m;
    }
  };
  let found = false;
  let guard = 0;
  while (open.length > 0 && guard++ < n * 4) {
    const cur = open[0].i;
    const last = open.pop()!;
    if (open.length > 0) {
      open[0] = last;
      bubbleDown();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      found = true;
      break;
    }
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (!walk[ni] || closed[ni]) continue;
        // No corner cutting on diagonals.
        if (dx !== 0 && dy !== 0 && (!walk[cy * cols + nx] || !walk[ny * cols + cx])) continue;
        const step = dx !== 0 && dy !== 0 ? 1.41421 : 1;
        const ng = g[cur] + step;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          open.push({ f: ng + hf(ni), i: ni });
          bubbleUp(open.length - 1);
        }
      }
    }
  }
  if (!found) return [];
  // Reconstruct cell centres, then greedily smooth with line-of-sight. A
  // smoothed hop must be wide enough for the player's body, not just the
  // centreline — otherwise long hops graze door-gap corners and the walker
  // clips geometry the path never intended.
  const cellsPath: Vec[] = [];
  for (let i = goal; i !== -1; i = came[i]) {
    cellsPath.push({ x: (i % cols) * cell + cell / 2, y: ((i / cols) | 0) * cell + cell / 2 });
  }
  cellsPath.reverse();
  const wideLine = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (!lineWalkable(nav, x0, y0, x1, y1)) return false;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * (cell * 0.55);
    const oy = (dx / len) * (cell * 0.55);
    return (
      lineWalkable(nav, x0 + ox, y0 + oy, x1 + ox, y1 + oy) &&
      lineWalkable(nav, x0 - ox, y0 - oy, x1 - ox, y1 - oy)
    );
  };
  const waypoints: Vec[] = [];
  let anchor: Vec = { x: sx, y: sy };
  let k = 0;
  while (k < cellsPath.length) {
    let far = k;
    for (let j = cellsPath.length - 1; j > k; j--) {
      if (wideLine(anchor.x, anchor.y, cellsPath[j].x, cellsPath[j].y)) {
        far = j;
        break;
      }
    }
    anchor = cellsPath[far];
    waypoints.push(anchor);
    k = far + 1;
  }
  // End on the true target when the last hop can reach it directly. The plain
  // check is right here: legitimate targets (doors, boards) sit close to walls.
  if (lineWalkable(nav, anchor.x, anchor.y, tx, ty)) {
    waypoints[waypoints.length - 1] = { x: tx, y: ty };
  } else {
    waypoints.push({ x: tx, y: ty });
  }
  return waypoints;
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

export function resolveCollision(
  solids: Rect[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  world: { w: number; h: number },
): Vec {
  const R = PLAYER_RADIUS;
  const clampX = (v: number) => Math.max(R + WALL_T, Math.min(world.w - R - WALL_T, v));
  const clampY = (v: number) => Math.max(R + WALL_T, Math.min(world.h - R - WALL_T, v));
  const hits = (x: number, y: number) => solids.some((s) => circleRect(x, y, R, s));

  // Sub-step the move so one large frame delta can't jump a thin obstacle or
  // wedge the circle into an envelope corner; slide per axis at each step.
  let x = fromX;
  let y = fromY;
  const tx = clampX(toX);
  const ty = clampY(toY);
  const total = Math.hypot(tx - x, ty - y);
  const steps = Math.max(1, Math.ceil(total / (R * 0.75)));
  const sx = (tx - x) / steps;
  const sy = (ty - y) / steps;
  for (let i = 0; i < steps; i++) {
    const nx = x + sx;
    const ny = y + sy;
    if (!hits(nx, ny)) {
      x = nx;
      y = ny;
    } else if (!hits(nx, y)) {
      x = nx;
    } else if (!hits(x, ny)) {
      y = ny;
    } else {
      break;
    }
  }

  // Depenetrate: a stale save (or an old-map position) can leave the player
  // inside a solid, where every move fails. Push out so movement recovers.
  for (let iter = 0; iter < 3; iter++) {
    const s = solids.find((r) => circleRect(x, y, R, r));
    if (!s) break;
    const nx = Math.max(s.x, Math.min(x, s.x + s.w));
    const ny = Math.max(s.y, Math.min(y, s.y + s.h));
    const dx = x - nx;
    const dy = y - ny;
    const d = Math.hypot(dx, dy);
    if (d > 0.0001) {
      const push = R - d + 0.5;
      x = clampX(x + (dx / d) * push);
      y = clampY(y + (dy / d) * push);
    } else {
      // Centre is inside the box — leave through the nearest face.
      const exits = [
        { v: x - s.x, apply: () => (x = clampX(s.x - R - 0.5)) },
        { v: s.x + s.w - x, apply: () => (x = clampX(s.x + s.w + R + 0.5)) },
        { v: y - s.y, apply: () => (y = clampY(s.y - R - 0.5)) },
        { v: s.y + s.h - y, apply: () => (y = clampY(s.y + s.h + R + 0.5)) },
      ];
      exits.sort((a, b) => a.v - b.v)[0].apply();
    }
  }
  return { x, y };
}

export function userHue(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
  return h;
}
