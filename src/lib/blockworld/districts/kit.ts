// Authoring a district.
//
// A district is a building or a room, written once as code and placed wherever
// an admin wants it. It is authored in LOCAL coordinates — 0,0,0 is its own
// north-west corner at ground level — so the same tower can be dropped anywhere
// on the map without rewriting it.
//
// Nothing here imports the renderer or Prisma: a district is pure data, the way
// src/lib/whiteboard-templates.ts is, so it can be unit tested without a canvas
// and shown in a picker without pulling in the engine.

import { B, BLOCKS } from "../blocks";
import { fillEdits, type Box, type Cell, type FillMode } from "../build-ops";
import type { PanelKind, Region, TextSign } from "../types";

/** A point of interest a district wants wired, before it has a database id. */
export type PoiDraft = {
  x: number;
  y: number;
  z: number;
  label: string;
  sublabel?: string;
  panel: PanelKind;
  refId?: string;
  adminOnly?: boolean;
};

/** Somebody standing in the district. */
export type NpcDraft = {
  key: string;
  name: string;
  role: string;
  kind: "staff" | "client";
  x: number;
  y: number;
  z: number;
  yaw: number;
  seated?: boolean;
  hue: number;
};

/** Everything a district produces, already translated into world coordinates. */
export type DistrictPlan = {
  /** Flat [x,y,z,id, …] — the format the world router speaks. */
  blocks: number[];
  signs: TextSign[];
  pois: PoiDraft[];
  regions: Region[];
  npcs: NpcDraft[];
};

export type District = {
  key: string;
  label: string;
  blurb: string;
  /** Footprint and height, so a picker can warn before it overlaps something. */
  size: { w: number; h: number; d: number };
  build: (origin: Cell) => DistrictPlan;
};

/**
 * The surface a district draws on.
 *
 * Blocks go into a scratch buffer rather than an edit list, so a later wall can
 * overwrite an earlier floor and only the final state is emitted. That also
 * makes the whole thing idempotent: stamping the same district twice produces
 * the same rows.
 */
export class Plot {
  private readonly buf: Uint8Array;
  private readonly signsOut: TextSign[] = [];
  private readonly poisOut: PoiDraft[] = [];
  private readonly regionsOut: Region[] = [];
  private readonly npcsOut: NpcDraft[] = [];

  constructor(
    readonly origin: Cell,
    readonly size: { w: number; h: number; d: number },
  ) {
    this.buf = new Uint8Array(size.w * size.h * size.d);
  }

  private idx(x: number, y: number, z: number): number {
    return (y * this.size.d + z) * this.size.w + x;
  }

  private inside(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && y >= 0 && z >= 0 && x < this.size.w && y < this.size.h && z < this.size.d
    );
  }

  /** Read a local cell. Outside the plot reads as air, so edges are harmless. */
  at(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.buf[this.idx(x, y, z)] : 0;
  }

  set(x: number, y: number, z: number, block: number): void {
    if (this.inside(x, y, z)) this.buf[this.idx(x, y, z)] = block;
  }

  /** Fill a local box. Modes are the same ones the in-game fill tool offers. */
  fill(box: Box, mode: FillMode, block: number): this {
    // The limit only exists to stop a mis-drawn in-game selection; authoring a
    // building deliberately writes more than that, so it is raised here.
    const edits = fillEdits(box, mode, block, (x, y, z) => this.at(x, y, z), 1_000_000);
    for (let i = 0; i < edits.length; i += 4) {
      this.set(edits[i], edits[i + 1], edits[i + 2], edits[i + 3]);
    }
    return this;
  }

  /** A room: floor, four walls, ceiling — the shell, hollow inside. */
  room(
    box: Box,
    mats: { floor: number; wall: number; ceiling?: number },
  ): this {
    this.fill(box, "walls", mats.wall);
    this.fill(box, "floor", mats.floor);
    if (mats.ceiling !== undefined) this.fill(box, "ceiling", mats.ceiling);
    return this;
  }

  /**
   * A band of glazing around a box at one height — what makes a tower read as
   * an office block rather than a concrete slab.
   */
  windows(box: Box, y: number, block: number, inset = 1): this {
    for (let x = box.min.x + inset; x <= box.max.x - inset; x++) {
      this.set(x, y, box.min.z, block);
      this.set(x, y, box.max.z, block);
    }
    for (let z = box.min.z + inset; z <= box.max.z - inset; z++) {
      this.set(box.min.x, y, z, block);
      this.set(box.max.x, y, z, block);
    }
    return this;
  }

  /**
   * A straight flight of steps climbing one storey.
   *
   * There is no lift: a POI cannot teleport, because `teleportTo` has no column
   * in the database. Stairs are how you get up a tower, so they have to be
   * walkable — each tread rises half a block, which the player's step-up
   * handles, and the run is carved clear above so nobody bumps their head.
   */
  stair(x: number, z: number, fromY: number, run: number, dz: 1 | -1, width = 2): this {
    for (let i = 0; i < run; i++) {
      const zz = z + i * dz;
      const y = fromY + Math.floor(i / 2);
      for (let w = 0; w < width; w++) {
        this.set(x + w, y, zz, i % 2 === 0 ? B.step : B.concrete);
        // Head room: clear the two cells above every tread.
        this.set(x + w, y + 1, zz, 0);
        this.set(x + w, y + 2, zz, 0);
        this.set(x + w, y + 3, zz, 0);
      }
    }
    return this;
  }

  sign(s: Omit<TextSign, "id">): this {
    this.signsOut.push(s);
    return this;
  }

  poi(p: PoiDraft): this {
    this.poisOut.push(p);
    return this;
  }

  region(r: Region): this {
    this.regionsOut.push(r);
    return this;
  }

  npc(n: NpcDraft): this {
    this.npcsOut.push(n);
    return this;
  }

  /** Translate everything into world space and emit it. */
  plan(): DistrictPlan {
    const { x: ox, y: oy, z: oz } = this.origin;
    const blocks: number[] = [];
    for (let y = 0; y < this.size.h; y++) {
      for (let z = 0; z < this.size.d; z++) {
        for (let x = 0; x < this.size.w; x++) {
          const id = this.buf[this.idx(x, y, z)];
          if (id !== 0) blocks.push(ox + x, oy + y, oz + z, id);
        }
      }
    }
    return {
      blocks,
      signs: this.signsOut.map((s) => ({ ...s, x: s.x + ox, y: s.y + oy, z: s.z + oz })),
      pois: this.poisOut.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy, z: p.z + oz })),
      regions: this.regionsOut.map((r) => ({
        ...r,
        min: { x: r.min.x + ox, y: r.min.y + oy, z: r.min.z + oz },
        max: { x: r.max.x + ox, y: r.max.y + oy, z: r.max.z + oz },
      })),
      npcs: this.npcsOut.map((n) => ({ ...n, x: n.x + ox, y: n.y + oy, z: n.z + oz })),
    };
  }
}

/** Local box, corners inclusive — the form every Plot method takes. */
export const box = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): Box => ({
  min: { x: Math.min(x0, x1), y: Math.min(y0, y1), z: Math.min(z0, z1) },
  max: { x: Math.max(x0, x1), y: Math.max(y0, y1), z: Math.max(z0, z1) },
});

/** Guard against a typo naming a block that does not exist. */
export function blockId(key: string): number {
  const id = B[key];
  if (id === undefined || id <= 0 || id >= BLOCKS.length) {
    throw new Error(`district used an unknown block: ${key}`);
  }
  return id;
}
