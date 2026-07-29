// Voxel AABB player physics. pos is the FEET position; yaw 0 faces -z with
// forward = (sin(yaw), 0, -cos(yaw)). Movement is axis-separated (x, z, y)
// with substepping so fast frames never tunnel through a block face.

import { blockAt, type Vec3, type World } from "./types";
import { solidHeight } from "./blocks";

export const PLAYER_HALF = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const GRAVITY = 24;
export const JUMP_SPEED = 8.2;
export const WALK_SPEED = 4.3;
export const SPRINT_SPEED = 6.5;
export const STEP_UP = 0.55;

export type PlayerState = { pos: Vec3; vel: Vec3; onGround: boolean };
export type MoveInput = { forward: number; strafe: number; jump: boolean; sprint: boolean };

const EPS = 0.001;
const TERMINAL_FALL = -40;
const MAX_DT = 0.05;
const MAX_SUBSTEP_MOVE = 0.25;
const AIR_CONTROL = 0.75;
const AIR_BLEND = 0.15;

type Hit = { bx: number; bz: number; top: number; bottom: number };

/** Solid blocks overlapping the AABB (strict overlap, so touching is free). */
function collect(
  w: World,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): Hit[] {
  const hits: Hit[] = [];
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ);
  for (let by = y0; by <= y1; by++) {
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) {
        const h = solidHeight(blockAt(w, bx, by, bz));
        if (h <= 0) continue;
        if (
          bx < maxX &&
          bx + 1 > minX &&
          bz < maxZ &&
          bz + 1 > minZ &&
          by < maxY &&
          by + h > minY
        ) {
          hits.push({ bx, bz, top: by + h, bottom: by });
        }
      }
    }
  }
  return hits;
}

function collectAt(w: World, x: number, y: number, z: number): Hit[] {
  return collect(
    w,
    x - PLAYER_HALF,
    y,
    z - PLAYER_HALF,
    x + PLAYER_HALF,
    y + PLAYER_HEIGHT,
    z + PLAYER_HALF,
  );
}

function maxTop(hits: Hit[]): number {
  let top = -Infinity;
  for (const h of hits) top = Math.max(top, h.top);
  return top;
}

/** Grounded auto-climb: snap feet to the obstruction top if it fits. */
function tryStepUp(w: World, st: PlayerState, nx: number, nz: number, hits: Hit[]): boolean {
  if (!st.onGround) return false;
  const top = maxTop(hits);
  if (top - st.pos.y > STEP_UP) return false;
  if (collectAt(w, nx, top, nz).length > 0) return false;
  st.pos.x = nx;
  st.pos.z = nz;
  st.pos.y = top;
  return true;
}

function moveX(w: World, st: PlayerState, dx: number): void {
  if (dx === 0) return;
  const p = st.pos;
  const nx = p.x + dx;
  const hits = collectAt(w, nx, p.y, p.z);
  if (hits.length === 0) {
    p.x = nx;
    return;
  }
  if (tryStepUp(w, st, nx, p.z, hits)) return;
  if (dx > 0) {
    let face = Infinity;
    for (const h of hits) face = Math.min(face, h.bx);
    p.x = face - PLAYER_HALF - EPS;
  } else {
    let face = -Infinity;
    for (const h of hits) face = Math.max(face, h.bx + 1);
    p.x = face + PLAYER_HALF + EPS;
  }
  st.vel.x = 0;
}

function moveZ(w: World, st: PlayerState, dz: number): void {
  if (dz === 0) return;
  const p = st.pos;
  const nz = p.z + dz;
  const hits = collectAt(w, p.x, p.y, nz);
  if (hits.length === 0) {
    p.z = nz;
    return;
  }
  if (tryStepUp(w, st, p.x, nz, hits)) return;
  if (dz > 0) {
    let face = Infinity;
    for (const h of hits) face = Math.min(face, h.bz);
    p.z = face - PLAYER_HALF - EPS;
  } else {
    let face = -Infinity;
    for (const h of hits) face = Math.max(face, h.bz + 1);
    p.z = face + PLAYER_HALF + EPS;
  }
  st.vel.z = 0;
}

function moveY(w: World, st: PlayerState, dy: number): void {
  if (dy === 0) return;
  const p = st.pos;
  const ny = p.y + dy;
  const hits = collectAt(w, p.x, ny, p.z);
  if (dy < 0) {
    if (hits.length === 0) {
      p.y = ny;
      st.onGround = false;
      return;
    }
    p.y = maxTop(hits);
    st.vel.y = 0;
    st.onGround = true;
  } else {
    st.onGround = false;
    if (hits.length === 0) {
      p.y = ny;
      return;
    }
    let bottom = Infinity;
    for (const h of hits) bottom = Math.min(bottom, h.bottom);
    p.y = bottom - PLAYER_HEIGHT - EPS;
    st.vel.y = 0;
  }
}

export function stepPlayer(
  world: World,
  st: PlayerState,
  input: MoveInput,
  yaw: number,
  dt: number,
): void {
  dt = Math.min(dt, MAX_DT);
  if (dt <= 0) return;

  let f = input.forward;
  let s = input.strafe;
  const len = Math.hypot(f, s);
  if (len > 1) {
    f /= len;
    s /= len;
  }
  const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const control = st.onGround ? 1 : AIR_CONTROL;
  const tx = (sin * f + cos * s) * speed * control;
  const tz = (-cos * f + sin * s) * speed * control;
  const blend = st.onGround ? 1 : AIR_BLEND;
  st.vel.x += (tx - st.vel.x) * blend;
  st.vel.z += (tz - st.vel.z) * blend;

  if (input.jump && st.onGround) st.vel.y = JUMP_SPEED;
  st.vel.y = Math.max(st.vel.y - GRAVITY * dt, TERMINAL_FALL);

  const maxMove =
    Math.max(Math.abs(st.vel.x), Math.abs(st.vel.y), Math.abs(st.vel.z)) * dt;
  const steps = Math.max(1, Math.ceil(maxMove / MAX_SUBSTEP_MOVE));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    moveX(world, st, st.vel.x * sdt);
    moveZ(world, st, st.vel.z * sdt);
    moveY(world, st, st.vel.y * sdt);
  }
}

/** Top solid surface (accounting partial heights) at x/z, for remote players. */
export function groundHeightAt(world: World, x: number, z: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let by = world.sy - 1; by >= 0; by--) {
    const h = solidHeight(blockAt(world, bx, by, bz));
    if (h > 0) return by + h;
  }
  return 0;
}
