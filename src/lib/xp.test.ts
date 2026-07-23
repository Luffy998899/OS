import { describe, it, expect } from "vitest";
import { levelInfo, levelForPoints } from "./xp";

describe("levelInfo", () => {
  it("starts at level 1 with 0 points", () => {
    const l = levelInfo(0);
    expect(l.level).toBe(1);
    expect(l.into).toBe(0);
    expect(l.progress).toBe(0);
  });
  it("levels up every 100 points", () => {
    expect(levelForPoints(99)).toBe(1);
    expect(levelForPoints(100)).toBe(2);
    expect(levelForPoints(250)).toBe(3);
    expect(levelForPoints(980)).toBe(10);
  });
  it("reports progress within a level", () => {
    const l = levelInfo(150);
    expect(l.level).toBe(2);
    expect(l.into).toBe(50);
    expect(l.toNext).toBe(50);
    expect(l.progress).toBeCloseTo(0.5);
  });
});
