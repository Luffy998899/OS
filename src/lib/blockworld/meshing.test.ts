import { describe, expect, it } from "vitest";
import { idx, type World } from "./types";
import { ATLAS_COLS, ATLAS_ROWS, B, BLOCKS, TILE } from "./blocks";
import { buildMeshData, type MeshArrays } from "./meshing";

function makeWorld(sx = 5, sy = 5, sz = 5): World {
  return {
    sx,
    sy,
    sz,
    blocks: new Uint8Array(sx * sy * sz),
    spawn: { x: 0, y: 0, z: 0 },
    spawnYaw: 0,
    pois: [],
    regions: [],
    signs: [],
    lair: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
  };
}

function set(w: World, x: number, y: number, z: number, id: number): void {
  w.blocks[idx(w, x, y, z)] = id;
}

const faceCount = (m: MeshArrays): number => m.positions.length / 3 / 4;

type Vert = { pos: [number, number, number]; normal: [number, number, number]; color: [number, number, number] };

function verts(m: MeshArrays): Vert[] {
  const out: Vert[] = [];
  for (let i = 0; i < m.positions.length / 3; i++) {
    out.push({
      pos: [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]],
      normal: [m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]],
      color: [m.colors[i * 3], m.colors[i * 3 + 1], m.colors[i * 3 + 2]],
    });
  }
  return out;
}

describe("buildMeshData", () => {
  it("emits exactly 6 faces for a single stone cube", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.stone);
    const { opaque, cutout, emissive } = buildMeshData(w);
    expect(faceCount(opaque)).toBe(6);
    expect(opaque.positions.length).toBe(24 * 3);
    expect(opaque.indices.length).toBe(36);
    expect(cutout.positions.length).toBe(0);
    expect(emissive.positions.length).toBe(0);
  });

  it("culls the shared faces of two adjacent stones (10 total)", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.stone);
    set(w, 2, 1, 1, B.stone);
    const { opaque } = buildMeshData(w);
    expect(faceCount(opaque)).toBe(10);
  });

  it("culls the shared faces of stone under grass", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.stone);
    set(w, 1, 2, 1, B.carpet_gray);
    const { opaque } = buildMeshData(w);
    expect(faceCount(opaque)).toBe(10);
  });

  it("keeps the stone face against glass and culls glass-glass faces", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.stone);
    set(w, 2, 1, 1, B.glass);
    set(w, 3, 1, 1, B.glass);
    const { opaque, cutout } = buildMeshData(w);
    // stone keeps all 6 faces — glass does not cull it
    expect(faceCount(opaque)).toBe(6);
    const stoneEast = verts(opaque).filter(
      (v) => v.normal[0] === 1 && v.pos[0] === 2,
    );
    expect(stoneEast.length).toBe(4);
    // glass 1: stone side + glass side culled (4); glass 2: glass side culled (5)
    expect(faceCount(cutout)).toBe(9);
  });

  it("meshes a slab with its top at y+0.5 and sides spanning 0..0.5", () => {
    const w = makeWorld();
    set(w, 1, 0, 1, B.step);
    const { opaque } = buildMeshData(w);
    const vs = verts(opaque);
    const top = vs.filter((v) => v.normal[1] === 1);
    expect(top.length).toBe(4);
    for (const v of top) expect(v.pos[1]).toBe(0.5);
    const east = vs.filter((v) => v.normal[0] === 1);
    expect(east.length).toBe(4);
    const ys = east.map((v) => v.pos[1]).sort();
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(0.5);
  });

  it("routes glowstone to the emissive bucket with colors >= emissive", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.ceiling_light);
    const { opaque, cutout, emissive } = buildMeshData(w);
    expect(faceCount(emissive)).toBe(6);
    expect(opaque.positions.length).toBe(0);
    expect(cutout.positions.length).toBe(0);
    const e = BLOCKS[B.ceiling_light].emissive ?? 0;
    for (const c of emissive.colors) expect(c).toBeGreaterThanOrEqual(e);
  });

  it("routes leaves to the cutout bucket", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.plant);
    const { opaque, cutout, emissive } = buildMeshData(w);
    expect(faceCount(cutout)).toBe(6);
    expect(opaque.positions.length).toBe(0);
    expect(emissive.positions.length).toBe(0);
  });

  it("keeps uvs inside the stone tile's atlas band", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.stone);
    const { opaque } = buildMeshData(w);
    const c = TILE.STONE % ATLAS_COLS;
    const r = (TILE.STONE / ATLAS_COLS) | 0;
    for (let i = 0; i < opaque.uvs.length; i += 2) {
      const u = opaque.uvs[i];
      const v = opaque.uvs[i + 1];
      expect(u).toBeGreaterThanOrEqual(c / ATLAS_COLS);
      expect(u).toBeLessThanOrEqual((c + 1) / ATLAS_COLS);
      expect(v).toBeGreaterThanOrEqual(1 - (r + 1) / ATLAS_ROWS);
      expect(v).toBeLessThanOrEqual(1 - r / ATLAS_ROWS);
    }
  });

  it("keeps indices consistent with the vertex count", () => {
    const w = makeWorld();
    set(w, 1, 1, 1, B.stone);
    set(w, 2, 1, 1, B.stone);
    const { opaque } = buildMeshData(w);
    expect(opaque.indices.length).toBe(faceCount(opaque) * 6);
    const vertCount = opaque.positions.length / 3;
    for (const i of opaque.indices) expect(i).toBeLessThan(vertCount);
  });

  it("bakes AO: a diagonal neighbor above darkens the shared top-face corner", () => {
    const lone = makeWorld();
    set(lone, 1, 1, 1, B.stone);
    const shadowed = makeWorld();
    set(shadowed, 1, 1, 1, B.stone);
    set(shadowed, 0, 2, 1, B.stone); // diagonally above-left of the cube's top face
    const topAt = (m: MeshArrays, x: number, z: number): Vert => {
      const hit = verts(m).find(
        (v) => v.normal[1] === 1 && v.pos[1] === 2 && v.pos[0] === x && v.pos[2] === z,
      );
      expect(hit).toBeDefined();
      return hit as Vert;
    };
    const bright = topAt(buildMeshData(lone).opaque, 1, 1);
    const dark = topAt(buildMeshData(shadowed).opaque, 1, 1);
    expect(bright.color[0]).toBe(1);
    expect(dark.color[0]).toBeLessThan(bright.color[0]);
  });
});
