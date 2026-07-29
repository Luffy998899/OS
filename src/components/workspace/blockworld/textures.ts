// Procedural 16px texture atlas for Blockworld. Every tile is painted from
// scratch with a per-tile seeded PRNG, so the atlas is byte-identical on every
// load — no image assets, no network. Original pixel art, Minecraft-inspired
// but not copied.

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

/** Per-pixel noise over a base fill: each color gets `chance` odds per pixel. */
function speckle(c: Ctx, r: Rand, colors: string[], chance: number): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (r() < chance) px(c, x, y, pick(r, colors));
    }
  }
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

/** Horizontal boards with seams, grain streaks and nail dots. */
function planks(
  c: Ctx,
  r: Rand,
  base: string,
  seam: string,
  grain: string,
  nail: string,
): void {
  fill(c, base);
  for (let board = 0; board < 4; board++) {
    const y0 = board * 4;
    c.fillStyle = seam;
    c.fillRect(0, y0 + 3, TILE_PX, 1);
    // Staggered board-end joint + a nail either side of it.
    const jx = 2 + Math.floor(r() * 12);
    c.fillRect(jx, y0, 1, 3);
    px(c, (jx + 2) % TILE_PX, y0 + 1, nail);
    px(c, (jx + 14) % TILE_PX, y0 + 1, nail);
    for (let i = 0; i < 5; i++) {
      const gx = Math.floor(r() * 14);
      px(c, gx, y0 + Math.floor(r() * 3), grain);
      px(c, gx + 1, y0 + Math.floor(r() * 3), grain);
    }
  }
}

/** Bands of staggered rectangles — bricks, shingles. */
function courses(
  c: Ctx,
  r: Rand,
  mortar: string,
  faces: string[],
  bandH: number,
  brickW: number,
): void {
  fill(c, mortar);
  const rows = TILE_PX / bandH;
  for (let i = 0; i < rows; i++) {
    const y = i * bandH;
    const off = (i % 2) * Math.floor(brickW / 2);
    for (let bx = off - brickW; bx < TILE_PX; bx += brickW) {
      c.fillStyle = pick(r, faces);
      c.fillRect(bx, y, brickW - 1, bandH - 1);
    }
  }
}

/** Multiply every existing pixel's alpha by `alpha` (for water). */
function fadeAlpha(c: Ctx, alpha: number): void {
  c.globalCompositeOperation = "destination-in";
  c.fillStyle = `rgba(0,0,0,${alpha})`;
  c.fillRect(0, 0, TILE_PX, TILE_PX);
  c.globalCompositeOperation = "source-over";
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

const dist = (x: number, y: number): number => Math.hypot(x - 7.5, y - 7.5);

const PAINTERS: Record<keyof typeof TILE, Painter> = {
  GRASS_TOP: (c, r) => {
    fill(c, "#69a83d");
    speckle(c, r, ["#7dbc4e", "#5b9432", "#4e8629", "#88c657"], 0.45);
  },

  GRASS_SIDE: (c, r) => {
    fill(c, "#8a6039");
    speckle(c, r, ["#9b7146", "#74502e", "#5f4126"], 0.35);
    c.fillStyle = "#69a83d";
    c.fillRect(0, 0, TILE_PX, 2);
    for (let x = 0; x < TILE_PX; x++) {
      if (r() < 0.55) px(c, x, 2, "#5b9432");
      if (r() < 0.35) px(c, x, 1, "#7dbc4e");
    }
  },

  DIRT: (c, r) => {
    fill(c, "#8a6039");
    speckle(c, r, ["#9b7146", "#74502e", "#a9825a", "#5f4126"], 0.4);
  },

  STONE: (c, r) => {
    fill(c, "#8f8f8f");
    speckle(c, r, ["#9a9a9a", "#828282", "#a3a3a3"], 0.35);
    crack(c, r, "#6e6e6e");
    crack(c, r, "#767676");
  },

  COBBLE: (c, r) => {
    fill(c, "#6f6f6f");
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 4; cx++) {
        const shade = pick(r, ["#8d8d8d", "#979797", "#858585", "#7e8386"]);
        c.fillStyle = shade;
        c.fillRect(cx * 4, cy * 4, 3, 3);
        px(c, cx * 4, cy * 4, "#a2a2a2");
        px(c, cx * 4 + 2, cy * 4 + 2, "#787878");
      }
    }
  },

  PLANKS: (c, r) => planks(c, r, "#b08945", "#8a6a33", "#a07a3a", "#6b4d22"),

  PLANKS_DARK: (c, r) => planks(c, r, "#6b4a2c", "#4e3520", "#5d3f24", "#3c2917"),

  LOG_SIDE: (c, r) => {
    fill(c, "#6d5433");
    for (let x = 0; x < TILE_PX; x++) {
      const shade = pick(r, ["#5e4728", "#7a5f3a", "#6d5433", "#654d2d"]);
      c.fillStyle = shade;
      c.fillRect(x, 0, 1, TILE_PX);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * TILE_PX);
      const y0 = Math.floor(r() * 10);
      c.fillStyle = "#4a3820";
      c.fillRect(x, y0, 1, 3 + Math.floor(r() * 4));
    }
  },

  LOG_TOP: (c, r) => {
    fill(c, "#c29a5b");
    const ringColors = ["#6d5433", "#5e4728", "#c29a5b", "#a87e44", "#c29a5b", "#a87e44", "#c29a5b", "#a87e44"];
    for (let i = 0; i < 8; i++) {
      c.fillStyle = ringColors[i];
      c.fillRect(i, i, TILE_PX - i * 2, 1);
      c.fillRect(i, TILE_PX - 1 - i, TILE_PX - i * 2, 1);
      c.fillRect(i, i, 1, TILE_PX - i * 2);
      c.fillRect(TILE_PX - 1 - i, i, 1, TILE_PX - i * 2);
    }
    speckle(c, r, ["#b28e4f"], 0.08);
  },

  LEAVES: (c, r) => {
    // 2x2 clumps at random spots leave ~25% of the tile fully transparent.
    for (let i = 0; i < 88; i++) {
      const x = Math.floor(r() * 15);
      const y = Math.floor(r() * 15);
      c.fillStyle = pick(r, ["#3e7a2a", "#4f9134", "#356b24", "#5aa03c"]);
      c.fillRect(x, y, 2, 2);
    }
    speckle(c, r, ["#63ad44"], 0.06);
  },

  GLASS: (c) => {
    c.fillStyle = "rgba(214,233,238,0.85)";
    c.fillRect(0, 0, TILE_PX, 1);
    c.fillRect(0, TILE_PX - 1, TILE_PX, 1);
    c.fillRect(0, 0, 1, TILE_PX);
    c.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
    px(c, 4, 5, "rgba(255,255,255,0.75)");
    px(c, 5, 4, "rgba(255,255,255,0.75)");
  },

  BRICK: (c, r) => {
    courses(c, r, "#b5aaa2", ["#9c4a3a", "#a35240", "#8f4234", "#a85a45"], 4, 8);
    speckle(c, r, ["#8a3f30"], 0.05);
  },

  SANDSTONE: (c, r) => {
    fill(c, "#d8c790");
    for (let y = 0; y < TILE_PX; y++) {
      const band = (y / 3) | 0;
      c.fillStyle = band % 2 === 0 ? "#e0d09c" : "#cdbc82";
      c.fillRect(0, y, TILE_PX, 1);
    }
    speckle(c, r, ["#c4b276", "#e6d8a8"], 0.15);
  },

  PATH: (c, r) => {
    fill(c, "#8f846e");
    speckle(c, r, ["#a39781", "#7c7258", "#6d6450", "#b0a48c"], 0.5);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = pick(r, ["#a39781", "#6d6450"]);
      c.fillRect(Math.floor(r() * 14), Math.floor(r() * 15), 2, 1);
    }
  },

  WATER: (c, r) => {
    fill(c, "#2662c4");
    speckle(c, r, ["#1f55ad", "#2d6fd4"], 0.25);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = "#78aae6";
      c.fillRect(Math.floor(r() * 13), Math.floor(r() * TILE_PX), 2 + Math.floor(r() * 2), 1);
    }
    fadeAlpha(c, 0.78);
  },

  CONCRETE: (c, r) => {
    // Kept near-neutral: block tints multiply in at mesh time.
    fill(c, "#d8d6d0");
    speckle(c, r, ["#dedcd6", "#d0cec8"], 0.25);
  },

  ROOF: (c, r) => {
    courses(c, r, "#262a32", ["#3f4550", "#434a56", "#3a404b"], 4, 4);
    speckle(c, r, ["#4a515e"], 0.06);
  },

  GLOWSTONE: (c, r) => {
    fill(c, "#c8862b");
    speckle(c, r, ["#a86c1f", "#d69939"], 0.25);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(r() * 13);
      const y = Math.floor(r() * 13);
      c.fillStyle = "#ffd966";
      c.fillRect(x, y, 2 + Math.floor(r() * 2), 2);
      px(c, x + 1, y, "#ffe9a3");
      if (r() < 0.5) px(c, x + 1, y + 1, "#fff6cc");
    }
  },

  SCAFFOLD: (c, r) => {
    // Frame + X-brace; the gaps stay transparent.
    c.fillStyle = "#b08945";
    c.fillRect(0, 0, TILE_PX, 1);
    c.fillRect(0, TILE_PX - 1, TILE_PX, 1);
    c.fillRect(0, 0, 1, TILE_PX);
    c.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
    for (let i = 0; i < TILE_PX; i++) {
      px(c, i, i, "#a07a3a");
      px(c, TILE_PX - 1 - i, i, "#8a6a33");
      if (i < TILE_PX - 1) {
        px(c, i + 1, i, "#b08945");
        px(c, TILE_PX - 2 - i, i, "#b08945");
      }
    }
    px(c, 1, 1, r() < 0.5 ? "#6b4d22" : "#8a6a33");
    px(c, 14, 14, "#6b4d22");
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

  CARPET: (c, r) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const even = ((x >> 1) + (y >> 1)) % 2 === 0;
        px(c, x, y, even ? "#9c2a2a" : "#7f1f1f");
      }
    }
    speckle(c, r, ["#a83434", "#731b1b"], 0.15);
  },

  WHITEBOARD: (c, r) => {
    fill(c, "#f4f4f2");
    c.strokeStyle = "#b9bcbe";
    c.strokeRect(0.5, 0.5, TILE_PX - 1, TILE_PX - 1);
    c.fillStyle = "#d04a3e";
    c.fillRect(3, 4, 4, 1);
    c.fillStyle = "#3a6fc4";
    px(c, 9, 6, "#3a6fc4");
    px(c, 10, 7, "#3a6fc4");
    px(c, 11, 8, "#3a6fc4");
    c.fillStyle = "#3f9c4d";
    c.fillRect(4, 10, 3, 1);
    px(c, 5 + Math.floor(r() * 6), 12, "#dcdcd8");
  },

  SCREEN: (c, r) => {
    fill(c, "#0b0e14");
    for (let y = 1; y < TILE_PX; y += 2) {
      c.fillStyle = "#101a29";
      c.fillRect(0, y, TILE_PX, 1);
    }
    px(c, 12, 11, "#1d3a5c");
    px(c, 13, 11, "#2b5580");
    px(c, 13, 12, "#1d3a5c");
    px(c, 12 + Math.floor(r() * 2), 10, "#16304c");
  },

  BOOKS: (c, r) => {
    fill(c, "#6b4a2c");
    const spineColors = ["#8e3b3b", "#3b5e8e", "#3f7a44", "#8e7a3b", "#6a4a8e", "#a06030"];
    for (const y0 of [1, 9]) {
      let x = 0;
      while (x < TILE_PX) {
        const w = 1 + Math.floor(r() * 2);
        if (r() < 0.12) {
          c.fillStyle = "#241812";
          c.fillRect(x, y0, w, 6);
        } else {
          const col = pick(r, spineColors);
          c.fillStyle = col;
          c.fillRect(x, y0, w, 6);
          px(c, x, y0 + 1, "#e8e0cc");
        }
        x += w;
      }
    }
  },

  CLOCK: (c) => {
    // Drawn analytically: wood corners, dark ring, white face, hands at ~10:10.
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const d = dist(x, y);
        if (d > 7.2) px(c, x, y, "#6b4a2c");
        else if (d > 5.8) px(c, x, y, "#4a4038");
        else px(c, x, y, "#f2efe6");
      }
    }
    px(c, 7, 3, "#4a4038");
    px(c, 8, 3, "#4a4038");
    px(c, 12, 7, "#4a4038");
    px(c, 12, 8, "#4a4038");
    px(c, 7, 12, "#4a4038");
    px(c, 8, 12, "#4a4038");
    px(c, 3, 7, "#4a4038");
    px(c, 3, 8, "#4a4038");
    c.fillStyle = "#2e2a24";
    c.fillRect(7, 4, 1, 4);
    c.fillRect(8, 7, 3, 1);
    px(c, 7, 7, "#2e2a24");
  },

  MARBLE: (c, r) => {
    fill(c, "#ece9e2");
    speckle(c, r, ["#e2dfd8", "#f2efe8"], 0.2);
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(r() * TILE_PX);
      let y = 0;
      while (y < TILE_PX) {
        px(c, x, y, "#b8b6b0");
        if (r() < 0.3) px(c, x + 1, y, "#a3a19b");
        x += Math.floor(r() * 3) - 1;
        y += r() < 0.7 ? 1 : 0;
        if (x < 0) x = 0;
        if (x > 15) x = 15;
        if (r() < 0.05) break;
      }
    }
  },

  DESK_TOP: (c, r) => {
    fill(c, "#8a6236");
    for (let i = 0; i < 14; i++) {
      c.fillStyle = pick(r, ["#7c5730", "#966c3c"]);
      c.fillRect(Math.floor(r() * 13), Math.floor(r() * TILE_PX), 3, 1);
    }
    // Paper sheet with faint ruled lines.
    c.fillStyle = "#f4f2ec";
    c.fillRect(2, 3, 5, 6);
    c.fillStyle = "#c9c7c0";
    c.fillRect(3, 5, 3, 1);
    c.fillRect(3, 7, 3, 1);
    // Keyboard: dark slab with a key grid.
    c.fillStyle = "#2a2d33";
    c.fillRect(9, 10, 6, 3);
    c.fillStyle = "#3d424b";
    for (let x = 10; x < 15; x += 2) {
      px(c, x, 11, "#3d424b");
    }
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

  METAL: (c, r) => {
    fill(c, "#9aa0a6");
    for (let y = 0; y < TILE_PX; y++) {
      c.fillStyle = pick(r, ["#a3a9af", "#92989e", "#9aa0a6"]);
      c.fillRect(0, y, TILE_PX, 1);
      if (r() < 0.4) {
        c.fillStyle = "#adb3b9";
        c.fillRect(Math.floor(r() * 12), y, 2 + Math.floor(r() * 3), 1);
      }
    }
    for (const [rx, ry] of [[2, 2], [13, 2], [2, 13], [13, 13]] as const) {
      px(c, rx, ry, "#5d6268");
      px(c, rx + 1, ry, "#c3c9cf");
    }
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
