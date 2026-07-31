// Procedural 32px texture atlas for the office workspace. Every tile is
// painted from scratch with a per-tile seeded PRNG, so the atlas is
// byte-identical on every load — no image assets, no network.
//
// These are office materials: carpet tile, acoustic ceiling, painted drywall,
// glass, veneer, brushed metal. They are muted — a real floorplate is not
// saturated — but they are not flat. Every surface is built the same way a
// modern texture pack builds one:
//
//   base gradient  →  material detail (weave, grain, panels, screens)
//   →  fine noise  →  an edge bevel that gives the block a lit side.
//
// The bevel is what makes a wall read as a wall instead of a coloured square:
// each tile is lit from the top-left, so adjacent blocks show seams.
//
// Painters address a 16-unit design grid (u()) so shapes stay on a readable
// pixel scale, and drop to raw pixels (px()) for the half-unit detail the
// higher resolution buys. Only fillRect/drawImage are used — the unit tests
// rasterise these painters in Node with a software canvas that implements
// exactly that much.

import { ATLAS_COLS, ATLAS_ROWS, TILE, TILE_PX } from "@/lib/blockworld/blocks";

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;
type Painter = (c: Ctx, r: Rand) => void;

/** Size of one design-grid unit in real pixels. The grid is always 16x16. */
const U = TILE_PX / 16;

/** mulberry32 — tiny deterministic PRNG, one instance per tile. */
function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const c = el.getContext("2d");
  if (!c) throw new Error("2d canvas context unavailable");
  c.imageSmoothingEnabled = false;
  return [el, c];
}

// ---------------------------------------------------------------------------
// Colour maths. Painters name a base colour and derive their own highlight and
// shadow from it, which is what keeps a material coherent.
// ---------------------------------------------------------------------------

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const toHex = (r: number, g: number, b: number): string =>
  "#" +
  [r, g, b]
    .map((v) => clamp255(v).toString(16).padStart(2, "0"))
    .join("");

/** Lighten (positive) or darken (negative) a colour by a flat amount. */
function shade(hex: string, amount: number): string {
  const [r, g, b] = parseHex(hex);
  return toHex(r + amount, g + amount, b + amount);
}

/** Blend two colours; t=0 is `a`, t=1 is `b`. */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

/** Raw-pixel rect — for detail finer than the design grid. */
const px = (c: Ctx, x: number, y: number, w: number, h: number, color: string): void => {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
};

/** Design-grid rect: coordinates are 0..16 regardless of TILE_PX. */
const u = (c: Ctx, x: number, y: number, w: number, h: number, color: string): void => {
  px(c, x * U, y * U, w * U, h * U, color);
};

/** One design-grid cell. */
const dot = (c: Ctx, x: number, y: number, color: string): void => u(c, x, y, 1, 1, color);

const fill = (c: Ctx, color: string): void => px(c, 0, 0, TILE_PX, TILE_PX, color);

const pick = <T,>(r: Rand, items: T[]): T => items[Math.floor(r() * items.length)];

/** Distance from the tile centre, in design-grid units. */
const dist = (x: number, y: number): number => Math.hypot(x - 7.5, y - 7.5);

/** A vertical gradient across the whole tile, one fillRect per pixel row. */
function vgrad(c: Ctx, top: string, bottom: string): void {
  for (let y = 0; y < TILE_PX; y++) {
    px(c, 0, y, TILE_PX, 1, mix(top, bottom, y / (TILE_PX - 1)));
  }
}

/** A horizontal gradient across the whole tile. */
function hgrad(c: Ctx, left: string, right: string): void {
  for (let x = 0; x < TILE_PX; x++) {
    px(c, x, 0, 1, TILE_PX, mix(left, right, x / (TILE_PX - 1)));
  }
}

/** Per-pixel luminance noise over whatever is already painted. */
function grain(c: Ctx, r: Rand, amount: number, chance = 1): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (r() > chance) continue;
      const n = (r() - 0.5) * 2 * amount;
      px(c, x, y, 1, 1, `rgba(${n > 0 ? 255 : 0},${n > 0 ? 255 : 0},${n > 0 ? 255 : 0},${Math.abs(n) / 255})`);
    }
  }
}

/** Per-pixel speckle in named colours — flecks in carpet, chips in stone. */
function speckle(c: Ctx, r: Rand, colors: string[], chance: number): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (r() < chance) px(c, x, y, 1, 1, pick(r, colors));
    }
  }
}

/**
 * Light the tile from the top-left: a highlight along the top and left edges,
 * a shadow along the bottom and right. This is the single thing that makes a
 * flat colour read as a solid block.
 */
function bevel(c: Ctx, light: string, dark: string, w = 1, alpha = 1): void {
  const l = alpha >= 1 ? light : withAlpha(light, alpha);
  const d = alpha >= 1 ? dark : withAlpha(dark, alpha);
  px(c, 0, 0, TILE_PX, w, l);
  px(c, 0, 0, w, TILE_PX, l);
  px(c, 0, TILE_PX - w, TILE_PX, w, d);
  px(c, TILE_PX - w, 0, w, TILE_PX, d);
}

function withAlpha(hex: string, a: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** A `w`-pixel border hugging the tile edge — bezels, frames, mullions. */
function border(c: Ctx, color: string, w: number): void {
  px(c, 0, 0, TILE_PX, w, color);
  px(c, 0, TILE_PX - w, TILE_PX, w, color);
  px(c, 0, 0, w, TILE_PX, color);
  px(c, TILE_PX - w, 0, w, TILE_PX, color);
}

/** Multiply every existing pixel's alpha by `alpha` (glass, water). */
function fadeAlpha(c: Ctx, alpha: number): void {
  c.globalCompositeOperation = "destination-in";
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  c.fillRect(0, 0, TILE_PX, TILE_PX);
  c.globalCompositeOperation = "source-over";
}

/** A short random walk of dark pixels — cracks in stone-like tiles. */
function crack(c: Ctx, r: Rand, color: string): void {
  let x = 2 + Math.floor(r() * 12);
  let y = 2 + Math.floor(r() * 12);
  const vertical = r() < 0.5;
  const steps = 5 + Math.floor(r() * 5);
  for (let i = 0; i < steps; i++) {
    px(c, x * U, y * U, U, U, color);
    if (vertical) {
      y += 1;
      x += r() < 0.4 ? (r() < 0.5 ? 1 : -1) : 0;
    } else {
      x += 1;
      y += r() < 0.4 ? (r() < 0.5 ? 1 : -1) : 0;
    }
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
  }
}

// ---------------------------------------------------------------------------
// Material recipes shared by several tiles
// ---------------------------------------------------------------------------

/**
 * Loop-pile carpet tile: a woven base, colour flecks, and a darker seam on the
 * top and left edges so a laid floor shows its grid.
 */
function carpet(c: Ctx, r: Rand, base: string, flecks: string[]): void {
  vgrad(c, shade(base, 6), shade(base, -6));
  // The weave: alternating pixel rows and columns, very low contrast.
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if ((x + y) % 2 === 0) continue;
      px(c, x, y, 1, 1, `rgba(0,0,0,${(x % 4 === 0 ? 0.05 : 0.03).toFixed(2)})`);
    }
  }
  speckle(c, r, flecks, 0.16);
  grain(c, r, 10, 0.5);
  // Seam: the cut edge of the tile, darker on two sides only.
  const seam = shade(base, -30);
  px(c, 0, 0, TILE_PX, U / 2 || 1, seam);
  px(c, 0, 0, U / 2 || 1, TILE_PX, seam);
}

/** Flat painted plaster: soft vertical wash, roller texture, corner bevel. */
function paintedWall(c: Ctx, r: Rand, base: string): void {
  vgrad(c, shade(base, 8), shade(base, -8));
  grain(c, r, 7, 0.7);
  // Faint roller streaks.
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(r() * TILE_PX);
    px(c, x, 0, 1, TILE_PX, `rgba(255,255,255,0.05)`);
  }
  bevel(c, shade(base, 16), shade(base, -20), 1);
}

/** Wood veneer with a run of grain lines along one axis. */
function veneer(c: Ctx, r: Rand, base: string, dark: string, light: string): void {
  vgrad(c, shade(base, 8), shade(base, -8));
  // Long grain, drifting slightly so it never looks like a barcode.
  for (let g = 0; g < 7; g++) {
    let y = Math.floor(r() * TILE_PX);
    const tone = r() < 0.5 ? dark : light;
    const a = 0.18 + r() * 0.22;
    for (let x = 0; x < TILE_PX; x++) {
      if (r() < 0.12) y += r() < 0.5 ? 1 : -1;
      if (y < 0 || y >= TILE_PX) continue;
      px(c, x, y, 1, 1, withAlpha(tone, a));
    }
  }
  // Board seam across the plank, and the lit edge.
  px(c, 0, 0, TILE_PX, 1, shade(base, -26));
  grain(c, r, 6, 0.4);
  bevel(c, shade(base, 14), shade(base, -18), 1);
}

/** Brushed metal: a directional sheen plus fine scratches. */
function brushed(c: Ctx, r: Rand, base: string): void {
  hgrad(c, shade(base, -10), shade(base, 10));
  for (let y = 0; y < TILE_PX; y++) {
    const a = 0.05 + r() * 0.1;
    px(c, 0, y, TILE_PX, 1, r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  }
  // A brighter band where the light catches it.
  px(c, 0, Math.floor(TILE_PX * 0.28), TILE_PX, 2, "rgba(255,255,255,0.14)");
  grain(c, r, 6, 0.5);
  bevel(c, shade(base, 22), shade(base, -22), 1);
}

/** A lit screen: dark bezel, glowing panel, scanlines and window chrome. */
function screen(c: Ctx, r: Rand, glow: string, chrome: string[]): void {
  const bezel = "#15181e";
  fill(c, bezel);
  vgrad(c, shade(bezel, 14), shade(bezel, -6));
  // Panel inset.
  const m = 2 * U;
  px(c, m, m, TILE_PX - m * 2, TILE_PX - m * 2 - U, glow);
  // Content: a couple of window bars in different accent colours.
  let y = m + U;
  for (const col of chrome) {
    const w = Math.floor((TILE_PX - m * 2) * (0.35 + r() * 0.5));
    px(c, m + U, y, w, U, col);
    y += U * 2;
  }
  // Scanlines keep the panel from reading as a flat rectangle.
  for (let sy = m; sy < TILE_PX - m - U; sy += 2) {
    px(c, m, sy, TILE_PX - m * 2, 1, "rgba(0,0,0,0.10)");
  }
  // Glass reflection down the top-left corner.
  for (let i = 0; i < 5; i++) {
    px(c, m + i, m, 1, Math.floor((TILE_PX - m * 2) * 0.5) - i * 2, "rgba(255,255,255,0.08)");
  }
  // Stand foot along the bottom.
  px(c, 0, TILE_PX - U, TILE_PX, U, shade(bezel, -4));
  px(c, Math.floor(TILE_PX * 0.35), TILE_PX - U, Math.floor(TILE_PX * 0.3), U, shade(bezel, 18));
  bevel(c, "#39404c", "#080a0e", 1);
  // A monitor's top bezel is the darkest edge on it, so it keeps its own line
  // rather than the generic lit edge every other block gets.
  px(c, 0, 0, TILE_PX, 1, "#12151a");
}

/** Foliage: a clump of leaves on a transparent field, cut round the edges. */
function foliage(c: Ctx, r: Rand, tones: string[], density: number): void {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = dist(x, y);
      if (d > 7.6) continue;
      // Thins toward the rim so the clump has a soft edge rather than a disc.
      if (r() > density - d * 0.03) continue;
      dot(c, x, y, pick(r, tones));
    }
  }
  // A stem so the clump is attached to something.
  const stem = tones[tones.length - 1];
  u(c, 7, 9, 2, 7, shade(stem, -24));
}

// ---------------------------------------------------------------------------
// The painters — one per atlas tile
// ---------------------------------------------------------------------------

const PAINTERS: Record<keyof typeof TILE, Painter> = {
  // ---- floors ----
  CARPET_GRAY: (c, r) => carpet(c, r, "#8b8d91", ["#7e8085", "#96989c", "#84868b"]),
  CARPET_BLUE: (c, r) => carpet(c, r, "#657b9c", ["#5a6f8f", "#7288a8", "#5f7493"]),
  CARPET_GREEN: (c, r) => carpet(c, r, "#6b8e74", ["#5f8168", "#78997f", "#648a6d"]),
  CARPET_RED: (c, r) => carpet(c, r, "#9c6866", ["#8d5d5c", "#a97674", "#95615f"]),

  CEILING_TILE: (c, r) => {
    // Mineral-fibre acoustic tile: near-white, finely pitted, dark grid edge.
    vgrad(c, "#f2f0eb", "#e4e2dc");
    speckle(c, r, ["#e0ded7", "#eae8e1", "#d8d6cf"], 0.3);
    grain(c, r, 8, 0.6);
    // The T-bar grid: a dark channel on the top and left.
    px(c, 0, 0, TILE_PX, U, "#c3c1ba");
    px(c, 0, 0, U, TILE_PX, "#c3c1ba");
    px(c, 0, 0, TILE_PX, 1, "#a9a7a0");
    px(c, 0, 0, 1, TILE_PX, "#a9a7a0");
    // The lit face of the T-bar.
    px(c, 0, U, TILE_PX, 1, "#fbfaf6");
    px(c, U, 0, 1, TILE_PX, "#fbfaf6");
  },

  CEILING_LIGHT: (c) => {
    // Recessed LED panel: a bright diffuser inside the same grid.
    fill(c, "#cfcdc6");
    px(c, 0, 0, TILE_PX, U, "#b6b4ad");
    px(c, 0, 0, U, TILE_PX, "#b6b4ad");
    const m = U;
    px(c, m, m, TILE_PX - m * 2, TILE_PX - m * 2, "#fff8e2");
    // Hot centre falling off to the frame, so it reads as emitting.
    for (let i = 0; i < 5; i++) {
      const k = m + 1 + i;
      const size = TILE_PX - k * 2;
      if (size <= 0) break;
      px(c, k, k, size, size, `rgba(255,255,255,${0.14 + i * 0.06})`);
    }
    px(c, m, m, TILE_PX - m * 2, 1, "rgba(255,255,255,0.85)");
  },

  // ---- walls ----
  DRYWALL: (c, r) => paintedWall(c, r, "#e6e4df"),

  DRYWALL_TRIM: (c, r) => {
    // Painted wall over a darker skirting board.
    paintedWall(c, r, "#e8e6e1");
    const skirt = Math.floor(TILE_PX * 0.78);
    px(c, 0, skirt, TILE_PX, TILE_PX - skirt, "#b9b6ae");
    px(c, 0, skirt, TILE_PX, 1, "#d7d4cc");
    px(c, 0, TILE_PX - 1, TILE_PX, 1, "#918e87");
    grain(c, r, 6, 0.3);
  },

  GLASS_CLEAR: (c) => {
    // Mostly air with a cool tint, a frame, and one diagonal highlight.
    fill(c, "#cfe3ec");
    border(c, "#9fb6c2", U);
    for (let i = 0; i < TILE_PX; i++) {
      px(c, i, TILE_PX - 1 - i, 2, 2, "rgba(255,255,255,0.9)");
    }
    fadeAlpha(c, 0.17);
  },

  GLASS_FROSTED: (c, r) => {
    fill(c, "#dbe6ea");
    speckle(c, r, ["#e8f0f3", "#cfdde2", "#f2f7f9"], 0.5);
    grain(c, r, 10, 0.8);
    border(c, "#b9c9d1", U);
    fadeAlpha(c, 0.6);
  },

  CURTAIN_WALL: (c) => {
    // Spandrel glazing: tinted panel inside a heavy aluminium mullion.
    vgrad(c, "#93b3cb", "#7a9cb6");
    border(c, "#8e969c", U);
    px(c, 0, 0, TILE_PX, 1, "#c2cad0");
    px(c, TILE_PX - 1, 0, 1, TILE_PX, "#666d73");
    // The sky reflection in the top half.
    px(c, U, U, TILE_PX - U * 2, Math.floor(TILE_PX * 0.34), "rgba(255,255,255,0.22)");
    px(c, U, U, TILE_PX - U * 2, 2, "rgba(255,255,255,0.4)");
    fadeAlpha(c, 0.78);
  },

  // ---- timber + hard floors ----
  WOOD_VENEER: (c, r) => veneer(c, r, "#b98d55", "#8d6539", "#d3ab73"),
  WOOD_DARK: (c, r) => veneer(c, r, "#6d4f33", "#4d3722", "#8a684a"),

  CONCRETE: (c, r) => {
    vgrad(c, "#a4a4a1", "#918f8c");
    speckle(c, r, ["#8e8c89", "#adaba7", "#999794"], 0.35);
    grain(c, r, 9, 0.7);
    crack(c, r, "rgba(90,90,88,0.5)");
    bevel(c, "#b6b6b3", "#75736f", 1);
  },

  MARBLE: (c, r) => {
    vgrad(c, "#eeeae1", "#ded9cf");
    // Veining: pale grey rivers wandering across the slab.
    for (let v = 0; v < 3; v++) {
      let y = Math.floor(r() * TILE_PX);
      const a = 0.2 + r() * 0.2;
      for (let x = 0; x < TILE_PX; x++) {
        if (r() < 0.35) y += r() < 0.5 ? 1 : -1;
        if (y < 0 || y >= TILE_PX) continue;
        px(c, x, y, 1, 1, `rgba(150,146,138,${a})`);
        px(c, x, y + 1, 1, 1, `rgba(150,146,138,${a * 0.4})`);
      }
    }
    grain(c, r, 5, 0.4);
    bevel(c, "#ffffff", "#bcb7ac", 1);
  },

  PAVING: (c, r) => {
    vgrad(c, "#adaaa2", "#9b9890");
    speckle(c, r, ["#a4a199", "#b5b2aa", "#96938c"], 0.4);
    grain(c, r, 8, 0.6);
    // Slab joint on two sides.
    px(c, 0, 0, TILE_PX, U, "#84817a");
    px(c, 0, 0, U, TILE_PX, "#84817a");
    px(c, 0, U, TILE_PX, 1, "#bdbab2");
  },

  // ---- envelope ----
  FACADE: (c, r) => {
    // Precast panel with a shadow gap between units.
    vgrad(c, "#c2c5c9", "#a9acb1");
    grain(c, r, 7, 0.5);
    px(c, 0, 0, TILE_PX, U, "#8f9297");
    px(c, 0, U, TILE_PX, 1, "#d3d6da");
    px(c, 0, 0, U, TILE_PX, "#9a9da2");
    bevel(c, "#d8dbdf", "#83868b", 1);
  },

  // ---- workstation ----
  MONITOR_ON: (c, r) => screen(c, r, "#1d3f63", ["#5fa8e0", "#8fd0a8", "#e0b45f"]),

  MONITOR_BACK: (c, r) => {
    vgrad(c, "#31363f", "#22262d");
    grain(c, r, 6, 0.4);
    // Vent slots and the stand column.
    for (let y = 4; y < 11; y += 2) u(c, 4, y, 8, 1, "rgba(0,0,0,0.35)");
    u(c, 7, 11, 2, 4, "#3a4049");
    u(c, 5, 15, 6, 1, "#454b55");
    bevel(c, "#474d57", "#14171b", 1);
  },

  DESK_TOP: (c, r) => {
    veneer(c, r, "#b08a54", "#8a6539", "#c9a370");
    // The edge banding of a desk, so the top reads as a slab.
    px(c, 0, TILE_PX - U, TILE_PX, U, "#8c6b41");
    px(c, 0, TILE_PX - U, TILE_PX, 1, "#c8a877");
  },

  CHAIR: (c, r) => {
    // Moulded task-chair shell in dark mesh.
    vgrad(c, "#565a61", "#3d4046");
    for (let y = 0; y < TILE_PX; y += 2)
      for (let x = 0; x < TILE_PX; x += 2) px(c, x, y, 1, 1, "rgba(0,0,0,0.22)");
    grain(c, r, 6, 0.4);
    // Lumbar band across the back.
    px(c, 0, Math.floor(TILE_PX * 0.55), TILE_PX, U, "#2f3238");
    px(c, 0, Math.floor(TILE_PX * 0.55), TILE_PX, 1, "#6c717a");
    bevel(c, "#6e737c", "#26282d", 1);
  },

  CPU_TOWER: (c, r) => {
    vgrad(c, "#3a3f47", "#2a2e34");
    grain(c, r, 6, 0.4);
    // Front panel: mesh intake, power LED, a drive slot.
    u(c, 2, 2, 12, 7, "#2f343a");
    for (let y = 2; y < 9; y++)
      for (let x = 2; x < 14; x++) if ((x + y) % 2 === 0) dot(c, x, y, "#262a30");
    u(c, 3, 11, 10, 1, "#4a5058");
    dot(c, 12, 13, "#63d6a0");
    dot(c, 3, 13, "#4f555d");
    bevel(c, "#4d535c", "#1b1e22", 1);
  },

  // ---- plants ----
  PLANT: (c, r) => foliage(c, r, ["#5da944", "#4d9138", "#6cbc50", "#3f7a2e"], 0.98),
  PLANT_FERN: (c, r) => foliage(c, r, ["#4f9b46", "#5fae53", "#3f8438"], 0.95),
  PLANT_TALL: (c, r) => foliage(c, r, ["#57a84d", "#68b95c", "#46903d"], 1.0),

  PLANTER: (c, r) => {
    vgrad(c, shade("#a8785c", 12), shade("#a8785c", -14));
    grain(c, r, 8, 0.5);
    // Rim, then the soil line just under it.
    px(c, 0, 0, TILE_PX, U, "#8e6247");
    px(c, 0, U, TILE_PX, U, "#4a3527");
    px(c, 0, 0, TILE_PX, 1, "#c39a7d");
    bevel(c, "#c49a7b", "#7a533b", 1);
  },

  POT_TERRACOTTA: (c, r) => {
    vgrad(c, "#c07a4f", "#a3623c");
    grain(c, r, 8, 0.5);
    px(c, 0, 0, TILE_PX, U + 1, "#b16a42");
    px(c, 0, 0, TILE_PX, 1, "#d69368");
    px(c, 0, U + 1, TILE_PX, U, "#4a3527");
    bevel(c, "#d0895c", "#7d4a2c", 1);
  },

  POT_WHITE: (c, r) => {
    vgrad(c, "#e3dfd7", "#cbc6bc");
    grain(c, r, 6, 0.4);
    px(c, 0, 0, TILE_PX, U + 1, "#d5d0c6");
    px(c, 0, 0, TILE_PX, 1, "#f5f2ec");
    px(c, 0, U + 1, TILE_PX, U, "#4a3527");
    bevel(c, "#f3f0ea", "#a9a49a", 1);
  },

  // ---- metals + fittings ----
  METAL: (c, r) => brushed(c, r, "#9aa0a6"),

  ELEVATOR: (c, r) => {
    brushed(c, r, "#b0b6bc");
    // The leaf joint down the middle of a pair of lift doors.
    const m = Math.floor(TILE_PX / 2);
    px(c, m - 1, 0, 1, TILE_PX, "#7f858b");
    px(c, m, 0, 1, TILE_PX, "#d2d7dc");
    // Sill at the bottom.
    px(c, 0, TILE_PX - U, TILE_PX, U, "#8a9096");
  },

  WHITEBOARD: (c, r) => {
    vgrad(c, "#fbfaf6", "#eceada");
    grain(c, r, 4, 0.3);
    // Ghosted marker strokes, and the aluminium tray along the bottom.
    u(c, 3, 4, 6, 1, "rgba(70,110,170,0.30)");
    u(c, 3, 6, 9, 1, "rgba(70,110,170,0.20)");
    u(c, 3, 8, 4, 1, "rgba(190,80,70,0.24)");
    px(c, 0, TILE_PX - U * 2, TILE_PX, U, "#c9ccd0");
    px(c, 0, TILE_PX - U * 2, TILE_PX, 1, "#eceef0");
    px(c, 0, TILE_PX - U, TILE_PX, U, "#9aa0a6");
    bevel(c, "#ffffff", "#b9b7ad", 1);
  },

  CORKBOARD: (c, r) => {
    vgrad(c, "#cba677", "#b08e60");
    speckle(c, r, ["#b8955f", "#d8b98d", "#a6844f"], 0.45);
    grain(c, r, 10, 0.7);
    // Pinned notes with their pins.
    u(c, 2, 3, 4, 4, "#f4f1e6");
    u(c, 9, 5, 5, 4, "#eef3f6");
    dot(c, 4, 3, "#c8443c");
    dot(c, 11, 5, "#3f6fbf");
    // Aluminium frame.
    border(c, "#8d7047", U);
    px(c, 0, 0, TILE_PX, 1, "#bda079");
  },

  BOOKS: (c, r) => {
    fill(c, "#5a4636");
    // A shelf of spines in different heights and colours.
    const spines = ["#8a5a3a", "#4f6b8a", "#7a5a86", "#4a7a5a", "#a3703f", "#63566f"];
    let x = 0;
    while (x < TILE_PX) {
      const w = U + Math.floor(r() * 2) * U;
      const col = pick(r, spines);
      const top = Math.floor(r() * 2) * U;
      px(c, x, top, Math.min(w, TILE_PX - x), TILE_PX - top, col);
      px(c, x, top, 1, TILE_PX - top, shade(col, 22));
      px(c, x + w - 1, top, 1, TILE_PX - top, shade(col, -22));
      // A band across the spine, the way book cloth is stamped.
      px(c, x, top + Math.floor((TILE_PX - top) * 0.3), w, 1, shade(col, 30));
      x += w;
    }
    px(c, 0, TILE_PX - U, TILE_PX, U, "#3d2f24");
    grain(c, r, 6, 0.3);
  },

  BOOK_STACK: (c, r) => {
    fill(c, "#6b4a7a");
    // Books lying flat, seen from the side.
    const layers = ["#6b4a7a", "#4a6b7a", "#7a6b4a", "#7a4a5a"];
    let y = TILE_PX;
    let i = 0;
    while (y > 0 && i < layers.length) {
      const h = U + Math.floor(r() * 2) * U;
      y -= h;
      px(c, 0, y, TILE_PX, h, layers[i]);
      px(c, 0, y, TILE_PX, 1, shade(layers[i], 26));
      px(c, 0, y + h - 1, TILE_PX, 1, shade(layers[i], -26));
      // The page block on one side.
      px(c, TILE_PX - U, y + 1, U, h - 2, "#e6e0d2");
      i++;
    }
    grain(c, r, 5, 0.3);
  },

  SERVER_RACK: (c, r) => {
    vgrad(c, "#31363d", "#22262b");
    grain(c, r, 5, 0.4);
    // Rack units with vents and status LEDs.
    for (let uy = 1; uy < 15; uy += 3) {
      u(c, 1, uy, 14, 2, "#2a2e34");
      // Vent slots across the face of each rack unit.
      for (let x = 3; x < 12; x++) dot(c, x, uy, "#232730");
      dot(c, 13, uy, r() < 0.5 ? "#4ade80" : "#f5b544");
      dot(c, 1, uy, "#3c424a");
    }
    bevel(c, "#454b53", "#15181c", 1);
  },

  TV_SCREEN: (c, r) => screen(c, r, "#20242e", ["#7f8ea8", "#5c6a80"]),

  PANTRY: (c, r) => {
    // Laminate cabinet fronts with a handle line.
    vgrad(c, "#d2ccbf", "#bcb5a6");
    grain(c, r, 7, 0.5);
    const m = Math.floor(TILE_PX / 2);
    px(c, m - 1, 0, 2, TILE_PX, "#a8a194");
    px(c, m, 0, 1, TILE_PX, "#e0dacd");
    u(c, 2, 7, 4, 1, "#8d8779");
    u(c, 10, 7, 4, 1, "#8d8779");
    bevel(c, "#e8e2d6", "#9b9587", 1);
  },

  ACOUSTIC_FELT: (c, r) => {
    vgrad(c, "#a3a09b", "#8f8c87");
    // Felt is fibrous: dense short strokes, no sheen at all.
    for (let i = 0; i < TILE_PX * 6; i++) {
      const x = Math.floor(r() * TILE_PX);
      const y = Math.floor(r() * TILE_PX);
      px(c, x, y, 1, 1 + Math.floor(r() * 2), r() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)");
    }
    grain(c, r, 9, 0.8);
    px(c, 0, 0, TILE_PX, 1, "rgba(255,255,255,0.12)");
  },

  CLOCK: (c, r) => {
    // Wall clock: white face, dark ring, hands at ten-past-ten.
    fill(c, "#e9e7e1");
    vgrad(c, "#f4f2ec", "#dedbd4");
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = dist(x, y);
        // Wall, dark outer case, brushed bezel, then the white face — filled,
        // not a ring, so the dial reads from across the room.
        if (d > 7.4) dot(c, x, y, "#d5d2cb");
        else if (d > 6.8) dot(c, x, y, "#2f333a");
        else if (d > 6.0) dot(c, x, y, "#7c828a");
        else dot(c, x, y, "#fbfaf7");
      }
    // Hour ticks at the quarters.
    for (const [x, y] of [
      [7, 2],
      [7, 13],
      [2, 7],
      [13, 7],
    ] as const)
      dot(c, x, y, "#2f333a");
    // Hands.
    u(c, 7, 5, 1, 3, "#22262b");
    u(c, 8, 7, 3, 1, "#22262b");
    u(c, 7, 7, 1, 1, "#c0392b");
    grain(c, r, 4, 0.2);
  },

  SIGN_STRIP: (c) => {
    // Illuminated door strip: dark housing, a bright band across the middle.
    fill(c, "#22262c");
    vgrad(c, "#2b3037", "#1b1e23");
    const top = Math.floor(TILE_PX * 0.34);
    const h = Math.floor(TILE_PX * 0.32);
    px(c, 0, top, TILE_PX, h, "#f7f3e4");
    px(c, 0, top, TILE_PX, 1, "#ffffff");
    px(c, 0, top + h - 1, TILE_PX, 1, "#cfc9b4");
    // Diffuser falloff into the housing.
    px(c, 0, top - 1, TILE_PX, 1, "rgba(247,243,228,0.5)");
    px(c, 0, top + h, TILE_PX, 1, "rgba(247,243,228,0.5)");
  },

  ROOF: (c, r) => {
    // Single-ply membrane with welded seams and ballast grit.
    vgrad(c, "#525860", "#414750");
    speckle(c, r, ["#474d55", "#5b6169", "#3c424a"], 0.4);
    grain(c, r, 8, 0.6);
    px(c, 0, Math.floor(TILE_PX * 0.5), TILE_PX, 1, "#333940");
    px(c, 0, Math.floor(TILE_PX * 0.5) + 1, TILE_PX, 1, "#5f656d");
    bevel(c, "#646a72", "#31363d", 1);
  },

  STONE: (c, r) => {
    vgrad(c, "#95958f", "#7e7e79");
    speckle(c, r, ["#8a8a85", "#a0a09a", "#767671"], 0.45);
    grain(c, r, 10, 0.7);
    crack(c, r, "rgba(70,70,66,0.55)");
    crack(c, r, "rgba(70,70,66,0.4)");
    bevel(c, "#a6a6a0", "#65655f", 1);
  },

  // ---- the Upside Down ----
  LAIR_STONE: (c, r) => {
    vgrad(c, "#2b2130", "#1c1521");
    speckle(c, r, ["#241c29", "#332639", "#191320"], 0.45);
    grain(c, r, 8, 0.6);
    // Wet, veined surface.
    for (let i = 0; i < 3; i++) crack(c, r, "rgba(110,30,50,0.45)");
    bevel(c, "#3a2c42", "#120d16", 1);
  },

  LAIR_VINE: (c, r) => {
    fill(c, "#2a1420");
    // Sinew running down the tile, splitting as it goes.
    for (let s = 0; s < 4; s++) {
      let x = 2 + Math.floor(r() * 12);
      for (let y = 0; y < 16; y++) {
        if (r() < 0.3) x += r() < 0.5 ? 1 : -1;
        if (x < 0 || x > 15) break;
        dot(c, x, y, pick(r, ["#7d1e30", "#95283b", "#5f1626"]));
        if (r() < 0.25) dot(c, x + 1, y, "#5f1626");
      }
    }
    speckle(c, r, ["#a83348"], 0.05);
    grain(c, r, 9, 0.5);
  },

  VECNA: (c, r) => {
    vgrad(c, "#5a1f26", "#3d141a");
    speckle(c, r, ["#6b2730", "#48181f", "#7d2c37"], 0.4);
    // Cracked, glowing fissures.
    for (let i = 0; i < 3; i++) crack(c, r, "rgba(224,90,58,0.65)");
    grain(c, r, 10, 0.6);
    bevel(c, "#6f2831", "#2a0d12", 1);
  },

  OBSIDIAN: (c, r) => {
    vgrad(c, "#2f2440", "#1d1529");
    speckle(c, r, ["#3a2c4e", "#251b34", "#443358"], 0.3);
    // Conchoidal glints — obsidian is volcanic glass.
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * TILE_PX);
      const y = Math.floor(r() * TILE_PX);
      px(c, x, y, 2, 1, "rgba(190,170,230,0.28)");
    }
    grain(c, r, 7, 0.5);
    bevel(c, "#453458", "#140e1d", 1);
  },

  LAIR_GLOW: (c, r) => {
    fill(c, "#8a3420");
    vgrad(c, "#e05a3a", "#8a3420");
    // Embers pulsing through a dark crust.
    speckle(c, r, ["#ff8f5e", "#c04726", "#ffb37f"], 0.35);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(r() * TILE_PX);
      const y = Math.floor(r() * TILE_PX);
      px(c, x, y, 2, 2, "rgba(255,210,160,0.6)");
    }
    grain(c, r, 12, 0.6);
  },

  WATER: (c, r) => {
    vgrad(c, "#7d9db6", "#61819a");
    // Ripple bands.
    for (let y = 0; y < TILE_PX; y += 4) {
      px(c, 0, y, TILE_PX, 1, "rgba(255,255,255,0.16)");
      px(c, 0, y + 1, TILE_PX, 1, "rgba(0,0,0,0.08)");
    }
    grain(c, r, 8, 0.5);
    fadeAlpha(c, 0.72);
  },

  // ---- studio kit ----
  CAMERA: (c, r) => {
    vgrad(c, "#2c3036", "#1c1f24");
    grain(c, r, 6, 0.4);
    // Body, lens barrel and a record light.
    u(c, 1, 4, 14, 8, "#22262b");
    for (let ring = 0; ring < 4; ring++) {
      const k = 4 + ring;
      const sz = 16 - k * 2;
      if (sz <= 0) break;
      u(c, k, k, sz, sz, ring % 2 === 0 ? "#3a4048" : "#2a2f36");
    }
    u(c, 7, 7, 2, 2, "#8fb8d8");
    dot(c, 7, 7, "#dfeaf4");
    dot(c, 13, 4, "#e0523f");
    bevel(c, "#464c55", "#101317", 1);
  },

  TRIPOD: (c, r) => {
    fill(c, "#2b3037");
    vgrad(c, "#3c4148", "#272b31");
    grain(c, r, 5, 0.3);
    // Three legs splaying out from a centre column.
    u(c, 7, 0, 2, 7, "#4a5058");
    for (let i = 0; i < 8; i++) {
      dot(c, 7 - Math.floor(i * 0.8), 7 + i, "#454b53");
      dot(c, 8 + Math.floor(i * 0.8), 7 + i, "#454b53");
      dot(c, 7, 7 + i, "#3a4046");
    }
    bevel(c, "#525860", "#1a1d21", 1);
  },

  SOFTBOX: (c, r) => {
    // A big diffused light source: hot in the middle, framed in black.
    fill(c, "#1e2126");
    const m = U;
    px(c, m, m, TILE_PX - m * 2, TILE_PX - m * 2, "#fff6e0");
    for (let i = 0; i < 6; i++) {
      const k = m + 1 + i;
      const sz = TILE_PX - k * 2;
      if (sz <= 0) break;
      px(c, k, k, sz, sz, `rgba(255,255,255,${0.1 + i * 0.05})`);
    }
    grain(c, r, 4, 0.2);
    border(c, "#15181c", U);
  },

  CLAPBOARD: (c) => {
    fill(c, "#1c1f24");
    // The diagonal clapper stripes across the top.
    for (let x = 0; x < 16; x++) {
      const on = Math.floor(x / 2) % 2 === 0;
      u(c, x, 0, 1, 3, on ? "#f2f2ee" : "#1c1f24");
    }
    // Slate lines below.
    u(c, 2, 6, 12, 1, "#4a5058");
    u(c, 2, 9, 9, 1, "#4a5058");
    u(c, 2, 12, 11, 1, "#4a5058");
    bevel(c, "#3a4048", "#0d0f12", 1);
  },

  MIC: (c, r) => {
    vgrad(c, "#4f555d", "#33383e");
    grain(c, r, 6, 0.4);
    // Grille head over a slim body — a woven mesh, not a flat cap.
    for (let y = 1; y < 8; y++)
      for (let x = 5; x < 11; x++) dot(c, x, y, (x + y) % 2 === 0 ? "#767d86" : "#3d434a");
    u(c, 7, 8, 2, 7, "#454b53");
    u(c, 6, 15, 4, 1, "#2b3036");
    bevel(c, "#5f666e", "#22262b", 1);
  },

  // ---- desk clutter (kept in the palette; the floor no longer places it) ----
  COFFEE: (c, r) => {
    fill(c, "#efece5");
    vgrad(c, "#f6f3ec", "#dfdbd3");
    // Mug seen from above: rim, dark coffee, handle.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = dist(x, y);
        if (d > 6.4) continue;
        dot(c, x, y, d > 5.2 ? "#ffffff" : d > 4.4 ? "#d8d4cc" : "#5c3a24");
      }
    dot(c, 13, 7, "#e8e4dc");
    dot(c, 14, 7, "#e8e4dc");
    dot(c, 6, 6, "rgba(255,255,255,0.35)");
    grain(c, r, 5, 0.3);
  },

  PAPERS: (c, r) => {
    fill(c, "#d9d5cc");
    // A few sheets fanned out, each with ruled lines.
    for (let s = 0; s < 3; s++) {
      const ox = s * U;
      const oy = s * U;
      px(c, ox, oy, TILE_PX - U * 3, TILE_PX - U * 3, "#f4f2ec");
      px(c, ox, oy, TILE_PX - U * 3, 1, "#ffffff");
      px(c, ox, oy + TILE_PX - U * 3 - 1, TILE_PX - U * 3, 1, "#c9c5bd");
      for (let ly = 2; ly < 10; ly += 2) u(c, 1 + s, ly + s, 8, 1, "rgba(120,120,130,0.35)");
    }
    grain(c, r, 4, 0.2);
  },

  DESK_PHONE: (c, r) => {
    vgrad(c, "#2a2e33", "#1c2024");
    grain(c, r, 5, 0.3);
    u(c, 1, 2, 14, 5, "#22262b");
    // Keypad.
    for (let ky = 0; ky < 3; ky++)
      for (let kx = 0; kx < 3; kx++) dot(c, 4 + kx * 2, 9 + ky * 2, "#4a5058");
    // Handset resting across the top.
    u(c, 1, 1, 14, 2, "#3a4046");
    u(c, 1, 1, 14, 1, "#565d66");
    dot(c, 12, 9, "#4ade80");
    bevel(c, "#41474e", "#141719", 1);
  },

  PRINTER: (c, r) => {
    vgrad(c, "#474d54", "#33383e");
    grain(c, r, 6, 0.4);
    // Paper tray, output slot and a status strip.
    u(c, 1, 9, 14, 4, "#2c3137");
    u(c, 2, 5, 12, 1, "#22262b");
    u(c, 2, 10, 12, 2, "#e8e5dd");
    dot(c, 13, 3, "#4ade80");
    dot(c, 11, 3, "#f5b544");
    bevel(c, "#5a6068", "#22262b", 1);
  },

  WATER_COOLER: (c, r) => {
    vgrad(c, "#dfe3e7", "#c4c9ce");
    grain(c, r, 5, 0.3);
    // The bottle up top, the dispenser below.
    u(c, 3, 0, 10, 7, "#b9dce8");
    u(c, 4, 1, 8, 5, "#a2d2e2");
    px(c, 4 * U, 1 * U, 2, 5 * U, "rgba(255,255,255,0.5)");
    u(c, 2, 7, 12, 9, "#d3d7db");
    u(c, 6, 10, 4, 2, "#8d939a");
    dot(c, 5, 9, "#4f9be0");
    dot(c, 10, 9, "#e05a5a");
    bevel(c, "#eef1f4", "#a4a9ae", 1);
  },

  ART_FRAME: (c, r) => {
    // A framed print: mount board, frame, and an abstract block composition.
    fill(c, "#8a6a45");
    border(c, "#6d5133", U);
    px(c, U, U, TILE_PX - U * 2, TILE_PX - U * 2, "#f2efe6");
    const art = ["#4f6b8a", "#c8845c", "#7a8a6b", "#8a6a8c"];
    for (let i = 0; i < 4; i++) {
      const x = 3 + Math.floor(r() * 4);
      const y = 3 + Math.floor(r() * 4);
      u(c, x, y, 2 + Math.floor(r() * 4), 2 + Math.floor(r() * 4), art[i]);
    }
    px(c, U, U, TILE_PX - U * 2, 1, "#ffffff");
    bevel(c, "#a8845c", "#4f3a24", 1);
  },

  SOFA: (c, r) => {
    vgrad(c, "#5a6672", "#414c56");
    // Upholstery: a seat cushion line and piped edges.
    for (let i = 0; i < TILE_PX * 3; i++) {
      const x = Math.floor(r() * TILE_PX);
      const y = Math.floor(r() * TILE_PX);
      px(c, x, y, 1, 1, r() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)");
    }
    px(c, 0, Math.floor(TILE_PX * 0.45), TILE_PX, 1, "#333c45");
    px(c, 0, Math.floor(TILE_PX * 0.45) + 1, TILE_PX, 1, "#6b7783");
    grain(c, r, 6, 0.4);
    bevel(c, "#6e7a86", "#2f373f", 1);
  },

  LAMP: (c, r) => {
    fill(c, "#2b2f34");
    // A warm shade with light spilling down it.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = dist(x, y);
        if (d > 7) continue;
        dot(c, x, y, d > 5.4 ? "#e0b463" : d > 3 ? "#ffd98f" : "#fff2cd");
      }
    u(c, 7, 12, 2, 4, "#4a5058");
    u(c, 5, 15, 6, 1, "#3a4046");
    grain(c, r, 5, 0.25);
  },

  RUG_PATTERN: (c, r) => {
    vgrad(c, "#8a626b", "#75505a");
    // A woven border and a simple repeating motif.
    border(c, "#5f414a", U);
    border(c, "#9c757e", 1);
    for (let y = 4; y < 12; y += 3)
      for (let x = 4; x < 12; x += 3) u(c, x, y, 2, 2, "#a3818a");
    for (let i = 0; i < TILE_PX * 2; i++) {
      const x = Math.floor(r() * TILE_PX);
      const y = Math.floor(r() * TILE_PX);
      px(c, x, y, 1, 1, "rgba(0,0,0,0.07)");
    }
    grain(c, r, 7, 0.5);
  },

  VENT: (c, r) => {
    vgrad(c, "#cfd2d6", "#b4b8bd");
    grain(c, r, 5, 0.3);
    // Louvre blades, each with a lit top edge and a shadow beneath.
    for (let y = 2; y < 15; y += 3) {
      u(c, 1, y, 14, 2, "#9aa0a6");
      px(c, U, y * U, 14 * U, 1, "#e3e6e9");
      px(c, U, (y + 2) * U - 1, 14 * U, 1, "#7d8288");
    }
    border(c, "#a8adb2", U);
    bevel(c, "#e2e5e8", "#8f949a", 1);
  },

  EXIT_SIGN: (c) => {
    // Backlit green running-man sign.
    fill(c, "#0f2b1a");
    const m = U;
    px(c, m, m, TILE_PX - m * 2, TILE_PX - m * 2, "#12331f");
    const on = "#5ee08a";
    // A blocky figure mid-stride, plus the door frame it runs toward.
    u(c, 5, 3, 2, 2, on);
    u(c, 5, 5, 2, 4, on);
    u(c, 4, 9, 2, 3, on);
    u(c, 7, 9, 2, 3, on);
    u(c, 7, 6, 2, 1, on);
    u(c, 11, 2, 1, 12, on);
    u(c, 11, 2, 3, 1, on);
    u(c, 11, 13, 3, 1, on);
    px(c, m, m, TILE_PX - m * 2, 1, "rgba(94,224,138,0.5)");
    border(c, "#0b2114", U);
  },
};

/** Paint the full atlas: one TILE_PX tile per TILE index. */
export function paintAtlas(): HTMLCanvasElement {
  const [atlas, ctx] = makeCanvas(ATLAS_COLS * TILE_PX, ATLAS_ROWS * TILE_PX);
  for (const name of Object.keys(TILE) as (keyof typeof TILE)[]) {
    const t = TILE[name];
    // Each tile paints on its own canvas so speckle never bleeds across tiles
    // and transparent tiles start from a clean alpha=0 surface.
    const [tile, c] = makeCanvas(TILE_PX, TILE_PX);
    PAINTERS[name](c, mulberry32(t * 7919 + 17));
    ctx.drawImage(tile, (t % ATLAS_COLS) * TILE_PX, ((t / ATLAS_COLS) | 0) * TILE_PX);
  }
  return atlas;
}

/** 8x8 face texture for the player model. Skin tone follows the given hue. */
export function paintSkinFace(hue: number): HTMLCanvasElement {
  const h = ((hue % 360) + 360) % 360;
  const [face, c] = makeCanvas(8, 8);
  c.fillStyle = `hsl(${h}, 45%, 68%)`;
  c.fillRect(0, 0, 8, 8);
  c.fillStyle = `hsl(${h}, 45%, 58%)`;
  c.fillRect(0, 7, 8, 1);
  c.fillRect(0, 0, 8, 1);
  // 2x2 eyes with a white glint in the top-left pixel of each.
  c.fillStyle = "#1e1a18";
  c.fillRect(1, 2, 2, 2);
  c.fillRect(5, 2, 2, 2);
  c.fillStyle = "#ffffff";
  c.fillRect(1, 2, 1, 1);
  c.fillRect(5, 2, 1, 1);
  c.fillStyle = `hsl(${h}, 50%, 32%)`;
  c.fillRect(3, 5, 2, 1);
  return face;
}
