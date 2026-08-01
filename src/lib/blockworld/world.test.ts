// AUXA HQ validated against the office spec's 10 invariants. The two that
// matter most are 4 and 5: a flood fill over STANDABLE cells has to walk from
// the spawn pad into every room (proving the doorways really connect), and it
// must never find its way into the Upside Down.

import { describe, expect, it } from "vitest";
import { BLOCKS, isSolid } from "./blocks";
import { blockAt } from "./types";
import type { PanelKind, Poi, Region, World } from "./types";
import { buildWorld } from "./world";
import type { WorldInput } from "./world";

const input: WorldInput = {
  rooms: [
    { id: "rm-dev", key: "developer", name: "Dev Wing", kind: "team" },
    { id: "rm-video", key: "video-editing", name: "Video Editing Bay", kind: "team" },
    { id: "rm-board", key: "common-board", name: "Conference Hall", kind: "team" },
    { id: "rm-creative", key: "creative", name: "Creative Studio", kind: "team" },
    { id: "rm-tasks", key: "tasks", name: "Task Hall", kind: "team" },
    { id: "rm-heads", key: "managing-heads", name: "Managing Heads", kind: "team" },
    { id: "rm-time", key: "timetable", name: "Timetable", kind: "team" },
    { id: "rm-outreach", key: "outreach", name: "Outreach Office", kind: "team" },
    { id: "rm-shoot", key: "shoot", name: "Shoot Studio", kind: "team" },
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

/** Regions that are rooms you walk into — used by invariants 9 and 10. */
const ROOM_KEYS = [
  "conference",
  "video",
  "creative",
  "creative-internal",
  "creative-clients",
  "shoot",
  "dev-wing",
  "tasks",
  "outreach",
  "managing-heads",
  "lobby",
  "pantry",
  "timetable",
];

const TOOL_PANELS: PanelKind[] = [
  "video",
  "city",
  "conference",
  "tasks",
  "approvals",
  "outreach",
  "creative",
  "shoot",
  "timetable",
  "docs",
  "bounties",
  "missions",
  "client",
];

const solidAt = (x: number, y: number, z: number): boolean =>
  isSolid(blockAt(world, x, y, z));

/** (x, y, z) is a FEET cell: solid floor beneath, two clear blocks of body. */
const standable = (x: number, y: number, z: number): boolean =>
  solidAt(x, y - 1, z) && !solidAt(x, y, z) && !solidAt(x, y + 1, z);

const regionOf = (key: string): Region => {
  const r = world.regions.find((x) => x.key === key);
  if (!r) throw new Error(`no region ${key}`);
  return r;
};

const inRegion = (r: Region, x: number, y: number, z: number): boolean =>
  x >= r.min.x &&
  x < r.max.x &&
  y >= r.min.y &&
  y < r.max.y &&
  z >= r.min.z &&
  z < r.max.z;

const isTowerFloor = (r: Region): boolean => r.key.startsWith("floor-");
const isLift = (p: Poi): boolean => p.id.startsWith("lift-");

// ---------------------------------------------------------------------------
// The walk: flood fill over standable cells, stepping up or down one block.
// ---------------------------------------------------------------------------

const { sx, sy, sz } = world;
const cellIdx = (x: number, y: number, z: number): number =>
  (y * sz + z) * sx + x;

const walkable = ((): Uint8Array => {
  const seen = new Uint8Array(sx * sy * sz);
  const start = {
    x: Math.floor(world.spawn.x),
    y: world.spawn.y,
    z: Math.floor(world.spawn.z),
  };
  if (!standable(start.x, start.y, start.z)) return seen;
  const queue: number[] = [cellIdx(start.x, start.y, start.z)];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % sx;
    const z = Math.floor(i / sx) % sz;
    const y = Math.floor(i / (sx * sz));
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (const dy of [0, -1, 1]) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || ny < 1 || nx >= sx || nz >= sz || ny >= sy - 1)
          continue;
        const ni = cellIdx(nx, ny, nz);
        if (seen[ni] || !standable(nx, ny, nz)) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return seen;
})();

const reachedCount = walkable.reduce<number>((n, v) => n + v, 0);

const reachesRegion = (r: Region): boolean => {
  for (let y = r.min.y; y < Math.min(r.max.y, sy - 1); y++)
    for (let z = r.min.z; z < r.max.z; z++)
      for (let x = r.min.x; x < r.max.x; x++)
        if (walkable[cellIdx(x, y, z)]) return true;
  return false;
};

// ---------------------------------------------------------------------------

describe("invariant 1: the block buffer", () => {
  it("is sx*sy*sz long with only valid block ids", () => {
    expect(world.blocks.length).toBe(world.sx * world.sy * world.sz);
    let maxId = 0;
    for (let i = 0; i < world.blocks.length; i++)
      if (world.blocks[i] > maxId) maxId = world.blocks[i];
    expect(maxId).toBeLessThan(BLOCKS.length);
  });
});

describe("invariant 2: spawn", () => {
  it("stands on solid ground with 2 air blocks above", () => {
    const x = Math.floor(world.spawn.x);
    const y = world.spawn.y;
    const z = Math.floor(world.spawn.z);
    expect(solidAt(x, y - 1, z)).toBe(true);
    expect(solidAt(x, y, z)).toBe(false);
    expect(solidAt(x, y + 1, z)).toBe(false);
  });

  it("is inside the reception lobby, facing up the corridor", () => {
    const lobby = regionOf("lobby");
    expect(
      inRegion(
        lobby,
        Math.floor(world.spawn.x),
        world.spawn.y,
        Math.floor(world.spawn.z),
      ),
    ).toBe(true);
    expect(world.spawnYaw).toBe(0);
  });
});

describe("invariant 3: POIs", () => {
  it("has unique ids", () => {
    const ids = world.pois.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every AABB inside world bounds", () => {
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

  it("gives every non-lift POI a standable cell to be used from", () => {
    for (const p of world.pois) {
      if (isLift(p)) continue;
      let ok = false;
      outer: for (let x = p.min.x - 1; x <= p.max.x; x++)
        for (let z = p.min.z - 1; z <= p.max.z; z++)
          for (let y = Math.max(1, p.min.y - 2); y <= p.max.y + 1; y++)
            if (standable(x, y, z)) {
              ok = true;
              break outer;
            }
      expect(ok, `POI ${p.id} has nowhere to stand`).toBe(true);
    }
  });
});

describe("invariant 4: everything is walkable from spawn", () => {
  it("floods a connected floor area the size of a real floorplate", () => {
    // The plate is deliberately compact — big enough that the office reads as
    // a building, small enough that nothing is a hike. Both ends matter: too
    // small means rooms lost their space, too large means the sprawl is back.
    expect(reachedCount).toBeGreaterThan(2500);
    expect(reachedCount).toBeLessThan(8000);
  });

  it.each(
    world.regions
      .filter((r) => !r.lair && !isTowerFloor(r))
      .map((r) => ({ key: r.key, label: r.label })),
  )("walks into $key ($label)", ({ key }) => {
    expect(reachesRegion(regionOf(key)), `${key} is not reachable on foot`).toBe(
      true,
    );
  });
});

describe("invariant 5: the Upside Down is sealed", () => {
  it("is never reached by the walk from spawn", () => {
    const l = world.lair;
    for (let y = l.min.y; y < l.max.y; y++)
      for (let z = l.min.z; z < l.max.z; z++)
        for (let x = l.min.x; x < l.max.x; x++)
          if (walkable[cellIdx(x, y, z)])
            throw new Error(`walked into the lair at ${x},${y},${z}`);
  });

  it("shares no air with the surface at all", () => {
    // Stronger than the walk: 6-connected air flood from the spawn column.
    const solidTable = new Uint8Array(BLOCKS.length);
    BLOCKS.forEach((b, i) => {
      solidTable[i] = b.solid ? 1 : 0;
    });
    const seen = new Uint8Array(world.blocks.length);
    const queue = new Int32Array(world.blocks.length);
    let head = 0;
    let tail = 0;
    const start = cellIdx(
      Math.floor(world.spawn.x),
      world.spawn.y,
      Math.floor(world.spawn.z),
    );
    expect(solidTable[world.blocks[start]]).toBe(0);
    seen[start] = 1;
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
        const ni = cellIdx(nx, ny, nz);
        if (seen[ni] || solidTable[world.blocks[ni]]) continue;
        seen[ni] = 1;
        queue[tail++] = ni;
      }
    }
    const l = world.lair;
    for (let y = l.min.y; y < l.max.y; y++)
      for (let z = l.min.z; z < l.max.z; z++)
        for (let x = l.min.x; x < l.max.x; x++)
          if (seen[cellIdx(x, y, z)])
            throw new Error(`surface air leaks into the lair at ${x},${y},${z}`);
  });

  it("is a lair-flagged region containing Vecna's desk and the way back", () => {
    const lair = world.regions.find((r) => r.lair);
    expect(lair?.label).toBe("The Upside Down");
    const ids = world.pois.map((p) => p.id);
    expect(ids).toContain("vecna-desk");
    expect(ids).toContain("rift-out");
    expect(world.pois.find((p) => p.id === "rift-in")?.adminOnly).toBe(true);
    expect(world.pois.find((p) => p.id === "rift-out")?.adminOnly).toBeFalsy();
  });
});

describe("invariant 6: teleports", () => {
  const teleports = world.pois.filter((p) => p.panel === "rift");

  it("has a lift POI for every tower floor plus both lobby calls", () => {
    // 2 towers x 10 floors x (up + down) + 2 lobby lifts + 2 rift ends.
    expect(teleports.length).toBe(2 * 10 * 2 + 2 + 2);
  });

  it.each(teleports.map((p) => ({ id: p.id, poi: p })))(
    "$id lands on solid ground with 2 air above",
    ({ poi }) => {
      expect(poi.teleportTo, poi.id).toBeDefined();
      const t = poi.teleportTo!;
      const x = Math.floor(t.x);
      const z = Math.floor(t.z);
      expect(solidAt(x, t.y - 1, z), `${poi.id} lands on air`).toBe(true);
      expect(solidAt(x, t.y, z), `${poi.id} feet blocked`).toBe(false);
      expect(solidAt(x, t.y + 1, z), `${poi.id} head blocked`).toBe(false);
    },
  );
});

describe("invariant 7: the two towers", () => {
  for (const tower of ["pipeline", "complete"]) {
    for (let n = 1; n <= 10; n++) {
      it(`${tower} floor ${n} has a region, a project POI and both lifts`, () => {
        const r = world.regions.find((x) => x.key === `floor-${tower}-${n}`);
        expect(r, `missing region for ${tower} floor ${n}`).toBeDefined();
        expect(r!.label).toContain(`Floor ${n} · `);
        const ids = world.pois.map((p) => p.id);
        expect(ids).toContain(`city-${tower}-${n}`);
        expect(ids).toContain(`lift-${tower}-${n}`);
        expect(ids).toContain(`lift-down-${tower}-${n}`);
      });
    }
  }

  it("fills pipeline floors with projects in floor order, rest available", () => {
    const labelOf = (n: number): string =>
      world.regions.find((r) => r.key === `floor-pipeline-${n}`)!.label;
    expect(labelOf(1)).toBe("Pipeline Tower — Floor 1 · Project Alpha");
    expect(labelOf(2)).toBe("Pipeline Tower — Floor 2 · Project Beta");
    expect(labelOf(3)).toBe("Pipeline Tower — Floor 3 · Project Gamma");
    expect(labelOf(4)).toBe("Pipeline Tower — Floor 4 · Available");
    expect(
      world.regions.find((r) => r.key === "floor-complete-1")!.label,
    ).toBe("Completed Tower — Floor 1 · Toolsmith");
    expect(world.pois.find((p) => p.id === "city-pipeline-2")?.refId).toBe(
      "pr-beta",
    );
    expect(world.pois.find((p) => p.id === "city-complete-1")?.refId).toBe(
      "pr-tools",
    );
    expect(world.pois.find((p) => p.id === "city-pipeline-9")?.refId).toBeUndefined();
  });
});

describe("invariant 8: the computers", () => {
  const workstations = world.pois.filter((p) => p.id.includes("-pc"));

  it("places at least 14 usable workstations", () => {
    expect(workstations.length).toBeGreaterThanOrEqual(14);
  });

  it("wires each one to a real tool panel and says what it opens", () => {
    for (const w of workstations) {
      expect(TOOL_PANELS, `${w.id} panel ${w.panel}`).toContain(w.panel);
      expect(w.sublabel, w.id).toContain("sit down and work");
    }
  });

  it("includes every workstation the spec names", () => {
    const ids = workstations.map((w) => w.id);
    for (const id of [
      "reception-pc",
      "video-pc-1",
      "video-pc-2",
      "video-pc-3",
      "script-pc",
      "task-pc-1",
      "task-pc-2",
      "outreach-pc-1",
      "outreach-pc-2",
      "creative-pc-internal",
      "creative-pc-clients",
      "approvals-pc",
      "dev-pc",
      "shoot-pc",
    ])
      expect(ids, `missing workstation ${id}`).toContain(id);
    expect(
      world.pois.find((p) => p.id === "creative-pc-clients")?.refId,
    ).toBe("clients");
    expect(world.pois.find((p) => p.id === "dev-pc")?.refId).toBe("tools");
  });
});

describe("invariant 9: no empty rooms", () => {
  it.each(ROOM_KEYS.map((key) => ({ key })))(
    "$key contains at least one tool or mission POI",
    ({ key }) => {
      const r = regionOf(key);
      const hit = world.pois.some(
        (p) =>
          TOOL_PANELS.includes(p.panel) &&
          // Wall-mounted boards sit in the wall, one block outside the room.
          p.max.x > r.min.x - 1 &&
          p.min.x < r.max.x + 1 &&
          p.max.z > r.min.z - 1 &&
          p.min.z < r.max.z + 1 &&
          p.max.y > r.min.y &&
          p.min.y < r.max.y,
      );
      expect(hit, `${r.label} has nothing to do in it`).toBe(true);
    },
  );

  it("gives every named room a mission board wired to its DB room", () => {
    for (const [id, roomKey] of [
      ["board-conference", "common-board"],
      ["board-video", "video-editing"],
      ["board-creative", "creative"],
      ["board-shoot", "shoot"],
      ["board-dev-wing", "developer"],
      ["board-tasks", "tasks"],
      ["board-outreach", "outreach"],
      ["board-managing-heads", "managing-heads"],
    ] as const) {
      const board = world.pois.find((p) => p.id === id);
      expect(board, `missing ${id}`).toBeDefined();
      expect(board!.panel).toBe("missions");
      expect(board!.refId).toBe(
        input.rooms.find((r) => r.key === roomKey)!.id,
      );
    }
  });

  it("maps every input room to exactly one region", () => {
    for (const r of input.rooms) {
      const matches = world.regions.filter((x) => x.roomId === r.id);
      expect(matches.length, `room ${r.key}`).toBe(1);
    }
  });

  it("gives each client a booth POI", () => {
    for (const c of input.rooms.filter((r) => r.kind === "client")) {
      const p = world.pois.find((x) => x.id === `client-${c.id}`);
      expect(p, `missing booth for ${c.name}`).toBeDefined();
      expect(p!.panel).toBe("client");
      expect(p!.refId).toBe(c.id);
    }
  });
});

describe("invariant 10: the interiors are lit", () => {
  it.each(ROOM_KEYS.map((key) => ({ key })))(
    "$key has recessed ceiling lights",
    ({ key }) => {
      const r = regionOf(key);
      let lights = 0;
      for (let y = r.min.y; y < r.max.y; y++)
        for (let z = r.min.z; z < r.max.z; z++)
          for (let x = r.min.x; x < r.max.x; x++)
            if (blockAt(world, x, y, z) === BLOCKS.findIndex((b) => b.key === "ceiling_light"))
              lights++;
      expect(lights, `${r.label} is dark`).toBeGreaterThan(0);
    },
  );
});

describe("the place reads as an office", () => {
  it("has no grass, dirt or cobblestone in the palette", () => {
    const keys = new Set(BLOCKS.map((b) => b.key));
    for (const banned of ["grass", "dirt", "cobble", "leaves", "log", "sand"])
      expect(keys.has(banned), `${banned} is back`).toBe(false);
  });

  it("names every room on a sign the corridor can read", () => {
    const texts = world.signs.map((s) => s.text);
    for (const text of [
      "AUXA HQ",
      "CONFERENCE HALL",
      "VIDEO EDITING BAY",
      "CREATIVE — INTERNAL",
      "CREATIVE — CLIENTS",
      "SHOOT STUDIO",
      "DEV WING",
      "TASK HALL",
      "OUTREACH OFFICE",
      "MANAGING HEADS",
      "PANTRY",
      "B1 — RESTRICTED",
    ])
      expect(texts, `missing sign ${text}`).toContain(text);
  });

  it("keeps every doorway 3 wide and 3 high", () => {
    // Doors are located from their own signage rather than hardcoded, so this
    // keeps testing the doorways after any layout change. The sign sits half a
    // block off the wall on the reader's side, centred on the 3-wide gap.
    const openingFor = (text: string) => {
      const s = world.signs.find((x) => x.text === text);
      if (!s) return null;
      if (s.face === "e") return { axis: "x" as const, wall: Math.round(s.x - 1.05), from: Math.round(s.z - 1.5) };
      if (s.face === "w") return { axis: "x" as const, wall: Math.round(s.x + 0.05), from: Math.round(s.z - 1.5) };
      if (s.face === "s") return { axis: "z" as const, wall: Math.round(s.z - 1.05), from: Math.round(s.x - 1.5) };
      return { axis: "z" as const, wall: Math.round(s.z + 0.05), from: Math.round(s.x - 1.5) };
    };
    for (const text of [
      "CONFERENCE HALL",
      "VIDEO EDITING BAY",
      "CREATIVE — INTERNAL",
      "CREATIVE — CLIENTS",
      "DEV WING",
      "TASK HALL",
      "OUTREACH OFFICE",
      "SHOOT STUDIO",
      "MANAGING HEADS",
      "PANTRY",
    ]) {
      const d = openingFor(text);
      expect(d, `no door sign for ${text}`).not.toBeNull();
      for (let i = 0; i < 3; i++)
        for (let y = 1; y <= 3; y++) {
          const x = d!.axis === "x" ? d!.wall : d!.from + i;
          const z = d!.axis === "x" ? d!.from + i : d!.wall;
          expect(solidAt(x, y, z), `${text} blocked at ${x},${y},${z}`).toBe(false);
        }
    }
  });

  it("opens the entrance at least 6 wide and 4 high", () => {
    // The entrance is wherever the building's own name hangs.
    const hq = world.signs.find((s) => s.text === "AUXA HQ");
    expect(hq, "the building is unnamed").toBeDefined();
    const facadeZ = Math.round(hq!.z - 1.05);
    let run = 0;
    let best = 0;
    for (let x = 0; x < world.sx; x++) {
      let clear = true;
      for (let y = 1; y <= 4; y++) if (solidAt(x, y, facadeZ)) clear = false;
      run = clear ? run + 1 : 0;
      best = Math.max(best, run);
    }
    expect(best, `entrance gap at z=${facadeZ}`).toBeGreaterThanOrEqual(6);
  });

  it("is a compact floorplate, not a campus", () => {
    // Task: "the area is too big" — the plate must stay small-to-medium.
    expect(world.sx * world.sz).toBeLessThan(7000);
  });
});

describe("the office is populated", () => {
  it("puts people in the rooms", () => {
    expect(world.npcs.length).toBeGreaterThanOrEqual(15);
    // The rooms that should visibly have someone working in them.
    for (const id of [
      "npc-reception",
      "npc-video-1",
      "npc-task-1",
      "npc-outreach-1",
      "npc-creative-1",
      "npc-approvals",
      "npc-dev-1",
    ]) {
      expect(world.npcs.find((n) => n.id === id), `${id} missing`).toBeTruthy();
    }
  });

  it("gives every NPC a clear cell to stand in, on solid ground", () => {
    for (const n of world.npcs) {
      const x = Math.floor(n.x);
      const y = Math.floor(n.y);
      const z = Math.floor(n.z);
      expect(solidAt(x, y, z), `${n.id} is inside a block`).toBe(false);
      expect(solidAt(x, y + 1, z), `${n.id} has no headroom`).toBe(false);
      expect(solidAt(x, y - 1, z), `${n.id} is floating`).toBe(true);
    }
  });

  it("has unique NPC ids and a hue for each", () => {
    const ids = world.npcs.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of world.npcs) {
      expect(n.hue).toBeGreaterThanOrEqual(0);
      expect(n.hue).toBeLessThan(360);
      expect(n.name.length).toBeGreaterThan(1);
    }
  });

  it("points every client NPC at a real client POI", () => {
    const clientNpcs = world.npcs.filter((n) => n.kind === "client");
    expect(clientNpcs.length).toBeGreaterThan(0);
    for (const n of clientNpcs) {
      expect(n.poiId, `${n.id} has no poi`).toBeTruthy();
      const target = world.pois.find((p) => p.id === n.poiId);
      expect(target, `${n.poiId} does not exist`).toBeTruthy();
      expect(target?.panel).toBe("client");
    }
  });

  it("keeps the floor interactive instead of dressing it with scenery", () => {
    const idOf = (key: string) => BLOCKS.findIndex((b) => b.key === key);
    const count = (key: string) => {
      const id = idOf(key);
      let n = 0;
      for (let i = 0; i < world.blocks.length; i++) if (world.blocks[i] === id) n++;
      return n;
    };
    // Scenery you cannot use is gone: it filled every corner and did nothing.
    const scenery = [
      "sofa",
      "rug_pattern",
      "lamp",
      "cooler",
      "printer",
      "art",
      "vent",
      "exit_sign",
      "coffee",
      "papers",
      "phone",
      "book_stack",
      "cpu",
      "plant",
      "planter",
      "plant_fern",
      "plant_tall",
      "pot",
      "pot_white",
    ];
    for (const key of scenery) {
      // A typo here would make the assertion vacuous, so prove the block exists.
      expect(idOf(key), `unknown block ${key}`).toBeGreaterThan(0);
      expect(count(key), `${key} is back on the floor`).toBe(0);
    }
    // What's left is the furniture people actually walk up to and use.
    expect(count("desk"), "no desks").toBeGreaterThan(20);
    expect(count("monitor"), "nothing to sit down at").toBeGreaterThan(20);
    expect(count("chair"), "nowhere to sit").toBeGreaterThan(15);
  });
});
