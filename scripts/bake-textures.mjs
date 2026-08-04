#!/usr/bin/env node
// Bake real photographic textures down to atlas tiles.
//
//   node scripts/bake-textures.mjs
//
// Reads scripts/texture-manifest.json, fetches each source once into a cache,
// and writes src/components/workspace/blockworld/baked-textures.ts. The baked
// output is committed; the multi-megabyte sources are not, and the game never
// touches the network — the pixels are compiled in.
//
// ---------------------------------------------------------------------------
// The one thing that matters here: HOW the source is reduced.
//
// A 1024px photo squeezed into a 64px tile the obvious way — averaging each
// 16x16 block of source pixels — destroys exactly what makes it look real.
// Measured on the office carpet:
//
//   source, native ............ luminance sigma 19.7
//   16x16 box average ......... luminance sigma  8.1   <- no better than a hand-drawn tile
//   8x8  window ............... luminance sigma 13.2
//   4x4  window ............... luminance sigma 16.1   <- what we use
//   2x2  window ............... luminance sigma 17.9   (starts to alias)
//
// So we sample a small window from the CENTRE of each source cell instead of
// averaging the cell. That keeps ~82% of the fibre variance. Seamlessness
// survives because the sample grid is a regular sub-grid of a source that is
// already seamless, so tile column 0 still continues from tile column 63.
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".texture-cache");
const MANIFEST = join(ROOT, "scripts", "texture-manifest.json");
const OUT = join(ROOT, "src", "components", "workspace", "blockworld", "baked-textures.ts");

/** Atlas tile size. Must match TILE_PX in src/lib/blockworld/blocks.ts. */
const SIZE = 64;
/** Width of the sample window, in source pixels. See the note above. */
const WINDOW = 4;

// ---------------------------------------------------------------------------
// PNG decoding, with no dependencies: Node ships zlib, and un-filtering the
// scanlines is the only other thing a baseline PNG needs.
// ---------------------------------------------------------------------------

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNG is not supported");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`only 8-bit PNGs are supported, got ${depth}`);
  const ch = CHANNELS[colorType];
  if (!ch) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  let i = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[i++];
    const line = Buffer.from(raw.subarray(i, i + stride));
    i += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      switch (filter) {
        case 1:
          line[x] = (line[x] + a) & 255;
          break;
        case 2:
          line[x] = (line[x] + b) & 255;
          break;
        case 3:
          line[x] = (line[x] + ((a + b) >> 1)) & 255;
          break;
        case 4: {
          // Paeth: pick whichever neighbour the gradient predicts best.
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default:
          break; // 0 = no filter
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, channels: ch, data: out };
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * Reduce a source image to SIZE x SIZE by averaging a small window at the
 * centre of each source cell. `pick` maps the source pixel's channels to the
 * output channels.
 */
function sample(img, outChannels, pick) {
  const { width, height, channels, data } = img;
  // The cell is fractional so a source whose size is not a multiple of SIZE
  // still bakes; the sample grid stays uniform either way.
  const cellX = width / SIZE;
  const cellY = height / SIZE;
  const win = Math.max(1, Math.min(WINDOW, Math.floor(Math.min(cellX, cellY))));
  const out = Buffer.alloc(SIZE * SIZE * outChannels);
  const acc = new Array(outChannels);

  for (let ty = 0; ty < SIZE; ty++) {
    for (let tx = 0; tx < SIZE; tx++) {
      acc.fill(0);
      const y0 = Math.floor(ty * cellY + (cellY - win) / 2);
      const x0 = Math.floor(tx * cellX + (cellX - win) / 2);
      for (let sy = y0; sy < y0 + win; sy++) {
        for (let sx = x0; sx < x0 + win; sx++) {
          const o = ((sy % height) * width + (sx % width)) * channels;
          pick(data, o, acc);
        }
      }
      const to = (ty * SIZE + tx) * outChannels;
      for (let k = 0; k < outChannels; k++) {
        out[to + k] = Math.max(0, Math.min(255, Math.round(acc[k] / (win * win))));
      }
    }
  }
  return out;
}

const asRgb = (d, o, acc) => {
  acc[0] += d[o];
  acc[1] += d[o + 1];
  acc[2] += d[o + 2];
};

const asLuminance = (d, o, acc) => {
  acc[0] += 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
};

/**
 * Normal maps are vectors, not colours: averaging them shortens the vector and
 * flattens the surface, so each sampled normal is re-normalised afterwards.
 */
function sampleNormal(img) {
  const out = sample(img, 3, asRgb);
  for (let i = 0; i < out.length; i += 3) {
    let x = out[i] / 127.5 - 1;
    let y = out[i + 1] / 127.5 - 1;
    let z = out[i + 2] / 127.5 - 1;
    const len = Math.hypot(x, y, z) || 1;
    x /= len;
    y /= len;
    z /= len;
    out[i] = Math.round((x + 1) * 127.5);
    out[i + 1] = Math.round((y + 1) * 127.5);
    out[i + 2] = Math.round((z + 1) * 127.5);
  }
  return out;
}

/**
 * Flatten the source's own lighting out of the tile.
 *
 * Every photograph of a floor has a lighting gradient in it — brighter where
 * the lamp was, darker at the edges. Reducing it to a tile keeps that gradient,
 * and tiling THAT across a room repeats the bright patch every single block.
 * The result is a visible grid: exactly the "floor of bath mats" look we are
 * trying to get rid of, now with a photograph's authority behind it.
 *
 * So subtract a heavily blurred copy and add the global mean back. What is left
 * is the fibre — the part that is actually the material — with the photographer's
 * lighting removed. The blur wraps, because the tile does.
 */
function flatten(bytes, channels, radius = Math.round(SIZE / 4)) {
  const n = SIZE * SIZE;
  const out = Buffer.from(bytes);
  for (let k = 0; k < channels; k++) {
    // Separable box blur, wrapping at the edges so the tile stays seamless.
    const src = new Float64Array(n);
    for (let i = 0; i < n; i++) src[i] = bytes[i * channels + k];
    const tmp = new Float64Array(n);
    const span = radius * 2 + 1;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) sum += src[y * SIZE + ((x + d + SIZE) % SIZE)];
        tmp[y * SIZE + x] = sum / span;
      }
    }
    const blur = new Float64Array(n);
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) sum += tmp[((y + d + SIZE) % SIZE) * SIZE + x];
        blur[y * SIZE + x] = sum / span;
      }
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += src[i];
    mean /= n;
    for (let i = 0; i < n; i++) {
      out[i * channels + k] = Math.max(0, Math.min(255, Math.round(src[i] - blur[i] + mean)));
    }
  }
  return out;
}

/** How much the tile's own brightness drifts across it — the grid tell. */
function drift(bytes, channels) {
  const q = [0, 0, 0, 0];
  const c = [0, 0, 0, 0];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * channels;
      const l = channels === 1 ? bytes[i] : 0.299 * bytes[i] + 0.587 * bytes[i + 1] + 0.114 * bytes[i + 2];
      const k = (y < SIZE / 2 ? 0 : 2) + (x < SIZE / 2 ? 0 : 1);
      q[k] += l;
      c[k]++;
    }
  }
  const means = q.map((v, i) => v / c[i]);
  return Math.max(...means) - Math.min(...means);
}

// ---------------------------------------------------------------------------
// Reporting — so a bad bake is obvious rather than silently shipped
// ---------------------------------------------------------------------------

function stats(bytes, channels) {
  const lums = [];
  for (let i = 0; i < bytes.length; i += channels) {
    lums.push(
      channels === 1 ? bytes[i] : 0.299 * bytes[i] + 0.587 * bytes[i + 1] + 0.114 * bytes[i + 2],
    );
  }
  const mean = lums.reduce((s, v) => s + v, 0) / lums.length;
  const sigma = Math.sqrt(lums.reduce((s, v) => s + (v - mean) ** 2, 0) / lums.length);
  return { mean, sigma };
}

/**
 * How visible the wrap is, as a ratio.
 *
 * Opposite edges of a seamless tile are NOT identical — they are neighbours
 * once tiled, so they differ by however much any two adjacent pixels differ.
 * Comparing them to zero would condemn every high-frequency material. What
 * matters is whether the wrap looks like the interior: a ratio near 1 is
 * seamless, and a ratio well above 1 is a visible line down the floor.
 */
function seamRatio(bytes, channels) {
  const at = (x, y, k) => bytes[((y % SIZE) * SIZE + (x % SIZE)) * channels + k];
  let wrap = 0;
  let inner = 0;
  let n = 0;
  for (let i = 0; i < SIZE; i++) {
    for (let k = 0; k < channels; k++) {
      wrap += Math.abs(at(0, i, k) - at(SIZE - 1, i, k));
      wrap += Math.abs(at(i, 0, k) - at(i, SIZE - 1, k));
      // The same measurement taken well inside the tile, as the baseline.
      inner += Math.abs(at(SIZE >> 1, i, k) - at((SIZE >> 1) - 1, i, k));
      inner += Math.abs(at(i, SIZE >> 1, k) - at(i, (SIZE >> 1) - 1, k));
      n += 2;
    }
  }
  // A flat map (an unembossed normal, say) has no interior variation to compare
  // against, and dividing by nothing would cry seam on a surface that has none.
  if (inner / n < 0.5) return 1;
  return wrap / inner;
}

// ---------------------------------------------------------------------------

async function fetchCached(url) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, createHash("sha1").update(url).digest("hex").slice(0, 16) + ".png");
  if (existsSync(file)) return readFileSync(file);
  process.stdout.write(`  fetching ${url.split("/").pop()} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  process.stdout.write(`${(buf.length / 1024).toFixed(0)} KB\n`);
  return buf;
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const baked = [];

  console.log(`Baking ${manifest.tiles.length} textures to ${SIZE}x${SIZE} …\n`);
  for (const entry of manifest.tiles) {
    const buf = entry.file
      ? readFileSync(join(ROOT, entry.file))
      : await fetchCached(entry.url);
    const img = decodePng(buf);

    let bytes;
    let channels;
    if (entry.kind === "normal") {
      bytes = sampleNormal(img);
      channels = 3;
    } else if (entry.kind === "luminance") {
      bytes = sample(img, 1, asLuminance);
      channels = 1;
    } else {
      bytes = sample(img, 3, asRgb);
      channels = 3;
    }

    // Normals are geometry, not light — flattening them would be meaningless.
    // `flat: false` opts a tile out, for surfaces whose gradient is the point.
    const before = drift(bytes, channels);
    if (entry.kind !== "normal" && entry.flat !== false) {
      bytes = flatten(bytes, channels);
    }

    const s = stats(bytes, channels);
    console.log(
      `  ${entry.tile.padEnd(12)} ${img.width}x${img.height} -> ${SIZE}x${SIZE} ` +
        `${channels}ch  mean ${s.mean.toFixed(1)}  sigma ${s.sigma.toFixed(1)}  ` +
        `seam ${seamRatio(bytes, channels).toFixed(2)}x  ` +
        `drift ${before.toFixed(1)}->${drift(bytes, channels).toFixed(1)}`,
    );
    baked.push({ tile: entry.tile, channels, base64: bytes.toString("base64") });
  }

  const credits = manifest.sources
    .map((s) => `// ${s.name} — ${s.licence} — ${s.url}\n//   ${s.credit}`)
    .join("\n");

  const body = baked
    .map(
      (b) =>
        `  ${b.tile}: {\n    channels: ${b.channels},\n    data:\n      "${b.base64.match(/.{1,96}/g).join('" +\n      "')}",\n  },`,
    )
    .join("\n");

  const ts = `// GENERATED by scripts/bake-textures.mjs — do not edit by hand.
//
// Real photographic materials, reduced to ${SIZE}x${SIZE} atlas tiles. These are the
// pixels the office is actually made of; the multi-megabyte sources they came
// from are not in the repository, and nothing here touches the network.
//
// Sources, all public domain:
//
${credits}
//
// Sampled with a ${WINDOW}x${WINDOW} window per source cell rather than a flat average —
// averaging a 16x16 cell collapses the fibre detail that makes a surface read
// as real. See the note in the bake script for the measurements.

export type BakedTexture = {
  /** 1 = single channel (luminance or mask), 3 = RGB. */
  channels: number;
  /** Raw bytes, row-major, ${SIZE}x${SIZE}. */
  data: string;
};

export const BAKED_SIZE = ${SIZE};

export const BAKED: Record<string, BakedTexture> = {
${body}
};

/** Decode a baked texture to its raw bytes. Cached — the atlas is painted twice. */
const cache = new Map<string, Uint8Array>();

export function bakedBytes(name: string): Uint8Array | null {
  const hit = cache.get(name);
  if (hit) return hit;
  const entry = BAKED[name];
  if (!entry) return null;
  const bin = typeof atob === "function"
    ? atob(entry.data)
    : Buffer.from(entry.data, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  cache.set(name, out);
  return out;
}
`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, ts);
  const kb = (Buffer.byteLength(ts) / 1024).toFixed(0);
  console.log(`\nWrote ${OUT.replace(ROOT + "/", "")} (${kb} KB)`);
}

main().catch((err) => {
  console.error(`\nbake failed: ${err.message}`);
  process.exit(1);
});
