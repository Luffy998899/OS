import { describe, it, expect } from "vitest";
import {
  buildLayout,
  resolveCollision,
  roomIdAt,
  ZONE_PLANS,
  PLAYER_RADIUS,
  type RoomInput,
  type Rect,
} from "./workspace-map";

const roomFor = (key: string, i: number): RoomInput => ({
  id: `id-${key}`,
  key,
  name: key,
  kind: "department",
  posX: i,
  posY: 0,
  missionCount: 0,
});

const ALL_KEYS = [
  "developer",
  "video-editing",
  "common-board",
  "creative",
  "tasks",
  "managing-heads",
  "timetable",
  "outreach",
  "shoot",
];

const fullCampus = buildLayout(ALL_KEYS.map(roomFor));

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

describe("campus plan", () => {
  it("places every canonical zone with no overlaps", () => {
    expect(fullCampus.rooms).toHaveLength(ALL_KEYS.length);
    for (let i = 0; i < fullCampus.rooms.length; i++) {
      for (let j = i + 1; j < fullCampus.rooms.length; j++) {
        expect(
          overlaps(fullCampus.rooms[i].rect, fullCampus.rooms[j].rect),
          `${fullCampus.rooms[i].key} overlaps ${fullCampus.rooms[j].key}`,
        ).toBe(false);
      }
    }
  });

  it("keeps every zone, board and desk inside the world", () => {
    const { world } = fullCampus;
    for (const room of fullCampus.rooms) {
      expect(room.rect.x).toBeGreaterThan(0);
      expect(room.rect.y).toBeGreaterThan(0);
      expect(room.rect.x + room.rect.w).toBeLessThan(world.w);
      expect(room.rect.y + room.rect.h).toBeLessThan(world.h);
      expect(room.board.x).toBeGreaterThan(room.rect.x - 1);
      expect(room.board.x).toBeLessThan(room.rect.x + room.rect.w + 1);
      for (const d of room.desks) {
        expect(d.x).toBeGreaterThan(room.rect.x);
        expect(d.x + d.w).toBeLessThan(room.rect.x + room.rect.w);
      }
    }
  });

  it("leaves corridor gaps between the zone bands", () => {
    // Every pair of zones must be separated by enough corridor to walk through.
    const minGap = PLAYER_RADIUS * 2 + 24;
    for (let i = 0; i < fullCampus.rooms.length; i++) {
      for (let j = i + 1; j < fullCampus.rooms.length; j++) {
        const a = fullCampus.rooms[i].rect;
        const b = fullCampus.rooms[j].rect;
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(minGap);
      }
    }
  });

  it("builds the developer city with three buildings inside the zone", () => {
    const dev = fullCampus.rooms.find((r) => r.zone === "developer")!;
    expect(fullCampus.buildings).toHaveLength(3);
    for (const b of fullCampus.buildings) {
      expect(b.rect.x).toBeGreaterThan(dev.rect.x);
      expect(b.rect.x + b.rect.w).toBeLessThan(dev.rect.x + dev.rect.w);
      expect(b.rect.y).toBeGreaterThan(dev.rect.y);
      expect(b.rect.y + b.rect.h).toBeLessThan(dev.rect.y + dev.rect.h);
      // The door spot must be standable — not inside any solid.
      const spot = resolveCollision(
        fullCampus.solids,
        b.door.x,
        b.door.y,
        b.door.x,
        b.door.y,
        fullCampus.world,
      );
      expect(spot.x).toBeCloseTo(b.door.x);
      expect(spot.y).toBeCloseTo(b.door.y);
    }
  });

  it("skips buildings when the developer zone is absent", () => {
    const noDev = buildLayout([roomFor("creative", 0)]);
    expect(noDev.buildings).toHaveLength(0);
  });

  it("spawns in open corridor with the plaza board nearby", () => {
    const { spawn, plaza, solids, world } = fullCampus;
    const stand = resolveCollision(solids, spawn.x, spawn.y, spawn.x, spawn.y, world);
    expect(stand).toEqual(spawn);
    expect(roomIdAt(fullCampus.rooms, spawn.x, spawn.y)).toBeNull();
    expect(Math.hypot(plaza.board.x - spawn.x, plaza.board.y - spawn.y)).toBeLessThan(120);
  });

  it("grows the client wing eastward and widens the world when needed", () => {
    const many = buildLayout([
      ...ALL_KEYS.map(roomFor),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        key: `client-${i}`,
        name: `Client ${i}`,
        kind: "client",
        posX: i,
        posY: 5,
        missionCount: 0,
      })),
    ]);
    const clients = many.rooms.filter((r) => r.zone === "client");
    expect(clients).toHaveLength(5);
    const xs = clients.map((r) => r.rect.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(many.world.w).toBeGreaterThan(fullCampus.world.w);
    for (const c of clients) {
      expect(c.rect.x + c.rect.w).toBeLessThan(many.world.w);
    }
  });

  it("binds legacy room keys onto their new zones", () => {
    const legacy = buildLayout([roomFor("client", 0), roomFor("creativity", 1)]);
    expect(legacy.rooms.find((r) => r.key === "client")?.zone).toBe("outreach");
    expect(legacy.rooms.find((r) => r.key === "creativity")?.zone).toBe("shoot");
  });

  it("themes each zone with its signature prop", () => {
    const propsFor = (zone: string) =>
      fullCampus.rooms.find((r) => r.zone === zone)!.props.map((p) => p.kind);
    expect(propsFor("video-editing")).toContain("npc-editor");
    expect(propsFor("video-editing")).toContain("queue-board");
    expect(propsFor("conference")).toContain("conference-screen");
    expect(propsFor("conference")).toContain("chair");
    expect(propsFor("creative")).toContain("door-clients");
    expect(propsFor("creative")).toContain("door-internal");
    expect(propsFor("creative")).toContain("infinite-board");
    expect(propsFor("tasks")).toContain("task-wall");
    expect(propsFor("managing-heads")).toContain("approval-desk");
    expect(propsFor("outreach")).toContain("outreach-desk");
    expect(propsFor("shoot")).toContain("camera-rig");
    expect(propsFor("timetable")).toContain("big-clock");
  });

  it("keeps the zone plan itself free of duplicate slots", () => {
    const zones = ZONE_PLANS.map((p) => p.zone);
    expect(new Set(zones).size).toBe(zones.length);
    for (let i = 0; i < ZONE_PLANS.length; i++) {
      for (let j = i + 1; j < ZONE_PLANS.length; j++) {
        expect(overlaps(ZONE_PLANS[i].rect, ZONE_PLANS[j].rect)).toBe(false);
      }
    }
  });
});
