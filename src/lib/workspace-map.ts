// Top-down office map for the Gamified Workspace game. Rooms have walls with
// doorways (collision), desks and decor. Coordinates are a fixed world space;
// the canvas scales to fit.

export const WORLD = { w: 1040, h: 660 };
export const TILE = 20;

export type Rect = { x: number; y: number; w: number; h: number };
export type Vec = { x: number; y: number };
export type Door = { side: "top" | "bottom" | "left" | "right" };

export type Decor = {
  kind: "plant" | "cooler" | "board" | "shelf" | "rug";
  x: number;
  y: number;
};

export type RoomDef = {
  key: string;
  name: string;
  short: string;
  accent: string; // rug / label tint (game world palette)
  rect: Rect;
  doors: Door[];
  board: Vec;
  desks: Rect[];
  decor: Decor[];
};

const WALL_T = 9;
const DOOR_W = 84;

function desksFor(r: Rect): Rect[] {
  const dw = 74;
  const dh = 34;
  const y = r.y + r.h - dh - 26;
  return [
    { x: r.x + 26, y, w: dw, h: dh },
    { x: r.x + r.w - dw - 26, y, w: dw, h: dh },
  ];
}

function room(
  key: string,
  name: string,
  short: string,
  accent: string,
  rect: Rect,
  doors: Door[],
  decor: Decor[] = [],
): RoomDef {
  return {
    key,
    name,
    short,
    accent,
    rect,
    doors,
    board: { x: rect.x + rect.w / 2, y: rect.y + 52 },
    desks: desksFor(rect),
    decor,
  };
}

export const ROOMS: RoomDef[] = [
  room("developer", "Developer Room", "DEV", "#7db3e8", { x: 24, y: 24, w: 300, h: 196 }, [{ side: "bottom" }], [
    { kind: "shelf", x: 40, y: 40 },
    { kind: "plant", x: 290, y: 44 },
  ]),
  room("creative", "Creative Room", "CRE", "#8fd6a6", { x: 360, y: 24, w: 300, h: 196 }, [{ side: "bottom" }], [
    { kind: "board", x: 470, y: 40 },
    { kind: "plant", x: 630, y: 44 },
  ]),
  room("video-editing", "Video Editing", "VID", "#e0a86b", { x: 696, y: 24, w: 320, h: 196 }, [{ side: "bottom" }], [
    { kind: "shelf", x: 712, y: 40 },
    { kind: "cooler", x: 980, y: 44 },
  ]),
  room("managing-heads", "Managing Heads", "MGT", "#d68f8f", { x: 24, y: 268, w: 300, h: 196 }, [{ side: "top" }], [
    { kind: "plant", x: 292, y: 430 },
  ]),
  room("common-board", "Common Board", "HUB", "#c7bda8", { x: 360, y: 268, w: 300, h: 196 }, [{ side: "top" }, { side: "bottom" }], [
    { kind: "board", x: 470, y: 284 },
    { kind: "cooler", x: 626, y: 430 },
  ]),
  room("client", "Client Room", "CLI", "#b79ce0", { x: 696, y: 268, w: 320, h: 196 }, [{ side: "top" }], [
    { kind: "plant", x: 984, y: 288 },
  ]),
  room("creativity", "Creativity Room", "IDEA", "#e8cf7d", { x: 360, y: 512, w: 300, h: 124 }, [{ side: "top" }], [
    { kind: "board", x: 470, y: 528 },
  ]),
];

export const SPAWN: Vec = { x: 510, y: 366 }; // Common Board (hub)

// Outer boundary walls.
export const OUTER_WALLS: Rect[] = [
  { x: 0, y: 0, w: WORLD.w, h: WALL_T },
  { x: 0, y: WORLD.h - WALL_T, w: WORLD.w, h: WALL_T },
  { x: 0, y: 0, w: WALL_T, h: WORLD.h },
  { x: WORLD.w - WALL_T, y: 0, w: WALL_T, h: WORLD.h },
];

// Build wall segments for a room, leaving DOOR_W gaps where there are doors.
function roomWalls(r: RoomDef): Rect[] {
  const { x, y, w, h } = r.rect;
  const t = WALL_T;
  const has = (side: Door["side"]) => r.doors.some((d) => d.side === side);
  const segs: Rect[] = [];

  // top / bottom (horizontal walls)
  for (const [side, wy] of [
    ["top", y - t] as const,
    ["bottom", y + h] as const,
  ]) {
    if (has(side)) {
      const gapStart = x + w / 2 - DOOR_W / 2;
      segs.push({ x: x - t, y: wy, w: gapStart - (x - t), h: t });
      segs.push({ x: gapStart + DOOR_W, y: wy, w: x + w + t - (gapStart + DOOR_W), h: t });
    } else {
      segs.push({ x: x - t, y: wy, w: w + t * 2, h: t });
    }
  }
  // left / right (vertical walls)
  for (const [side, wx] of [
    ["left", x - t] as const,
    ["right", x + w] as const,
  ]) {
    if (has(side)) {
      const gapStart = y + h / 2 - DOOR_W / 2;
      segs.push({ x: wx, y: y - t, w: t, h: gapStart - (y - t) });
      segs.push({ x: wx, y: gapStart + DOOR_W, w: t, h: y + h + t - (gapStart + DOOR_W) });
    } else {
      segs.push({ x: wx, y: y - t, w: t, h: h + t * 2 });
    }
  }
  return segs;
}

export const ROOM_WALLS: Rect[] = ROOMS.flatMap(roomWalls);

// Everything an avatar collides with.
export const SOLIDS: Rect[] = [
  ...OUTER_WALLS,
  ...ROOM_WALLS,
  ...ROOMS.flatMap((r) => r.desks),
];

export const PLAYER_RADIUS = 11;
export const INTERACT_RADIUS = 72;

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

// Per-axis collision resolution; player is a box of half-size PLAYER_RADIUS.
export function resolveCollision(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Vec {
  const hs = PLAYER_RADIUS;
  let x = toX;
  let y = fromY;
  for (const s of SOLIDS) {
    if (overlap(x, y, hs, s)) {
      if (toX > fromX) x = s.x - hs;
      else if (toX < fromX) x = s.x + s.w + hs;
    }
  }
  y = toY;
  for (const s of SOLIDS) {
    if (overlap(x, y, hs, s)) {
      if (toY > fromY) y = s.y - hs;
      else if (toY < fromY) y = s.y + s.h + hs;
    }
  }
  x = Math.max(WALL_T + hs, Math.min(WORLD.w - WALL_T - hs, x));
  y = Math.max(WALL_T + hs, Math.min(WORLD.h - WALL_T - hs, y));
  return { x, y };
}

function overlap(cx: number, cy: number, hs: number, s: Rect): boolean {
  return (
    cx + hs > s.x && cx - hs < s.x + s.w && cy + hs > s.y && cy - hs < s.y + s.h
  );
}

// Deterministic per-user color for character shirts.
export function userHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
