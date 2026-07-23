// Top-down office map for the Gamified Workspace game. Coordinates are in a
// fixed world space; the canvas scales to fit. Open-plan layout: rooms are floor
// zones (not walled off) and collision is only against the outer boundary and
// furniture, so avatars roam freely between rooms.

export const WORLD = { w: 1000, h: 640 };
export const WALL = 14;

export type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };

export type RoomDef = {
  key: string;
  name: string;
  short: string;
  rect: Rect;
  board: Vec; // mission kiosk location
  desks: Rect[];
  spawn: Vec;
};

function desksFor(r: Rect): Rect[] {
  const dw = 78;
  const dh = 40;
  const y = r.y + r.h - dh - 22;
  return [
    { x: r.x + 26, y, w: dw, h: dh },
    { x: r.x + r.w - dw - 26, y, w: dw, h: dh },
  ];
}

function room(
  key: string,
  name: string,
  short: string,
  rect: Rect,
): RoomDef {
  return {
    key,
    name,
    short,
    rect,
    board: { x: rect.x + rect.w / 2, y: rect.y + 40 },
    desks: desksFor(rect),
    spawn: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
  };
}

export const ROOMS: RoomDef[] = [
  room("developer", "Developer Room", "DEV", { x: 20, y: 20, w: 300, h: 190 }),
  room("creative", "Creative Room", "CRE", { x: 350, y: 20, w: 300, h: 190 }),
  room("video-editing", "Video Editing", "VID", { x: 680, y: 20, w: 300, h: 190 }),
  room("managing-heads", "Managing Heads", "MGT", { x: 20, y: 240, w: 300, h: 190 }),
  room("common-board", "Common Board", "HUB", { x: 350, y: 240, w: 300, h: 190 }),
  room("client", "Client Room", "CLI", { x: 680, y: 240, w: 300, h: 190 }),
  room("creativity", "Creativity Room", "IDEA", { x: 350, y: 460, w: 300, h: 160 }),
];

export const SPAWN: Vec = { x: 500, y: 335 }; // Common Board (hub)

// Outer boundary walls.
export const OUTER_WALLS: Rect[] = [
  { x: 0, y: 0, w: WORLD.w, h: WALL },
  { x: 0, y: WORLD.h - WALL, w: WORLD.w, h: WALL },
  { x: 0, y: 0, w: WALL, h: WORLD.h },
  { x: WORLD.w - WALL, y: 0, w: WALL, h: WORLD.h },
];

// Everything an avatar collides with.
export const SOLIDS: Rect[] = [
  ...OUTER_WALLS,
  ...ROOMS.flatMap((r) => r.desks),
];

export const PLAYER_RADIUS = 12;
export const INTERACT_RADIUS = 66;

export function roomKeyAt(x: number, y: number): string | null {
  for (const r of ROOMS) {
    if (
      x >= r.rect.x &&
      x <= r.rect.x + r.rect.w &&
      y >= r.rect.y &&
      y <= r.rect.y + r.rect.h
    ) {
      return r.key;
    }
  }
  return null;
}

export function nearestBoard(x: number, y: number): RoomDef | null {
  let best: RoomDef | null = null;
  let bestD = INTERACT_RADIUS;
  for (const r of ROOMS) {
    const d = Math.hypot(r.board.x - x, r.board.y - y);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

// Axis-aligned resolution: given a desired position, clamp it out of solids.
// Treats the player as a box of half-size PLAYER_RADIUS.
export function resolveCollision(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Vec {
  const hs = PLAYER_RADIUS;
  let x = toX;
  let y = fromY;
  // Move X, resolve against solids.
  for (const s of SOLIDS) {
    if (overlap(x, y, hs, s)) {
      if (toX > fromX) x = s.x - hs;
      else if (toX < fromX) x = s.x + s.w + hs;
    }
  }
  // Move Y, resolve against solids.
  y = toY;
  for (const s of SOLIDS) {
    if (overlap(x, y, hs, s)) {
      if (toY > fromY) y = s.y - hs;
      else if (toY < fromY) y = s.y + s.h + hs;
    }
  }
  // Clamp to world.
  x = Math.max(WALL + hs, Math.min(WORLD.w - WALL - hs, x));
  y = Math.max(WALL + hs, Math.min(WORLD.h - WALL - hs, y));
  return { x, y };
}

function overlap(cx: number, cy: number, hs: number, s: Rect): boolean {
  return (
    cx + hs > s.x &&
    cx - hs < s.x + s.w &&
    cy + hs > s.y &&
    cy - hs < s.y + s.h
  );
}
