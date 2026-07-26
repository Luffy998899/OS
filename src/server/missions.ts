import type { Prisma } from "@prisma/client";
import type { db as database } from "@/lib/db";
import { SKILLS, normalizeSkill, skillLevel, type SkillKey } from "@/lib/skills";

/**
 * Completing a mission pays its base points plus whatever urgency bonus was
 * frozen onto it when it was claimed off the bounty board.
 */
export function missionXp(task: { points: number; bountyBonus?: number | null }): number {
  return Math.max(0, task.points + (task.bountyBonus ?? 0));
}

/**
 * Credit (or reverse) a mission's XP. It lands in three places that have to move
 * together: the ledger for the audit trail, the cached lifetime total for the
 * leaderboard, and the craft track that drives the skill tree.
 */
export async function applyMissionXp(
  tx: Prisma.TransactionClient,
  opts: {
    userId: string;
    skill: string;
    delta: number;
    reason: string;
    taskId?: string | null;
  },
): Promise<void> {
  if (opts.delta === 0) return;
  const skill = normalizeSkill(opts.skill);

  await tx.pointsLedger.create({
    data: {
      userId: opts.userId,
      delta: opts.delta,
      reason: opts.reason,
      taskId: opts.taskId ?? null,
    },
  });
  await tx.user.update({
    where: { id: opts.userId },
    data: { points: { increment: opts.delta } },
  });

  // Craft XP never goes negative — reopening a mission takes back what it gave,
  // not more, so a demotion can't be engineered by reopening old work.
  const current = await tx.skillProgress.findUnique({
    where: { userId_skill: { userId: opts.userId, skill } },
    select: { xp: true },
  });
  const next = Math.max(0, (current?.xp ?? 0) + opts.delta);
  await tx.skillProgress.upsert({
    where: { userId_skill: { userId: opts.userId, skill } },
    create: { userId: opts.userId, skill, xp: next },
    update: { xp: next },
  });
}

export type CraftLevels = Record<SkillKey, number>;
export type CraftXp = Record<SkillKey, number>;

export function emptyCraftXp(): CraftXp {
  return { design: 0, dev: 0, video: 0, ops: 0 };
}

/** Every craft track for a user, with untouched crafts reported as zero. */
export async function craftXpFor(
  db: typeof database | Prisma.TransactionClient,
  userId: string,
): Promise<CraftXp> {
  const rows = await db.skillProgress.findMany({
    where: { userId },
    select: { skill: true, xp: true },
  });
  const out = emptyCraftXp();
  for (const row of rows) out[normalizeSkill(row.skill)] = row.xp;
  return out;
}

export function levelsFromXp(xp: CraftXp): CraftLevels {
  const out = {} as CraftLevels;
  for (const key of SKILLS) out[key] = skillLevel(xp[key]);
  return out;
}

export async function craftLevelsFor(
  db: typeof database | Prisma.TransactionClient,
  userId: string,
): Promise<CraftLevels> {
  return levelsFromXp(await craftXpFor(db, userId));
}
