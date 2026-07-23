export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Indian financial year label (Apr–Mar), e.g. "2026-27". */
export function financialYear(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0 = Jan
  const startYear = m >= 3 ? y : y - 1; // FY starts in April
  const endShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endShort}`;
}

export function invoiceNumber(fy: string, seq: number): string {
  return `INV/${fy}/${String(seq).padStart(3, "0")}`;
}

export type LineInput = { qty: number; rate: number };

export function computeTotals(
  items: LineInput[],
  taxType: string,
  taxRate: number,
  discount: number,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = round2(
    items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0),
  );
  const taxable = Math.max(0, subtotal - (Number(discount) || 0));
  const taxAmount =
    taxType === "none" ? 0 : round2((taxable * (Number(taxRate) || 0)) / 100);
  const total = round2(taxable + taxAmount);
  return { subtotal, taxAmount, total };
}

export const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on receipt", days: 0 },
  { value: "net_15", label: "Net 15", days: 15 },
  { value: "net_30", label: "Net 30", days: 30 },
  { value: "net_45", label: "Net 45", days: 45 },
] as const;

export const TAX_TYPES = [
  { value: "igst", label: "IGST" },
  { value: "cgst_sgst", label: "CGST + SGST" },
  { value: "none", label: "No tax" },
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
] as const;

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}
