// DB-driven office layout for the Gamified Workspace. Rooms are placed on a grid
// (posX/posY) so the map is expandable — admins add client areas at runtime.
// Logic (movement/collision) stays in top-down world coordinates; the game
// renders it isometrically.

export type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };

export const CELL = { w: 300, h: 200 };
export const GAP = 72;
export const PAD = 60;
const WALL_T = 10;
const DOOR_W = 96;

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

export type RoomGeom = RoomInput & {
  rect: Rect;
  board: Vec;
  desks: Rect[];
  accent: string;
};

export type Layout = {
  world: { w: number; h: number };
  rooms: RoomGeom[];
  solids: Rect[];
  spawn: Vec;
};

const DEPT_ACCENT: Record<string, string> = {
  developer: "#6f9ff0",
  creative: "#63c98a",
  "video-editing": "#e0a862",
  "managing-heads": "#d98a8a",
  "common-board": "#c9bfa6",
  client: "#b18fe0",
  creativity: "#e6cf6a",
};
const CLIENT_ACCENTS = ["#5bb9c9", "#c98fb0", "#8fb46a", "#d0a05a", "#7f9be0"];

function roomRect(posX: number, posY: number): Rect {
  return {
    x: PAD + posX * (CELL.w + GAP),
    y: PAD + posY * (CELL.h + GAP),
    w: CELL.w,
    h: CELL.h,
  };
}

function desksFor(r: Rect): Rect[] {
  const dw = 76;
  const dh = 40;
  const y = r.y + r.h - dh - 28;
  return [
    { x: r.x + 30, y, w: dw, h: dh },
    { x: r.x + r.w - dw - 30, y, w: dw, h: dh },
  ];
}

// Four walls with a centred doorway gap on each side, so any two adjacent rooms
// connect through the corridor between them.
export function roomWalls(r: Rect): Rect[] {
  const t = WALL_T;
  const segs: Rect[] = [];
  const gx = r.x + r.w / 2 - DOOR_W / 2;
  const gy = r.y + r.h / 2 - DOOR_W / 2;
  // top & bottom
  for (const wy of [r.y - t, r.y + r.h]) {
    segs.push({ x: r.x - t, y: wy, w: gx - (r.x - t), h: t });
    segs.push({ x: gx + DOOR_W, y: wy, w: r.x + r.w + t - (gx + DOOR_W), h: t });
  }
  // left & right
  for (const wx of [r.x - t, r.x + r.w]) {
    segs.push({ x: wx, y: r.y - t, w: t, h: gy - (r.y - t) });
    segs.push({ x: wx, y: gy + DOOR_W, w: t, h: r.y + r.h + t - (gy + DOOR_W) });
  }
  return segs;
}

// The building shell. Kept separate from room walls so the 3D renderer can give
// it a full-height (view-blocking) treatment while dividers stay waist-to-head high.
export function outerWalls(world: { w: number; h: number }): Rect[] {
  return [
    { x: 0, y: 0, w: world.w, h: WALL_T },
    { x: 0, y: world.h - WALL_T, w: world.w, h: WALL_T },
    { x: 0, y: 0, w: WALL_T, h: world.h },
    { x: world.w - WALL_T, y: 0, w: WALL_T, h: world.h },
  ];
}

export function buildLayout(rooms: RoomInput[]): Layout {
  const maxX = Math.max(0, ...rooms.map((r) => r.posX));
  const maxY = Math.max(0, ...rooms.map((r) => r.posY));
  const world = {
    w: PAD * 2 + (maxX + 1) * CELL.w + maxX * GAP,
    h: PAD * 2 + (maxY + 1) * CELL.h + maxY * GAP,
  };

  let clientIdx = 0;
  const geoms: RoomGeom[] = rooms.map((r) => {
    const rect = roomRect(r.posX, r.posY);
    const accent =
      r.kind === "client"
        ? CLIENT_ACCENTS[clientIdx++ % CLIENT_ACCENTS.length]
        : (DEPT_ACCENT[r.key] ?? "#9aa0aa");
    return {
      ...r,
      rect,
      board: { x: rect.x + rect.w / 2, y: rect.y + 46 },
      desks: desksFor(rect),
      accent,
    };
  });

  const outer: Rect[] = outerWalls(world);
  const solids: Rect[] = [
    ...outer,
    ...geoms.flatMap((g) => roomWalls(g.rect)),
    ...geoms.flatMap((g) => g.desks),
  ];

  const hub =
    geoms.find((g) => g.key === "common-board") ?? geoms[0] ?? null;
  const spawn: Vec = hub
    ? { x: hub.rect.x + hub.rect.w / 2, y: hub.rect.y + hub.rect.h / 2 }
    : { x: world.w / 2, y: world.h / 2 };

  return { world, rooms: geoms, solids, spawn };
}

export function roomKeyAt(rooms: RoomGeom[], x: number, y: number): string | null {
  for (const r of rooms) {
    if (
      x >= r.rect.x &&
      x <= r.rect.x + r.rect.w &&
      y >= r.rect.y &&
      y <= r.rect.y + r.rect.h
    )
      return r.key;
  }
  return null;
}

export function roomIdAt(rooms: RoomGeom[], x: number, y: number): string | null {
  const key = roomKeyAt(rooms, x, y);
  return key ? (rooms.find((r) => r.key === key)?.id ?? null) : null;
}

export function nearestBoard(rooms: RoomGeom[], x: number, y: number): RoomGeom | null {
  let best: RoomGeom | null = null;
  let bestD = INTERACT_RADIUS;
  for (const r of rooms) {
    const d = Math.hypot(r.board.x - x, r.board.y - y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export function resolveCollision(
  solids: Rect[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  world: { w: number; h: number },
): Vec {
  const hs = PLAYER_RADIUS;
  let x = toX;
  let y = fromY;
  for (const s of solids) {
    if (overlap(x, y, hs, s)) {
      if (toX > fromX) x = s.x - hs;
      else if (toX < fromX) x = s.x + s.w + hs;
    }
  }
  y = toY;
  for (const s of solids) {
    if (overlap(x, y, hs, s)) {
      if (toY > fromY) y = s.y - hs;
      else if (toY < fromY) y = s.y + s.h + hs;
    }
  }
  x = Math.max(WALL_T + hs, Math.min(world.w - WALL_T - hs, x));
  y = Math.max(WALL_T + hs, Math.min(world.h - WALL_T - hs, y));
  return { x, y };
}

function overlap(cx: number, cy: number, hs: number, s: Rect): boolean {
  return (
    cx + hs > s.x && cx - hs < s.x + s.w && cy + hs > s.y && cy - hs < s.y + s.h
  );
}

export function userHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
