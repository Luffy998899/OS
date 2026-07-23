import { describe, it, expect } from "vitest";
import { financialYear, invoiceNumber, computeTotals, round2 } from "./finance";

describe("financialYear", () => {
  it("uses Apr–Mar Indian FY", () => {
    expect(financialYear(new Date("2026-06-18"))).toBe("2026-27");
    expect(financialYear(new Date("2026-02-10"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01"))).toBe("2026-27");
  });
});

describe("invoiceNumber", () => {
  it("pads sequence", () => {
    expect(invoiceNumber("2026-27", 21)).toBe("INV/2026-27/021");
    expect(invoiceNumber("2026-27", 5)).toBe("INV/2026-27/005");
  });
});

describe("computeTotals", () => {
  it("computes subtotal, tax and total", () => {
    const t = computeTotals([{ qty: 1, rate: 10000 }], "igst", 18, 0);
    expect(t.subtotal).toBe(10000);
    expect(t.taxAmount).toBe(1800);
    expect(t.total).toBe(11800);
  });
  it("applies discount before tax", () => {
    const t = computeTotals([{ qty: 2, rate: 5000 }], "igst", 18, 1000);
    expect(t.subtotal).toBe(10000);
    expect(t.taxAmount).toBe(round2(9000 * 0.18));
    expect(t.total).toBe(round2(9000 + 9000 * 0.18));
  });
  it("no tax type yields zero tax", () => {
    const t = computeTotals([{ qty: 1, rate: 500 }], "none", 18, 0);
    expect(t.taxAmount).toBe(0);
    expect(t.total).toBe(500);
  });
});
