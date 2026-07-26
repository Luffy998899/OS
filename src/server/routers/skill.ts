import { router, protectedProcedure } from "../trpc";
import {
  SKILLS,
  SKILL_META,
  isEligible,
  normalizeSkill,
  nextUnlock,
  skillInfo,
  tierName,
  unlocksFor,
  type SkillKey,
} from "@/lib/skills";
import { levelInfo } from "@/lib/xp";
import { craftXpFor, emptyCraftXp, levelsFromXp } from "../missions";

export const skillRouter = router({
  /**
   * The caller's craft ladder: XP per track, the tier it buys, what the next
   * tier unlocks, and how much of the open board each level is currently
   * holding back.
   */
  tree: protectedProcedure.query(async ({ ctx }) => {
    const [xp, me, openBounties, completed] = await Promise.all([
      craftXpFor(ctx.db, ctx.user.id),
      ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { points: true },
      }),
      ctx.db.task.findMany({
        where: {
          isBounty: true,
          assigneeId: null,
          approvalStatus: "approved",
          status: { notIn: ["done"] },
        },
        select: { skill: true, minSkillLevel: true },
      }),
      ctx.db.task.groupBy({
        by: ["skill"],
        where: { assigneeId: ctx.user.id, status: "done" },
        _count: { _all: true },
      }),
    ]);

    const levels = levelsFromXp(xp);
    const doneBySkill = emptyCraftXp();
    for (const row of completed) doneBySkill[normalizeSkill(row.skill)] = row._count._all;

    const tracks = SKILLS.map((key: SkillKey) => {
      const info = skillInfo(xp[key]);
      const forSkill = openBounties.filter((b) => normalizeSkill(b.skill) === key);
      return {
        ...SKILL_META[key],
        ...info,
        missionsCompleted: doneBySkill[key],
        unlocks: unlocksFor(key).map((u) => ({ ...u, earned: levels[key] >= u.level })),
        // `next` from skillInfo is the next tier's name; this is what it buys.
        nextUnlock: nextUnlock(key, levels[key]),
        openBounties: forSkill.length,
        eligibleBounties: forSkill.filter((b) => isEligible(levels[key], b.minSkillLevel)).length,
      };
    });

    const totalCraftXp = SKILLS.reduce((sum, key) => sum + xp[key], 0);
    const top = [...tracks].sort((a, b) => b.xp - a.xp)[0];

    return {
      tracks,
      levels,
      overall: levelInfo(me?.points ?? 0),
      points: me?.points ?? 0,
      totalCraftXp,
      /** The craft you've invested most in — your title on the floor. */
      speciality:
        top && top.xp > 0
          ? { key: top.key, label: top.label, tier: tierName(top.level), level: top.level }
          : null,
    };
  }),

  /** Everyone's craft levels, for the roster panel inside the game. */
  roster: protectedProcedure.query(async ({ ctx }) => {
    const [users, progress] = await Promise.all([
      ctx.db.user.findMany({
        where: { status: { not: "suspended" } },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          title: true,
          department: true,
          points: true,
        },
        orderBy: { points: "desc" },
        take: 60,
      }),
      ctx.db.skillProgress.findMany({ select: { userId: true, skill: true, xp: true } }),
    ]);

    const byUser = new Map<string, ReturnType<typeof emptyCraftXp>>();
    for (const row of progress) {
      const bag = byUser.get(row.userId) ?? emptyCraftXp();
      bag[normalizeSkill(row.skill)] = row.xp;
      byUser.set(row.userId, bag);
    }

    return users.map((u) => {
      const xp = byUser.get(u.id) ?? emptyCraftXp();
      const levels = levelsFromXp(xp);
      const best = SKILLS.reduce((a, b) => (xp[b] > xp[a] ? b : a), SKILLS[0]);
      return {
        ...u,
        level: levelInfo(u.points).level,
        crafts: SKILLS.map((key) => ({
          key,
          label: SKILL_META[key].label,
          color: SKILL_META[key].color,
          xp: xp[key],
          level: levels[key],
          tier: tierName(levels[key]),
        })),
        speciality: xp[best] > 0 ? { key: best, label: SKILL_META[best].label, tier: tierName(levels[best]) } : null,
      };
    });
  }),
});
