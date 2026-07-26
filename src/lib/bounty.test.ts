import { describe, it, expect } from "vitest";
import { bountyReward, compareBounties, hoursUntil, MAX_BONUS_PCT } from "./bounty";

const NOW = new Date("2026-07-26T10:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("bountyReward", () => {
  it("pays base XP with no bonus for calm work", () => {
    const r = bountyReward({ points: 40, priority: "medium", dueAt: null, now: NOW });
    expect(r.bonus).toBe(0);
    expect(r.total).toBe(40);
    expect(r.tier).toBe("standard");
  });

  it("adds a bonus for urgent priority", () => {
    const r = bountyReward({ points: 40, priority: "urgent", dueAt: null, now: NOW });
    expect(r.bonusPct).toBeCloseTo(0.5);
    expect(r.bonus).toBe(20);
    expect(r.total).toBe(60);
    expect(r.tier).toBe("critical");
  });

  it("stacks priority with a closing deadline", () => {
    const r = bountyReward({
      points: 100,
      priority: "high",
      dueAt: inHours(3),
      now: NOW,
    });
    expect(r.bonusPct).toBeCloseTo(0.55); // 0.25 high + 0.30 same-shift
    expect(r.total).toBe(155);
    expect(r.tier).toBe("critical");
  });

  it("treats an overdue bounty as maximally pressing", () => {
    const r = bountyReward({
      points: 50,
      priority: "medium",
      dueAt: inHours(-20),
      now: NOW,
    });
    expect(r.bonusPct).toBeCloseTo(0.3);
    expect(r.hoursLeft).toBeLessThan(0);
    expect(r.tier).toBe("urgent");
  });

  it("never pays more than double", () => {
    const r = bountyReward({
      points: 200,
      priority: "urgent",
      dueAt: inHours(-100),
      now: NOW,
    });
    expect(r.bonusPct).toBeLessThanOrEqual(MAX_BONUS_PCT);
    expect(r.total).toBeLessThanOrEqual(400);
  });

  it("tapers the deadline bonus as the due date recedes", () => {
    const near = bountyReward({ points: 100, priority: "low", dueAt: inHours(12), now: NOW });
    const mid = bountyReward({ points: 100, priority: "low", dueAt: inHours(48), now: NOW });
    const far = bountyReward({ points: 100, priority: "low", dueAt: inHours(400), now: NOW });
    expect(near.bonus).toBeGreaterThan(mid.bonus);
    expect(mid.bonus).toBeGreaterThan(far.bonus);
    expect(far.bonus).toBe(0);
  });

  it("floors negative point values at zero", () => {
    expect(bountyReward({ points: -10, priority: "urgent", now: NOW }).total).toBe(0);
  });
});

describe("hoursUntil", () => {
  it("returns null without a deadline and handles bad input", () => {
    expect(hoursUntil(null, NOW)).toBeNull();
    expect(hoursUntil("not-a-date", NOW)).toBeNull();
  });

  it("accepts dates and ISO strings alike", () => {
    expect(hoursUntil(inHours(5), NOW)).toBeCloseTo(5);
    expect(hoursUntil(inHours(5).toISOString(), NOW)).toBeCloseTo(5);
  });
});

describe("compareBounties", () => {
  it("puts the hottest bounty at the top of the board", () => {
    const board = [
      { bonusPct: 0, total: 90 },
      { bonusPct: 0.5, total: 30 },
      { bonusPct: 0.25, total: 60 },
    ];
    expect([...board].sort(compareBounties).map((b) => b.total)).toEqual([30, 60, 90]);
  });

  it("breaks ties on payout, then on age", () => {
    const older = { bonusPct: 0.25, total: 50, createdAt: "2026-07-01T00:00:00Z" };
    const newer = { bonusPct: 0.25, total: 50, createdAt: "2026-07-20T00:00:00Z" };
    expect([newer, older].sort(compareBounties)[0]).toBe(older);
  });
});
