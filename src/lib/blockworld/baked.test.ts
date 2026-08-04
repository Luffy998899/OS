import { describe, expect, it } from "vitest";
import { BAKED, BAKED_SIZE, bakedBytes } from "@/components/workspace/blockworld/baked-textures";

// The baked textures are generated and committed, which means they can rot
// silently — a truncated commit, a bad merge, a re-bake from a source that
// moved. These check the payload itself, with no canvas involved.

const NAMES = Object.keys(BAKED);
const isNormal = (n: string) => n.endsWith("_N");
/** Photographs of objects rather than of surfaces — these never tile. */
const PROP_FACES = new Set(["SCREEN_ON", "RACK"]);

const at = (b: Uint8Array, ch: number, x: number, y: number, k: number) =>
  b[((y % BAKED_SIZE) * BAKED_SIZE + (x % BAKED_SIZE)) * ch + k];

const luminance = (b: Uint8Array, ch: number, i: number) =>
  ch === 1 ? b[i] : 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];

describe("the baked textures", () => {
  it("ships the materials the office is made of", () => {
    expect(NAMES).toContain("CARPET");
    expect(NAMES).toContain("WALL");
    expect(NAMES).toContain("CEILING");
    expect(NAMES.length).toBeGreaterThanOrEqual(6);
  });

  it("decodes to exactly the declared size — a truncated commit fails here", () => {
    for (const name of NAMES) {
      const bytes = bakedBytes(name);
      expect(bytes, name).not.toBeNull();
      expect(bytes!.length, `${name} is the wrong length`).toBe(
        BAKED_SIZE * BAKED_SIZE * BAKED[name].channels,
      );
    }
  });

  it("decodes the same bytes every time", () => {
    for (const name of NAMES) {
      expect(Array.from(bakedBytes(name)!.slice(0, 64))).toEqual(
        Array.from(bakedBytes(name)!.slice(0, 64)),
      );
    }
  });

  it("carries real detail — a flat payload would mean the bake failed", () => {
    for (const name of NAMES) {
      if (isNormal(name)) continue;
      const bytes = bakedBytes(name)!;
      const ch = BAKED[name].channels;
      const lums: number[] = [];
      for (let i = 0; i < bytes.length; i += ch) lums.push(luminance(bytes, ch, i));
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
      const sigma = Math.sqrt(lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length);
      expect(sigma, `${name} is flat`).toBeGreaterThan(3);
    }
  });

  it("keeps the carpet's fibre — the whole point of photographing it", () => {
    // Reduced the obvious way (a flat 16x16 box average) the real carpet comes
    // out at sigma 8, which is what the hand-drawn tile it replaced scored.
    // Sampling a small window instead keeps it near the source's own 19.
    const bytes = bakedBytes("CARPET")!;
    const mean = bytes.reduce((a, b) => a + b, 0) / bytes.length;
    const sigma = Math.sqrt(
      bytes.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / bytes.length,
    );
    expect(sigma).toBeGreaterThan(12);
  });

  it("tiles without a seam", () => {
    // Opposite edges of a seamless tile are neighbours once laid out, so they
    // are not identical — they differ by however much any two adjacent lines
    // differ. Comparing them to zero would condemn every real material.
    for (const name of NAMES) {
      const bytes = bakedBytes(name)!;
      const ch = BAKED[name].channels;
      let wrap = 0;
      let inner = 0;
      for (let i = 0; i < BAKED_SIZE; i++) {
        for (let k = 0; k < ch; k++) {
          wrap += Math.abs(at(bytes, ch, 0, i, k) - at(bytes, ch, BAKED_SIZE - 1, i, k));
          wrap += Math.abs(at(bytes, ch, i, 0, k) - at(bytes, ch, i, BAKED_SIZE - 1, k));
          inner += Math.abs(at(bytes, ch, 32, i, k) - at(bytes, ch, 31, i, k));
          inner += Math.abs(at(bytes, ch, i, 32, k) - at(bytes, ch, i, 31, k));
        }
      }
      if (inner < BAKED_SIZE * ch) continue; // a flat map has no seam to find
      if (PROP_FACES.has(name)) continue; // a monitor is not laid edge to edge
      expect(wrap / inner, `${name} shows its seam`).toBeLessThan(1.6);
    }
  });

  it("has no lighting of its own left in it", () => {
    // A photograph of a floor carries the photographer's lighting. Tiled, that
    // repeats the bright patch on every single block — a grid, drawn by the
    // camera rather than by us. The bake flattens it out; this proves it ran.
    for (const name of NAMES) {
      // A prop's face is a picture, not a tiling surface: a screen's gradient
      // IS its content, and flattening it would wash the desktop off the
      // monitor. Only the materials that repeat across a floor are held flat.
      if (isNormal(name) || PROP_FACES.has(name)) continue;
      const bytes = bakedBytes(name)!;
      const ch = BAKED[name].channels;
      const q = [0, 0, 0, 0];
      const n = [0, 0, 0, 0];
      for (let y = 0; y < BAKED_SIZE; y++) {
        for (let x = 0; x < BAKED_SIZE; x++) {
          const k = (y < BAKED_SIZE / 2 ? 0 : 2) + (x < BAKED_SIZE / 2 ? 0 : 1);
          q[k] += luminance(bytes, ch, (y * BAKED_SIZE + x) * ch);
          n[k]++;
        }
      }
      const means = q.map((v, i) => v / n[i]);
      expect(Math.max(...means) - Math.min(...means), `${name} still has a gradient`).toBeLessThan(4);
    }
  });

  it("stores normals as unit vectors", () => {
    for (const name of NAMES.filter(isNormal)) {
      const bytes = bakedBytes(name)!;
      expect(BAKED[name].channels).toBe(3);
      let worst = 0;
      for (let i = 0; i < bytes.length; i += 3) {
        const x = bytes[i] / 127.5 - 1;
        const y = bytes[i + 1] / 127.5 - 1;
        const z = bytes[i + 2] / 127.5 - 1;
        worst = Math.max(worst, Math.abs(Math.hypot(x, y, z) - 1));
      }
      // Averaging normals shortens them; the bake renormalises afterwards.
      expect(worst, `${name} has non-unit normals`).toBeLessThan(0.05);
      // And they point out of the surface, not into it.
      let blue = 0;
      for (let i = 2; i < bytes.length; i += 3) blue += bytes[i];
      expect(blue / (bytes.length / 3), `${name} points inward`).toBeGreaterThan(150);
    }
  });

  it("returns null for a texture that was never baked", () => {
    expect(bakedBytes("NOT_A_TEXTURE")).toBeNull();
  });
});
