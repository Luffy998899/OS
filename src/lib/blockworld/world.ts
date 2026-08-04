// The world is not generated. It is built.
//
// There used to be a whole office in this file — a floorplate, towers, rooms,
// props, the lot — stamped into the database as a starting point. It is gone
// on purpose: nobody should open the office and find someone else's building
// already standing in it. What is left is the envelope the map lives in, and
// the smallest possible thing to stand on while you place the first block.
//
// Coordinates: x east, y up, z south. Yaw 0 faces -z (north).

import { B } from "./blocks";
import type { World } from "./types";

// Room for a city. The buffer is one byte per cell, so this is 2.4 MB in memory
// and costs nothing on the wire — `load` only ever sends blocks somebody placed.
// Empty chunks produce no meshes, so the extra volume is a loop, not geometry.
const SX = 160;
const SY = 96;
const SZ = 160;

/** Dimensions of the editable world, for callers that need them up front. */
export const WORLD_SIZE = { sx: SX, sy: SY, sz: SZ } as const;

/** The structural slab, and the level you walk at when you stand on it. */
const SLAB = 0;
const FLOOR = 1;

/** How wide the pad you spawn onto is. Big enough to stand and turn, no more. */
export const STARTER_PAD = 12;

/**
 * A fresh install: one small pad under the spawn point and nothing else.
 *
 * It is scaffolding, not design — somewhere to stand while you lay the first
 * floor. Step off it and you are on the world's own base plane (anything below
 * y0 reads as solid), so leaving the pad is a flat plain, not a fall out of
 * the map.
 */
export function buildStarterPad(): World {
  const blocks = new Uint8Array(SX * SY * SZ);
  const cx = Math.floor(SX / 2);
  const cz = Math.floor(SZ / 2);
  const half = Math.floor(STARTER_PAD / 2);
  for (let z = cz - half; z < cz + half; z++) {
    for (let x = cx - half; x < cx + half; x++) {
      blocks[(SLAB * SZ + z) * SX + x] = B.concrete;
    }
  }

  return {
    sx: SX,
    sy: SY,
    sz: SZ,
    blocks,
    spawn: { x: cx + 0.5, y: FLOOR, z: cz + 0.5 },
    spawnYaw: 0,
    pois: [],
    regions: [],
    signs: [],
    npcs: [],
    // No lair until somebody builds one.
    lair: { min: { x: -1, y: -1, z: -1 }, max: { x: -1, y: -1, z: -1 } },
  };
}
