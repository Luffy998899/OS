// Can somebody actually get there?
//
// A district is authored by hand, and the failure that hurts is not a crash —
// it is a door bricked up by a sofa, a floor with no stair to it, a board
// walled off in a cupboard. None of that shows up in a block count, and by the
// time you notice in the browser you have already stamped it.
//
// So: a small solver over a district's own blocks, following the same rules
// physics.ts follows, that answers "which cells can a player stand in, and
// which of those connect to which". Test-only — nothing at runtime needs it,
// and it deliberately knows nothing about the world outside the plot.

import { BLOCKS } from "../blocks";
import { PLAYER_HEIGHT, STEP_UP } from "../physics";
import type { DistrictPlan } from "./kit";

/** A standing spot, in the district's own coordinates. */
export type Spot = { x: number; y: number; z: number };

const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;

export class Walkable {
  /** Collision height of the block in each cell; absent means air. */
  private readonly solid = new Map<string, number>();
  private readonly lo = { x: Infinity, y: Infinity, z: Infinity };
  private readonly hi = { x: -Infinity, y: -Infinity, z: -Infinity };

  constructor(plan: DistrictPlan) {
    for (let i = 0; i < plan.blocks.length; i += 4) {
      const [x, y, z, id] = plan.blocks.slice(i, i + 4);
      const def = BLOCKS[id];
      this.lo.x = Math.min(this.lo.x, x);
      this.lo.y = Math.min(this.lo.y, y);
      this.lo.z = Math.min(this.lo.z, z);
      this.hi.x = Math.max(this.hi.x, x);
      this.hi.y = Math.max(this.hi.y, y);
      this.hi.z = Math.max(this.hi.z, z);
      // A coffee cup is not a wall: only blocks that collide count.
      if (def?.solid) this.solid.set(key(x, y, z), def.height);
    }
  }

  /** How far the block in this cell rises, or 0 where there is nothing to hit. */
  private height(x: number, y: number, z: number): number {
    return this.solid.get(key(x, y, z)) ?? 0;
  }

  /** Where the player's feet rest when standing in this cell. */
  private feet(x: number, y: number, z: number): number {
    return y + this.height(x, y, z);
  }

  /**
   * Is the player's body clear in this column with their feet at this height?
   * A block only counts if it actually overlaps them, so the half-block step
   * they are standing on top of is not a block they are standing inside.
   */
  private clear(x: number, z: number, feet: number): boolean {
    const head = feet + PLAYER_HEIGHT;
    for (let c = Math.floor(feet); c < head; c++) {
      const h = this.height(x, c, z);
      if (h > 0 && c + h > feet) return false;
    }
    return true;
  }

  /**
   * Can a player stand here? They rest on whatever is in the cell — the floor
   * below it, or a step or a chair inside it, so long as it is low enough to
   * get onto — and need their full height clear above.
   */
  stands(x: number, y: number, z: number): boolean {
    const here = this.height(x, y, z);
    if (here > STEP_UP) return false; // you would be inside it
    if (here === 0 && this.height(x, y - 1, z) < 1) return false; // nothing underfoot
    return this.clear(x, z, this.feet(x, y, z));
  }

  /** Every cell reachable on foot from a starting spot, without jumping. */
  flood(from: Spot): Set<string> {
    const seen = new Set<string>();
    if (!this.stands(from.x, from.y, from.z)) return seen;
    const queue: Spot[] = [from];
    seen.add(key(from.x, from.y, from.z));
    while (queue.length > 0) {
      const at = queue.pop()!;
      const standing = this.feet(at.x, at.y, at.z);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = at.x + dx;
        const nz = at.z + dz;
        // A step up of half a block is free; a drop of any size is gravity, so
        // the landing is the highest surface that is not above the step.
        const from = Math.floor(standing + STEP_UP);
        for (let ny = from; ny >= this.lo.y - 1; ny--) {
          if (!this.stands(nx, ny, nz)) continue;
          const landing = this.feet(nx, ny, nz);
          if (landing - standing > STEP_UP) continue;
          // Mid-stride the player straddles both columns, so climbing needs
          // head room over the cell being left as well as the one being
          // entered — which is what physics.ts checks before it lets you up.
          if (landing > standing && !this.clear(at.x, at.z, landing)) continue;
          const k = key(nx, ny, nz);
          if (seen.has(k)) break;
          seen.add(k);
          queue.push({ x: nx, y: ny, z: nz });
          break; // the first surface at or below head height is the one you land on
        }
      }
    }
    return seen;
  }

  /** Every standing spot in the district, so a test can pick the biggest island. */
  allSpots(): Spot[] {
    const out: Spot[] = [];
    for (let y = this.lo.y; y <= this.hi.y + 1; y++) {
      for (let z = this.lo.z; z <= this.hi.z; z++) {
        for (let x = this.lo.x; x <= this.hi.x; x++) {
          if (this.stands(x, y, z)) out.push({ x, y, z });
        }
      }
    }
    return out;
  }

  /** The largest set of spots that all connect to each other. */
  largestIsland(): Set<string> {
    const spots = this.allSpots();
    const claimed = new Set<string>();
    let best = new Set<string>();
    for (const s of spots) {
      if (claimed.has(key(s.x, s.y, s.z))) continue;
      const island = this.flood(s);
      for (const k of island) claimed.add(k);
      if (island.size > best.size) best = island;
    }
    return best;
  }

  /**
   * How close a player standing here gets their eye to a cell — the same
   * distance the aiming ray measures, so a POI outside interact range from
   * every reachable spot is a POI nobody can open.
   */
  reach(spot: Spot, eyeHeight: number, cell: Spot): number {
    const eye = {
      x: spot.x + 0.5,
      y: this.feet(spot.x, spot.y, spot.z) + eyeHeight,
      z: spot.z + 0.5,
    };
    const clamp = (v: number, lo: number) => Math.max(lo, Math.min(lo + 1, v));
    return Math.hypot(
      eye.x - clamp(eye.x, cell.x),
      eye.y - clamp(eye.y, cell.y),
      eye.z - clamp(eye.z, cell.z),
    );
  }
}
