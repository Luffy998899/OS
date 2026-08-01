// Face-culled chunk meshing with baked ambient occlusion. Walks every block,
// emits indexed quads for exposed faces and sorts them into three buckets
// (opaque / cutout / emissive) that the renderer maps to separate materials.

import { ATLAS_COLS, ATLAS_ROWS, BLOCKS, type BlockDef } from "./blocks";
import { blockAt, type World } from "./types";

export type MeshArrays = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};

const UV_INSET = 0.001;
const AO_LEVELS = [1.0, 0.85, 0.72, 0.6];
const CUTOUT_KEYS = new Set([
  "glass",
  "glass_frosted",
  "curtain_wall",
  "plant",
  "plant_fern",
  "plant_tall",
  "tripod",
  "mic",
  "water",
  "lair_vine",
]);

type Vec = readonly [number, number, number];

type Face = {
  /** Outward normal — also the one-block step used for culling and AO. */
  n: Vec;
  /** Tangent axes; u x v === n so the corner order below is CCW-outward. */
  u: Vec;
  v: Vec;
  shade: number;
  tile: keyof BlockDef["tiles"];
  /** Quad corners in (0,0) (1,0) (1,1) (0,1) tangent order; h = block height. */
  corners: (x: number, y: number, z: number, h: number) => [Vec, Vec, Vec, Vec];
};

const FACES: Face[] = [
  {
    n: [0, 1, 0],
    u: [1, 0, 0],
    v: [0, 0, -1],
    shade: 1.0,
    tile: "top",
    corners: (x, y, z, h) => [
      [x, y + h, z + 1],
      [x + 1, y + h, z + 1],
      [x + 1, y + h, z],
      [x, y + h, z],
    ],
  },
  {
    n: [0, -1, 0],
    u: [1, 0, 0],
    v: [0, 0, 1],
    shade: 0.55,
    tile: "bottom",
    corners: (x, y, z) => [
      [x, y, z],
      [x + 1, y, z],
      [x + 1, y, z + 1],
      [x, y, z + 1],
    ],
  },
  {
    n: [1, 0, 0],
    u: [0, 0, -1],
    v: [0, 1, 0],
    shade: 0.8,
    tile: "side",
    corners: (x, y, z, h) => [
      [x + 1, y, z + 1],
      [x + 1, y, z],
      [x + 1, y + h, z],
      [x + 1, y + h, z + 1],
    ],
  },
  {
    n: [-1, 0, 0],
    u: [0, 0, 1],
    v: [0, 1, 0],
    shade: 0.8,
    tile: "side",
    corners: (x, y, z, h) => [
      [x, y, z],
      [x, y, z + 1],
      [x, y + h, z + 1],
      [x, y + h, z],
    ],
  },
  {
    n: [0, 0, 1],
    u: [1, 0, 0],
    v: [0, 1, 0],
    shade: 0.68,
    tile: "side",
    corners: (x, y, z, h) => [
      [x, y, z + 1],
      [x + 1, y, z + 1],
      [x + 1, y + h, z + 1],
      [x, y + h, z + 1],
    ],
  },
  {
    n: [0, 0, -1],
    u: [-1, 0, 0],
    v: [0, 1, 0],
    shade: 0.68,
    tile: "side",
    corners: (x, y, z, h) => [
      [x + 1, y, z],
      [x, y, z],
      [x, y + h, z],
      [x + 1, y + h, z],
    ],
  },
];

type Builder = {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
};

const newBuilder = (): Builder => ({
  positions: [],
  normals: [],
  uvs: [],
  colors: [],
  indices: [],
});

const finish = (b: Builder): MeshArrays => ({
  positions: new Float32Array(b.positions),
  normals: new Float32Array(b.normals),
  uvs: new Float32Array(b.uvs),
  colors: new Float32Array(b.colors),
  indices: new Uint32Array(b.indices),
});

const occludes = (id: number): boolean => {
  const d = BLOCKS[id];
  return d !== undefined && d.opaque && d.height === 1;
};

const tintCache = new Map<string, Vec>();

function tintOf(def: BlockDef): Vec {
  if (!def.tint) return [1, 1, 1];
  let rgb = tintCache.get(def.tint);
  if (!rgb) {
    const n = parseInt(def.tint.slice(1), 16);
    rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    tintCache.set(def.tint, rgb);
  }
  return rgb;
}

/** Classic 3-neighbor AO: side/side/corner samples one step out along the normal. */
function cornerAO(w: World, x: number, y: number, z: number, f: Face, du: number, dv: number): number {
  const bx = x + f.n[0];
  const by = y + f.n[1];
  const bz = z + f.n[2];
  const s1 = occludes(blockAt(w, bx + du * f.u[0], by + du * f.u[1], bz + du * f.u[2]));
  const s2 = occludes(blockAt(w, bx + dv * f.v[0], by + dv * f.v[1], bz + dv * f.v[2]));
  const co = occludes(
    blockAt(
      w,
      bx + du * f.u[0] + dv * f.v[0],
      by + du * f.u[1] + dv * f.v[1],
      bz + du * f.u[2] + dv * f.v[2],
    ),
  );
  const occ = s1 && s2 ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (co ? 1 : 0);
  return AO_LEVELS[occ];
}

const CORNER_UV: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function emitFace(b: Builder, w: World, x: number, y: number, z: number, def: BlockDef, f: Face): void {
  const t = def.tiles[f.tile];
  const col = t % ATLAS_COLS;
  const row = (t / ATLAS_COLS) | 0;
  const u0 = col / ATLAS_COLS + UV_INSET;
  const u1 = (col + 1) / ATLAS_COLS - UV_INSET;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + UV_INSET;
  const v1 = 1 - row / ATLAS_ROWS - UV_INSET;
  const [tr, tg, tb] = tintOf(def);
  const e = def.emissive ?? 0;
  const corners = f.corners(x, y, z, def.height);
  const base = b.positions.length / 3;
  const ao: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [cu, cv] = CORNER_UV[i];
    const p = corners[i];
    b.positions.push(p[0], p[1], p[2]);
    b.normals.push(f.n[0], f.n[1], f.n[2]);
    b.uvs.push(cu ? u1 : u0, cv ? v1 : v0);
    const a = cornerAO(w, x, y, z, f, cu ? 1 : -1, cv ? 1 : -1);
    ao.push(a);
    const s = f.shade * a;
    b.colors.push(Math.max(tr * s, e), Math.max(tg * s, e), Math.max(tb * s, e));
  }
  // Standard AO seam fix: flip the diagonal when the 00-11 pair is darker.
  if (ao[0] + ao[2] < ao[1] + ao[3]) {
    b.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  } else {
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

/**
 * Edge length of a mesh chunk. Editing a block only rebuilds the chunk it sits
 * in (and its neighbour when it sits on a seam), so placing a block costs a few
 * thousand voxels of work rather than the whole world.
 */
export const CHUNK = 16;

export type ChunkKey = string;

export const chunkKey = (cx: number, cy: number, cz: number): ChunkKey => `${cx},${cy},${cz}`;

/** Every chunk coordinate in the world, in render order. */
export function allChunks(world: World): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let cy = 0; cy * CHUNK < world.sy; cy++)
    for (let cz = 0; cz * CHUNK < world.sz; cz++)
      for (let cx = 0; cx * CHUNK < world.sx; cx++) out.push([cx, cy, cz]);
  return out;
}

/**
 * The chunks a single block edit invalidates: its own, plus any neighbour whose
 * meshed faces could change because they were culled against this block.
 */
export function dirtyChunksFor(x: number, y: number, z: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const seen = new Set<string>();
  for (const [dx, dy, dz] of [
    [0, 0, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ] as const) {
    const c: [number, number, number] = [
      Math.floor((x + dx) / CHUNK),
      Math.floor((y + dy) / CHUNK),
      Math.floor((z + dz) / CHUNK),
    ];
    const k = chunkKey(...c);
    if (seen.has(k) || c[0] < 0 || c[1] < 0 || c[2] < 0) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Mesh one chunk. Neighbour lookups cross chunk borders, so seams stay culled. */
export function buildChunkMeshData(
  world: World,
  cx: number,
  cy: number,
  cz: number,
): { opaque: MeshArrays; cutout: MeshArrays; emissive: MeshArrays } {
  return meshRange(
    world,
    cx * CHUNK,
    Math.min(world.sx, (cx + 1) * CHUNK),
    cy * CHUNK,
    Math.min(world.sy, (cy + 1) * CHUNK),
    cz * CHUNK,
    Math.min(world.sz, (cz + 1) * CHUNK),
  );
}

export function buildMeshData(world: World): { opaque: MeshArrays; cutout: MeshArrays; emissive: MeshArrays } {
  return meshRange(world, 0, world.sx, 0, world.sy, 0, world.sz);
}

function meshRange(
  world: World,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): { opaque: MeshArrays; cutout: MeshArrays; emissive: MeshArrays } {
  const opaque = newBuilder();
  const cutout = newBuilder();
  const emissive = newBuilder();
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const id = world.blocks[(y * world.sz + z) * world.sx + x];
        if (id === 0) continue;
        const def = BLOCKS[id];
        if (!def) continue;
        const target =
          (def.emissive ?? 0) > 0 ? emissive : CUTOUT_KEYS.has(def.key) ? cutout : opaque;
        for (const f of FACES) {
          const nId = blockAt(world, x + f.n[0], y + f.n[1], z + f.n[2]);
          if (nId === id) continue; // same-id faces (glass-glass, water-water) vanish
          const nDef = BLOCKS[nId];
          if (nDef?.opaque) {
            // Sides stay visible against shorter opaque neighbors (exposed strip).
            if (f.tile === "side" ? nDef.height >= def.height : nDef.height === 1) continue;
          }
          emitFace(target, world, x, y, z, def, f);
        }
      }
    }
  }
  return { opaque: finish(opaque), cutout: finish(cutout), emissive: finish(emissive) };
}
