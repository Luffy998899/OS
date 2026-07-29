import { describe, expect, it } from "vitest";
import { idx, type World } from "./types";
import { B } from "./blocks";
import {
  groundHeightAt,
  JUMP_SPEED,
  PLAYER_HALF,
  stepPlayer,
  type MoveInput,
  type PlayerState,
} from "./physics";

const DT = 0.05;

function makeWorld(sx = 16, sy = 8, sz = 16): World {
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

/** Stone floor at y=0 → walkable surface at y=1. */
function floorWorld(): World {
  const w = makeWorld();
  for (let z = 0; z < w.sz; z++) {
    for (let x = 0; x < w.sx; x++) set(w, x, 0, z, B.stone);
  }
  return w;
}

function player(x: number, y: number, z: number): PlayerState {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: true };
}

function inp(over: Partial<MoveInput> = {}): MoveInput {
  return { forward: 0, strafe: 0, jump: false, sprint: false, ...over };
}

describe("stepPlayer", () => {
  it("walks on flat ground staying at surface height", () => {
    const w = floorWorld();
    const st = player(8, 1, 12);
    for (let i = 0; i < 20; i++) {
      stepPlayer(w, st, inp({ forward: 1 }), 0, DT);
      expect(st.pos.y).toBeCloseTo(1, 5);
      expect(st.onGround).toBe(true);
    }
    expect(st.pos.z).toBeLessThan(12);
    expect(st.pos.x).toBeCloseTo(8, 5);
  });

  it("stops at a 1-high wall without tunneling, even at sprint with dt=0.05", () => {
    const w = floorWorld();
    for (let x = 0; x < w.sx; x++) set(w, x, 1, 5, B.brick);
    const st = player(8, 1, 8);
    for (let i = 0; i < 60; i++) {
      stepPlayer(w, st, inp({ forward: 1, sprint: true }), 0, DT);
      expect(st.pos.z).toBeGreaterThan(6);
    }
    // clamped flush against z=6 face
    expect(st.pos.z).toBeCloseTo(6 + PLAYER_HALF + 0.001, 3);
    expect(st.pos.y).toBeCloseTo(1, 5);
  });

  it("auto-steps onto a half slab while walking", () => {
    const w = floorWorld();
    for (let x = 0; x < w.sx; x++) {
      for (let z = 0; z <= 5; z++) set(w, x, 1, z, B.slab_stone);
    }
    const st = player(8, 1, 8);
    for (let i = 0; i < 40; i++) stepPlayer(w, st, inp({ forward: 1 }), 0, DT);
    expect(st.pos.z).toBeLessThan(5.5);
    expect(st.pos.y).toBeCloseTo(1.5, 5);
    expect(st.onGround).toBe(true);
  });

  it("steps onto carpet (height 0.1)", () => {
    const w = floorWorld();
    for (let x = 0; x < w.sx; x++) {
      for (let z = 0; z <= 5; z++) set(w, x, 1, z, B.carpet_red);
    }
    const st = player(8, 1, 8);
    for (let i = 0; i < 40; i++) stepPlayer(w, st, inp({ forward: 1 }), 0, DT);
    expect(st.pos.z).toBeLessThan(5.5);
    expect(st.pos.y).toBeCloseTo(1.1, 5);
    expect(st.onGround).toBe(true);
  });

  it("cannot walk or step up a 2-high wall", () => {
    const w = floorWorld();
    for (let x = 0; x < w.sx; x++) {
      set(w, x, 1, 5, B.brick);
      set(w, x, 2, 5, B.brick);
    }
    const st = player(8, 1, 8);
    for (let i = 0; i < 80; i++) {
      stepPlayer(w, st, inp({ forward: 1, sprint: true }), 0, DT);
      expect(st.pos.z).toBeGreaterThan(6);
    }
    expect(st.pos.y).toBeCloseTo(1, 5);
    expect(st.pos.z).toBeCloseTo(6 + PLAYER_HALF + 0.001, 3);
  });

  it("jumps at least 1.05 blocks and lands back on the ground", () => {
    const w = floorWorld();
    const st = player(8, 1, 8);
    stepPlayer(w, st, inp({ jump: true }), 0, DT);
    expect(st.vel.y).toBeGreaterThan(0);
    expect(st.vel.y).toBeLessThanOrEqual(JUMP_SPEED);
    let peak = st.pos.y;
    for (let i = 0; i < 60; i++) {
      stepPlayer(w, st, inp(), 0, DT);
      peak = Math.max(peak, st.pos.y);
    }
    expect(peak - 1).toBeGreaterThanOrEqual(1.05);
    expect(st.pos.y).toBeCloseTo(1, 5);
    expect(st.onGround).toBe(true);
  });

  it("walking off a ledge starts falling", () => {
    const w = makeWorld();
    for (let z = 8; z < w.sz; z++) {
      for (let x = 0; x < w.sx; x++) set(w, x, 3, z, B.stone);
    }
    const st = player(8, 4, 10);
    let fell = false;
    for (let i = 0; i < 40 && !fell; i++) {
      stepPlayer(w, st, inp({ forward: 1 }), 0, DT);
      if (!st.onGround && st.pos.y < 4) fell = true;
    }
    expect(fell).toBe(true);
    expect(st.pos.z).toBeLessThan(8 - PLAYER_HALF);
  });

  it("treats out-of-bounds x as a wall", () => {
    const w = floorWorld();
    const st = player(2, 1, 8);
    // yaw -PI/2: forward = (sin, 0, -cos) = (-1, 0, 0)
    for (let i = 0; i < 60; i++) {
      stepPlayer(w, st, inp({ forward: 1, sprint: true }), -Math.PI / 2, DT);
      expect(st.pos.x).toBeGreaterThan(PLAYER_HALF - 0.01);
    }
    expect(st.pos.x).toBeCloseTo(PLAYER_HALF + 0.001, 3);
    expect(st.pos.y).toBeCloseTo(1, 5);
  });
});

describe("groundHeightAt", () => {
  it("returns the slab top on a slab column and ground level elsewhere", () => {
    const w = floorWorld();
    set(w, 4, 0, 4, B.slab_stone); // slab replaces the floor block
    expect(groundHeightAt(w, 4.5, 4.5)).toBeCloseTo(0.5, 5);
    expect(groundHeightAt(w, 8.5, 8.5)).toBeCloseTo(1, 5);
  });

  it("returns 0 on an empty column", () => {
    const w = makeWorld();
    expect(groundHeightAt(w, 3.5, 3.5)).toBe(0);
  });
});
