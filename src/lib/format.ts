export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Formats a duration in seconds as "Hh Mm" (or "Mm"). */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** Clock string like 2h 05m from seconds, zero-padded H:MM:SS for timers. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const past = diff >= 0;
  const units: [number, string][] = [
    [60_000, "just now"],
    [3_600_000, "m"],
    [86_400_000, "h"],
    [604_800_000, "d"],
    [2_629_800_000, "w"],
    [31_557_600_000, "mo"],
    [Infinity, "y"],
  ];
  if (abs < 60_000) return "just now";
  for (let i = 1; i < units.length; i++) {
    if (abs < units[i][0]) {
      const value = Math.floor(abs / units[i - 1][0]);
      const label = units[i][1];
      return past ? `${value}${label} ago` : `in ${value}${label}`;
    }
  }
  return d.toLocaleDateString();
}
