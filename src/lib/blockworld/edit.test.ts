import { describe, expect, it } from "vitest";
import { B } from "./blocks";
import { blockAt } from "./types";
import type { World } from "./types";
import {
  overlapsPlayer,
  paletteIds,
  raycastVoxel,
  setBlock,
  worldFromData,
  BLOCK_GROUPS,
  type WorldData,
} from "./edit";
import { CHUNK, dirtyChunksFor } from "./meshing";

const emptyData = (over: Partial<WorldData> = {}): WorldData => ({
  size: { sx: 16, sy: 16, sz: 16 },
  blocks: [],
  signs: [],
  pois: [],
  regions: [],
  spawn: { x: 8, y: 1, z: 8, yaw: 0 },
  revision: 0,
  canBuild: true,
  ...over,
});

/** A 16³ world with a solid floor at y=0, which is what a fresh install is. */
function floorWorld(): World {
  const blocks: number[] = [];
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) blocks.push(x, 0, z, B.paving);
  return worldFromData(emptyData({ blocks }));
}

describe("worldFromData", () => {
  it("builds an empty world when nothing has been placed", () => {
    const w = worldFromData(emptyData());
    expect(w.blocks.every((b) => b === 0)).toBe(true);
    expect(w.pois).toEqual([]);
    expect(w.npcs).toEqual([]);
  });

  it("puts each stored block at its own coordinate", () => {
    const w = worldFromData(
      emptyData({ blocks: [1, 2, 3, B.desk, 4, 5, 6, B.chair] }),
    );
    expect(blockAt(w, 1, 2, 3)).toBe(B.desk);
    expect(blockAt(w, 4, 5, 6)).toBe(B.chair);
    expect(blockAt(w, 0, 0, 0)).toBe(0);
  });

  it("drops blocks stored outside the world instead of wrapping them", () => {
    const w = worldFromData(emptyData({ blocks: [99, 0, 0, B.desk, -1, 0, 0, B.desk] }));
    expect(w.blocks.every((b) => b === 0)).toBe(true);
  });

  it("turns a stored spot into a one-block interactive volume", () => {
    const w = worldFromData(
      emptyData({
        pois: [
          {
            id: "p1",
            label: "Task terminal",
            sublabel: "sit down and work",
            panel: "tasks",
            refId: "rm-1",
            adminOnly: false,
            x: 3,
            y: 2,
            z: 4,
          },
        ],
      }),
    );
    expect(w.pois).toHaveLength(1);
    expect(w.pois[0].min).toEqual({ x: 3, y: 2, z: 4 });
    expect(w.pois[0].max).toEqual({ x: 4, y: 3, z: 5 });
    expect(w.pois[0].panel).toBe("tasks");
  });

  it("carries the builder's spawn through", () => {
    const w = worldFromData(emptyData({ spawn: { x: 2, y: 5, z: 7, yaw: 1.5 } }));
    expect(w.spawn).toEqual({ x: 2, y: 5, z: 7 });
    expect(w.spawnYaw).toBe(1.5);
  });
});

describe("raycastVoxel", () => {
  it("finds the block straight ahead and the cell in front of it", () => {
    const w = floorWorld();
    setBlock(w, 8, 1, 4, B.desk);
    // Standing at z=8 looking north (-z) along the floor.
    const hit = raycastVoxel(w, 8.5, 1.5, 8.5, 0, 0, -1, 10);
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z]).toEqual([8, 1, 4]);
    // The placement cell is one step back along the ray.
    expect([hit!.px, hit!.py, hit!.pz]).toEqual([8, 1, 5]);
  });

  it("finds the floor when you look down", () => {
    const w = floorWorld();
    const hit = raycastVoxel(w, 8.5, 3.5, 8.5, 0, -1, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBe(0);
    expect(hit!.py).toBe(1);
  });

  it("returns nothing when the ray only crosses air", () => {
    const w = worldFromData(emptyData());
    expect(raycastVoxel(w, 8.5, 8.5, 8.5, 0, 0, -1, 10)).toBeNull();
  });

  it("respects the reach limit", () => {
    const w = floorWorld();
    setBlock(w, 8, 1, 0, B.desk);
    expect(raycastVoxel(w, 8.5, 1.5, 15.5, 0, 0, -1, 4)).toBeNull();
    expect(raycastVoxel(w, 8.5, 1.5, 15.5, 0, 0, -1, 20)).not.toBeNull();
  });

  it("hits the nearest block, not one behind it", () => {
    const w = floorWorld();
    setBlock(w, 8, 1, 6, B.desk);
    setBlock(w, 8, 1, 3, B.chair);
    const hit = raycastVoxel(w, 8.5, 1.5, 10.5, 0, 0, -1, 20);
    expect(hit!.z).toBe(6);
  });

  it("travels on a diagonal without skipping through corners", () => {
    const w = worldFromData(emptyData());
    setBlock(w, 10, 5, 10, B.desk);
    const d = 1 / Math.sqrt(2);
    const hit = raycastVoxel(w, 5.5, 5.5, 5.5, d, 0, d, 20);
    expect(hit).not.toBeNull();
    expect([hit!.x, hit!.y, hit!.z]).toEqual([10, 5, 10]);
  });
});

describe("overlapsPlayer", () => {
  it("refuses a block placed where the player stands", () => {
    expect(overlapsPlayer(8, 1, 8, 8.5, 1, 8.5)).toBe(true);
  });

  it("refuses a block at head height", () => {
    expect(overlapsPlayer(8, 2, 8, 8.5, 1, 8.5)).toBe(true);
  });

  it("allows a block at the player's feet level one cell away", () => {
    expect(overlapsPlayer(6, 1, 8, 8.5, 1, 8.5)).toBe(false);
  });

  it("allows a block below the floor and above the head", () => {
    expect(overlapsPlayer(8, 0, 8, 8.5, 1, 8.5)).toBe(false);
    expect(overlapsPlayer(8, 3, 8, 8.5, 1, 8.5)).toBe(false);
  });
});

describe("dirtyChunksFor", () => {
  it("only rebuilds one chunk for an edit in the middle of it", () => {
    expect(dirtyChunksFor(8, 8, 8)).toEqual([[0, 0, 0]]);
  });

  it("rebuilds the neighbour too when the edit sits on a seam", () => {
    const dirty = dirtyChunksFor(CHUNK, 8, 8);
    expect(dirty).toContainEqual([1, 0, 0]);
    expect(dirty).toContainEqual([0, 0, 0]);
  });

  it("never returns a negative chunk", () => {
    for (const c of dirtyChunksFor(0, 0, 0)) {
      expect(Math.min(...c)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the creative palette", () => {
  it("offers every group and no air", () => {
    const ids = paletteIds();
    expect(ids.length).toBeGreaterThan(40);
    expect(ids).not.toContain(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names only blocks that exist", () => {
    const known = new Set(Object.keys(B));
    for (const group of BLOCK_GROUPS)
      for (const key of group.keys)
        expect(known.has(key), `${group.name} lists unknown block ${key}`).toBe(true);
  });
});
