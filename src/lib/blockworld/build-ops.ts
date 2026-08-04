// Bulk building: the geometry behind the selection box and the fill tool.
//
// Placing an office one block at a time is not a way to design a map. A
// builder marks two corners and says what to do with the volume between them;
// everything here is the pure arithmetic for that, kept out of the renderer so
// it can be reasoned about and tested directly.

export type Cell = { x: number; y: number; z: number };
export type Box = { min: Cell; max: Cell };

/** How a fill treats the volume it was given. */
export type FillMode =
  | "solid" // every cell
  | "hollow" // the shell only — walls, floor and ceiling
  | "walls" // the four upright sides, open above and below
  | "floor" // the bottom layer
  | "ceiling" // the top layer
  | "frame" // the twelve edges
  | "replace" // every cell that already holds a block
  | "clear"; // empty the volume

export const FILL_MODES: { mode: FillMode; label: string; blurb: string }[] = [
  { mode: "solid", label: "Solid", blurb: "Every block in the box." },
  { mode: "hollow", label: "Hollow", blurb: "Shell only — walls, floor, ceiling." },
  { mode: "walls", label: "Walls", blurb: "The four sides, open top and bottom." },
  { mode: "floor", label: "Floor", blurb: "The bottom layer." },
  { mode: "ceiling", label: "Ceiling", blurb: "The top layer." },
  { mode: "frame", label: "Frame", blurb: "The twelve edges — a wireframe." },
  { mode: "replace", label: "Replace", blurb: "Only where a block already is." },
  { mode: "clear", label: "Clear", blurb: "Empty the box." },
];

/**
 * The largest volume one fill may touch. A 76x76x72 world is 415k cells; the
 * cap keeps a mis-drawn selection from writing the entire map in one request,
 * which the batch limit would reject anyway.
 */
export const MAX_FILL = 20_000;

/** Corner order doesn't matter to the builder, so normalise it here. */
export function normaliseBox(a: Cell, b: Cell): Box {
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

/** Cell count of a box, corners inclusive. */
export function boxVolume(box: Box): number {
  return (
    (box.max.x - box.min.x + 1) * (box.max.y - box.min.y + 1) * (box.max.z - box.min.z + 1)
  );
}

export function boxSize(box: Box): { w: number; h: number; d: number } {
  return {
    w: box.max.x - box.min.x + 1,
    h: box.max.y - box.min.y + 1,
    d: box.max.z - box.min.z + 1,
  };
}

/** Clamp a box to the world, so a selection can never address a cell outside it. */
export function clampBox(box: Box, sx: number, sy: number, sz: number): Box {
  const c = (v: number, hi: number): number => Math.max(0, Math.min(hi - 1, v));
  return {
    min: { x: c(box.min.x, sx), y: c(box.min.y, sy), z: c(box.min.z, sz) },
    max: { x: c(box.max.x, sx), y: c(box.max.y, sy), z: c(box.max.z, sz) },
  };
}

/** Does this mode touch the cell at (x,y,z) of the given box? */
function inMode(box: Box, mode: FillMode, x: number, y: number, z: number): boolean {
  const edgeX = x === box.min.x || x === box.max.x;
  const edgeY = y === box.min.y || y === box.max.y;
  const edgeZ = z === box.min.z || z === box.max.z;
  switch (mode) {
    case "solid":
    case "replace":
    case "clear":
      return true;
    case "hollow":
      return edgeX || edgeY || edgeZ;
    case "walls":
      return edgeX || edgeZ;
    case "floor":
      return y === box.min.y;
    case "ceiling":
      return y === box.max.y;
    case "frame":
      // An edge of the box is where two of the three axes are at a limit.
      return (edgeX ? 1 : 0) + (edgeY ? 1 : 0) + (edgeZ ? 1 : 0) >= 2;
  }
}

/**
 * The block edits a fill produces, as the flat [x,y,z,id, ...] the world
 * router speaks. `existing` reports what is already at a cell so "replace"
 * can skip air and every mode can skip a cell that already holds the right
 * block — a fill that changes nothing should cost nothing.
 */
export function fillEdits(
  box: Box,
  mode: FillMode,
  blockId: number,
  existing: (x: number, y: number, z: number) => number,
  limit = MAX_FILL,
): number[] {
  const id = mode === "clear" ? 0 : blockId;
  const out: number[] = [];
  for (let y = box.min.y; y <= box.max.y; y++) {
    for (let z = box.min.z; z <= box.max.z; z++) {
      for (let x = box.min.x; x <= box.max.x; x++) {
        if (!inMode(box, mode, x, y, z)) continue;
        const was = existing(x, y, z);
        if (mode === "replace" && was === 0) continue;
        if (was === id) continue;
        out.push(x, y, z, id);
        if (out.length >= limit * 4) return out;
      }
    }
  }
  return out;
}

/**
 * The inverse of a batch: what to send to put everything back. Built from the
 * world as it stands *before* the batch is applied, so it has to be taken
 * first — which is also what makes undo exact rather than approximate.
 */
export function inverseEdits(
  edits: number[],
  existing: (x: number, y: number, z: number) => number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < edits.length; i += 4) {
    const x = edits[i];
    const y = edits[i + 1];
    const z = edits[i + 2];
    out.push(x, y, z, existing(x, y, z));
  }
  return out;
}

/** Which way a wall faces, given the side of the block the builder aimed at. */
export function faceFromNormal(dx: number, dz: number): "n" | "s" | "e" | "w" {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? "e" : "w";
  return dz > 0 ? "s" : "n";
}
