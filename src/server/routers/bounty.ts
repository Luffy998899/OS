import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { bountyReward, compareBounties } from "@/lib/bounty";
import {
  SKILL_META,
  SKILL_ROOM_KEY,
  isEligible,
  normalizeSkill,
  skillForVertical,
  tierName,
} from "@/lib/skills";
import { craftLevelsFor } from "../missions";
import { VERTICAL_ROOM_KEY, skillEnum, skillLevelSchema } from "./task";

const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);
const verticalEnum = z.enum([
  "website-dev",
  "digital-marketing",
  "roadmap",
  "client-outreach",
  "billing",
]);

const bountyInclude = {
  createdBy: { select: { id: true, name: true } },
  client: { select: { id: true, companyName: true } },
  room: { select: { id: true, name: true, key: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

/** Where a bounty lands on the floor: its client's area, else its craft's room. */
async function resolveBountyRoom(
  db: typeof import("@/lib/db").db,
  opts: { skill: string; vertical: string; clientId?: string | null; provided?: string | null },
): Promise<string | null> {
  if (opts.provided) return opts.provided;
  if (opts.clientId) {
    const clientRoom = await db.room.findFirst({
      where: { clientId: opts.clientId },
      select: { id: true },
    });
    if (clientRoom) return clientRoom.id;
  }
  for (const key of [SKILL_ROOM_KEY[normalizeSkill(opts.skill)], VERTICAL_ROOM_KEY[opts.vertical]]) {
    if (!key) continue;
    const room = await db.room.findUnique({ where: { key }, select: { id: true } });
    if (room) return room.id;
  }
  return null;
}

export const bountyRouter = router({
  /**
   * The open board: every unclaimed mission, hottest first, each priced with its
   * live urgency bonus and marked with whether the caller's craft level clears
   * the gate.
   */
  board: protectedProcedure.query(async ({ ctx }) => {
    const [tasks, levels] = await Promise.all([
      ctx.db.task.findMany({
        where: {
          isBounty: true,
          assigneeId: null,
          approvalStatus: "approved",
          status: { notIn: ["done"] },
        },
        include: bountyInclude,
        take: 60,
      }),
      craftLevelsFor(ctx.db, ctx.user.id),
    ]);

    const now = new Date();
    const rows = tasks.map((t) => {
      const skill = normalizeSkill(t.skill);
      const reward = bountyReward({
        points: t.points,
        priority: t.priority,
        dueAt: t.dueAt,
        now,
      });
      const level = levels[skill];
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        vertical: t.vertical,
        priority: t.priority,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        estimateMinutes: t.estimateMinutes,
        room: t.room,
        client: t.client,
        postedBy: t.createdBy,
        skill,
        skillLabel: SKILL_META[skill].label,
        minSkillLevel: t.minSkillLevel,
        requiredTier: tierName(t.minSkillLevel),
        yourLevel: level,
        eligible: isEligible(level, t.minSkillLevel),
        ...reward,
      };
    });

    rows.sort(compareBounties);
    return {
      bounties: rows,
      levels,
      eligibleCount: rows.filter((r) => r.eligible).length,
    };
  }),

  /** Bounties the caller has claimed and not yet finished. */
  mine: protectedProcedure.query(({ ctx }) =>
    ctx.db.task.findMany({
      where: {
        isBounty: true,
        assigneeId: ctx.user.id,
        status: { not: "done" },
      },
      orderBy: [{ claimedAt: "desc" }],
      include: bountyInclude,
    }),
  ),

  /**
   * Grab a bounty off the wall. The urgency bonus is frozen onto the task here,
   * so the reward you signed up for is the reward you get paid — even if the
   * deadline slips past while you work on it.
   */
  claim: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({ where: { id: input.id } });
      if (!task || !task.isBounty) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.assigneeId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Someone grabbed this one first.",
        });
      }

      const skill = normalizeSkill(task.skill);
      const levels = await craftLevelsFor(ctx.db, ctx.user.id);
      if (!isEligible(levels[skill], task.minSkillLevel)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Needs ${SKILL_META[skill].label} ${tierName(task.minSkillLevel)} — you're ${tierName(levels[skill])}. Earn XP on smaller ${SKILL_META[skill].label.toLowerCase()} missions first.`,
        });
      }

      const reward = bountyReward({
        points: task.points,
        priority: task.priority,
        dueAt: task.dueAt,
      });

      // Conditional update — two people hitting the board at once means one of
      // them loses the race here rather than both thinking they own the work.
      const claimed = await ctx.db.task.updateMany({
        where: { id: task.id, assigneeId: null, isBounty: true },
        data: {
          assigneeId: ctx.user.id,
          claimedAt: new Date(),
          bountyBonus: reward.bonus,
        },
      });
      if (claimed.count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Someone grabbed this one first.",
        });
      }

      await ctx.db.taskActivity.create({
        data: {
          taskId: task.id,
          type: "claimed",
          actorId: ctx.user.id,
          meta: JSON.stringify({ bonus: reward.bonus, tier: reward.tier }),
        },
      });
      if (task.createdById !== ctx.user.id) {
        await ctx.db.notification.create({
          data: {
            userId: task.createdById,
            type: "task_assigned",
            title: "Bounty claimed",
            body: `${ctx.user.name} grabbed “${task.title}”`,
            meta: JSON.stringify({ taskId: task.id }),
          },
        });
      }

      return { id: task.id, title: task.title, reward };
    }),

  /** Put a claimed bounty back on the wall for someone else. */
  release: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({ where: { id: input.id } });
      if (!task || !task.isBounty) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.assigneeId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "That isn't your bounty." });
      }
      if (task.status === "done") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Finished missions can't go back on the board.",
        });
      }

      await ctx.db.task.update({
        where: { id: task.id },
        data: {
          assigneeId: null,
          claimedAt: null,
          bountyBonus: 0,
          status: "todo",
          startedAt: null,
        },
      });
      await ctx.db.taskActivity.create({
        data: { taskId: task.id, type: "released", actorId: ctx.user.id },
      });
      return { ok: true };
    }),

  /** Pin an unassigned mission to the board for anyone eligible to grab. */
  post: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        title: z.string().min(3),
        description: z.string().optional(),
        vertical: verticalEnum.default("roadmap"),
        priority: priorityEnum.default("medium"),
        points: z.number().int().min(0).max(1000).default(20),
        skill: skillEnum.optional(),
        minSkillLevel: skillLevelSchema.default(0),
        dueAt: z.date().optional(),
        estimateMinutes: z.number().int().positive().optional(),
        clientId: z.string().optional(),
        roomId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const skill = input.skill ?? skillForVertical(input.vertical);
      const roomId = await resolveBountyRoom(ctx.db, {
        skill,
        vertical: input.vertical,
        clientId: input.clientId,
        provided: input.roomId,
      });

      return ctx.db.task.create({
        data: {
          title: input.title,
          description: input.description,
          vertical: input.vertical,
          priority: input.priority,
          points: input.points,
          skill,
          minSkillLevel: input.minSkillLevel,
          isBounty: true,
          assigneeId: null,
          clientId: input.clientId || null,
          roomId,
          dueAt: input.dueAt,
          estimateMinutes: input.estimateMinutes,
          createdById: ctx.user.id,
          approvalStatus: "approved",
          activities: { create: { type: "posted", actorId: ctx.user.id } },
        },
      });
    }),

  /** Take an unclaimed bounty back off the wall. */
  unlist: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({ where: { id: input.id } });
      if (!task || !task.isBounty) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.assigneeId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That bounty is already claimed — ask the owner to release it.",
        });
      }
      await ctx.db.task.delete({ where: { id: task.id } });
      return { ok: true };
    }),
});
