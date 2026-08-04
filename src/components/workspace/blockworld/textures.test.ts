import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ATLAS_COLS, TILE, TILE_PX } from "@/lib/blockworld/blocks";
import { paintAtlas, paintSkinFace } from "./textures";

// The node test environment has no canvas backend, so this file ships a tiny
// software rasteriser: enough of the 2d context for the painters (fillRect,
// drawImage, destination-in) to run and be inspected pixel by pixel.

type RGBA = { r: number; g: number; b: number; a: number };

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function parseColor(style: string): RGBA {
  if (style.startsWith("#")) {
    const hex = style.slice(1);
    if (hex.length !== 6) throw new Error(`bad hex color: ${style}`);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(style);
  if (rgb) {
    const parts = rgb[1].split(",").map((v) => Number(v.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  const hsl = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/.exec(style);
  if (hsl) {
    const [r, g, b] = hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    return { r, g, b, a: 1 };
  }
  throw new Error(`unsupported color: ${style}`);
}

class Ctx2D {
  fillStyle = "#000000";
  strokeStyle = "#000000";
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  readonly buf: Float64Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.buf = new Float64Array(w * h * 4);
  }

  private blend(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (this.globalCompositeOperation === "destination-in") {
      this.buf[i + 3] *= c.a;
      return;
    }
    const da = this.buf[i + 3];
    const oa = c.a + da * (1 - c.a);
    if (oa <= 0) {
      this.buf[i] = this.buf[i + 1] = this.buf[i + 2] = this.buf[i + 3] = 0;
      return;
    }
    const src = [c.r, c.g, c.b];
    for (let k = 0; k < 3; k++) {
      this.buf[i + k] = (src[k] * c.a + this.buf[i + k] * da * (1 - c.a)) / oa;
    }
    this.buf[i + 3] = oa;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const color = parseColor(this.fillStyle);
    for (let py = Math.floor(y); py < Math.floor(y) + h; py++) {
      for (let pxx = Math.floor(x); pxx < Math.floor(x) + w; pxx++) {
        this.blend(pxx, py, color);
      }
    }
  }

  /** Nearest-neighbour blit, optionally scaled — the atlas upscales tiles. */
  drawImage(src: FakeCanvas, dx: number, dy: number, dw?: number, dh?: number): void {
    const from = src.ctx;
    if (!from) throw new Error("drawImage from an unpainted canvas");
    const w = dw ?? from.w;
    const h = dh ?? from.h;
    for (let y = 0; y < h; y++) {
      const sy = Math.min(from.h - 1, Math.floor((y * from.h) / h));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(from.w - 1, Math.floor((x * from.w) / w));
        const i = (sy * from.w + sx) * 4;
        this.blend(dx + x, dy + y, {
          r: from.buf[i],
          g: from.buf[i + 1],
          b: from.buf[i + 2],
          a: from.buf[i + 3],
        });
      }
    }
  }

  createImageData(w: number, h: number): FakeImageData {
    return new FakeImageData(new Uint8ClampedArray(w * h * 4), w, h);
  }

  getImageData(x: number, y: number, w: number, h: number): FakeImageData {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++) {
      for (let pxx = 0; pxx < w; pxx++) {
        const si = ((y + py) * this.w + (x + pxx)) * 4;
        const di = (py * w + pxx) * 4;
        data[di] = this.buf[si];
        data[di + 1] = this.buf[si + 1];
        data[di + 2] = this.buf[si + 2];
        data[di + 3] = Math.round(this.buf[si + 3] * 255);
      }
    }
    return new FakeImageData(data, w, h);
  }

  putImageData(img: FakeImageData, x: number, y: number): void {
    for (let py = 0; py < img.height; py++) {
      for (let pxx = 0; pxx < img.width; pxx++) {
        const si = (py * img.width + pxx) * 4;
        const tx = x + pxx;
        const ty = y + py;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const di = (ty * this.w + tx) * 4;
        this.buf[di] = img.data[si];
        this.buf[di + 1] = img.data[si + 1];
        this.buf[di + 2] = img.data[si + 2];
        this.buf[di + 3] = img.data[si + 3] / 255;
      }
    }
  }
}

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

class FakeCanvas {
  width = 0;
  height = 0;
  ctx: Ctx2D | null = null;
  getContext(kind: string): Ctx2D | null {
    if (kind !== "2d") return null;
    if (!this.ctx) this.ctx = new Ctx2D(this.width, this.height);
    return this.ctx;
  }
}

beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => new FakeCanvas() });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const ctxOf = (canvas: HTMLCanvasElement): Ctx2D => {
  const c = (canvas as unknown as FakeCanvas).ctx;
  if (!c) throw new Error("canvas was never painted");
  return c;
};

const at = (c: Ctx2D, x: number, y: number): RGBA => {
  const i = (y * c.w + x) * 4;
  return { r: c.buf[i], g: c.buf[i + 1], b: c.buf[i + 2], a: c.buf[i + 3] };
};

/** All 256 pixels of one atlas cell, row-major. */
function cell(c: Ctx2D, tile: number): RGBA[] {
  const x0 = (tile % ATLAS_COLS) * TILE_PX;
  const y0 = ((tile / ATLAS_COLS) | 0) * TILE_PX;
  const out: RGBA[] = [];
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) out.push(at(c, x0 + x, y0 + y));
  }
  return out;
}

const rowOf = (pixels: RGBA[], y: number): RGBA[] => pixels.slice(y * TILE_PX, (y + 1) * TILE_PX);

/** A row named as a fraction of the tile, so these tests survive a resolution
 *  change instead of pinning themselves to a pixel grid. */
const rowAt = (pixels: RGBA[], frac: number): RGBA[] =>
  rowOf(pixels, Math.min(TILE_PX - 1, Math.floor(TILE_PX * frac)));

/** Every pixel of the tile scales with the resolution; so should any count. */
const scaled = (countAt16px: number): number => countAt16px * (TILE_PX / 16) ** 2;

const lum = (p: RGBA): number => 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;

const meanLum = (pixels: RGBA[]): number =>
  pixels.reduce((s, p) => s + lum(p), 0) / pixels.length;

const meanAlpha = (pixels: RGBA[]): number =>
  pixels.reduce((s, p) => s + p.a, 0) / pixels.length;

/** HSL saturation, 0..1 — how far from gray a pixel sits. */
function sat(p: RGBA): number {
  const max = Math.max(p.r, p.g, p.b) / 255;
  const min = Math.min(p.r, p.g, p.b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

const meanSat = (pixels: RGBA[]): number =>
  pixels.reduce((s, p) => s + sat(p), 0) / pixels.length;

let atlas: Ctx2D;
beforeAll(() => {
  atlas = ctxOf(paintAtlas());
});

const tileNames = Object.keys(TILE) as (keyof typeof TILE)[];

describe("paintAtlas", () => {
  it("paints a nearest-neighbour atlas covering the whole 8x8 grid", () => {
    const canvas = paintAtlas();
    expect(canvas.width).toBe(ATLAS_COLS * TILE_PX);
    expect(canvas.height).toBe(ATLAS_COLS * TILE_PX);
    expect(ctxOf(canvas).imageSmoothingEnabled).toBe(false);
  });

  it("paints every tile in the block palette at its own atlas cell", () => {
    // The props pass filled the atlas: all 64 cells of the 8x8 grid are used.
    expect(tileNames).toHaveLength(64);
    // Sparse cutouts (vines, foliage, thin stands) legitimately cover less.
    const sparse = new Set<keyof typeof TILE>([
      "LAIR_VINE",
      "PLANT_FERN",
      "PLANT_TALL",
      "TRIPOD",
      "MIC",
      "COFFEE",
      "LAMP",
    ]);
    for (const name of tileNames) {
      const painted = cell(atlas, TILE[name]).filter((p) => p.a > 0).length;
      expect(painted, `${name} is blank`).toBeGreaterThan(sparse.has(name) ? 40 : 100);
    }
  });

  it("uses every cell of the 8x8 grid exactly once", () => {
    const used = tileNames.map((n) => TILE[n]);
    expect(new Set(used).size).toBe(used.length);
    expect(Math.max(...used)).toBe(63);
    expect(Math.min(...used)).toBe(0);
  });

  it("is deterministic — two atlases are pixel-identical", () => {
    const a = ctxOf(paintAtlas());
    const b = ctxOf(paintAtlas());
    expect(Array.from(a.buf)).toEqual(Array.from(b.buf));
  });

  it("keeps every solid office material fully opaque", () => {
    const seeThrough = new Set<keyof typeof TILE>([
      "GLASS_CLEAR",
      "GLASS_FROSTED",
      "CURTAIN_WALL",
      "PLANT",
      "WATER",
      "LAIR_VINE",
      "PLANT_FERN",
      "PLANT_TALL",
      "TRIPOD",
      "MIC",
      "COFFEE",
      "LAMP",
      "CPU_TOWER",
      "PAPERS",
      "BOOK_STACK",
    ]);
    for (const name of tileNames) {
      if (seeThrough.has(name)) continue;
      const holes = cell(atlas, TILE[name]).filter((p) => p.a < 1).length;
      expect(holes, `${name} has gaps`).toBe(0);
    }
  });

  it("makes glazing see-through in the right proportions", () => {
    expect(meanAlpha(cell(atlas, TILE.GLASS_CLEAR))).toBeLessThan(0.25);
    expect(meanAlpha(cell(atlas, TILE.GLASS_CLEAR))).toBeGreaterThan(0.05);
    expect(meanAlpha(cell(atlas, TILE.GLASS_FROSTED))).toBeGreaterThan(0.45);
    expect(meanAlpha(cell(atlas, TILE.GLASS_FROSTED))).toBeLessThan(0.75);
    expect(meanAlpha(cell(atlas, TILE.CURTAIN_WALL))).toBeGreaterThan(0.6);
    expect(meanAlpha(cell(atlas, TILE.WATER))).toBeCloseTo(0.72, 2);
  });

  it("cuts roughly a third of the plant tile away", () => {
    const pixels = cell(atlas, TILE.PLANT);
    const clear = pixels.filter((p) => p.a === 0).length / pixels.length;
    expect(clear).toBeGreaterThan(0.15);
    expect(clear).toBeLessThan(0.45);
    // What is left has to read as foliage.
    const leaf = pixels.filter((p) => p.a > 0 && p.g > p.r + 10 && p.g > p.b + 20);
    expect(leaf.length).toBeGreaterThan(scaled(120));
  });

  it("keeps office materials muted — no saturated block-game palette", () => {
    const muted: (keyof typeof TILE)[] = [
      "CARPET_GRAY",
      "CARPET_BLUE",
      "CARPET_GREEN",
      "CARPET_RED",
      "CEILING_TILE",
      "DRYWALL",
      "DRYWALL_TRIM",
      "CONCRETE",
      "MARBLE",
      "PAVING",
      "FACADE",
      "METAL",
      "CHAIR",
      "ACOUSTIC_FELT",
      "ROOF",
      "STONE",
    ];
    for (const name of muted) {
      expect(meanSat(cell(atlas, TILE[name])), `${name} is loud`).toBeLessThan(0.3);
    }
    for (const name of ["WOOD_VENEER", "WOOD_DARK", "CORKBOARD"] as const) {
      expect(meanSat(cell(atlas, TILE[name])), `${name} is loud`).toBeLessThan(0.45);
    }
  });

  it("gives each carpet tile a darker seam on two edges", () => {
    for (const name of ["CARPET_GRAY", "CARPET_BLUE", "CARPET_GREEN", "CARPET_RED"] as const) {
      const pixels = cell(atlas, TILE[name]);
      const field = rowAt(pixels, 0.5);
      const left = pixels.filter((_, i) => i % TILE_PX === 0);
      expect(meanLum(rowOf(pixels, 0)), `${name} top seam`).toBeLessThan(meanLum(field) - 4);
      expect(meanLum(left), `${name} left seam`).toBeLessThan(meanLum(field) - 4);
    }
  });

  it("colours the four carpets apart from one another", () => {
    const mids = ["CARPET_GRAY", "CARPET_BLUE", "CARPET_GREEN", "CARPET_RED"].map((n) =>
      at(atlas, (TILE[n as keyof typeof TILE] % ATLAS_COLS) * TILE_PX + 8, 8),
    );
    const [gray, blue, green, red] = mids;
    expect(Math.abs(gray.r - gray.b)).toBeLessThan(14);
    expect(blue.b).toBeGreaterThan(blue.r + 20);
    expect(green.g).toBeGreaterThan(green.r + 12);
    expect(red.r).toBeGreaterThan(red.b + 20);
  });

  it("paints an acoustic ceiling tile with a grid edge and a lit LED panel", () => {
    const ceil = cell(atlas, TILE.CEILING_TILE);
    expect(meanLum(ceil)).toBeGreaterThan(215);
    expect(meanLum(rowOf(ceil, 0))).toBeLessThan(meanLum(rowAt(ceil, 0.5)) - 8);

    const light = cell(atlas, TILE.CEILING_LIGHT);
    // The lit panel is the middle third of the tile, whatever the resolution.
    const lo = TILE_PX * 0.36;
    const hi = TILE_PX * 0.64;
    const centre = light.filter((_, i) => {
      const x = i % TILE_PX;
      const y = (i / TILE_PX) | 0;
      return x > lo && x < hi && y > lo && y < hi;
    });
    expect(meanLum(centre)).toBeGreaterThan(250);
    expect(meanLum(rowOf(light, 0))).toBeLessThan(meanLum(centre) - 20);
  });

  it("runs a darker skirting along the bottom of the trim tile", () => {
    const trim = cell(atlas, TILE.DRYWALL_TRIM);
    const body = [...rowAt(trim, 0.15), ...rowAt(trim, 0.4)];
    const skirting = [...rowAt(trim, 0.85), ...rowAt(trim, 0.92), ...rowAt(trim, 0.99)];
    expect(meanLum(skirting)).toBeLessThan(meanLum(body) - 20);
    expect(meanLum(body)).toBeGreaterThan(220);
  });

  it("draws an all-in-one: aluminium frame, dark glass, a lit desktop", () => {
    const mon = cell(atlas, TILE.MONITOR_ON);
    // The reference machine is framed in silver, not a black bezel.
    const frame = meanLum(rowAt(mon, 0));
    expect(frame, "the frame is not aluminium").toBeGreaterThan(150);
    // The glass inside the frame is near-black by comparison.
    const glass = mon.filter((_, i) => {
      const x = i % TILE_PX;
      const y = (i / TILE_PX) | 0;
      return (
        x > TILE_PX * 0.2 && x < TILE_PX * 0.8 && y > TILE_PX * 0.15 && y < TILE_PX * 0.6
      );
    });
    expect(meanLum(glass), "the screen is not dark glass").toBeLessThan(frame - 80);
    // The chin below the glass is frame-coloured too.
    expect(meanLum(rowAt(mon, 0.86))).toBeGreaterThan(120);
    // The dock is the only colour on the panel — proof it is switched on.
    const blue = mon.filter((p) => p.b > p.r + 40 && p.b > 120).length;
    const green = mon.filter((p) => p.g > p.r + 30 && p.g > p.b + 20).length;
    const amber = mon.filter((p) => p.r > 150 && p.g > 110 && p.b < 110).length;
    expect(blue, "no blue dock icon").toBeGreaterThanOrEqual(scaled(1));
    expect(green, "no green dock icon").toBeGreaterThanOrEqual(scaled(1));
    expect(amber, "no amber dock icon").toBeGreaterThanOrEqual(scaled(1));
  });

  it("draws a mantel clock: pale dial, dark hands, timber base", () => {
    const clock = cell(atlas, TILE.CLOCK);
    // The reference dial is cream rather than white, so it is "pale", not 245+.
    const dial = clock.filter((p) => lum(p) > 200).length;
    expect(dial, "no dial").toBeGreaterThan(scaled(40));
    // Hands, hour marks and the base are all dark against it.
    const dark = clock.filter((p) => lum(p) < 60).length;
    expect(dark, "no hands or marks").toBeGreaterThanOrEqual(scaled(9));
    // The clock stands on wood: the bottom of the tile is dark and warm.
    const base = rowAt(clock, 0.9);
    expect(meanLum(base), "the base is not timber").toBeLessThan(110);
    const warm = base.filter((p) => p.r > p.b + 20).length;
    expect(warm, "the base is not warm-toned").toBeGreaterThan(TILE_PX * 0.5);
  });

  it("lights the server rack with green and amber status LEDs", () => {
    const rack = cell(atlas, TILE.SERVER_RACK);
    expect(meanLum(rack)).toBeLessThan(60);
    const green = rack.filter((p) => p.g > 150 && p.g > p.r + 40).length;
    const amber = rack.filter((p) => p.r > 170 && p.b < 100).length;
    expect(green).toBeGreaterThanOrEqual(scaled(2));
    expect(amber).toBeGreaterThanOrEqual(scaled(1));
  });

  it("glows the sign strip in a band across the middle", () => {
    const sign = cell(atlas, TILE.SIGN_STRIP);
    expect(meanLum(rowAt(sign, 0.5)), "the band is not lit").toBeGreaterThan(200);
    expect(meanLum(rowAt(sign, 0.06)), "the housing is not dark").toBeLessThan(60);
  });

  it("keeps the Upside Down dark and red", () => {
    const vecna = cell(atlas, TILE.VECNA);
    expect(meanLum(vecna)).toBeLessThan(80);
    const mid = at(atlas, (TILE.VECNA % ATLAS_COLS) * TILE_PX + 8, ((TILE.VECNA / ATLAS_COLS) | 0) * TILE_PX + 8);
    expect(mid.r).toBeGreaterThan(mid.b + 30);
    expect(meanLum(cell(atlas, TILE.LAIR_STONE))).toBeLessThan(60);
    expect(meanLum(cell(atlas, TILE.LAIR_GLOW))).toBeGreaterThan(70);
  });
});

describe("paintSkinFace", () => {
  it("paints an 8x8 face with eyes, glints and a mouth", () => {
    const face = paintSkinFace(20);
    expect(face.width).toBe(8);
    expect(face.height).toBe(8);
    const c = ctxOf(face);
    expect(c.imageSmoothingEnabled).toBe(false);
    for (const [x, y] of [[2, 2], [2, 3], [6, 2], [6, 3]] as const) {
      expect(lum(at(c, x, y)), `eye ${x},${y}`).toBeLessThan(40);
    }
    expect(lum(at(c, 1, 2))).toBeGreaterThan(250);
    expect(lum(at(c, 5, 2))).toBeGreaterThan(250);
    const mouth = at(c, 3, 5);
    const cheek = at(c, 3, 4);
    expect(lum(mouth)).toBeLessThan(lum(cheek) - 30);
    expect(at(c, 0, 0).a).toBe(1);
  });

  it("follows the hue and wraps negative or oversized values", () => {
    const warm = at(ctxOf(paintSkinFace(20)), 4, 4);
    const cool = at(ctxOf(paintSkinFace(200)), 4, 4);
    expect(warm.r).toBeGreaterThan(warm.b);
    expect(cool.b).toBeGreaterThan(cool.r);
    const wrapped = at(ctxOf(paintSkinFace(-160)), 4, 4);
    expect(wrapped).toEqual(cool);
    expect(at(ctxOf(paintSkinFace(380)), 4, 4)).toEqual(warm);
  });
});
