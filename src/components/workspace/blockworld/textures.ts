// Procedural 16px texture atlas for the office workspace. Every tile is painted
// from scratch with a per-tile seeded PRNG, so the atlas is byte-identical on
// every load — no image assets, no network. These are office materials: carpet
// tile, acoustic ceiling, painted drywall, glass, veneer, brushed metal. Muted
// and low contrast on purpose — a real floorplate is not saturated.

import { ATLAS_COLS, ATLAS_ROWS, TILE, TILE_PX } from "@/lib/blockworld/blocks";

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;
type Painter = (c: Ctx, r: Rand) => void;

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

const px = (c: Ctx, x: number, y: number, color: string): void => {
  c.fillStyle = color;
  c.fillRect(x, y, 1, 1);
};

const fill = (c: Ctx, color: string): void => {
  c.fillStyle = color;
  c.fillRect(0, 0, TILE_PX, TILE_PX);
};

const pick = <T,>(r: Rand, items: T[]): T => items[Math.floor(r() * items.length)];

const dist = (x: number, y: number): number => Math.hypot(x - 7.5, y - 7.5);

/** Per-pixel noise over a base fill: each color gets `chance` odds per pixel. */
function speckle(c: Ctx, r: Rand, colors: string[], chance: number): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (r() < chance) px(c, x, y, pick(r, colors));
    }
  }
}

/** A `w`px border hugging the tile edge — bezels, frames, mullions. */
function border(c: Ctx, color: string, w: number): void {
  c.fillStyle = color;
  c.fillRect(0, 0, TILE_PX, w);
  c.fillRect(0, TILE_PX - w, TILE_PX, w);
  c.fillRect(0, 0, w, TILE_PX);
  c.fillRect(TILE_PX - w, 0, w, TILE_PX);
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
  const steps = 4 + Math.floor(r() * 4);
  for (let i = 0; i < steps; i++) {
    px(c, x, y, color);
    if (vertical) {
      y++;
      x += Math.floor(r() * 3) - 1;
    } else {
      x++;
      y += Math.floor(r() * 3) - 1;
    }
    if (x < 0 || x > 15 || y < 0 || y > 15) break;
  }
}

/**
 * Commercial carpet tile: dithered fleck pile with the square tile seam
 * showing on two edges, the way a glue-down 500mm tile reads from above.
 */
function carpet(
  c: Ctx,
  r: Rand,
  base: string,
  light: string,
  dark: string,
  seam: string,
): void {
  fill(c, base);
  speckle(c, r, [light, dark, light], 0.55);
  c.fillStyle = seam;
  c.fillRect(0, 0, TILE_PX, 1);
  c.fillRect(0, 0, 1, TILE_PX);
  // Feather the seam one pixel in so it reads as pile, not a drawn line.
  for (let i = 0; i < TILE_PX; i++) {
    if (r() < 0.4) px(c, i, 1, seam);
    if (r() < 0.4) px(c, 1, i, seam);
  }
}

/** Flat painted drywall with a faint roller nap. */
function paintedWall(c: Ctx, r: Rand): void {
  fill(c, "#e8e6e1");
  speckle(c, r, ["#ecebe6", "#e3e1dc"], 0.3);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = "#e4e2dd";
    c.fillRect(Math.floor(r() * TILE_PX), Math.floor(r() * 11), 1, 3 + Math.floor(r() * 4));
  }
}

/** Timber veneer: horizontal bands plus drawn-out grain streaks. */
function veneer(
  c: Ctx,
  r: Rand,
  base: string,
  light: string,
  mid: string,
  grain: string,
): void {
  fill(c, base);
  for (let y = 0; y < TILE_PX; y++) {
    c.fillStyle = pick(r, [base, light, mid, base]);
    c.fillRect(0, y, TILE_PX, 1);
  }
  for (let i = 0; i < 7; i++) {
    const y = Math.floor(r() * TILE_PX);
    const x = Math.floor(r() * 12);
    c.fillStyle = grain;
    c.fillRect(x, y, 3 + Math.floor(r() * 5), 1);
    if (r() < 0.4) px(c, x + 1, y + 1, mid);
  }
}

/** Brushed aluminium: fine vertical brush lines with a couple of bright ones. */
function brushed(c: Ctx, r: Rand, base: string, shades: string[], sheen: string): void {
  fill(c, base);
  for (let x = 0; x < TILE_PX; x++) {
    c.fillStyle = pick(r, shades);
    c.fillRect(x, 0, 1, TILE_PX);
    if (r() < 0.35) {
      c.fillStyle = sheen;
      c.fillRect(x, Math.floor(r() * 11), 1, 3 + Math.floor(r() * 4));
    }
  }
}

/** A wandering vertical tendril for the lair vines. */
function tendril(c: Ctx, r: Rand, x0: number): void {
  let x = x0;
  for (let y = 0; y < TILE_PX; y++) {
    px(c, x, y, "#7a1f24");
    if (r() < 0.3) px(c, x + (r() < 0.5 ? 1 : -1), y, "#5c1418");
    if (r() < 0.15) px(c, x, y, "#a03434");
    x += Math.floor(r() * 3) - 1;
    if (x < 1) x = 1;
    if (x > 14) x = 14;
  }
}

const PAINTERS: Record<keyof typeof TILE, Painter> = {
  CARPET_GRAY: (c, r) => carpet(c, r, "#8b8d91", "#95979b", "#818387", "#75777b"),

  CARPET_BLUE: (c, r) => carpet(c, r, "#6b7f9e", "#7589a8", "#617594", "#566a88"),

  CARPET_GREEN: (c, r) => carpet(c, r, "#6f9177", "#799b81", "#65876d", "#5a7c62"),

  CARPET_RED: (c, r) => carpet(c, r, "#a06a68", "#aa7472", "#96605e", "#8a5654"),

  CEILING_TILE: (c, r) => {
    // Mineral fibre: near-white board, pinhole perforations, grid tee on two edges.
    fill(c, "#eceae5");
    speckle(c, r, ["#dedcd6", "#f3f1ec", "#e4e2dd"], 0.4);
    for (let i = 0; i < 10; i++) {
      px(c, 2 + Math.floor(r() * 13), 2 + Math.floor(r() * 13), "#d3d0ca");
    }
    c.fillStyle = "#c6c3bd";
    c.fillRect(0, 0, TILE_PX, 1);
    c.fillRect(0, 0, 1, TILE_PX);
  },

  CEILING_LIGHT: (c, r) => {
    // Recessed LED panel: gray housing, evenly lit diffuser brightest mid-panel.
    fill(c, "#f2f4f6");
    for (let y = 1; y < TILE_PX - 1; y++) {
      for (let x = 1; x < TILE_PX - 1; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        px(c, x, y, d < 3 ? "#ffffff" : d < 5.5 ? "#fbfcfd" : "#f1f3f6");
      }
    }
    speckle(c, r, ["#fdfdfe"], 0.12);
    border(c, "#b6babe", 1);
    px(c, 1, 1, "#9ea3a8");
    px(c, 14, 14, "#9ea3a8");
  },

  DRYWALL: (c, r) => paintedWall(c, r),

  DRYWALL_TRIM: (c, r) => {
    paintedWall(c, r);
    // Skirting board along the bottom three pixels.
    c.fillStyle = "#b3b1ac";
    c.fillRect(0, TILE_PX - 3, TILE_PX, 3);
    c.fillStyle = "#c6c4bf";
    c.fillRect(0, TILE_PX - 3, TILE_PX, 1);
    c.fillStyle = "#9d9b97";
    c.fillRect(0, TILE_PX - 1, TILE_PX, 1);
  },

  GLASS_CLEAR: (c) => {
    // Almost entirely see-through: a cool wash, a thin frame, one wipe streak.
    fill(c, "rgba(212,230,238,0.05)");
    c.fillStyle = "rgba(198,216,226,0.4)";
    c.fillRect(0, 0, TILE_PX, 1);
    c.fillRect(0, TILE_PX - 1, TILE_PX, 1);
    c.fillRect(0, 0, 1, TILE_PX);
    c.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
    for (let i = 3; i < 12; i++) px(c, i, 13 - i, "rgba(255,255,255,0.24)");
  },

  GLASS_FROSTED: (c, r) => {
    fill(c, "rgba(246,248,249,0.55)");
    for (let y = 0; y < TILE_PX; y++) {
      if (y % 3 === 0) {
        c.fillStyle = "rgba(255,255,255,0.1)";
        c.fillRect(0, y, TILE_PX, 1);
      } else if (y % 4 === 2) {
        c.fillStyle = "rgba(202,212,218,0.08)";
        c.fillRect(0, y, TILE_PX, 1);
      }
    }
    for (let i = 0; i < 6; i++) {
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.fillRect(Math.floor(r() * 10), Math.floor(r() * TILE_PX), 4 + Math.floor(r() * 5), 1);
    }
  },

  WOOD_VENEER: (c, r) => veneer(c, r, "#c8a878", "#d2b485", "#bd9d6e", "#a8874f"),

  WOOD_DARK: (c, r) => veneer(c, r, "#6a4b33", "#74553b", "#5e412c", "#4a3323"),

  CONCRETE: (c, r) => {
    // Power-floated slab: soft mottling, a couple of exposed aggregate specks.
    fill(c, "#b7b8b5");
    speckle(c, r, ["#bdbeba", "#b1b2af", "#c2c3bf"], 0.3);
    for (let i = 0; i < 2; i++) {
      const x = 3 + Math.floor(r() * 10);
      const y = 3 + Math.floor(r() * 10);
      px(c, x, y, "#8f918d");
      px(c, x + 1, y, "#d0d1cd");
    }
  },

  MARBLE: (c, r) => {
    fill(c, "#efece6");
    speckle(c, r, ["#e6e3dc", "#f4f2ec"], 0.22);
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(r() * TILE_PX);
      let y = 0;
      while (y < TILE_PX) {
        px(c, x, y, "#b8b6b0");
        if (r() < 0.3) px(c, x + 1, y, "#a5a39d");
        x += Math.floor(r() * 3) - 1;
        y += r() < 0.7 ? 1 : 0;
        if (x < 0) x = 0;
        if (x > 15) x = 15;
        if (r() < 0.05) break;
      }
    }
  },

  PAVING: (c, r) => {
    // Four big plaza slabs with a recessed joint between them.
    fill(c, "#8d887f");
    for (const [sx, sy] of [[1, 1], [9, 1], [1, 9], [9, 9]] as const) {
      c.fillStyle = pick(r, ["#aaa59c", "#a49f96", "#afaaa1"]);
      c.fillRect(sx, sy, 6, 6);
    }
    speckle(c, r, ["#b0aba2", "#9d988f"], 0.2);
    c.fillStyle = "#8d887f";
    c.fillRect(0, 0, TILE_PX, 1);
    c.fillRect(0, 8, TILE_PX, 1);
    c.fillRect(0, 0, 1, TILE_PX);
    c.fillRect(8, 0, 1, TILE_PX);
  },

  FACADE: (c, r) => {
    // Flat cladding panel; the shadow gap runs down the left edge.
    fill(c, "#ada9a3");
    speckle(c, r, ["#b1ada7", "#a9a59f"], 0.18);
    c.fillStyle = "#8e8a85";
    c.fillRect(0, 0, 1, TILE_PX);
    c.fillStyle = "#bcb8b2";
    c.fillRect(1, 0, 1, TILE_PX);
  },

  CURTAIN_WALL: (c, r) => {
    // Vision glass graded from sky at the head to a deeper reflection at the
    // cill, held in a 2px mullion frame.
    for (let y = 0; y < TILE_PX; y++) {
      const t = y / (TILE_PX - 1);
      const rr = (152 - 36 * t) | 0;
      const gg = (170 - 34 * t) | 0;
      const bb = (188 - 28 * t) | 0;
      c.fillStyle = `rgba(${rr},${gg},${bb},0.7)`;
      c.fillRect(0, y, TILE_PX, 1);
    }
    for (let y = 3; y < 8; y++) {
      c.fillStyle = "rgba(255,255,255,0.12)";
      c.fillRect(3, y, 11 - y, 1);
    }
    px(c, 5 + Math.floor(r() * 4), 10, "rgba(255,255,255,0.14)");
    border(c, "#7c8188", 2);
    c.fillStyle = "#9ba0a6";
    c.fillRect(0, 0, TILE_PX, 1);
  },

  MONITOR_ON: (c, r) => {
    // A display, read head-on: black bezel, slate panel, a header strip and a
    // few UI bars in the usual dashboard colors.
    fill(c, "#0d0f12");
    c.fillStyle = "#1d232c";
    c.fillRect(1, 1, 14, 13);
    c.fillStyle = "#2d3644";
    c.fillRect(1, 1, 14, 3);
    px(c, 2, 2, "#8fa4c4");
    px(c, 13, 2, "#5f6b7d");
    c.fillStyle = "#151a21";
    c.fillRect(11, 5, 4, 8);
    c.fillStyle = "#4a7fd0";
    c.fillRect(3, 6, 6, 1);
    c.fillStyle = "#4aa36a";
    c.fillRect(3, 8, 4, 1);
    c.fillStyle = "#d3a34a";
    c.fillRect(3, 10, 7, 1);
    c.fillStyle = "#39414d";
    c.fillRect(3, 12, 5, 1);
    for (let i = 0; i < 3; i++) {
      px(c, 12 + Math.floor(r() * 2), 6 + i * 2, "#3b4a5f");
    }
    c.fillStyle = "#16191d";
    c.fillRect(6, 14, 4, 2);
  },

  MONITOR_BACK: (c, r) => {
    fill(c, "#2a2d31");
    speckle(c, r, ["#2e3135", "#26292d"], 0.25);
    c.fillStyle = "#33363b";
    c.fillRect(2, 2, 12, 1);
    // Stand notch.
    c.fillStyle = "#1e2124";
    c.fillRect(6, 11, 4, 5);
    c.fillStyle = "#3a3e43";
    c.fillRect(6, 11, 4, 1);
  },

  DESK_TOP: (c, r) => {
    veneer(c, r, "#c8a878", "#d2b485", "#bd9d6e", "#a8874f");
    // Paper sheet with ruled lines.
    c.fillStyle = "#f6f4ee";
    c.fillRect(2, 2, 5, 7);
    c.fillStyle = "#cbc9c2";
    c.fillRect(3, 4, 3, 1);
    c.fillRect(3, 6, 3, 1);
    // Keyboard.
    c.fillStyle = "#2a2d33";
    c.fillRect(8, 10, 7, 4);
    c.fillStyle = "#3d424b";
    for (let x = 9; x < 15; x += 2) {
      px(c, x, 11, "#3d424b");
      px(c, x, 12, "#3d424b");
    }
    // Mouse.
    c.fillStyle = "#31353b";
    c.fillRect(12, 5, 2, 3);
    px(c, 12, 5, "#464b52");
  },

  CHAIR: (c, r) => {
    // Mesh weave: alternating warp/weft with a soft sheen across the seat.
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        px(c, x, y, (x + y) % 2 === 0 ? "#3a3d43" : "#2f3237");
      }
    }
    speckle(c, r, ["#44474d", "#2a2d31"], 0.14);
    c.fillStyle = "rgba(255,255,255,0.06)";
    c.fillRect(0, 4, TILE_PX, 3);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, 13, TILE_PX, 3);
  },

  PLANT: (c, r) => {
    // Cutout foliage — roughly a third of the tile stays fully transparent.
    for (let i = 0; i < 66; i++) {
      const x = Math.floor(r() * 15);
      const y = Math.floor(r() * 15);
      c.fillStyle = pick(r, ["#4a7a3c", "#568c45", "#3f6a33", "#61994e"]);
      c.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 10; i++) {
      px(c, Math.floor(r() * TILE_PX), Math.floor(r() * TILE_PX), "#6ea658");
    }
  },

  PLANTER: (c, r) => {
    fill(c, "#a5674a");
    speckle(c, r, ["#ad6f52", "#9a5f43", "#b47a5c"], 0.3);
    // Rim: highlight over a shadow line, then the body darkens at the edges.
    c.fillStyle = "#c08363";
    c.fillRect(0, 0, TILE_PX, 2);
    c.fillStyle = "#cf9575";
    c.fillRect(0, 0, TILE_PX, 1);
    c.fillStyle = "#8a5039";
    c.fillRect(0, 2, TILE_PX, 1);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, 3, 2, TILE_PX - 3);
    c.fillRect(TILE_PX - 2, 3, 2, TILE_PX - 3);
  },

  METAL: (c, r) => brushed(c, r, "#a4a9ae", ["#a9aeb3", "#9ba0a5", "#a4a9ae"], "#b6bbc0"),

  ELEVATOR: (c, r) => {
    brushed(c, r, "#9ba1a7", ["#a0a6ac", "#949aa0", "#9ba1a7"], "#b0b6bc");
    // Centre seam between the two leaves.
    c.fillStyle = "#6f7479";
    c.fillRect(7, 0, 1, TILE_PX);
    c.fillStyle = "#c2c8ce";
    c.fillRect(8, 0, 1, TILE_PX);
    // Call-button plate.
    c.fillStyle = "#b8bcc0";
    c.fillRect(12, 5, 3, 5);
    c.fillStyle = "#8d9297";
    c.fillRect(12, 5, 3, 1);
    px(c, 13, 7, "#e8c96a");
    px(c, 13, 8, "#6f7479");
  },

  WHITEBOARD: (c, r) => {
    fill(c, "#f6f6f4");
    speckle(c, r, ["#f2f2f0"], 0.1);
    border(c, "#b9bdc1", 1);
    c.fillStyle = "#d9dcdf";
    c.fillRect(1, 1, TILE_PX - 2, 1);
    // Faint marker strokes.
    c.fillStyle = "#93aed6";
    c.fillRect(3, 5, 7, 1);
    c.fillStyle = "#a8c6ac";
    c.fillRect(3, 8, 4, 1);
    px(c, 9, 9, "#d6a9a4");
    px(c, 10, 10, "#d6a9a4");
    px(c, 11, 11, "#d6a9a4");
    // Marker resting in the tray.
    c.fillStyle = "#6f7479";
    c.fillRect(4 + Math.floor(r() * 5), 13, 3, 1);
  },

  CORKBOARD: (c, r) => {
    fill(c, "#b99b74");
    speckle(c, r, ["#c2a37c", "#ae8f68", "#c8ab86", "#a4855f"], 0.6);
    // Pinned paper corners.
    for (const [x, y] of [[2, 2], [10, 4], [5, 10]] as const) {
      c.fillStyle = "#f2efe6";
      c.fillRect(x, y, 4, 4);
      c.fillStyle = "#d8d4c8";
      c.fillRect(x, y + 3, 4, 1);
      px(c, x + 1, y + 1, "#c0574c");
    }
    px(c, 13, 12, "#8f7350");
  },

  BOOKS: (c, r) => {
    // A shelf of ring binders, spines out.
    fill(c, "#4e4a45");
    const spines = ["#7d6a5e", "#5f6d7d", "#6b7d68", "#8a7a5e", "#77607a", "#6d6f74"];
    let x = 0;
    while (x < TILE_PX) {
      const w = 2 + Math.floor(r() * 2);
      c.fillStyle = pick(r, spines);
      c.fillRect(x, 1, w, 14);
      c.fillStyle = "rgba(0,0,0,0.18)";
      c.fillRect(x + w - 1, 1, 1, 14);
      c.fillStyle = "#e6e2d8";
      c.fillRect(x, 4, Math.max(1, w - 1), 2);
      if (r() < 0.4) px(c, x, 10, "#3a3733");
      x += w;
    }
    c.fillStyle = "#3a3733";
    c.fillRect(0, 15, TILE_PX, 1);
    c.fillRect(0, 0, TILE_PX, 1);
  },

  SERVER_RACK: (c, r) => {
    fill(c, "#23262b");
    for (let u = 0; u < 5; u++) {
      const y = u * 3 + 1;
      c.fillStyle = "#1b1e22";
      c.fillRect(1, y, 14, 2);
      c.fillStyle = "#2b2f35";
      c.fillRect(1, y + 2, 14, 1);
      // Status LEDs down the left of each unit.
      px(c, 2, y, r() < 0.75 ? "#57c46a" : "#2f5c39");
      px(c, 4, y, r() < 0.4 ? "#d8a53f" : "#5c4a24");
      if (r() < 0.5) px(c, 6, y + 1, "#57c46a");
      for (let x = 9; x < 15; x += 2) px(c, x, y + 1, "#33373d");
    }
    speckle(c, r, ["#26292e"], 0.1);
  },

  TV_SCREEN: (c, r) => {
    // Big panel on standby: near-black with the backlight sitting slightly
    // proud across the upper half, not a hotspot.
    fill(c, "#0a0c10");
    for (let y = 1; y < TILE_PX - 1; y++) {
      for (let x = 1; x < TILE_PX - 1; x++) {
        const glow = 1 - Math.abs(y - 6) / 12 - Math.abs(x - 7.5) / 40;
        px(c, x, y, glow > 0.85 ? "#161e2e" : glow > 0.72 ? "#121927" : "#0f1522");
      }
    }
    speckle(c, r, ["#0d1119"], 0.1);
    border(c, "#191c21", 1);
    px(c, 8, 14, "#2b6ea8");
  },

  PANTRY: (c, r) => {
    // Stone counter with the ring somebody left behind.
    fill(c, "#d9d5cd");
    speckle(c, r, ["#cfcbc3", "#e2ded6", "#c4c0b8"], 0.45);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = Math.hypot(x - 10.5, y - 5.5);
        if (d > 2.2 && d < 3.1) px(c, x, y, "#bfae97");
      }
    }
    px(c, 3, 12, "#b3aea4");
    px(c, 4, 12, "#c9c4ba");
  },

  ACOUSTIC_FELT: (c, r) => {
    // Neutral gray: the felt blocks tint this at mesh time.
    fill(c, "#9a9a98");
    speckle(c, r, ["#a2a2a0", "#929290", "#9e9e9c", "#969694"], 0.6);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = pick(r, ["#a6a6a4", "#8e8e8c"]);
      c.fillRect(Math.floor(r() * 14), Math.floor(r() * TILE_PX), 2, 1);
    }
  },

  CLOCK: (c, r) => {
    // Analogue wall clock on the painted wall, hands at ten past ten.
    paintedWall(c, r);
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = dist(x, y);
        if (d <= 5.6) px(c, x, y, "#fbfaf7");
        else if (d <= 6.6) px(c, x, y, "#71757a");
      }
    }
    for (const [x, y] of [[7, 3], [8, 3], [12, 7], [12, 8], [7, 12], [8, 12], [3, 7], [3, 8]] as const) {
      px(c, x, y, "#5c6065");
    }
    // Minute hand up-right, hour hand up-left.
    for (const [x, y] of [[9, 6], [10, 5], [11, 4]] as const) px(c, x, y, "#24272b");
    for (const [x, y] of [[6, 6], [5, 5]] as const) px(c, x, y, "#24272b");
    c.fillStyle = "#24272b";
    c.fillRect(7, 7, 2, 2);
  },

  SIGN_STRIP: (c, r) => {
    fill(c, "#1a1d22");
    speckle(c, r, ["#1e2127"], 0.15);
    c.fillStyle = "#3f4c62";
    c.fillRect(0, 5, TILE_PX, 6);
    c.fillStyle = "#8ba2c6";
    c.fillRect(0, 6, TILE_PX, 4);
    c.fillStyle = "#e6eefb";
    c.fillRect(0, 7, TILE_PX, 2);
    for (let i = 0; i < 4; i++) {
      px(c, Math.floor(r() * TILE_PX), 7 + Math.floor(r() * 2), "#ffffff");
    }
    c.fillStyle = "#14171b";
    c.fillRect(0, 0, 1, TILE_PX);
    c.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
  },

  ROOF: (c, r) => {
    // Single-ply membrane with welded seams.
    fill(c, "#6f7378");
    speckle(c, r, ["#747880", "#6a6e73"], 0.3);
    for (const y of [0, 5, 10, 15] as const) {
      c.fillStyle = "#5e6267";
      c.fillRect(0, y, TILE_PX, 1);
      if (y + 1 < TILE_PX) {
        c.fillStyle = "#7c8085";
        c.fillRect(0, y + 1, TILE_PX, 1);
      }
    }
  },

  STONE: (c, r) => {
    fill(c, "#8f8f8f");
    speckle(c, r, ["#9a9a9a", "#828282", "#a3a3a3"], 0.35);
    crack(c, r, "#6e6e6e");
    crack(c, r, "#767676");
  },

  LAIR_STONE: (c, r) => {
    fill(c, "#20242e");
    speckle(c, r, ["#272c38", "#1a1d26", "#2c3140"], 0.35);
    crack(c, r, "#12141b");
    crack(c, r, "#12141b");
    crack(c, r, "#31202a");
  },

  LAIR_VINE: (c, r) => {
    tendril(c, r, 3 + Math.floor(r() * 3));
    tendril(c, r, 9 + Math.floor(r() * 4));
    // One horizontal runner tying the strands together.
    let y = 4 + Math.floor(r() * 8);
    for (let x = 0; x < TILE_PX; x++) {
      px(c, x, y, "#6b1a1f");
      y += Math.floor(r() * 3) - 1;
      if (y < 1) y = 1;
      if (y > 14) y = 14;
    }
  },

  VECNA: (c, r) => {
    fill(c, "#5a1e22");
    speckle(c, r, ["#4c171b", "#68262a"], 0.3);
    for (let i = 0; i < 5; i++) {
      let y = Math.floor(r() * TILE_PX);
      for (let x = 0; x < TILE_PX; x++) {
        px(c, x, y, "#762d30");
        if (r() < 0.2) px(c, x, y + 1, "#3f1114");
        if (r() < 0.4) y += Math.floor(r() * 3) - 1;
        if (y < 0) y = 0;
        if (y > 15) y = 15;
      }
    }
    speckle(c, r, ["#8e3a3a"], 0.04);
  },

  OBSIDIAN: (c, r) => {
    fill(c, "#17101f");
    speckle(c, r, ["#241635", "#1d1329", "#100b16"], 0.35);
    for (let i = 0; i < 5; i++) {
      px(c, Math.floor(r() * TILE_PX), Math.floor(r() * TILE_PX), "#4a2a66");
    }
    px(c, 3 + Math.floor(r() * 10), 3 + Math.floor(r() * 10), "#6b4a8e");
  },

  LAIR_GLOW: (c, r) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = dist(x, y) + r() * 0.8;
        if (d < 2.5) px(c, x, y, "#ffe9b8");
        else if (d < 4.5) px(c, x, y, "#ff9840");
        else if (d < 6.5) px(c, x, y, "#e8531f");
        else if (d < 8.5) px(c, x, y, "#a32712");
        else px(c, x, y, "#7c1a10");
      }
    }
  },

  WATER: (c, r) => {
    fill(c, "#4a6f86");
    speckle(c, r, ["#446677", "#527a92"], 0.3);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = "#8fb0c2";
      c.fillRect(Math.floor(r() * 13), Math.floor(r() * TILE_PX), 2 + Math.floor(r() * 2), 1);
    }
    fadeAlpha(c, 0.72);
  },
};

/** Paint the full 128x128 atlas: one 16px tile per TILE index. */
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
  px(c, 1, 2, "#ffffff");
  px(c, 5, 2, "#ffffff");
  c.fillStyle = `hsl(${h}, 50%, 32%)`;
  c.fillRect(3, 5, 2, 1);
  return face;
}
