// The material registry for the office. Array order IS the block id — never
// reorder, only append. Tiles index into the 8x8 texture atlas painted by
// src/components/workspace/blockworld/textures.ts (16px tiles, 128x128).
//
// This is an OFFICE, not a landscape: carpet tiles, ceiling grid, glass
// partitions, desks, monitors. No grass, no dirt, no cobblestone.

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 8;
export const TILE_PX = 16;

/** Atlas tile indexes (col + row * ATLAS_COLS). Keep in sync with textures.ts. */
export const TILE = {
  CARPET_GRAY: 0,
  CARPET_BLUE: 1,
  CARPET_GREEN: 2,
  CARPET_RED: 3,
  CEILING_TILE: 4,
  CEILING_LIGHT: 5,
  DRYWALL: 6,
  DRYWALL_TRIM: 7,
  GLASS_CLEAR: 8,
  GLASS_FROSTED: 9,
  WOOD_VENEER: 10,
  WOOD_DARK: 11,
  CONCRETE: 12,
  MARBLE: 13,
  PAVING: 14,
  FACADE: 15,
  CURTAIN_WALL: 16,
  MONITOR_ON: 17,
  MONITOR_BACK: 18,
  DESK_TOP: 19,
  CHAIR: 20,
  PLANT: 21,
  PLANTER: 22,
  METAL: 23,
  ELEVATOR: 24,
  WHITEBOARD: 25,
  CORKBOARD: 26,
  BOOKS: 27,
  SERVER_RACK: 28,
  TV_SCREEN: 29,
  PANTRY: 30,
  ACOUSTIC_FELT: 31,
  CLOCK: 32,
  SIGN_STRIP: 33,
  ROOF: 34,
  STONE: 35,
  LAIR_STONE: 36,
  LAIR_VINE: 37,
  VECNA: 38,
  OBSIDIAN: 39,
  LAIR_GLOW: 40,
  WATER: 41,
  // ---- props & decoration (fills the 8x8 atlas to 64) ----
  CPU_TOWER: 42,
  PLANT_FERN: 43,
  PLANT_TALL: 44,
  POT_TERRACOTTA: 45,
  POT_WHITE: 46,
  CAMERA: 47,
  TRIPOD: 48,
  SOFTBOX: 49,
  CLAPBOARD: 50,
  MIC: 51,
  COFFEE: 52,
  PAPERS: 53,
  DESK_PHONE: 54,
  PRINTER: 55,
  WATER_COOLER: 56,
  ART_FRAME: 57,
  BOOK_STACK: 58,
  SOFA: 59,
  LAMP: 60,
  RUG_PATTERN: 61,
  VENT: 62,
  EXIT_SIGN: 63,
} as const;

export type BlockDef = {
  key: string;
  label: string;
  /** Collides with the player. */
  solid: boolean;
  /** Culls the faces of neighbouring blocks (false = glass/plants/etc). */
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

  // ---- floors ----
  cube("carpet_gray", "Grey Carpet Tile", TILE.CARPET_GRAY),
  cube("carpet_blue", "Blue Carpet Tile", TILE.CARPET_BLUE),
  cube("carpet_green", "Green Carpet Tile", TILE.CARPET_GREEN),
  cube("carpet_red", "Red Carpet Tile", TILE.CARPET_RED),
  cube("concrete", "Polished Concrete", TILE.CONCRETE),
  cube("marble", "Marble Floor", TILE.MARBLE),
  cube("paving", "Plaza Paving", TILE.PAVING),
  cube("wood_floor", "Wood Floor", TILE.WOOD_VENEER),

  // ---- walls & structure ----
  cube("drywall", "Painted Wall", TILE.DRYWALL),
  cube("drywall_accent", "Accent Wall", TILE.DRYWALL, { tint: "#4a6d8c" }),
  cube("drywall_warm", "Warm Wall", TILE.DRYWALL, { tint: "#d8c9b0" }),
  {
    key: "trim",
    label: "Wall Trim",
    solid: true,
    opaque: true,
    height: 1,
    tiles: { top: TILE.DRYWALL, bottom: TILE.DRYWALL, side: TILE.DRYWALL_TRIM },
  },
  cube("glass", "Glass Partition", TILE.GLASS_CLEAR, { opaque: false }),
  cube("glass_frosted", "Frosted Glass", TILE.GLASS_FROSTED, { opaque: false }),
  cube("curtain_wall", "Curtain Wall", TILE.CURTAIN_WALL, { opaque: false }),
  cube("facade", "Facade Panel", TILE.FACADE),
  cube("facade_blue", "Blue Facade", TILE.FACADE, { tint: "#7f95c8" }),
  cube("facade_green", "Green Facade", TILE.FACADE, { tint: "#79b07c" }),
  cube("facade_warm", "Warm Facade", TILE.FACADE, { tint: "#d0a878" }),
  cube("metal", "Brushed Metal", TILE.METAL),
  cube("elevator", "Elevator Door", TILE.ELEVATOR, { emissive: 0.12 }),
  cube("stone", "Stone", TILE.STONE),
  cube("roof", "Roof Deck", TILE.ROOF),

  // ---- ceiling ----
  cube("ceiling", "Ceiling Tile", TILE.CEILING_TILE),
  cube("ceiling_light", "Recessed Light", TILE.CEILING_LIGHT, { emissive: 1 }),

  // ---- furniture ----
  {
    key: "desk",
    label: "Desk",
    solid: true,
    opaque: false,
    height: 1,
    tiles: { top: TILE.DESK_TOP, bottom: TILE.WOOD_DARK, side: TILE.WOOD_VENEER },
  },
  {
    key: "desk_dark",
    label: "Dark Desk",
    solid: true,
    opaque: false,
    height: 1,
    tiles: { top: TILE.WOOD_DARK, bottom: TILE.WOOD_DARK, side: TILE.WOOD_DARK },
  },
  {
    key: "chair",
    label: "Office Chair",
    solid: true,
    opaque: false,
    height: 0.55,
    tiles: { top: TILE.CHAIR, bottom: TILE.METAL, side: TILE.CHAIR },
  },
  {
    key: "monitor",
    label: "Monitor",
    solid: true,
    opaque: false,
    height: 0.7,
    tiles: { top: TILE.MONITOR_BACK, bottom: TILE.MONITOR_BACK, side: TILE.MONITOR_ON },
    emissive: 0.55,
  },
  {
    key: "table",
    label: "Meeting Table",
    solid: true,
    opaque: false,
    height: 1,
    tiles: { top: TILE.WOOD_VENEER, bottom: TILE.WOOD_DARK, side: TILE.WOOD_DARK },
  },
  cube("whiteboard", "Whiteboard", TILE.WHITEBOARD),
  cube("corkboard", "Pin Board", TILE.CORKBOARD),
  cube("tv", "Wall Display", TILE.TV_SCREEN, { emissive: 0.5 }),
  cube("books", "Bookshelf", TILE.BOOKS),
  cube("server_rack", "Server Rack", TILE.SERVER_RACK, { emissive: 0.3 }),
  cube("pantry", "Pantry Counter", TILE.PANTRY),
  cube("felt", "Acoustic Felt", TILE.ACOUSTIC_FELT),
  cube("felt_orange", "Orange Felt", TILE.ACOUSTIC_FELT, { tint: "#e0a13a" }),
  cube("felt_teal", "Teal Felt", TILE.ACOUSTIC_FELT, { tint: "#4fae9c" }),
  {
    key: "clock",
    label: "Wall Clock",
    solid: true,
    opaque: true,
    height: 1,
    tiles: { top: TILE.DRYWALL, bottom: TILE.DRYWALL, side: TILE.CLOCK },
  },
  cube("sign", "Sign Strip", TILE.SIGN_STRIP, { emissive: 0.4 }),

  // ---- planting & soft ----
  cube("plant", "Office Plant", TILE.PLANT, { opaque: false, solid: false, tint: "#5da944" }),
  {
    key: "planter",
    label: "Planter",
    solid: true,
    opaque: false,
    height: 0.6,
    tiles: { top: TILE.PLANTER, bottom: TILE.PLANTER, side: TILE.PLANTER },
  },
  {
    key: "rug",
    label: "Rug",
    solid: true,
    opaque: false,
    height: 0.06,
    tiles: { top: TILE.CARPET_RED, bottom: TILE.CARPET_RED, side: TILE.CARPET_RED },
  },
  {
    key: "step",
    label: "Step",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.CONCRETE, bottom: TILE.CONCRETE, side: TILE.CONCRETE },
  },
  {
    key: "step_marble",
    label: "Marble Step",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.MARBLE, bottom: TILE.MARBLE, side: TILE.MARBLE },
  },
  cube("water", "Water", TILE.WATER, { solid: false, opaque: false, height: 0.85 }),

  // ---- desk clutter & office props ----
  {
    key: "cpu",
    label: "Desktop Tower",
    solid: true,
    opaque: false,
    height: 0.8,
    tiles: { top: TILE.METAL, bottom: TILE.METAL, side: TILE.CPU_TOWER },
    emissive: 0.18,
  },
  {
    key: "coffee",
    label: "Coffee Cup",
    solid: false,
    opaque: false,
    height: 0.25,
    tiles: { top: TILE.COFFEE, bottom: TILE.COFFEE, side: TILE.COFFEE },
  },
  {
    key: "papers",
    label: "Paperwork",
    solid: false,
    opaque: false,
    height: 0.14,
    tiles: { top: TILE.PAPERS, bottom: TILE.PAPERS, side: TILE.PAPERS },
  },
  {
    key: "phone",
    label: "Desk Phone",
    solid: false,
    opaque: false,
    height: 0.28,
    tiles: { top: TILE.DESK_PHONE, bottom: TILE.DESK_PHONE, side: TILE.DESK_PHONE },
  },
  {
    key: "book_stack",
    label: "Stacked Books",
    solid: false,
    opaque: false,
    height: 0.42,
    tiles: { top: TILE.BOOK_STACK, bottom: TILE.BOOK_STACK, side: TILE.BOOK_STACK },
  },
  {
    key: "printer",
    label: "Printer",
    solid: true,
    opaque: false,
    height: 0.7,
    tiles: { top: TILE.METAL, bottom: TILE.METAL, side: TILE.PRINTER },
  },
  cube("cooler", "Water Cooler", TILE.WATER_COOLER, { opaque: false }),
  cube("art", "Framed Art", TILE.ART_FRAME),
  cube("vent", "Ceiling Vent", TILE.VENT),
  cube("exit_sign", "Exit Sign", TILE.EXIT_SIGN, { emissive: 0.85 }),
  {
    key: "lamp",
    label: "Floor Lamp",
    solid: false,
    opaque: false,
    height: 1,
    tiles: { top: TILE.LAMP, bottom: TILE.LAMP, side: TILE.LAMP },
    emissive: 0.7,
  },
  {
    key: "sofa",
    label: "Sofa",
    solid: true,
    opaque: false,
    height: 0.6,
    tiles: { top: TILE.SOFA, bottom: TILE.SOFA, side: TILE.SOFA },
  },
  {
    key: "rug_pattern",
    label: "Patterned Rug",
    solid: true,
    opaque: false,
    height: 0.06,
    tiles: { top: TILE.RUG_PATTERN, bottom: TILE.RUG_PATTERN, side: TILE.RUG_PATTERN },
  },

  // ---- planting ----
  cube("plant_fern", "Fern", TILE.PLANT_FERN, { opaque: false, solid: false }),
  cube("plant_tall", "Tall Plant", TILE.PLANT_TALL, { opaque: false, solid: false }),
  {
    key: "pot",
    label: "Terracotta Pot",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.POT_TERRACOTTA, bottom: TILE.POT_TERRACOTTA, side: TILE.POT_TERRACOTTA },
  },
  {
    key: "pot_white",
    label: "White Pot",
    solid: true,
    opaque: false,
    height: 0.5,
    tiles: { top: TILE.POT_WHITE, bottom: TILE.POT_WHITE, side: TILE.POT_WHITE },
  },

  // ---- shoot kit ----
  {
    key: "camera",
    label: "Video Camera",
    solid: true,
    opaque: false,
    height: 0.6,
    tiles: { top: TILE.CAMERA, bottom: TILE.CAMERA, side: TILE.CAMERA },
    emissive: 0.2,
  },
  cube("tripod", "Tripod", TILE.TRIPOD, { opaque: false, solid: false }),
  cube("softbox", "Studio Light", TILE.SOFTBOX, { opaque: false, emissive: 0.95 }),
  {
    key: "clapboard",
    label: "Clapperboard",
    solid: false,
    opaque: false,
    height: 0.2,
    tiles: { top: TILE.CLAPBOARD, bottom: TILE.CLAPBOARD, side: TILE.CLAPBOARD },
  },
  {
    key: "mic",
    label: "Microphone",
    solid: false,
    opaque: false,
    height: 0.9,
    tiles: { top: TILE.MIC, bottom: TILE.MIC, side: TILE.MIC },
  },

  // ---- the Upside Down ----
  cube("lair_stone", "Upside Down Stone", TILE.LAIR_STONE),
  cube("lair_vine", "Red Vine", TILE.LAIR_VINE, { opaque: false, emissive: 0.15 }),
  cube("vecna_flesh", "Vecna Flesh", TILE.VECNA, { emissive: 0.1 }),
  cube("obsidian", "Obsidian", TILE.OBSIDIAN),
  cube("lair_glow", "Rift Light", TILE.LAIR_GLOW, { emissive: 1 }),
];

/** Block ids by key — the world builder places blocks with these. */
export const B: Record<string, number> = Object.fromEntries(
  BLOCKS.map((b, i) => [b.key, i]),
);

export const isSolid = (id: number): boolean => BLOCKS[id]?.solid ?? true;
export const solidHeight = (id: number): number =>
  BLOCKS[id]?.solid ? BLOCKS[id].height : 0;
