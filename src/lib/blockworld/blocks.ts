// The block registry. Array order IS the block id — never reorder, only
// append. Tiles index into the 8x8 texture atlas painted by
// src/components/workspace/blockworld/textures.ts (16px tiles, 128x128).

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
export const TILE_PX = 16;

/** Atlas tile indexes (col + row * ATLAS_COLS). Keep in sync with textures.ts. */
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  PLANKS: 5,
  PLANKS_DARK: 6,
  LOG_SIDE: 7,
  LOG_TOP: 8,
  LEAVES: 9,
  GLASS: 10,
  BRICK: 11,
  SANDSTONE: 12,
  PATH: 13,
  WATER: 14,
  CONCRETE: 15,
  ROOF: 16,
  GLOWSTONE: 17,
  SCAFFOLD: 18,
  LAIR_STONE: 19,
  LAIR_VINE: 20,
  VECNA: 21,
  OBSIDIAN: 22,
  CARPET: 23,
  WHITEBOARD: 24,
  SCREEN: 25,
  BOOKS: 26,
  CLOCK: 27,
  MARBLE: 28,
  DESK_TOP: 29,
  LAIR_GLOW: 30,
  METAL: 31,
} as const;

export type BlockDef = {
  key: string;
  label: string;
  /** Collides with the player. */
  solid: boolean;
  /** Culls the faces of neighbouring blocks (false = glass/leaves/water/etc). */
  opaque: boolean;
  /** Visual + collision height, from the block's floor. 1 = full cube. */
  height: number;
  tiles: { top: number; bottom: number; side: number };
  /** Multiplied into vertex colors (hex). */
  tint?: string;
  /** 0..1: self-lit — meshing routes these faces to the emissive bucket. */
  emissive?: number;
};

const cube = (
  key: string,
  label: string,
  tile: number,
  extra?: Partial<BlockDef>,
): BlockDef => ({
  key,
  label,
  solid: true,
  opaque: true,
  height: 1,
  tiles: { top: tile, bottom: tile, side: tile },
  ...extra,
});

export const BLOCKS: BlockDef[] = [
  { key: "air", label: "Air", solid: false, opaque: false, height: 0, tiles: { top: 0, bottom: 0, side: 0 } },
  {
    key: "grass",
    label: "Grass",
    solid: true,
    opaque: true,
    height: 1,
    tiles: { top: TILE.GRASS_TOP, bottom: TILE.DIRT, side: TILE.GRASS_SIDE },
  },
  cube("dirt", "Dirt", TILE.DIRT),
  cube("stone", "Stone", TILE.STONE),
  cube("cobble", "Cobblestone", TILE.COBBLE),
  cube("planks", "Oak Planks", TILE.PLANKS),
  cube("planks_dark", "Dark Planks", TILE.PLANKS_DARK),
  {
    key: "log",
    label: "Log",
    solid: true,
    opaque: true,
    height: 1,
    tiles: { top: TILE.LOG_TOP, bottom: TILE.LOG_TOP, side: TILE.LOG_SIDE },
  },
  cube("leaves", "Leaves", TILE.LEAVES, { opaque: false, tint: "#5da944" }),
  cube("glass", "Glass", TILE.GLASS, { opaque: false }),
  cube("brick", "Brick", TILE.BRICK),
  cube("sandstone", "Sandstone", TILE.SANDSTONE),
  cube("path", "Path", TILE.PATH),
  cube("water", "Water", TILE.WATER, { solid: false, opaque: false, height: 0.85 }),
  cube("concrete_white", "White Concrete", TILE.CONCRETE, { tint: "#eceae4" }),
  cube("concrete_blue", "Blue Concrete", TILE.CONCRETE, { tint: "#7f95c8" }),
  cube("concrete_green", "Green Concrete", TILE.CONCRETE, { tint: "#79b07c" }),
  cube("concrete_red", "Red Concrete", TILE.CONCRETE, { tint: "#c98a8a" }),
  cube("concrete_yellow", "Yellow Concrete", TILE.CONCRETE, { tint: "#dcc06a" }),
  cube("concrete_purple", "Purple Concrete", TILE.CONCRETE, { tint: "#a48fd8" }),
  cube("concrete_teal", "Teal Concrete", TILE.CONCRETE, { tint: "#6fb5c0" }),
  cube("roof", "Roof Slate", TILE.ROOF),
  cube("glowstone", "Glowstone", TILE.GLOWSTONE, { emissive: 1 }),
  cube("scaffold", "Scaffolding", TILE.SCAFFOLD, { opaque: false }),
  {
    key: "slab_stone",
    label: "Stone Slab",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.STONE, bottom: TILE.STONE, side: TILE.STONE },
  },
  {
    key: "slab_plank",
    label: "Plank Slab",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.PLANKS, bottom: TILE.PLANKS, side: TILE.PLANKS },
  },
  {
    key: "slab_sandstone",
    label: "Sandstone Slab",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.SANDSTONE, bottom: TILE.SANDSTONE, side: TILE.SANDSTONE },
  },
  {
    key: "slab_dark",
    label: "Dark Slab",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.PLANKS_DARK, bottom: TILE.PLANKS_DARK, side: TILE.PLANKS_DARK },
  },
  cube("lair_stone", "Upside Down Stone", TILE.LAIR_STONE),
  cube("lair_vine", "Red Vine", TILE.LAIR_VINE, { opaque: false, emissive: 0.15 }),
  cube("vecna_flesh", "Vecna Flesh", TILE.VECNA, { emissive: 0.1 }),
  cube("obsidian", "Obsidian", TILE.OBSIDIAN),
  {
    key: "carpet_red",
    label: "Red Carpet",
    solid: true,
    opaque: false,
    height: 0.1,
    tiles: { top: TILE.CARPET, bottom: TILE.CARPET, side: TILE.CARPET },
  },
  cube("marble", "Marble", TILE.MARBLE),
  cube("whiteboard", "Whiteboard", TILE.WHITEBOARD),
  cube("screen", "Screen", TILE.SCREEN, { emissive: 0.35 }),
  cube("books", "Bookshelf", TILE.BOOKS),
  {
    key: "clock",
    label: "Clock Face",
    solid: true,
    opaque: true,
    height: 1,
    tiles: { top: TILE.SANDSTONE, bottom: TILE.SANDSTONE, side: TILE.CLOCK },
  },
  {
    key: "desk",
    label: "Desk",
    solid: true,
    opaque: true,
    height: 1,
    tiles: { top: TILE.DESK_TOP, bottom: TILE.PLANKS_DARK, side: TILE.PLANKS_DARK },
  },
  cube("lair_glow", "Rift Light", TILE.LAIR_GLOW, { emissive: 1 }),
  cube("metal", "Metal Panel", TILE.METAL),
];

/** Block ids by key — the world builder places blocks with these. */
export const B: Record<string, number> = Object.fromEntries(
  BLOCKS.map((b, i) => [b.key, i]),
);

export const isSolid = (id: number): boolean => BLOCKS[id]?.solid ?? true;
export const solidHeight = (id: number): number =>
  BLOCKS[id]?.solid ? BLOCKS[id].height : 0;
