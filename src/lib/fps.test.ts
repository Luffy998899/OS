import { describe, it, expect } from "vitest";
import {
  buildCastGrid,
  buildFloorIndex,
  buildSolids,
  castRay,
  columnRay,
  facingBucket,
  floorRoomAt,
  makeCamera,
  moveVector,
  normalizeAngle,
  pickTarget,
  projectHeight,
  projectSprite,
  rayAabb,
  CEILING_HEIGHT,
  DESK_HEIGHT,
  EYE_HEIGHT,
  type Hit,
  type Solid,
} from "./fps";
import { buildLayout, type RoomInput } from "./workspace-map";

const ROOMS: RoomInput[] = [
  { id: "a", key: "developer", name: "Developer City", kind: "department", posX: 0, posY: 0, missionCount: 2 },
  { id: "b", key: "creative", name: "Creative Studio", kind: "department", posX: 1, posY: 0, missionCount: 0 },
  { id: "c", key: "common-board", name: "Conference Hall", kind: "department", posX: 0, posY: 1, missionCount: 1 },
];

const layout = buildLayout(ROOMS);

describe("rayAabb", () => {
  const box = { x: 100, y: 0, w: 20, h: 100 };

  it("reports entry and exit along the ray", () => {
    const hit = rayAabb(box, 0, 50, 1, 0);
    expect(hit).not.toBeNull();
    expect(hit!.dist).toBeCloseTo(100);
    expect(hit!.exit).toBeCloseTo(120);
    expect(hit!.axis).toBe(0);
  });

  it("misses when the ray passes by", () => {
    expect(rayAabb(box, 0, 200, 1, 0)).toBeNull();
    expect(rayAabb(box, 0, 50, -1, 0)).toBeNull(); // pointing away
  });

  it("ignores a ray that starts inside the box", () => {
    expect(rayAabb(box, 110, 50, 1, 0)).toBeNull();
  });

  it("handles axis-aligned rays with a zero component", () => {
    expect(rayAabb({ x: 0, y: 100, w: 100, h: 10 }, 50, 0, 0, 1)?.dist).toBeCloseTo(100);
    expect(rayAabb({ x: 0, y: 100, w: 100, h: 10 }, 500, 0, 0, 1)).toBeNull();
  });

  it("names the face it crossed", () => {
    // Coming from below, the ray crosses the box's y-facing side first.
    expect(rayAabb({ x: 0, y: 100, w: 200, h: 40 }, 100, 0, 0.2, 1)?.axis).toBe(1);
  });
});

describe("buildSolids", () => {
  const solids = buildSolids(layout);

  it("gives the building shell full height so it blocks sight", () => {
    const shell = solids.filter((s) => s.kind === "shell");
    expect(shell).toHaveLength(4);
    expect(shell.every((s) => s.height === CEILING_HEIGHT)).toBe(true);
  });

  it("keeps dividers below eye level so the floor stays readable", () => {
    const partitions = solids.filter((s) => s.kind === "partition");
    expect(partitions.length).toBeGreaterThan(0);
    expect(partitions.every((s) => s.height < EYE_HEIGHT)).toBe(true);
  });

  it("marks desks as knee-high and tags them to their room", () => {
    const desks = solids.filter((s) => s.kind === "desk");
    expect(desks.length).toBeGreaterThan(0);
    expect(desks.every((s) => s.height === DESK_HEIGHT)).toBe(true);
    expect(desks.every((s) => s.roomId !== null)).toBe(true);
  });

  it("raises the conference table above desk height and the towers to the ceiling", () => {
    const tables = solids.filter((s) => s.kind === "table");
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.every((s) => s.height > DESK_HEIGHT)).toBe(true);
    const buildings = solids.filter((s) => s.kind === "building");
    expect(buildings).toHaveLength(3);
    expect(buildings.filter((s) => s.windows === "tower")).toHaveLength(2);
    expect(buildings.some((s) => s.height === CEILING_HEIGHT)).toBe(true);
  });
});

describe("castRay", () => {
  const solids = buildSolids(layout);
  const grid = buildCastGrid(solids, layout.world);
  const out: Hit[] = [];

  it("returns hits ordered from nearest to furthest", () => {
    const room = layout.rooms[0];
    const n = castRay(grid, room.rect.x + 5, room.rect.y + 5, 1, 1, 4000, out);
    expect(n).toBeGreaterThan(0);
    for (let i = 1; i < n; i++) expect(out[i].dist).toBeGreaterThanOrEqual(out[i - 1].dist);
  });

  it("sees past a knee-high desk to what stands behind it", () => {
    const room = layout.rooms.find((r) => r.desks.length > 0 && r.zone !== "conference")!;
    const desk = room.desks[0];
    // Stand north of the desk, look south — desk first, then the far wall.
    const n = castRay(grid, desk.x + desk.w / 2, room.rect.y + 2, 0, 1, 4000, out);
    const kinds = out.slice(0, n).map((h) => h.solid.kind);
    expect(kinds[0]).toBe("desk");
    expect(kinds.length).toBeGreaterThan(1);
  });

  it("stops at the first full-height occluder", () => {
    // Fire west out of the leftmost zone: the outer shell ends the ray.
    const n = castRay(grid, layout.rooms[0].rect.x + 5, layout.rooms[0].rect.y + 5, -1, 0, 4000, out);
    expect(n).toBeGreaterThan(0);
    const last = out[n - 1];
    expect(last.solid.kind).toBe("shell");
    expect(out.slice(0, n).filter((h) => h.solid.kind === "shell")).toHaveLength(1);
  });

  it("treats a tower as a view-blocking occluder", () => {
    // Stand west of Pipeline Tower, look east through it: nothing behind survives.
    const tower = layout.buildings[0];
    const oy = tower.rect.y + tower.rect.h / 2;
    const n = castRay(grid, tower.rect.x - 30, oy, 1, 0, 4000, out);
    expect(n).toBeGreaterThan(0);
    const towerHit = out.slice(0, n).find((h) => h.solid.kind === "building");
    expect(towerHit).toBeTruthy();
    const behind = out.slice(0, n).filter((h) => h.dist > towerHit!.dist + tower.rect.w);
    expect(behind).toHaveLength(0);
  });

  it("reports a face coordinate inside the unit range", () => {
    const n = castRay(grid, layout.spawn.x, layout.spawn.y, 1, 0.3, 4000, out);
    for (let i = 0; i < n; i++) {
      expect(out[i].u).toBeGreaterThanOrEqual(0);
      expect(out[i].u).toBeLessThanOrEqual(1);
    }
  });

  it("finds nothing when the ray is shorter than the first wall", () => {
    expect(castRay(grid, layout.spawn.x, layout.spawn.y, 1, 0, 1, out)).toBe(0);
  });

  it("agrees with a brute-force scan over every solid", () => {
    const ox = layout.spawn.x;
    const oy = layout.spawn.y;
    for (const angle of [0.3, 1.1, 2.4, -0.7, -2.9]) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const n = castRay(grid, ox, oy, dx, dy, 4000, out);
      let nearest: { dist: number; solid: Solid } | null = null;
      for (const s of solids) {
        const r = rayAabb(s, ox, oy, dx, dy);
        if (r && (!nearest || r.dist < nearest.dist)) nearest = { dist: r.dist, solid: s };
      }
      expect(n).toBeGreaterThan(0);
      expect(out[0].dist).toBeCloseTo(nearest!.dist, 5);
      expect(out[0].solid).toBe(nearest!.solid);
    }
  });
});

describe("camera", () => {
  const cam = makeCamera({ x: 100, y: 100, yaw: 0, pitch: 0, width: 640, height: 360 });

  it("aims the centre column straight ahead", () => {
    const ray = columnRay(cam, cam.width / 2);
    expect(ray.dx).toBeCloseTo(1);
    expect(ray.dy).toBeCloseTo(0);
  });

  it("spreads the outer columns across the field of view", () => {
    const left = columnRay(cam, 0);
    const right = columnRay(cam, cam.width);
    expect(Math.atan2(left.dy, left.dx)).toBeCloseTo(-Math.PI / 6); // half of a 60° FOV
    expect(Math.atan2(right.dy, right.dx)).toBeCloseTo(Math.PI / 6);
  });

  it("puts the floor below the horizon and the ceiling above it", () => {
    expect(projectHeight(cam, 0, 200)).toBeGreaterThan(cam.horizon);
    expect(projectHeight(cam, 240, 200)).toBeLessThan(cam.horizon);
    expect(projectHeight(cam, EYE_HEIGHT, 200)).toBeCloseTo(cam.horizon);
  });

  it("shifts the horizon when looking up", () => {
    const up = makeCamera({ x: 100, y: 100, yaw: 0, pitch: 0.5, width: 640, height: 360 });
    expect(up.horizon).toBeGreaterThan(cam.horizon);
  });

  it("makes distant things smaller", () => {
    const near = projectHeight(cam, 0, 100) - projectHeight(cam, 132, 100);
    const far = projectHeight(cam, 0, 400) - projectHeight(cam, 132, 400);
    expect(near).toBeGreaterThan(far * 3.5);
  });
});

describe("projectSprite", () => {
  const cam = makeCamera({ x: 0, y: 0, yaw: 0, pitch: 0, width: 640, height: 360 });

  it("centres something directly ahead", () => {
    const p = projectSprite(cam, 300, 0);
    expect(p).not.toBeNull();
    expect(p!.screenX).toBeCloseTo(320);
    expect(p!.depth).toBeCloseTo(300);
  });

  it("drops anything behind the camera", () => {
    expect(projectSprite(cam, -300, 0)).toBeNull();
  });

  it("puts things to the right of the heading on the right of the screen", () => {
    // +y is to the camera's right when facing +x.
    expect(projectSprite(cam, 300, 120)!.screenX).toBeGreaterThan(320);
    expect(projectSprite(cam, 300, -120)!.screenX).toBeLessThan(320);
  });
});

describe("movement", () => {
  it("walks along the heading and strafes across it", () => {
    const fwd = moveVector(0, 1, 0, 10);
    expect(fwd.dx).toBeCloseTo(10);
    expect(fwd.dy).toBeCloseTo(0);
    const right = moveVector(0, 0, 1, 10);
    expect(right.dx).toBeCloseTo(0);
    expect(right.dy).toBeCloseTo(10);
  });

  it("never lets diagonal input outrun a straight line", () => {
    const diag = moveVector(0.7, 1, 1, 10);
    expect(Math.hypot(diag.dx, diag.dy)).toBeCloseTo(10);
  });

  it("stands still without input", () => {
    expect(moveVector(1.2, 0, 0, 10)).toEqual({ dx: 0, dy: 0 });
  });

  it("wraps angles into a half turn either way", () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });
});

describe("facingBucket", () => {
  it("shows the front when someone looks at you", () => {
    // Subject at origin looking along +x; camera stands on +x.
    expect(facingBucket(0, 200, 0, 0, 0)).toBe(0);
  });

  it("shows the back when they look away", () => {
    expect(facingBucket(Math.PI, 200, 0, 0, 0)).toBe(2);
  });

  it("shows a side profile when they look across you", () => {
    expect([1, 3]).toContain(facingBucket(Math.PI / 2, 200, 0, 0, 0));
    expect(facingBucket(Math.PI / 2, 200, 0, 0, 0)).not.toBe(
      facingBucket(-Math.PI / 2, 200, 0, 0, 0),
    );
  });
});

describe("pickTarget", () => {
  const cam = { x: 0, y: 0, dirX: 1, dirY: 0 };

  it("picks what you are looking at", () => {
    const ahead = { x: 100, y: 0, id: "ahead" };
    const behind = { x: -40, y: 0, id: "behind" };
    expect(pickTarget(cam, [behind, ahead], 200)?.id).toBe("ahead");
  });

  it("ignores anything out of range", () => {
    expect(pickTarget(cam, [{ x: 500, y: 0 }], 200)).toBeNull();
  });

  it("prefers the one you face over the one that is merely closer", () => {
    const offToTheSide = { x: 30, y: 60, id: "side" };
    const straightAhead = { x: 120, y: 0, id: "ahead" };
    expect(pickTarget(cam, [offToTheSide, straightAhead], 300)?.id).toBe("ahead");
  });
});

describe("buildFloorIndex", () => {
  const index = buildFloorIndex(layout);

  it("maps a point inside a room to that room", () => {
    const room = layout.rooms[1];
    const id = floorRoomAt(index, room.rect.x + room.rect.w / 2, room.rect.y + room.rect.h / 2);
    expect(id).toBe(2); // rooms[1] stored as index + 1
  });

  it("returns corridor for the gaps between rooms and outside the world", () => {
    const a = layout.rooms[0].rect;
    expect(floorRoomAt(index, a.x + a.w + 40, a.y + a.h + 40)).toBe(0);
    expect(floorRoomAt(index, -50, -50)).toBe(0);
    expect(floorRoomAt(index, layout.world.w + 500, 10)).toBe(0);
  });
});
