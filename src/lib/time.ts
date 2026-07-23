const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** Returns a Date shifted into IST wall-clock (for slicing date/time parts). */
export function istNow(base: Date = new Date()): Date {
  return new Date(base.getTime() + IST_OFFSET_MS);
}

/** IST calendar date as YYYY-MM-DD. */
export function istDateString(base: Date = new Date()): string {
  return istNow(base).toISOString().slice(0, 10);
}

/** IST time as HH:MM. */
export function istTimeString(base: Date = new Date()): string {
  return istNow(base).toISOString().slice(11, 16);
}
