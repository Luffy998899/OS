// Validation of the voxel campus against the build spec's 8 invariants,
// plus region/POI coverage checks. The world is built once from a realistic
// fixture: the 9 canonical rooms, 2 client rooms and 4 projects.

import { describe, expect, it } from "vitest";
import { BLOCKS, isSolid, solidHeight } from "./blocks";
import { blockAt } from "./types";
import type { World } from "./types";
import { buildWorld } from "./world";
import type { WorldInput } from "./world";

const input: WorldInput = {
  rooms: [
    { id: "rm-dev", key: "developer", name: "Developer Room", kind: "team" },
    { id: "rm-video", key: "video-editing", name: "Video Editing", kind: "team" },
    { id: "rm-board", key: "common-board", name: "Common Board", kind: "team" },
    { id: "rm-creative", key: "creative", name: "Creative", kind: "team" },
    { id: "rm-tasks", key: "tasks", name: "Tasks", kind: "team" },
    { id: "rm-heads", key: "managing-heads", name: "Managing Heads", kind: "team" },
    { id: "rm-time", key: "timetable", name: "Timetable", kind: "team" },
    { id: "rm-outreach", key: "outreach", name: "Outreach", kind: "team" },
    { id: "rm-shoot", key: "shoot", name: "Shoot", kind: "team" },
    { id: "rm-acme", key: "acme-corp", name: "Acme Corp", kind: "client" },
    { id: "rm-globex", key: "globex", name: "Globex", kind: "client" },
  ],
  projects: [
    { id: "pr-alpha", name: "Project Alpha", floor: 1, buildingKey: "pipeline" },
    { id: "pr-beta", name: "Project Beta", floor: 2, buildingKey: "pipeline" },
    { id: "pr-gamma", name: "Project Gamma", floor: 3, buildingKey: "pipeline" },
    { id: "pr-tools", name: "Toolsmith", floor: 1, buildingKey: "tools" },
  ],
};

const world: World = buildWorld(input);

const solidAt = (x: number, y: number, z: number): boolean =>
  isSolid(blockAt(world, x, y, z));

/** A player can stand ON the block at y: it is solid with 2 clear above. */
const standableOn = (x: number, y: number, z: number): boolean =>
  solidAt(x, y, z) && !solidAt(x, y + 1, z) && !solidAt(x, y + 2, z);

describe("invariant 1: spawn", () => {
  it("stands on solid ground with 2 air blocks above", () => {
    const x = Math.floor(world.spawn.x);
    const y = world.spawn.y;
    const z = Math.floor(world.spawn.z);
    expect(solidAt(x, y - 1, z)).toBe(true);
    expect(solidAt(x, y, z)).toBe(false);
    expect(solidAt(x, y + 1, z)).toBe(false);
  });
});

describe("invariant 2: POI reachability", () => {
  it("every POI AABB is within world bounds", () => {
    for (const p of world.pois) {
      expect(p.min.x, p.id).toBeGreaterThanOrEqual(0);
      expect(p.min.y, p.id).toBeGreaterThanOrEqual(0);
      expect(p.min.z, p.id).toBeGreaterThanOrEqual(0);
      expect(p.max.x, p.id).toBeLessThanOrEqual(world.sx);
      expect(p.max.y, p.id).toBeLessThanOrEqual(world.sy);
      expect(p.max.z, p.id).toBeLessThanOrEqual(world.sz);
      expect(p.min.x, p.id).toBeLessThan(p.max.x);
      expect(p.min.y, p.id).toBeLessThan(p.max.y);
      expect(p.min.z, p.id).toBeLessThan(p.max.z);
    }
  });

  it("every POI has an adjacent column a player can stand in", () => {
    for (const p of world.pois) {
      let reachable = false;
      outer: for (let x = p.min.x - 1; x <= p.max.x; x++) {
        for (let z = p.min.z - 1; z <= p.max.z; z++) {
          for (let y = p.min.y - 3; y <= p.max.y; y++) {
            if (standableOn(x, y, z)) {
              reachable = true;
              break outer;
            }
          }
        }
      }
      expect(reachable, `POI ${p.id} has no standable adjacent column`).toBe(true);
    }
  });
});

describe("invariant 3: building entrances", () => {
  // Two floor-level columns per doorway; each must be clear 3 high.
  const entrances: { name: string; cols: [number, number][] }[] = [
    { name: "dev-city", cols: [[62, 43], [62, 44]] },
    { name: "tools-bungalow", cols: [[45, 66], [46, 66]] },
    { name: "video-bay", cols: [[166, 58], [167, 58]] },
    { name: "conference-hall", cols: [[190, 95], [190, 96]] },
    { name: "task-hall", cols: [[70, 99], [70, 100]] },
    { name: "managing-heads", cols: [[110, 130], [111, 130]] },
    { name: "outreach-office", cols: [[52, 130], [53, 130]] },
    { name: "creative-internal-door", cols: [[156, 124], [157, 124]] },
    { name: "creative-clients-door", cols: [[172, 124], [173, 124]] },
    { name: "shoot-studio", cols: [[110, 162], [111, 162]] },
    { name: "clock-tower", cols: [[153, 99], [154, 99]] },
    { name: "shop-acme", cols: [[176, 104], [177, 104]] },
    { name: "shop-globex", cols: [[188, 104], [189, 104]] },
  ];

  it.each(entrances)("$name has a 2-wide x 3-high opening", ({ cols }) => {
    for (const [x, z] of cols)
      for (let y = 9; y <= 11; y++)
        expect(solidAt(x, y, z), `blocked at ${x},${y},${z}`).toBe(false);
  });
});

describe("invariant 4: dev city staircase", () => {
  // Walk the tower like a player: BFS over standing positions where each
  // step to a 4-neighbour column rises at most 0.55 (drops are free) and
  // leaves 2 blocks of clearance. Must climb from the ground floor (y9)
  // to the top floor plate (surface y34) — no flying, no big steps.
  it("is walkable from y9 to the top floor plate with rises <= 0.55", () => {
    const X0 = 30;
    const X1 = 62;
    const Z0 = 28;
    const Z1 = 60;

    const platforms = (x: number, z: number): number[] => {
      const tops: number[] = [];
      for (let y = 7; y < 42; y++)
        if (standableOn(x, y, z))
          tops.push(y + solidHeight(blockAt(world, x, y, z)));
      return tops;
    };

    const key = (x: number, z: number, top: number): string =>
      `${x},${z},${Math.round(top * 10)}`;
    const seen = new Set<string>();
    const queue: { x: number; z: number; top: number }[] = [];

    // Start just inside the entrance arch, feet at y9.
    for (const top of platforms(61, 44)) {
      if (top <= 9.5) {
        queue.push({ x: 61, z: 44, top });
        seen.add(key(61, 44, top));
      }
    }
    expect(queue.length).toBeGreaterThan(0);

    let reachedTop = false;
    while (queue.length > 0 && !reachedTop) {
      const cur = queue.shift()!;
      if (Math.abs(cur.top - 34) < 0.01) {
        reachedTop = true;
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = cur.x + dx;
        const nz = cur.z + dz;
        if (nx < X0 || nx > X1 || nz < Z0 || nz > Z1) continue;
        for (const top of platforms(nx, nz)) {
          if (top - cur.top > 0.55) continue; // too tall to step up
          if (cur.top - top > 4) continue; // don't leap down floors
          const k = key(nx, nz, top);
          if (seen.has(k)) continue;
          seen.add(k);
          queue.push({ x: nx, z: nz, top });
        }
      }
    }
    expect(reachedTop, "no walkable path to the top floor plate").toBe(true);
  });
});

describe("invariant 5: the lair is sealed", () => {
  it("flood fill from spawn never reaches the Upside Down", () => {
    const { sx, sy, sz, blocks, lair } = world;
    const solidTable = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach((b, i) => {
      solidTable[i] = b.solid ? 1 : 0;
    });
    const visited = new Uint8Array(blocks.length);
    const queue = new Int32Array(blocks.length);
    let head = 0;
    let tail = 0;
    const idxOf = (x: number, y: number, z: number): number =>
      (y * sz + z) * sx + x;

    const start = idxOf(Math.floor(world.spawn.x), 9, Math.floor(world.spawn.z));
    expect(solidTable[blocks[start]]).toBe(0);
    visited[start] = 1;
    queue[tail++] = start;

    while (head < tail) {
      const i = queue[head++];
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      const y = Math.floor(i / (sx * sz));
      for (const [dx, dy, dz] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz)
          continue;
        const ni = idxOf(nx, ny, nz);
        if (visited[ni] || solidTable[blocks[ni]]) continue;
        visited[ni] = 1;
        queue[tail++] = ni;
      }
    }

    for (let y = lair.min.y; y < lair.max.y; y++)
      for (let z = lair.min.z; z < lair.max.z; z++)
        for (let x = lair.min.x; x < lair.max.x; x++)
          if (visited[idxOf(x, y, z)] === 1)
            throw new Error(`surface air leaks into the lair at ${x},${y},${z}`);
  });
});

describe("invariant 6: rift teleports", () => {
  it("both rifts land on solid ground with 2 air above", () => {
    const rifts = world.pois.filter((p) => p.panel === "rift");
    expect(rifts.length).toBe(2);
    for (const r of rifts) {
      expect(r.teleportTo, r.id).toBeDefined();
      const t = r.teleportTo!;
      const x = Math.floor(t.x);
      const z = Math.floor(t.z);
      expect(solidAt(x, t.y - 1, z), `${r.id} lands on air`).toBe(true);
      expect(solidAt(x, t.y, z), `${r.id} feet blocked`).toBe(false);
      expect(solidAt(x, t.y + 1, z), `${r.id} head blocked`).toBe(false);
    }
  });

  it("the entry rift is admin-only, the return rift is not", () => {
    expect(world.pois.find((p) => p.id === "rift-in")?.adminOnly).toBe(true);
    expect(world.pois.find((p) => p.id === "rift-out")?.adminOnly).toBeFalsy();
  });
});

describe("invariant 7: regions", () => {
  it("all region volumes are inside world bounds", () => {
    for (const r of world.regions) {
      expect(r.min.x, r.key).toBeGreaterThanOrEqual(0);
      expect(r.min.y, r.key).toBeGreaterThanOrEqual(0);
      expect(r.min.z, r.key).toBeGreaterThanOrEqual(0);
      expect(r.max.x, r.key).toBeLessThanOrEqual(world.sx);
      expect(r.max.y, r.key).toBeLessThanOrEqual(world.sy);
      expect(r.max.z, r.key).toBeLessThanOrEqual(world.sz);
      expect(r.min.x, r.key).toBeLessThan(r.max.x);
      expect(r.min.y, r.key).toBeLessThan(r.max.y);
      expect(r.min.z, r.key).toBeLessThan(r.max.z);
    }
  });

  it("every room maps to exactly one region with its roomId", () => {
    for (const room of input.rooms) {
      const matches = world.regions.filter((r) => r.roomId === room.id);
      expect(matches.length, `room ${room.key}`).toBe(1);
    }
  });
});

describe("invariant 8: block buffer", () => {
  it("has sx*sy*sz blocks, all with valid ids", () => {
    const { sx, sy, sz, blocks } = world;
    expect(blocks.length).toBe(sx * sy * sz);
    let maxId = 0;
    for (let i = 0; i < blocks.length; i++)
      if (blocks[i] > maxId) maxId = blocks[i];
    expect(maxId).toBeLessThan(BLOCKS.length);
  });
});

describe("regions & POIs coverage", () => {
  it("every named building region exists by label", () => {
    const labels = new Set(world.regions.map((r) => r.label));
    for (const label of [
      "Fountain Plaza",
      "Dev City",
      "Tools Bungalow",
      "Video Editing Bay",
      "Conference Hall",
      "Task Hall",
      "Managing Heads",
      "The Upside Down",
      "Outreach Office",
      "Creative Studio",
      "Shoot Studio",
      "Clock Tower",
      "Acme Corp",
      "Globex",
    ])
      expect(labels.has(label), `missing region ${label}`).toBe(true);
  });

  it("dev city has one floor region per dev project, 5 storeys total", () => {
    const floors = world.regions.filter((r) =>
      r.label.startsWith("Dev City — Floor"),
    );
    expect(floors.length).toBe(5);
    for (const p of input.projects.filter((p) => p.buildingKey !== "tools")) {
      const label = `Dev City — Floor ${p.floor} · ${p.name}`;
      expect(
        floors.some((r) => r.label === label),
        `missing ${label}`,
      ).toBe(true);
    }
    expect(
      floors.filter((r) => r.label.endsWith("Under construction")).length,
    ).toBe(2);
  });

  it("the lair region is flagged and matches world.lair", () => {
    const lair = world.regions.find((r) => r.key === "lair");
    expect(lair?.lair).toBe(true);
    expect(lair!.min.x).toBeLessThanOrEqual(world.lair.min.x);
    expect(lair!.max.x).toBeGreaterThanOrEqual(world.lair.max.x);
  });

  it("all spec POI ids are present and unique", () => {
    const ids = world.pois.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      "bounty-board",
      "skill-stand",
      "city-floor-1",
      "city-floor-2",
      "city-floor-3",
      "tools-library",
      "writing-desk",
      "video-suites",
      "script-terminal",
      "lectern",
      "announce-board",
      "task-wall",
      "approvals-desk",
      "rift-in",
      "rift-out",
      "vecna-desk",
      "outreach-desks",
      "creative-internal",
      "creative-clients",
      "camera-rig",
      "timetable-board",
      "client-rm-acme",
      "client-rm-globex",
    ])
      expect(ids, `missing POI ${id}`).toContain(id);
  });

  it("under-construction floors get no city POI", () => {
    const ids = world.pois.map((p) => p.id);
    expect(ids).not.toContain("city-floor-4");
    expect(ids).not.toContain("city-floor-5");
  });

  it("city floor POIs reference their project", () => {
    for (const [id, refId] of [
      ["city-floor-1", "pr-alpha"],
      ["city-floor-2", "pr-beta"],
      ["city-floor-3", "pr-gamma"],
    ] as const)
      expect(world.pois.find((p) => p.id === id)?.refId).toBe(refId);
  });
});
