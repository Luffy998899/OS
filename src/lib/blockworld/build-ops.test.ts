import { describe, expect, it } from "vitest";
import {
  boxSize,
  boxVolume,
  clampBox,
  faceFromNormal,
  fillEdits,
  FILL_MODES,
  inverseEdits,
  MAX_FILL,
  normaliseBox,
  type Box,
  type FillMode,
} from "./build-ops";

const air = () => 0;
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/** The cells a fill writes, as "x,y,z" keys. */
const cellsOf = (edits: number[]): Set<string> => {
  const out = new Set<string>();
  for (let i = 0; i < edits.length; i += 4) out.add(`${edits[i]},${edits[i + 1]},${edits[i + 2]}`);
  return out;
};

describe("normaliseBox", () => {
  it("does not care which corner was marked first", () => {
    const a = normaliseBox({ x: 9, y: 4, z: 2 }, { x: 1, y: 0, z: 8 });
    const b = normaliseBox({ x: 1, y: 0, z: 8 }, { x: 9, y: 4, z: 2 });
    expect(a).toEqual(b);
    expect(a).toEqual(box(1, 0, 2, 9, 4, 8));
  });

  it("handles a single cell", () => {
    expect(normaliseBox({ x: 3, y: 3, z: 3 }, { x: 3, y: 3, z: 3 })).toEqual(box(3, 3, 3, 3, 3, 3));
  });
});

describe("boxVolume and boxSize", () => {
  it("counts corners inclusively", () => {
    expect(boxVolume(box(0, 0, 0, 0, 0, 0))).toBe(1);
    expect(boxVolume(box(0, 0, 0, 1, 1, 1))).toBe(8);
    expect(boxVolume(box(2, 5, 1, 4, 5, 3))).toBe(3 * 1 * 3);
    expect(boxSize(box(2, 5, 1, 4, 5, 3))).toEqual({ w: 3, h: 1, d: 3 });
  });
});

describe("clampBox", () => {
  it("pulls a selection back inside the world", () => {
    expect(clampBox(box(-5, -2, -1, 100, 90, 80), 16, 16, 16)).toEqual(box(0, 0, 0, 15, 15, 15));
  });

  it("leaves an in-bounds selection alone", () => {
    const b = box(2, 3, 4, 5, 6, 7);
    expect(clampBox(b, 16, 16, 16)).toEqual(b);
  });
});

describe("fillEdits", () => {
  const room = box(0, 0, 0, 4, 3, 4); // 5 x 4 x 5

  it("solid writes every cell", () => {
    expect(fillEdits(room, "solid", 7, air).length / 4).toBe(boxVolume(room));
  });

  it("hollow writes the shell and leaves the inside empty", () => {
    const cells = cellsOf(fillEdits(room, "hollow", 7, air));
    expect(cells.has("2,1,2")).toBe(false); // interior
    expect(cells.has("0,1,2")).toBe(true); // wall
    expect(cells.has("2,0,2")).toBe(true); // floor
    expect(cells.has("2,3,2")).toBe(true); // ceiling
    // 5*4*5 minus the 3*2*3 interior.
    expect(cells.size).toBe(boxVolume(room) - 3 * 2 * 3);
  });

  it("walls leaves the top and bottom open", () => {
    const cells = cellsOf(fillEdits(room, "walls", 7, air));
    expect(cells.has("2,0,2")).toBe(false);
    expect(cells.has("2,3,2")).toBe(false);
    expect(cells.has("0,0,0")).toBe(true);
    expect(cells.has("4,3,4")).toBe(true);
  });

  it("floor and ceiling are one layer each", () => {
    expect(fillEdits(room, "floor", 7, air).length / 4).toBe(5 * 5);
    expect(fillEdits(room, "ceiling", 7, air).length / 4).toBe(5 * 5);
    expect(cellsOf(fillEdits(room, "floor", 7, air)).has("2,0,2")).toBe(true);
    expect(cellsOf(fillEdits(room, "ceiling", 7, air)).has("2,3,2")).toBe(true);
  });

  it("frame is the twelve edges and nothing else", () => {
    const cells = cellsOf(fillEdits(box(0, 0, 0, 2, 2, 2), "frame", 7, air));
    expect(cells.has("0,0,0")).toBe(true); // corner
    expect(cells.has("1,0,0")).toBe(true); // along an edge
    expect(cells.has("1,1,0")).toBe(false); // face centre
    expect(cells.has("1,1,1")).toBe(false); // interior
  });

  it("clear empties the box whatever block was asked for", () => {
    const solid = () => 9;
    const edits = fillEdits(room, "clear", 7, solid);
    expect(edits.length / 4).toBe(boxVolume(room));
    for (let i = 3; i < edits.length; i += 4) expect(edits[i]).toBe(0);
  });

  it("replace skips air and rewrites only what is already there", () => {
    // A single block sitting in the middle of the box.
    const one = (x: number, y: number, z: number) => (x === 2 && y === 1 && z === 2 ? 5 : 0);
    const edits = fillEdits(room, "replace", 7, one);
    expect(edits).toEqual([2, 1, 2, 7]);
  });

  it("writes nothing when the box already holds that block", () => {
    expect(fillEdits(room, "solid", 7, () => 7)).toEqual([]);
    expect(fillEdits(room, "clear", 7, air)).toEqual([]);
  });

  it("stops at the limit instead of writing the whole world", () => {
    const huge = box(0, 0, 0, 99, 99, 99);
    expect(fillEdits(huge, "solid", 7, air, 100).length / 4).toBe(100);
    expect(fillEdits(huge, "solid", 7, air).length / 4).toBe(MAX_FILL);
  });

  it("emits well-formed quads", () => {
    const edits = fillEdits(room, "solid", 7, air);
    expect(edits.length % 4).toBe(0);
    for (let i = 0; i < edits.length; i += 4) {
      expect(Number.isInteger(edits[i])).toBe(true);
      expect(edits[i + 3]).toBe(7);
    }
  });

  it("covers every mode the palette offers", () => {
    for (const { mode } of FILL_MODES) {
      expect(() => fillEdits(room, mode as FillMode, 7, air)).not.toThrow();
    }
  });
});

describe("inverseEdits", () => {
  it("records what was there so undo puts it back exactly", () => {
    const before = (x: number) => (x === 1 ? 4 : 0);
    const edits = [0, 0, 0, 9, 1, 0, 0, 9];
    expect(inverseEdits(edits, before)).toEqual([0, 0, 0, 0, 1, 0, 0, 4]);
  });

  it("round-trips: applying then inverting restores the world", () => {
    const world = new Map<string, number>([["2,1,2", 5]]);
    const at = (x: number, y: number, z: number) => world.get(`${x},${y},${z}`) ?? 0;
    const edits = fillEdits(box(0, 0, 0, 3, 2, 3), "solid", 8, at);
    const undo = inverseEdits(edits, at);
    for (let i = 0; i < edits.length; i += 4) {
      world.set(`${edits[i]},${edits[i + 1]},${edits[i + 2]}`, edits[i + 3]);
    }
    expect(at(2, 1, 2)).toBe(8);
    for (let i = 0; i < undo.length; i += 4) {
      world.set(`${undo[i]},${undo[i + 1]},${undo[i + 2]}`, undo[i + 3]);
    }
    expect(at(2, 1, 2)).toBe(5);
    expect(at(0, 0, 0)).toBe(0);
  });
});

describe("faceFromNormal", () => {
  it("names the side the reader stands on", () => {
    expect(faceFromNormal(1, 0)).toBe("e");
    expect(faceFromNormal(-1, 0)).toBe("w");
    expect(faceFromNormal(0, 1)).toBe("s");
    expect(faceFromNormal(0, -1)).toBe("n");
  });

  it("picks the dominant axis for a diagonal", () => {
    expect(faceFromNormal(3, -1)).toBe("e");
    expect(faceFromNormal(-1, 4)).toBe("s");
  });
});
