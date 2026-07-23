import { describe, it, expect } from "vitest";
import { initials, formatDuration, formatClock, formatNumber } from "./format";

describe("initials", () => {
  it("uses first + last for multi-word names", () => {
    expect(initials("Aarav Mehta")).toBe("AM");
    expect(initials("Rohan Kumar Verma")).toBe("RV");
  });
  it("uses first two letters for single names", () => {
    expect(initials("Cher")).toBe("CH");
  });
  it("handles empty", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("formatDuration", () => {
  it("formats minutes-only", () => {
    expect(formatDuration(600)).toBe("10m");
  });
  it("formats hours + minutes", () => {
    expect(formatDuration(3600 + 300)).toBe("1h 05m");
  });
});

describe("formatClock", () => {
  it("zero-pads H:MM:SS", () => {
    expect(formatClock(3661)).toBe("01:01:01");
    expect(formatClock(0)).toBe("00:00:00");
  });
});

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });
});
