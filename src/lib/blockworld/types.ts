// The Blockworld contract: shared types for the voxel campus. Everything here
// is renderer-agnostic — the world is data, Three.js only ever sees the
// buffers meshing.ts derives from it.

export type Vec3 = { x: number; y: number; z: number };

/** Which overlay a point-of-interest opens when the player interacts. */
export type PanelKind =
  | "video"
  | "city"
  | "conference"
  | "tasks"
  | "approvals"
  | "outreach"
  | "creative"
  | "shoot"
  | "timetable"
  | "docs"
  | "lair"
  | "bounties"
  | "skills"
  | "client"
  | "missions"
  | "chat"
  | "rift";

/**
 * An interactive spot in the world. The player raycasts at its AABB (block
 * coordinates, max-exclusive) and presses E. `rift` POIs teleport instead of
 * opening a panel; `adminOnly` gates both kinds client- and server-side.
 */
export type Poi = {
  id: string;
  label: string;
  sublabel?: string;
  panel: PanelKind;
  refId?: string;
  adminOnly?: boolean;
  /** For panel === "rift": where the player lands (feet, block coords). */
  teleportTo?: Vec3;
  teleportYaw?: number;
  min: Vec3;
  max: Vec3;
};

/**
 * A named volume: buildings, individual tower floors, the lair, outdoor
 * districts. Used for the HUD place name, presence roomId and lair ambience.
 * More specific (smaller volume) regions win when volumes nest.
 */
export type Region = {
  key: string;
  label: string;
  /** Database Room id for presence, when the region maps to one. */
  roomId?: string | null;
  min: Vec3;
  max: Vec3;
  /** Upside Down ambience: fog, spores, red light. */
  lair?: boolean;
};

/** Flat text rendered onto a wall by the engine (canvas texture on a plane). */
export type TextSign = {
  text: string;
  /** Anchor block-space position of the sign's centre. */
  x: number;
  y: number;
  z: number;
  /** Which way the sign FACES (the side a reader stands on). */
  face: "n" | "s" | "e" | "w";
  /** World height of the text plane in blocks (width auto from text). */
  size?: number;
  color?: string;
  bg?: string;
};

/**
 * A person standing or sitting in the office. Staff make the place look
 * inhabited; `client` NPCs are the ones you can walk up to and talk to, which
 * is how a client area becomes a route into that client's work.
 */
export type Npc = {
  id: string;
  name: string;
  /** Shown under the name: "Video Editor", "Zen Salon — Client".  */
  role: string;
  kind: "staff" | "client";
  /** Feet position, block coords (x/z are centres, y is the standing floor). */
  x: number;
  y: number;
  z: number;
  /** Heading: 0 faces -z, positive turns toward +x. */
  yaw: number;
  seated?: boolean;
  /** Colour seed for the outfit, so each person looks different. */
  hue: number;
  /** Present on client NPCs: the POI id that opens their work. */
  poiId?: string;
};

export type World = {
  sx: number;
  sy: number;
  sz: number;
  /** Block ids, indexed via idx(). */
  blocks: Uint8Array;
  /** Player feet spawn position + heading. */
  spawn: Vec3;
  spawnYaw: number;
  pois: Poi[];
  regions: Region[];
  signs: TextSign[];
  npcs: Npc[];
  /** The Upside Down volume (also flagged in regions with lair: true). */
  lair: { min: Vec3; max: Vec3 };
};

export const idx = (w: { sx: number; sz: number }, x: number, y: number, z: number): number =>
  (y * w.sz + z) * w.sx + x;

/** Out of x/z range counts as solid stone so nobody walks off the world. */
export const OUT_OF_WORLD = 3;

export function blockAt(w: World, x: number, y: number, z: number): number {
  // NaN fails every comparison below and would index the array with NaN,
  // handing callers `undefined` where they expect a block id. Treat it as
  // solid so a stray NaN stops the player instead of crashing the renderer.
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return OUT_OF_WORLD;
  if (y >= w.sy) return 0;
  if (y < 0) return OUT_OF_WORLD;
  if (x < 0 || z < 0 || x >= w.sx || z >= w.sz) return OUT_OF_WORLD;
  return w.blocks[(y * w.sz + z) * w.sx + x];
}

export function regionAt(w: World, x: number, y: number, z: number): Region | null {
  let best: Region | null = null;
  let bestVol = Infinity;
  for (const r of w.regions) {
    if (
      x >= r.min.x &&
      x < r.max.x &&
      y >= r.min.y &&
      y < r.max.y &&
      z >= r.min.z &&
      z < r.max.z
    ) {
      const vol =
        (r.max.x - r.min.x) * (r.max.y - r.min.y) * (r.max.z - r.min.z);
      if (vol < bestVol) {
        bestVol = vol;
        best = r;
      }
    }
  }
  return best;
}

export function inLair(w: World, x: number, y: number, z: number): boolean {
  const l = w.lair;
  return (
    x >= l.min.x && x < l.max.x && y >= l.min.y && y < l.max.y && z >= l.min.z && z < l.max.z
  );
}
