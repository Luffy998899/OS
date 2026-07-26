// Skill tree — the career path behind the score.
//
// Mission XP lands in two places: the lifetime `points` total (leaderboard, see
// ./xp) and a per-craft track here. Craft levels are what gate eligibility for a
// mission on the bounty board, so points stop being a number and start being a
// ladder you climb in a direction.

export const SKILLS = ["design", "dev", "video", "ops"] as const;
export type SkillKey = (typeof SKILLS)[number];

export type SkillMeta = {
  key: SkillKey;
  label: string;
  blurb: string;
  /** Hex — shared by the UI chips and the 3D floor accents so both read alike. */
  color: string;
};

export const SKILL_META: Record<SkillKey, SkillMeta> = {
  design: {
    key: "design",
    label: "Design",
    blurb: "Brand, layout, campaign creative and everything that has to look right.",
    color: "#63c98a",
  },
  dev: {
    key: "dev",
    label: "Development",
    blurb: "Websites, apps, integrations — anything that ships as code.",
    color: "#6f9ff0",
  },
  video: {
    key: "video",
    label: "Video",
    blurb: "Edits, motion, reels and the whole post-production pipeline.",
    color: "#e0a862",
  },
  ops: {
    key: "ops",
    label: "Operations",
    blurb: "Roadmaps, client outreach, billing — the work that keeps work moving.",
    color: "#d98a8a",
  },
};

/** Cumulative craft XP needed to reach each tier. */
export const SKILL_TIERS = [
  { level: 0, name: "Novice", at: 0 },
  { level: 1, name: "Apprentice", at: 120 },
  { level: 2, name: "Practitioner", at: 320 },
  { level: 3, name: "Specialist", at: 700 },
  { level: 4, name: "Expert", at: 1300 },
  { level: 5, name: "Master", at: 2200 },
] as const;

export const MAX_SKILL_LEVEL = SKILL_TIERS.length - 1;

export type SkillInfo = {
  xp: number;
  level: number;
  tier: string;
  /** XP earned inside the current tier. */
  into: number;
  /** XP the current tier spans (0 once maxed). */
  span: number;
  toNext: number;
  progress: number; // 0..1
  next: string | null;
};

export function skillLevel(xp: number): number {
  const x = Math.max(0, Math.floor(xp));
  let level = 0;
  for (const t of SKILL_TIERS) {
    if (x >= t.at) level = t.level;
  }
  return level;
}

export function tierName(level: number): string {
  const clamped = Math.max(0, Math.min(MAX_SKILL_LEVEL, Math.floor(level)));
  return SKILL_TIERS[clamped].name;
}

export function skillInfo(xp: number): SkillInfo {
  const x = Math.max(0, Math.floor(xp));
  const level = skillLevel(x);
  const base = SKILL_TIERS[level].at;
  const next = level < MAX_SKILL_LEVEL ? SKILL_TIERS[level + 1] : null;
  const span = next ? next.at - base : 0;
  const into = x - base;
  return {
    xp: x,
    level,
    tier: SKILL_TIERS[level].name,
    into,
    span,
    toNext: next ? next.at - x : 0,
    progress: next ? Math.min(1, into / span) : 1,
    next: next ? next.name : null,
  };
}

/** Craft a mission trains when it wasn't set explicitly, derived from its vertical. */
export const VERTICAL_SKILL: Record<string, SkillKey> = {
  "website-dev": "dev",
  "digital-marketing": "design",
  roadmap: "ops",
  "client-outreach": "ops",
  billing: "ops",
};

export function skillForVertical(vertical: string): SkillKey {
  return VERTICAL_SKILL[vertical] ?? "ops";
}

/** Department rooms map onto crafts, so the floor reads the same as the tree. */
export const ROOM_SKILL: Record<string, SkillKey> = {
  developer: "dev",
  creative: "design",
  "video-editing": "video",
  "managing-heads": "ops",
  client: "ops",
  creativity: "design",
  "common-board": "ops",
};

/** Where a craft's missions land when a bounty doesn't name a room. */
export const SKILL_ROOM_KEY: Record<SkillKey, string> = {
  dev: "developer",
  design: "creative",
  video: "video-editing",
  ops: "managing-heads",
};

export function normalizeSkill(value: string | null | undefined): SkillKey {
  return (SKILLS as readonly string[]).includes(value ?? "")
    ? (value as SkillKey)
    : "ops";
}

const TIER_UNLOCKS: { level: number; label: (m: SkillMeta) => string }[] = [
  { level: 0, label: () => "Claim starter bounties from the open board" },
  { level: 1, label: (m) => `Claim standard ${m.label.toLowerCase()} missions` },
  { level: 2, label: (m) => `Lead ${m.label.toLowerCase()} missions in client areas` },
  { level: 3, label: (m) => `Claim high-priority ${m.label.toLowerCase()} bounties` },
  { level: 4, label: (m) => `Take urgent, double-XP ${m.label.toLowerCase()} contracts` },
  { level: 5, label: (m) => `Master of ${m.label} — every mission is eligible` },
];

/** What each tier opens up — shown on the tree so the ladder has a payoff. */
export const UNLOCKS: Record<SkillKey, { level: number; label: string }[]> =
  Object.fromEntries(
    SKILLS.map((key) => [
      key,
      TIER_UNLOCKS.map((t) => ({ level: t.level, label: t.label(SKILL_META[key]) })),
    ]),
  ) as Record<SkillKey, { level: number; label: string }[]>;

export function unlocksFor(skill: SkillKey): { level: number; label: string }[] {
  return UNLOCKS[skill];
}

export function nextUnlock(
  skill: SkillKey,
  level: number,
): { level: number; label: string } | null {
  return UNLOCKS[skill].find((u) => u.level > level) ?? null;
}

/** A mission is claimable when your craft level clears its gate. */
export function isEligible(level: number, minSkillLevel: number): boolean {
  return level >= minSkillLevel;
}

/**
 * Suggested gate for a mission, so managers posting bounties get a sane default
 * instead of guessing: bigger and more urgent work asks for a higher craft level.
 */
export function suggestedGate(points: number, priority: string): number {
  let gate = 0;
  if (points >= 40) gate += 1;
  if (points >= 90) gate += 1;
  if (priority === "high") gate += 1;
  if (priority === "urgent") gate += 2;
  return Math.min(MAX_SKILL_LEVEL, gate);
}
