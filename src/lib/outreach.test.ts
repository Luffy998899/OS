import { describe, it, expect } from "vitest";
import {
  assessFollowUp,
  compareFollowUps,
  daysSince,
  deriveLastTouch,
  parseDayKey,
  type LeadSignal,
} from "./outreach";

const NOW = new Date(2026, 6, 29, 10, 0, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const signal = (over: Partial<LeadSignal> = {}): LeadSignal => ({
  status: "pending",
  otpPending: false,
  otpExpired: false,
  daysSinceTouch: 0,
  touchSource: "none",
  hasPhone: true,
  assigned: false,
  ...over,
});

describe("parseDayKey", () => {
  it("reads a YYYY-MM-DD key as a local date", () => {
    const d = parseDayKey("2026-07-29");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(29);
  });

  it("rejects junk and nulls", () => {
    expect(parseDayKey(null)).toBeNull();
    expect(parseDayKey("")).toBeNull();
    expect(parseDayKey("29-07-2026")).toBeNull();
  });
});

describe("deriveLastTouch", () => {
  it("treats an untouched pending lead's intake as no touch at all", () => {
    const t = deriveLastTouch({
      status: "pending",
      assignedDate: "2026-07-28",
      createdAt: daysAgo(9),
    });
    expect(t.source).toBe("none");
    expect(daysSince(t.at, NOW)).toBe(9);
  });

  it("uses the run day once the lead has actually been worked", () => {
    const t = deriveLastTouch({
      status: "contacted",
      assignedDate: "2026-07-27",
      createdAt: daysAgo(20),
    });
    expect(t.source).toBe("worked");
    expect(daysSince(t.at, NOW)).toBe(2);
  });

  it("prefers a newer OTP over the run day", () => {
    const t = deriveLastTouch({
      status: "hot",
      assignedDate: "2026-07-20",
      createdAt: daysAgo(30),
      latestOtpAt: daysAgo(1),
    });
    expect(t.source).toBe("otp");
    expect(daysSince(t.at, NOW)).toBe(1);
  });
});

describe("assessFollowUp", () => {
  it("ignores leads that are done either way", () => {
    expect(assessFollowUp(signal({ status: "converted" }))).toBeNull();
    expect(assessFollowUp(signal({ status: "dropped", daysSinceTouch: 40 }))).toBeNull();
  });

  it("leaves a freshly contacted lead alone", () => {
    expect(
      assessFollowUp(signal({ status: "contacted", touchSource: "worked", daysSinceTouch: 1 })),
    ).toBeNull();
  });

  it("puts a live OTP above everything else", () => {
    const otp = assessFollowUp(signal({ status: "hot", otpPending: true }));
    const hot = assessFollowUp(signal({ status: "hot", daysSinceTouch: 5 }));
    expect(otp).not.toBeNull();
    expect(otp!.tier).toBe("now");
    expect(otp!.urgency).toBeGreaterThan(hot!.urgency);
  });

  it("flags an expired OTP as a re-send", () => {
    const r = assessFollowUp(signal({ status: "hot", otpExpired: true, daysSinceTouch: 2 }));
    expect(r!.why).toContain("expired");
    expect(r!.nextAction).toContain("Re-send");
  });

  it("gets more urgent the longer a hot lead sits", () => {
    const fresh = assessFollowUp(signal({ status: "hot", daysSinceTouch: 0 }))!;
    const stale = assessFollowUp(signal({ status: "hot", daysSinceTouch: 6 }))!;
    expect(stale.urgency).toBeGreaterThan(fresh.urgency);
  });

  it("names the owner sitting on an uncalled lead", () => {
    const r = assessFollowUp(
      signal({ status: "pending", assigned: true, ownerName: "Riya", daysSinceTouch: 5 }),
    );
    expect(r!.why).toContain("Riya");
    expect(r!.nextAction).toContain("pending pool");
  });

  it("only chases unclaimed pool leads once they go stale", () => {
    expect(assessFollowUp(signal({ daysSinceTouch: 1 }))).toBeNull();
    expect(assessFollowUp(signal({ daysSinceTouch: 4 }))).not.toBeNull();
  });

  it("asks for a number when there isn't one", () => {
    const r = assessFollowUp(signal({ status: "hot", hasPhone: false }));
    expect(r!.nextAction).toContain("number");
  });
});

describe("compareFollowUps", () => {
  it("sorts by urgency, then staleness, then name", () => {
    const rows = [
      { urgency: 50, daysSinceTouch: 1, name: "Bravo" },
      { urgency: 90, daysSinceTouch: 0, name: "Zulu" },
      { urgency: 50, daysSinceTouch: 9, name: "Alpha" },
      { urgency: 50, daysSinceTouch: 1, name: "Alpha" },
    ];
    expect([...rows].sort(compareFollowUps).map((r) => r.name)).toEqual([
      "Zulu",
      "Alpha",
      "Alpha",
      "Bravo",
    ]);
  });
});
