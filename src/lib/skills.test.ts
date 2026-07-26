import { describe, it, expect } from "vitest";
import {
  SKILLS,
  SKILL_TIERS,
  MAX_SKILL_LEVEL,
  skillLevel,
  skillInfo,
  tierName,
  skillForVertical,
  normalizeSkill,
  isEligible,
  nextUnlock,
  unlocksFor,
  suggestedGate,
} from "./skills";

describe("skillLevel", () => {
  it("starts every craft at Novice", () => {
    expect(skillLevel(0)).toBe(0);
    expect(tierName(0)).toBe("Novice");
  });

  it("promotes exactly on the tier threshold", () => {
    for (const tier of SKILL_TIERS) {
      expect(skillLevel(tier.at)).toBe(tier.level);
      if (tier.level > 0) expect(skillLevel(tier.at - 1)).toBe(tier.level - 1);
    }
  });

  it("caps at the top tier", () => {
    expect(skillLevel(999_999)).toBe(MAX_SKILL_LEVEL);
  });

  it("treats negative and fractional XP as floor-rounded", () => {
    expect(skillLevel(-50)).toBe(0);
    expect(skillLevel(119.9)).toBe(0);
  });
});

describe("skillInfo", () => {
  it("reports progress within the current tier", () => {
    const info = skillInfo(220); // Apprentice at 120, Practitioner at 320
    expect(info.level).toBe(1);
    expect(info.tier).toBe("Apprentice");
    expect(info.into).toBe(100);
    expect(info.span).toBe(200);
    expect(info.toNext).toBe(100);
    expect(info.progress).toBeCloseTo(0.5);
    expect(info.next).toBe("Practitioner");
  });

  it("is complete and has no next tier at the cap", () => {
    const info = skillInfo(5000);
    expect(info.level).toBe(MAX_SKILL_LEVEL);
    expect(info.next).toBeNull();
    expect(info.toNext).toBe(0);
    expect(info.progress).toBe(1);
  });
});

describe("mission → craft mapping", () => {
  it("routes each vertical to a craft", () => {
    expect(skillForVertical("website-dev")).toBe("dev");
    expect(skillForVertical("digital-marketing")).toBe("design");
    expect(skillForVertical("billing")).toBe("ops");
  });

  it("falls back to ops for anything unknown", () => {
    expect(skillForVertical("nonsense")).toBe("ops");
    expect(normalizeSkill(null)).toBe("ops");
    expect(normalizeSkill("video")).toBe("video");
  });
});

describe("eligibility gates", () => {
  it("needs the craft level to clear the gate", () => {
    expect(isEligible(0, 0)).toBe(true);
    expect(isEligible(1, 2)).toBe(false);
    expect(isEligible(3, 2)).toBe(true);
  });

  it("scales the suggested gate with size and urgency", () => {
    expect(suggestedGate(10, "medium")).toBe(0);
    expect(suggestedGate(50, "medium")).toBe(1);
    expect(suggestedGate(100, "urgent")).toBe(4);
    expect(suggestedGate(1000, "urgent")).toBeLessThanOrEqual(MAX_SKILL_LEVEL);
  });
});

describe("unlocks", () => {
  it("gives every craft one unlock per tier", () => {
    for (const skill of SKILLS) {
      expect(unlocksFor(skill)).toHaveLength(SKILL_TIERS.length);
    }
  });

  it("points at the next tier, and nothing once maxed", () => {
    expect(nextUnlock("dev", 0)?.level).toBe(1);
    expect(nextUnlock("dev", MAX_SKILL_LEVEL)).toBeNull();
  });
});
