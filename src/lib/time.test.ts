import { describe, it, expect } from "vitest";
import { istDateString, istTimeString } from "./time";

describe("IST helpers", () => {
  it("adds 5:30 offset to UTC", () => {
    const base = new Date("2026-01-01T00:00:00.000Z");
    expect(istDateString(base)).toBe("2026-01-01");
    expect(istTimeString(base)).toBe("05:30");
  });

  it("rolls over the date in the evening UTC", () => {
    const base = new Date("2026-01-01T20:00:00.000Z");
    expect(istDateString(base)).toBe("2026-01-02");
    expect(istTimeString(base)).toBe("01:30");
  });

  it("5:55 PM IST corresponds to 12:25 UTC (cron schedule)", () => {
    // The Vercel cron runs at 12:25 UTC; confirm that maps to 17:55 IST.
    const base = new Date("2026-03-10T12:25:00.000Z");
    expect(istTimeString(base)).toBe("17:55");
  });
});
