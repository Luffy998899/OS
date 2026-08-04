import { describe, expect, it } from "vitest";
import { BLOCKS } from "../blocks";
import { isBindablePanel } from "../panels";
import { EYE_HEIGHT } from "../physics";
import { WORLD_SIZE } from "../world";
import { box, DISTRICTS, getDistrict, Plot, type DistrictPlan } from "./index";
import { Walkable } from "./walkable";

/** What block-world.tsx aims with. A POI further than this cannot be opened. */
const INTERACT_RANGE = 4.4;

/** Every spot a player could stand in and open each of a district's POIs. */
function approaches(plan: DistrictPlan) {
  const walk = new Walkable(plan);
  const spots = walk.allSpots();
  return plan.pois.map((poi) => ({
    poi,
    spots: spots.filter((s) => walk.reach(s, EYE_HEIGHT, poi) < INTERACT_RANGE),
  }));
}

const ORIGIN = { x: 10, y: 0, z: 10 };
const built = DISTRICTS.map((d) => ({ d, plan: d.build(ORIGIN) }));

/** The world router rejects a batch over this, so a district must fit under it. */
const MAX_BATCH = 40_000;

describe("the Plot kit", () => {
  it("emits only non-air cells, translated to world space", () => {
    const p = new Plot({ x: 5, y: 2, z: 7 }, { w: 4, h: 4, d: 4 });
    p.set(1, 1, 1, 9);
    expect(p.plan().blocks).toEqual([6, 3, 8, 9]);
  });

  it("lets a later op overwrite an earlier one instead of stacking edits", () => {
    const p = new Plot({ x: 0, y: 0, z: 0 }, { w: 4, h: 4, d: 4 });
    p.fill(box(0, 0, 0, 3, 0, 3), "solid", 5);
    p.fill(box(0, 0, 0, 3, 0, 3), "solid", 7);
    const blocks = p.plan().blocks;
    expect(blocks.length / 4).toBe(16);
    for (let i = 3; i < blocks.length; i += 4) expect(blocks[i]).toBe(7);
  });

  it("ignores writes outside the plot rather than wrapping them", () => {
    const p = new Plot({ x: 0, y: 0, z: 0 }, { w: 4, h: 4, d: 4 });
    p.set(-1, 0, 0, 9);
    p.set(4, 0, 0, 9);
    p.set(0, 99, 0, 9);
    expect(p.plan().blocks).toEqual([]);
  });

  it("builds a stair that climbs and leaves head room", () => {
    const p = new Plot({ x: 0, y: 0, z: 0 }, { w: 8, h: 12, d: 12 });
    // Bury the run in solid rock so the carve-out is observable.
    p.fill(box(0, 0, 0, 7, 11, 11), "solid", 5);
    p.stair(2, 1, 1, 8, 1, 2);
    // The tread rises every second step …
    expect(p.at(2, 1, 1)).not.toBe(0);
    expect(p.at(2, 2, 3)).not.toBe(0);
    expect(p.at(2, 3, 5)).not.toBe(0);
    // … and the two cells above each tread are clear.
    expect(p.at(2, 2, 1)).toBe(0);
    expect(p.at(2, 3, 1)).toBe(0);
  });
});

describe("every district", () => {
  it("is uniquely keyed and findable", () => {
    const keys = DISTRICTS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(getDistrict(k)?.key).toBe(k);
    expect(getDistrict("nope")).toBeNull();
  });

  it.each(built)("$d.label stays inside its declared size", ({ d, plan }) => {
    for (let i = 0; i < plan.blocks.length; i += 4) {
      const x = plan.blocks[i] - ORIGIN.x;
      const y = plan.blocks[i + 1] - ORIGIN.y;
      const z = plan.blocks[i + 2] - ORIGIN.z;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(d.size.w);
      expect(y).toBeLessThan(d.size.h);
      expect(z).toBeLessThan(d.size.d);
    }
  });

  it.each(built)("$d.label fits in one batch and in the world", ({ d, plan }) => {
    expect(plan.blocks.length % 4).toBe(0);
    expect(plan.blocks.length / 4).toBeGreaterThan(200);
    expect(plan.blocks.length / 4).toBeLessThan(MAX_BATCH);
    expect(d.size.w).toBeLessThanOrEqual(WORLD_SIZE.sx);
    expect(d.size.h).toBeLessThanOrEqual(WORLD_SIZE.sy);
    expect(d.size.d).toBeLessThanOrEqual(WORLD_SIZE.sz);
  });

  it.each(built)("$d.label places only blocks that exist", ({ plan }) => {
    for (let i = 3; i < plan.blocks.length; i += 4) {
      const id = plan.blocks[i];
      expect(id).toBeGreaterThan(0);
      expect(BLOCKS[id], `block id ${id} is not in the registry`).toBeDefined();
    }
  });

  it.each(built)("$d.label wires only panels that can be bound", ({ plan }) => {
    for (const poi of plan.pois) {
      expect(isBindablePanel(poi.panel), `${poi.label} -> ${poi.panel}`).toBe(true);
      expect(poi.label.length).toBeGreaterThan(0);
      expect(poi.label.length).toBeLessThanOrEqual(48);
    }
  });

  it.each(built)("$d.label puts every point of interest on a solid block", ({ plan }) => {
    // A prompt floating in mid-air is a prompt nobody can find. Each POI must
    // sit on a cell the district actually filled.
    const placed = new Set<string>();
    for (let i = 0; i < plan.blocks.length; i += 4) {
      placed.add(`${plan.blocks[i]},${plan.blocks[i + 1]},${plan.blocks[i + 2]}`);
    }
    for (const poi of plan.pois) {
      expect(placed.has(`${poi.x},${poi.y},${poi.z}`), `${poi.label} hangs in the air`).toBe(
        true,
      );
    }
  });

  it.each(built)("$d.label names its regions uniquely and non-degenerately", ({ plan }) => {
    const keys = plan.regions.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of plan.regions) {
      expect(r.max.x).toBeGreaterThan(r.min.x);
      expect(r.max.y).toBeGreaterThan(r.min.y);
      expect(r.max.z).toBeGreaterThan(r.min.z);
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it.each(built)("$d.label puts every point of interest within reach", ({ plan }) => {
    // A board you cannot get in front of is scenery. This walks the district's
    // own blocks and checks each POI is openable from somewhere you can stand.
    for (const { poi, spots } of approaches(plan)) {
      expect(spots.length, `nowhere to stand and open ${poi.label}`).toBeGreaterThan(0);
    }
  });

  it.each(built)("$d.label connects everything it wires up", ({ plan }) => {
    // And you must be able to walk between them: a door bricked up by a sofa,
    // a floor with no stair to it, a board sealed in a cupboard all show up
    // here as a point of interest stranded on its own island.
    const walk = new Walkable(plan);
    const found = approaches(plan);
    if (found.length < 2) return;
    const island = walk.flood(found[0].spots[0]);
    for (const { poi, spots } of found) {
      const joined = spots.some((s) => island.has(`${s.x},${s.y},${s.z}`));
      expect(joined, `${poi.label} cannot be walked to from ${found[0].poi.label}`).toBe(true);
    }
  });

  it.each(built)("$d.label is placed relative to its origin", ({ d }) => {
    // Stamped somewhere else, the same district must come out the same shape.
    const a = d.build({ x: 0, y: 0, z: 0 }).blocks;
    const b = d.build({ x: 20, y: 3, z: 40 }).blocks;
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i += 4) {
      expect(b[i] - a[i]).toBe(20);
      expect(b[i + 1] - a[i + 1]).toBe(3);
      expect(b[i + 2] - a[i + 2]).toBe(40);
      expect(b[i + 3]).toBe(a[i + 3]);
    }
  });
});

describe("Dev City", () => {
  const plan = getDistrict("dev-city")!.build(ORIGIN);

  it("gives every storey of both towers its own desk", () => {
    for (const building of ["pipeline", "complete"] as const) {
      for (let n = 1; n <= 10; n++) {
        const poi = plan.pois.find((p) => p.refId === `${building}:${n}`);
        expect(poi, `${building} floor ${n} has no desk`).toBeDefined();
        expect(poi!.panel).toBe("city");
      }
    }
    expect(plan.pois.find((p) => p.refId === "tools:1")).toBeDefined();
  });

  it("nests each floor's region inside its building's", () => {
    const towerOf = (key: string) => plan.regions.find((r) => r.key === key)!;
    for (const building of ["pipeline", "complete"] as const) {
      const tower = towerOf(`devcity-${building}`);
      for (let n = 1; n <= 10; n++) {
        const floor = towerOf(`devcity-${building}-${n}`);
        expect(floor.min.x).toBeGreaterThanOrEqual(tower.min.x);
        expect(floor.max.x).toBeLessThanOrEqual(tower.max.x);
        expect(floor.min.y).toBeGreaterThanOrEqual(tower.min.y);
        expect(floor.max.y).toBeLessThanOrEqual(tower.max.y);
        // Smaller volume, so regionAt names the floor rather than the tower.
        const vol = (r: typeof floor) =>
          (r.max.x - r.min.x) * (r.max.y - r.min.y) * (r.max.z - r.min.z);
        expect(vol(floor)).toBeLessThan(vol(tower));
      }
    }
  });

  it("can be climbed from the plaza to the top floor", () => {
    // A storey paves its own slab edge to edge, so the flights have to go in
    // after all ten are down or each one is buried by the floor above it. This
    // starts on the paving outside the pipeline tower and walks up.
    const walk = new Walkable(plan);
    const island = [...walk.flood({ x: ORIGIN.x + 7, y: ORIGIN.y + 1, z: ORIGIN.z + 12 })].map(
      (k) => {
        const [x, y, z] = k.split(",").map(Number);
        return { x, y, z };
      },
    );
    for (const n of [1, 5, 10]) {
      const desk = plan.pois.find((p) => p.refId === `pipeline:${n}`)!;
      const arrived = island.some((s) => walk.reach(s, EYE_HEIGHT, desk) < INTERACT_RANGE);
      expect(arrived, `floor ${n} cannot be walked to from the plaza`).toBe(true);
    }
  });

  it("leaves a way in at ground level", () => {
    const solid = new Set<string>();
    for (let i = 0; i < plan.blocks.length; i += 4) {
      solid.add(`${plan.blocks[i]},${plan.blocks[i + 1]},${plan.blocks[i + 2]}`);
    }
    // The doorway is carved through the plaza-facing wall of each tower.
    const doorways = [
      { x: ORIGIN.x + 1 + 6, z: ORIGIN.z + 14 },
      { x: ORIGIN.x + 18 + 6, z: ORIGIN.z + 14 },
    ];
    for (const d of doorways) {
      expect(solid.has(`${d.x},${ORIGIN.y + 2},${d.z}`), "tower door is bricked up").toBe(
        false,
      );
    }
  });
});

describe("the rooms", () => {
  it("puts an editor at the video bay's timeline, facing the monitors", () => {
    const plan = getDistrict("video-bay")!.build(ORIGIN);
    expect(plan.npcs).toHaveLength(1);
    const [editor] = plan.npcs;
    expect(editor.seated).toBe(true);
    expect(editor.role).toBe("Video Editor");
    // The desk it sits at is one cell north of it.
    const desks = new Set<string>();
    for (let i = 0; i < plan.blocks.length; i += 4) {
      desks.add(`${plan.blocks[i]},${plan.blocks[i + 1]},${plan.blocks[i + 2]}`);
    }
    expect(desks.has(`${Math.floor(editor.x)},${editor.y},${Math.floor(editor.z) - 1}`)).toBe(
      true,
    );
  });

  it("gives managing heads the approvals counter", () => {
    const plan = getDistrict("managing-heads")!.build(ORIGIN);
    expect(plan.pois.some((p) => p.panel === "approvals")).toBe(true);
  });
});

/** What each cell of a plan ended up holding, by block key. */
function blockKeys(plan: DistrictPlan): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < plan.blocks.length; i += 4) {
    const [x, y, z, id] = plan.blocks.slice(i, i + 4);
    out.set(`${x},${y},${z}`, BLOCKS[id].key);
  }
  return out;
}

describe("the board room", () => {
  const plan = getDistrict("board-room")!.build(ORIGIN);

  it("seats the whole team", () => {
    const seats = [...blockKeys(plan).values()].filter(
      (k) => k === "chair" || k === "sofa",
    ).length;
    expect(seats).toBeGreaterThanOrEqual(30);
  });

  it("has a board to read from a seat and a lectern to speak from", () => {
    const conf = plan.pois.filter((p) => p.panel === "conference");
    expect(conf).toHaveLength(2);
    // ConferencePanel opens its composer on refId "compose" — the lectern is
    // for the person calling the meeting, the board is for everyone else.
    expect(conf.filter((p) => p.refId === "compose")).toHaveLength(1);
  });

  it("keeps the door lane clear of the sofa run", () => {
    const walk = new Walkable(plan);
    // Door, rug, the gap in the sofas, and the chair at the head of the table.
    for (let z = ORIGIN.z + 13; z <= ORIGIN.z + 16; z++) {
      expect(walk.stands(ORIGIN.x + 11, ORIGIN.y + 2, z), `blocked at z ${z}`).toBe(true);
    }
  });
});

describe("the task hall", () => {
  const plan = getDistrict("task-hall")!.build(ORIGIN);
  const booths = plan.pois.filter((p) => p.label === "Your task wall");

  it("gives every booth its own board, and the squad one of its own", () => {
    expect(booths).toHaveLength(6);
    expect(new Set(booths.map((p) => `${p.x},${p.y},${p.z}`)).size).toBe(6);
    expect(plan.pois.filter((p) => p.label === "Squad board")).toHaveLength(1);
    for (const p of plan.pois) expect(p.panel).toBe("tasks");
  });

  it("puts a desk and a seat at every booth", () => {
    const keys = blockKeys(plan);
    for (const wall of booths) {
      const inward = wall.x === ORIGIN.x ? 1 : -1;
      const foot = ORIGIN.y + 2;
      expect(keys.get(`${wall.x + inward},${foot},${wall.z}`), "no desk").toBe("desk");
      expect(keys.get(`${wall.x + inward * 3},${foot},${wall.z}`), "no chair").toBe("chair");
    }
  });
});
