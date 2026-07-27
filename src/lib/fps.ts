// First-person renderer maths for the workspace floor.
//
// The floor already exists as axis-aligned rectangles in top-down world space
// (see ./workspace-map), which is exactly what a raycaster wants. This module
// turns that layout into solids with real heights, and provides the ray/camera
// maths the renderer needs to draw the floor the way a person standing on it
// would see it: eye height, perspective, occlusion, no third-person camera.
//
// Everything here is pure and unit-testable — no canvas, no DOM.

import {
  outerWalls,
  roomWalls,
  type Layout,
  type Rect,
  type RoomGeom,
} from "./workspace-map";

// World units are the same ones the top-down map uses: the player's collision
// radius is 11, a room is 300x200. That works out at roughly 2.3cm per unit,
// which is where these heights come from.
export const EYE_HEIGHT = 66; // ~1.55m — standing eye level
export const CROUCH_HEIGHT = 40;
export const CEILING_HEIGHT = 240;
export const PARTITION_HEIGHT = 58; // open-plan divider, low enough to see across
export const DESK_HEIGHT = 34;
export const FOV = Math.PI / 3; // 60°
export const MAX_PITCH = 0.9;
export const VIEW_DISTANCE = 1500;
export const MAX_HITS = 8;

export type SolidKind = "shell" | "partition" | "desk" | "table" | "building";

export type Solid = Rect & {
  kind: SolidKind;
  height: number;
  /** Base colour for the face; the renderer shades it by angle, height and fog. */
  tint: string;
  roomId: string | null;
  /** Buildings get a lit-window grid; the shell gets a daylight band. */
  windows?: "tower" | "shell";
  /** Stable seed so a building's lit windows don't flicker between frames. */
  seed?: number;
};

export type Hit = {
  /** Distance to the entry face, in ray-direction units. */
  dist: number;
  /** Distance to the exit face — used to draw the top of low solids. */
  exit: number;
  /** 0..1 across the face that was hit, for seams and panel detail. */
  u: number;
  /** 0 when an x-facing (east/west) face was hit, 1 for a y-facing one. */
  axis: 0 | 1;
  solid: Solid;
};

export type CastGrid = {
  cell: number;
  cols: number;
  rows: number;
  buckets: number[][];
  solids: Solid[];
  world: { w: number; h: number };
  /** Per-solid visit stamps, so a solid spanning buckets is only tested once. */
  stamp: Int32Array;
  gen: number;
};

const SHELL_TINT = "#b9ae97";
const PARTITION_TINT = "#d6cdb9";
const DESK_TINT = "#c08a5c";
const TABLE_TINT = "#8a6f52";
export const BUILDING_HEIGHT = CEILING_HEIGHT; // towers meet the ceiling — full occluders
export const BUNGALOW_HEIGHT = 120;
export const TABLE_HEIGHT = 38;

/** Turn the campus into solids the raycaster can see, each with a height. */
export function buildSolids(layout: Layout): Solid[] {
  const solids: Solid[] = [];
  for (const w of outerWalls(layout.world)) {
    solids.push({
      ...w,
      kind: "shell",
      height: CEILING_HEIGHT,
      tint: SHELL_TINT,
      roomId: null,
      windows: "shell",
    });
  }
  for (const room of layout.rooms) {
    for (const w of roomWalls(room.rect)) {
      solids.push({
        ...w,
        kind: "partition",
        height: PARTITION_HEIGHT,
        tint: PARTITION_TINT,
        roomId: room.id,
      });
    }
    // The conference table is furniture with presence — taller than a desk,
    // walnut rather than oak, so the hall reads as a hall.
    const isTable = room.zone === "conference";
    for (const d of room.desks) {
      solids.push({
        ...d,
        kind: isTable ? "table" : "desk",
        height: isTable ? TABLE_HEIGHT : DESK_HEIGHT,
        tint: isTable ? TABLE_TINT : DESK_TINT,
        roomId: room.id,
      });
    }
  }
  layout.buildings.forEach((b, i) => {
    solids.push({
      ...b.rect,
      kind: "building",
      height: b.tall ? BUILDING_HEIGHT : BUNGALOW_HEIGHT,
      tint: b.tint,
      roomId: null,
      windows: b.tall ? "tower" : undefined,
      seed: i + 1,
    });
  });
  return solids;
}

/** A solid tall enough to hide everything behind it, so the ray can stop there. */
export function isOccluder(s: Solid): boolean {
  return s.height >= CEILING_HEIGHT;
}

export function buildCastGrid(
  solids: Solid[],
  world: { w: number; h: number },
  cell = 160,
): CastGrid {
  const cols = Math.max(1, Math.ceil(world.w / cell));
  const rows = Math.max(1, Math.ceil(world.h / cell));
  const buckets: number[][] = Array.from({ length: cols * rows }, () => []);
  solids.forEach((s, i) => {
    const x0 = clampInt(Math.floor(s.x / cell), 0, cols - 1);
    const x1 = clampInt(Math.floor((s.x + s.w) / cell), 0, cols - 1);
    const y0 = clampInt(Math.floor(s.y / cell), 0, rows - 1);
    const y1 = clampInt(Math.floor((s.y + s.h) / cell), 0, rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) buckets[cy * cols + cx].push(i);
    }
  });
  return {
    cell,
    cols,
    rows,
    buckets,
    solids,
    world,
    stamp: new Int32Array(solids.length),
    gen: 0,
  };
}

/**
 * Slab test. Returns the entry/exit distances along (dx, dy) plus which face was
 * crossed. Rays starting inside a solid are ignored — the camera should never be
 * there, and drawing from inside a desk looks worse than not drawing it.
 */
export function rayAabb(
  s: Rect,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
): { dist: number; exit: number; axis: 0 | 1 } | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis: 0 | 1 = 0;

  if (dx !== 0) {
    const inv = 1 / dx;
    let t1 = (s.x - ox) * inv;
    let t2 = (s.x + s.w - ox) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = 0;
    }
    if (t2 < tmax) tmax = t2;
  } else if (ox < s.x || ox > s.x + s.w) {
    return null;
  }

  if (dy !== 0) {
    const inv = 1 / dy;
    let t1 = (s.y - oy) * inv;
    let t2 = (s.y + s.h - oy) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = 1;
    }
    if (t2 < tmax) tmax = t2;
  } else if (oy < s.y || oy > s.y + s.h) {
    return null;
  }

  if (tmax < tmin || tmin <= 0) return null;
  return { dist: tmin, exit: tmax, axis };
}

/**
 * Walk the ray through the bucket grid and collect every solid it crosses, near
 * to far. Multiple hits matter here: a desk is knee-high, so what's behind it is
 * still visible above it and the renderer paints them back to front.
 *
 * `out` is a caller-owned scratch array — one allocation per frame, not per ray.
 */
export function castRay(
  grid: CastGrid,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxT: number,
  out: Hit[],
): number {
  const { cell, cols, rows, buckets, solids, stamp } = grid;
  grid.gen += 1;
  const gen = grid.gen;

  let cx = Math.floor(ox / cell);
  let cy = Math.floor(oy / cell);
  if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(cell / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(cell / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? cx + 1 : cx) * cell - ox) / dx;
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? cy + 1 : cy) * cell - oy) / dy;

  let n = 0;
  let nearestOccluder = Infinity;

  while (cx >= 0 && cy >= 0 && cx < cols && cy < rows) {
    const bucket = buckets[cy * cols + cx];
    for (let b = 0; b < bucket.length; b++) {
      const i = bucket[b];
      if (stamp[i] === gen) continue;
      stamp[i] = gen;
      const s = solids[i];
      const r = rayAabb(s, ox, oy, dx, dy);
      if (!r || r.dist > maxT || r.dist > nearestOccluder) continue;
      if (isOccluder(s) && r.dist < nearestOccluder) nearestOccluder = r.dist;
      const hx = ox + r.dist * dx;
      const hy = oy + r.dist * dy;
      const u =
        r.axis === 0
          ? s.h === 0
            ? 0
            : (hy - s.y) / s.h
          : s.w === 0
            ? 0
            : (hx - s.x) / s.w;
      const hit: Hit = { dist: r.dist, exit: r.exit, u: clamp01(u), axis: r.axis, solid: s };
      if (n < MAX_HITS) {
        out[n++] = hit;
      } else {
        // Full: only keep this one if it displaces something further away.
        let worst = 0;
        for (let k = 1; k < n; k++) if (out[k].dist > out[worst].dist) worst = k;
        if (out[worst].dist > hit.dist) out[worst] = hit;
      }
    }

    const exitT = tMaxX < tMaxY ? tMaxX : tMaxY;
    if (exitT > maxT || exitT > nearestOccluder) break;
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      tMaxY += tDeltaY;
      cy += stepY;
    }
  }

  // Drop anything the nearest full-height wall hides, then sort near to far.
  if (nearestOccluder < Infinity) {
    let k = 0;
    for (let i = 0; i < n; i++) if (out[i].dist <= nearestOccluder) out[k++] = out[i];
    n = k;
  }
  for (let i = 1; i < n; i++) {
    const h = out[i];
    let j = i - 1;
    while (j >= 0 && out[j].dist > h.dist) {
      out[j + 1] = out[j];
      j--;
    }
    out[j + 1] = h;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export type Camera = {
  x: number;
  y: number;
  /** Heading in radians; 0 looks along +x, growing clockwise into +y. */
  yaw: number;
  /** Look up/down, applied as a horizon shift rather than a real rotation. */
  pitch: number;
  eye: number;
  dirX: number;
  dirY: number;
  /** Camera plane, already scaled by tan(fov/2) so `dir + plane * cx` is a ray. */
  planeX: number;
  planeY: number;
  /** Distance to the projection plane in pixels. */
  projDist: number;
  horizon: number;
  width: number;
  height: number;
};

export function makeCamera(opts: {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  eye?: number;
  width: number;
  height: number;
  fov?: number;
  bob?: number;
}): Camera {
  const fov = opts.fov ?? FOV;
  const tanHalf = Math.tan(fov / 2);
  const dirX = Math.cos(opts.yaw);
  const dirY = Math.sin(opts.yaw);
  const projDist = opts.width / 2 / tanHalf;
  return {
    x: opts.x,
    y: opts.y,
    yaw: opts.yaw,
    pitch: opts.pitch,
    eye: opts.eye ?? EYE_HEIGHT,
    dirX,
    dirY,
    // Perpendicular to dir, scaled so cameraX in [-1, 1] spans the full FOV.
    planeX: -dirY * tanHalf,
    planeY: dirX * tanHalf,
    projDist,
    // Pitch is a horizon shear rather than a true rotation — cheap, and at the
    // angles a standing person actually uses the difference isn't visible.
    horizon: opts.height / 2 + Math.tan(opts.pitch) * projDist + (opts.bob ?? 0),
    width: opts.width,
    height: opts.height,
  };
}

/** Ray for screen column `x`. Its length is 1 along `dir`, so t is depth. */
export function columnRay(cam: Camera, x: number): { dx: number; dy: number } {
  const cameraX = (2 * x) / cam.width - 1;
  return {
    dx: cam.dirX + cam.planeX * cameraX,
    dy: cam.dirY + cam.planeY * cameraX,
  };
}

/** Screen y where a point at world height `z` and depth `d` lands. */
export function projectHeight(cam: Camera, z: number, depth: number): number {
  return cam.horizon + ((cam.eye - z) / depth) * cam.projDist;
}

export type SpriteProjection = {
  /** Horizontal centre in pixels. */
  screenX: number;
  /** Perpendicular depth — comparable with wall hit distances. */
  depth: number;
};

/** Billboard transform. Returns null for anything at or behind the camera. */
export function projectSprite(cam: Camera, wx: number, wy: number): SpriteProjection | null {
  const sx = wx - cam.x;
  const sy = wy - cam.y;
  const det = cam.planeX * cam.dirY - cam.dirX * cam.planeY;
  if (det === 0) return null;
  const inv = 1 / det;
  const transformX = inv * (cam.dirY * sx - cam.dirX * sy);
  const depth = inv * (-cam.planeY * sx + cam.planeX * sy);
  if (depth <= 0.5) return null;
  return {
    screenX: (cam.width / 2) * (1 + transformX / depth),
    depth,
  };
}

// ---------------------------------------------------------------------------
// Floor lookup — which room a floor pixel belongs to, so carpets get tinted
// ---------------------------------------------------------------------------

export type FloorIndex = {
  cell: number;
  cols: number;
  rows: number;
  /** 0 = corridor, otherwise the room's index in `layout.rooms` plus one. */
  ids: Uint8Array;
};

export function buildFloorIndex(layout: Layout, cell = 20): FloorIndex {
  const cols = Math.max(1, Math.ceil(layout.world.w / cell));
  const rows = Math.max(1, Math.ceil(layout.world.h / cell));
  const ids = new Uint8Array(cols * rows);
  layout.rooms.forEach((room, i) => {
    if (i >= 255) return; // 255 rooms is far more floor than anyone will build
    const x0 = clampInt(Math.floor(room.rect.x / cell), 0, cols - 1);
    const x1 = clampInt(Math.ceil((room.rect.x + room.rect.w) / cell) - 1, 0, cols - 1);
    const y0 = clampInt(Math.floor(room.rect.y / cell), 0, rows - 1);
    const y1 = clampInt(Math.ceil((room.rect.y + room.rect.h) / cell) - 1, 0, rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) ids[cy * cols + cx] = i + 1;
    }
  });
  return { cell, cols, rows, ids };
}

export function floorRoomAt(index: FloorIndex, x: number, y: number): number {
  const cx = Math.floor(x / index.cell);
  const cy = Math.floor(y / index.cell);
  if (cx < 0 || cy < 0 || cx >= index.cols || cy >= index.rows) return 0;
  return index.ids[cy * index.cols + cx];
}

// ---------------------------------------------------------------------------
// Movement & orientation helpers
// ---------------------------------------------------------------------------

/** Turn forward/strafe input into a world-space step for the current heading. */
export function moveVector(
  yaw: number,
  forward: number,
  strafe: number,
  speed: number,
): { dx: number; dy: number } {
  const len = Math.hypot(forward, strafe);
  if (len === 0) return { dx: 0, dy: 0 };
  const f = forward / len;
  const s = strafe / len;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    dx: (cos * f - sin * s) * speed,
    dy: (sin * f + cos * s) * speed,
  };
}

export function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r < -Math.PI) r += twoPi;
  return r;
}

export function shortestTurn(from: number, to: number): number {
  return normalizeAngle(to - from);
}

/**
 * Which of a character's four drawn orientations faces the camera: 0 front (they
 * are looking at you), 1 their left side, 2 back, 3 their right side.
 */
export function facingBucket(
  subjectYaw: number,
  cameraX: number,
  cameraY: number,
  subjectX: number,
  subjectY: number,
): 0 | 1 | 2 | 3 {
  const toCamera = Math.atan2(cameraY - subjectY, cameraX - subjectX);
  const rel = normalizeAngle(subjectYaw - toCamera);
  const abs = Math.abs(rel);
  if (abs < Math.PI / 4) return 0;
  if (abs > (3 * Math.PI) / 4) return 2;
  return rel > 0 ? 1 : 3;
}

/** Interaction picking: the nearest target inside range and roughly in front. */
export function pickTarget<T extends { x: number; y: number }>(
  cam: { x: number; y: number; dirX: number; dirY: number },
  targets: T[],
  range: number,
  cosLimit = 0.2,
): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    const dx = t.x - cam.x;
    const dy = t.y - cam.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range || dist === 0) continue;
    const facing = (dx / dist) * cam.dirX + (dy / dist) * cam.dirY;
    if (facing < cosLimit) continue;
    // Prefer what you're looking straight at, then what's closest.
    const score = facing * 2 - dist / range;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Where a room's interaction board stands, at eye-catching height. */
export function boardAnchor(room: RoomGeom): { x: number; y: number } {
  return { x: room.board.x, y: room.board.y };
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
