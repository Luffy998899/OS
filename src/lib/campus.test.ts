import { describe, it, expect } from "vitest";
import {
  buildLayout,
  buildNavGrid,
  findPath,
  resolveCollision,
  roomIdAt,
  ZONE_PLANS,
  PLAYER_RADIUS,
  type RoomInput,
  type Rect,
  type Vec,
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

  it("spawns in the park with the plaza board nearby", () => {
    const { spawn, plaza, solids, world } = fullCampus;
    const stand = resolveCollision(solids, spawn.x, spawn.y, spawn.x, spawn.y, world);
    expect(stand).toEqual(spawn);
    expect(roomIdAt(fullCampus.rooms, spawn.x, spawn.y)).toBeNull();
    expect(Math.hypot(plaza.board.x - spawn.x, plaza.board.y - spawn.y)).toBeLessThan(180);
  });

  it("keeps the parks, fountain and trees inside the world and out of rooms", () => {
    for (const park of fullCampus.parks) {
      expect(park.x + park.w).toBeLessThan(fullCampus.world.w);
      expect(park.y + park.h).toBeLessThan(fullCampus.world.h);
    }
    for (const tree of fullCampus.trees) {
      expect(roomIdAt(fullCampus.rooms, tree.x, tree.y)).toBeNull();
    }
    expect(fullCampus.fountain.x).toBeGreaterThan(0);
  });

  it("builds sealed interiors with standable spawns", () => {
    expect(fullCampus.interiors.length).toBeGreaterThanOrEqual(4);
    for (const interior of fullCampus.interiors) {
      const { spawn: s } = interior;
      const stand = resolveCollision(fullCampus.solids, s.x, s.y, s.x, s.y, fullCampus.world);
      expect(stand, `${interior.key} spawn standable`).toEqual(s);
      // Interiors never overlap campus zones.
      for (const room of fullCampus.rooms) {
        expect(overlaps(interior.rect, room.rect), `${interior.key} vs ${room.key}`).toBe(false);
      }
    }
  });

  it("links every building and the lair through walkable portals, both ways", () => {
    // 3 buildings + lair, each with an entry and an exit portal.
    expect(fullCampus.portals).toHaveLength(8);
    for (const portal of fullCampus.portals) {
      for (const point of [portal.at, portal.to]) {
        const stand = resolveCollision(
          fullCampus.solids,
          point.x,
          point.y,
          point.x,
          point.y,
          fullCampus.world,
        );
        expect(stand, `${portal.id} @ ${point.x},${point.y}`).toEqual(point);
      }
    }
    const lairEntry = fullCampus.portals.find((p) => p.id === "enter-lair");
    expect(lairEntry?.adminOnly).toBe(true);
    // The exit back through the rift is not admin-gated — nobody gets trapped.
    expect(fullCampus.portals.find((p) => p.id === "enter-lair-exit")?.adminOnly).toBeUndefined();
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

  it("gates the lair behind the managing-heads rift", () => {
    const noHeads = buildLayout(ALL_KEYS.filter((k) => k !== "managing-heads").map(roomFor));
    expect(noHeads.portals.find((p) => p.id === "enter-lair")).toBeUndefined();
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
    expect(propsFor("managing-heads")).toContain("rift");
    expect(propsFor("creative")).toContain("writing-desk");
    expect(propsFor("video-editing")).toContain("script-terminal");
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

  it("sub-steps large moves so they cannot tunnel through a tree", () => {
    const tree = fullCampus.trees[0];
    const box = { x: tree.x - 9, y: tree.y - 7, w: 18, h: 14 };
    // Charge straight through the trunk with one huge step.
    const from = { x: box.x - PLAYER_RADIUS - 30, y: tree.y };
    const to = { x: box.x + box.w + PLAYER_RADIUS + 30, y: tree.y };
    const out = resolveCollision(fullCampus.solids, from.x, from.y, to.x, to.y, fullCampus.world);
    // Must be stopped on the near side, not teleported past the trunk.
    expect(out.x).toBeLessThan(box.x);
  });

  it("slides around a corner instead of sticking to it", () => {
    const tree = fullCampus.trees[0];
    const box = { x: tree.x - 9, y: tree.y - 7, w: 18, h: 14 };
    // Start just off the bottom-right corner, aim up-left past the trunk —
    // the exact shape of the click-to-walk jam.
    let x = box.x + box.w + PLAYER_RADIUS - 3;
    let y = box.y + box.h + PLAYER_RADIUS + 2;
    const target = { x: box.x - 80, y: box.y - 40 };
    for (let i = 0; i < 200; i++) {
      const dx = target.x - x;
      const dy = target.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 12) break;
      const step = Math.min(6, d);
      const next = resolveCollision(
        fullCampus.solids,
        x,
        y,
        x + (dx / d) * step,
        y + (dy / d) * step,
        fullCampus.world,
      );
      x = next.x;
      y = next.y;
    }
    expect(Math.hypot(target.x - x, target.y - y)).toBeLessThan(60);
  });

  it("keeps trees and the fountain clear of every wall — no pocket can trap a player", () => {
    // A tree half-buried in a wall corner once formed a cul-de-sac narrower
    // than the player. Landscape solids must stand fully clear of walls.
    const landscape: Rect[] = [
      ...fullCampus.trees.map((t) => ({ x: t.x - 9, y: t.y - 7, w: 18, h: 14 })),
      { x: fullCampus.fountain.x - 34, y: fullCampus.fountain.y - 26, w: 68, h: 52 },
    ];
    const isLandscape = (s: Rect) =>
      landscape.some((l) => l.x === s.x && l.y === s.y && l.w === s.w && l.h === s.h);
    const walls = fullCampus.solids.filter((s) => !isLandscape(s));
    const minGap = PLAYER_RADIUS * 2 + 4;
    for (const l of landscape) {
      for (const w of walls) {
        const gapX = Math.max(w.x - (l.x + l.w), l.x - (w.x + w.w));
        const gapY = Math.max(w.y - (l.y + l.h), l.y - (w.y + w.h));
        const gap = Math.max(gapX, gapY);
        expect(
          gap,
          `landscape @${l.x},${l.y} sits ${gap.toFixed(0)}px from wall @${w.x},${w.y}`,
        ).toBeGreaterThanOrEqual(minGap);
      }
    }
  });

  it("navigation: A* + local steering walks every campus route to arrival", () => {
    const nav = buildNavGrid(fullCampus);
    // The same follower loop the floor runs: chase waypoints, steer, re-plan.
    const walkArrives = (sx: number, sy: number, target: Vec): boolean => {
      let x = sx;
      let y = sy;
      let detour: 0 | 1 | -1 = 0;
      let stuck = 0;
      let repath = 0;
      let pathI = 0;
      let wayBest = Infinity;
      let wayAge = 0;
      let path = findPath(nav, x, y, target.x, target.y);
      const dt = 2.2;
      for (let f = 0; f < 8000; f++) {
        if (Math.hypot(target.x - x, target.y - y) < 12) return true;
        while (pathI < path.length - 1 && Math.hypot(path[pathI].x - x, path[pathI].y - y) < 20) {
          pathI++;
          wayBest = Infinity;
          wayAge = 0;
        }
        const aim = path[pathI] ?? target;
        const aimDist = Math.hypot(aim.x - x, aim.y - y) || 1;
        const stepLen = Math.min(1.7 * dt * 1.05, aimDist);
        const ang = Math.atan2(aim.y - y, aim.x - x);
        if (aimDist < wayBest - 4) {
          wayBest = aimDist;
          wayAge = 0;
        } else if (++wayAge > 140) {
          wayAge = 0;
          wayBest = Infinity;
          detour = 0;
          if (++repath > 4) return false;
          path = findPath(nav, x, y, target.x, target.y);
          pathI = 0;
        }
        const tryStep = (a: number) =>
          resolveCollision(
            fullCampus.solids,
            x,
            y,
            x + Math.cos(a) * stepLen,
            y + Math.sin(a) * stepLen,
            fullCampus.world,
          );
        let next = tryStep(ang);
        let progressed = Math.hypot(next.x - x, next.y - y);
        if (progressed >= stepLen * 0.55) {
          detour = 0;
        } else {
          const followSide = (side: 1 | -1): boolean => {
            for (const off of [0.6, 0.95, 1.35, 1.75]) {
              const cand = tryStep(ang + side * off);
              const pd = Math.hypot(cand.x - x, cand.y - y);
              if (pd > progressed + 0.01) {
                next = cand;
                progressed = pd;
                if (pd > stepLen * 0.55) return true;
              }
            }
            return progressed > stepLen * 0.25;
          };
          if (detour === 0) {
            const l = tryStep(ang - 0.95);
            const r = tryStep(ang + 0.95);
            detour = Math.hypot(l.x - x, l.y - y) >= Math.hypot(r.x - x, r.y - y) ? -1 : 1;
          }
          if (!followSide(detour)) {
            detour = detour === 1 ? -1 : 1;
            followSide(detour);
          }
        }
        if (progressed > 0.05) stuck = 0;
        else if (++stuck > 24) {
          stuck = 0;
          detour = 0;
          if (++repath > 4) return false;
          path = findPath(nav, x, y, target.x, target.y);
          pathI = 0;
          if (path.length === 0) return false;
        }
        x = next.x;
        y = next.y;
      }
      return false;
    };

    const points: { label: string; at: Vec }[] = [
      { label: "spawn", at: fullCampus.spawn },
      ...fullCampus.rooms.map((r) => ({
        label: r.key,
        at: { x: r.board.x, y: r.board.y + 40 },
      })),
    ];
    const targets: { label: string; at: Vec }[] = [
      ...fullCampus.buildings.map((b) => ({ label: b.key, at: b.door })),
      { label: "rift", at: { x: 2020, y: 1052 } },
      {
        label: "plaza",
        at: { x: fullCampus.plaza.board.x, y: fullCampus.plaza.board.y + 30 },
      },
      ...fullCampus.rooms.map((r) => ({
        label: `${r.key}-board`,
        at: { x: r.board.x, y: r.board.y + 40 },
      })),
    ];
    for (const p of points) {
      for (const t of targets) {
        if (p.label === t.label.replace("-board", "")) continue;
        expect(walkArrives(p.at.x, p.at.y, t.at), `${p.label} -> ${t.label}`).toBe(true);
      }
    }
    // Inside each sealed interior, the walk from arrival spawn to the exit.
    for (const interior of fullCampus.interiors) {
      const exit = interior.props.find((pr) => pr.kind === "exit-door" || pr.kind === "rift");
      if (!exit) continue;
      expect(
        walkArrives(interior.spawn.x, interior.spawn.y, { x: exit.x, y: exit.y - 14 }),
        `${interior.key} spawn -> exit`,
      ).toBe(true);
    }
  });

  it("navigation: no path leads into a sealed vault from the campus", () => {
    const nav = buildNavGrid(fullCampus);
    const lair = fullCampus.interiors.find((i) => i.theme === "lair");
    expect(lair).toBeTruthy();
    const inside = lair!.spawn;
    const path = findPath(nav, fullCampus.spawn.x, fullCampus.spawn.y, inside.x, inside.y);
    // Either no route, or the "route" cannot actually end inside the vault.
    if (path.length > 0) {
      const end = path[path.length - 1];
      const before = path.length > 1 ? path[path.length - 2] : null;
      // The final forced hop targets the true click point, but the smoothed
      // portion must stop outside the vault walls.
      if (before) {
        const withinVault =
          before.x >= lair!.rect.x &&
          before.x <= lair!.rect.x + lair!.rect.w &&
          before.y >= lair!.rect.y &&
          before.y <= lair!.rect.y + lair!.rect.h;
        expect(withinVault).toBe(false);
      }
      expect(end.x).toBe(inside.x);
    }
  });

  it("pushes a player out of a solid they were saved inside of", () => {
    const tree = fullCampus.trees[0];
    // A stale save from the old map put us dead centre in a trunk.
    const out = resolveCollision(
      fullCampus.solids,
      tree.x,
      tree.y,
      tree.x,
      tree.y,
      fullCampus.world,
    );
    const nx = Math.max(tree.x - 9, Math.min(out.x, tree.x + 9));
    const ny = Math.max(tree.y - 7, Math.min(out.y, tree.y + 7));
    expect(Math.hypot(out.x - nx, out.y - ny)).toBeGreaterThanOrEqual(PLAYER_RADIUS - 0.01);
  });
});
