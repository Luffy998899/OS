// Creative mode: turning the stored world into something you can stand in, and
// working out which block you are pointing at.
//
// The world is no longer generated — it arrives as a list of placed blocks and
// is assembled here. Everything not in that list is air over a paved slab.

import { BLOCKS } from "./blocks";
import type { PanelKind, Poi, Region, TextSign, World } from "./types";

export type WorldData = {
  size: { sx: number; sy: number; sz: number };
  /** Flat [x,y,z,id, …] — see the world router for why it travels this way. */
  blocks: number[];
  signs: {
    id: string;
    text: string;
    x: number;
    y: number;
    z: number;
    face: "n" | "s" | "e" | "w";
    size: number;
    color: string | null;
    bg: string | null;
  }[];
  pois: {
    id: string;
    label: string;
    sublabel: string | null;
    panel: string;
    refId: string | null;
    adminOnly: boolean;
    x: number;
    y: number;
    z: number;
  }[];
  regions: {
    key: string;
    label: string;
    roomId: string | null;
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    lair: boolean;
  }[];
  spawn: { x: number; y: number; z: number; yaw: number };
  revision: number;
  canBuild: boolean;
};

/** Assemble a renderable world from what the database holds. */
export function worldFromData(data: WorldData): World {
  const { sx, sy, sz } = data.size;
  const blocks = new Uint8Array(sx * sy * sz);
  for (let i = 0; i < data.blocks.length; i += 4) {
    const x = data.blocks[i];
    const y = data.blocks[i + 1];
    const z = data.blocks[i + 2];
    const id = data.blocks[i + 3];
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) continue;
    blocks[(y * sz + z) * sx + x] = id;
  }

  const pois: Poi[] = data.pois.map((p) => ({
    id: p.id,
    label: p.label,
    sublabel: p.sublabel ?? undefined,
    panel: p.panel as PanelKind,
    refId: p.refId ?? undefined,
    adminOnly: p.adminOnly,
    min: { x: p.x, y: p.y, z: p.z },
    max: { x: p.x + 1, y: p.y + 1, z: p.z + 1 },
  }));

  const regions: Region[] = data.regions.map((r) => ({
    key: r.key,
    label: r.label,
    roomId: r.roomId,
    min: r.min,
    max: r.max,
    lair: r.lair,
  }));

  const signs: TextSign[] = data.signs.map((s) => ({
    id: s.id,
    text: s.text,
    x: s.x,
    y: s.y,
    z: s.z,
    face: s.face,
    size: s.size,
    color: s.color ?? undefined,
    bg: s.bg ?? undefined,
  }));

  return {
    sx,
    sy,
    sz,
    blocks,
    spawn: { x: data.spawn.x, y: data.spawn.y, z: data.spawn.z },
    spawnYaw: data.spawn.yaw,
    pois,
    regions,
    signs,
    npcs: [],
    // Nothing generates a lair any more; keep the volume off the map so the
    // ambience never triggers on a world nobody built one in.
    lair: { min: { x: -1, y: -1, z: -1 }, max: { x: -1, y: -1, z: -1 } },
  };
}

export const blockIndex = (w: World, x: number, y: number, z: number): number =>
  (y * w.sz + z) * w.sx + x;

export const insideWorld = (w: World, x: number, y: number, z: number): boolean =>
  x >= 0 && y >= 0 && z >= 0 && x < w.sx && y < w.sy && z < w.sz;

/** Write a block straight into the buffer. The caller re-meshes. */
export function setBlock(w: World, x: number, y: number, z: number, id: number): void {
  if (!insideWorld(w, x, y, z)) return;
  w.blocks[blockIndex(w, x, y, z)] = id;
}

export type VoxelHit = {
  /** The block the ray struck. */
  x: number;
  y: number;
  z: number;
  /** The empty cell in front of the face it struck — where a placed block goes. */
  px: number;
  py: number;
  pz: number;
};

/**
 * Amanatides–Woo voxel traversal: step cell by cell along the ray and stop at
 * the first non-air block. Returns the struck cell and the one before it, which
 * is where a new block lands.
 */
export function raycastVoxel(
  w: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
): VoxelHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  // Distance along the ray to the next cell boundary on each axis, and the
  // distance between successive boundaries.
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = stepZ === 0 ? Infinity : Math.abs(1 / dz);

  const boundary = (o: number, i: number, step: number): number =>
    step > 0 ? i + 1 - o : o - i;

  let tMaxX = stepX === 0 ? Infinity : boundary(ox, x, stepX) * tDeltaX;
  let tMaxY = stepY === 0 ? Infinity : boundary(oy, y, stepY) * tDeltaY;
  let tMaxZ = stepZ === 0 ? Infinity : boundary(oz, z, stepZ) * tDeltaZ;

  let px = x;
  let py = y;
  let pz = z;
  let travelled = 0;

  // The cell the camera itself sits in never counts as a hit, or you would
  // always strike whatever you are standing inside.
  for (let guard = 0; guard < 512 && travelled <= maxDist; guard++) {
    if (insideWorld(w, x, y, z)) {
      const id = w.blocks[blockIndex(w, x, y, z)];
      if (id !== 0 && BLOCKS[id]) {
        return { x, y, z, px, py, pz };
      }
    }
    px = x;
    py = y;
    pz = z;
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      travelled = tMaxX;
      tMaxX += tDeltaX;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      travelled = tMaxY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      travelled = tMaxZ;
      tMaxZ += tDeltaZ;
    }
    // Once the ray has left the world entirely there is nothing left to hit.
    if (
      (stepX >= 0 ? x > w.sx : x < 0) &&
      (stepY >= 0 ? y > w.sy : y < 0) &&
      (stepZ >= 0 ? z > w.sz : z < 0)
    )
      break;
  }
  return null;
}

/** Would placing a block here trap the player inside it? */
export function overlapsPlayer(
  bx: number,
  by: number,
  bz: number,
  feetX: number,
  feetY: number,
  feetZ: number,
  half = 0.3,
  height = 1.8,
): boolean {
  return (
    bx < feetX + half &&
    bx + 1 > feetX - half &&
    bz < feetZ + half &&
    bz + 1 > feetZ - half &&
    by < feetY + height &&
    by + 1 > feetY
  );
}

/** The palette shown in the creative inventory, grouped the way you build. */
export const BLOCK_GROUPS: { name: string; keys: string[] }[] = [
  {
    name: "Floors",
    keys: ["carpet_gray", "carpet_blue", "carpet_green", "carpet_red", "wood_floor", "marble", "concrete", "paving", "rug_pattern"],
  },
  {
    name: "Walls & structure",
    keys: ["drywall", "drywall_accent", "drywall_warm", "trim", "facade", "facade_blue", "facade_green", "facade_warm", "stone", "roof", "metal"],
  },
  {
    name: "Glass & light",
    keys: ["glass", "glass_frosted", "curtain_wall", "ceiling", "ceiling_light", "sign", "exit_sign", "lamp", "water"],
  },
  {
    name: "Furniture",
    keys: ["desk", "desk_dark", "table", "chair", "sofa", "monitor", "cpu", "pantry", "elevator", "books", "book_stack", "printer", "cooler", "phone"],
  },
  {
    name: "Boards & fittings",
    keys: ["whiteboard", "corkboard", "tv", "clock", "art", "vent", "felt", "felt_orange", "felt_teal", "server_rack"],
  },
  {
    name: "Studio & props",
    keys: ["camera", "tripod", "softbox", "clapboard", "mic", "coffee", "papers", "plant", "plant_fern", "plant_tall", "planter", "pot", "pot_white"],
  },
  {
    name: "The Upside Down",
    keys: ["lair_stone", "lair_vine", "vecna_flesh", "obsidian", "lair_glow"],
  },
];

/** Every block id in the palette, in group order, skipping unknown keys. */
export function paletteIds(): number[] {
  const byKey = new Map(BLOCKS.map((b, i) => [b.key, i]));
  const out: number[] = [];
  for (const g of BLOCK_GROUPS)
    for (const k of g.keys) {
      const id = byKey.get(k);
      if (id !== undefined && id !== 0) out.push(id);
    }
  return out;
}
