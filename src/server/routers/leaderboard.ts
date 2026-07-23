import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const leaderboardRouter = router({
  standings: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { status: { not: "suspended" } },
      orderBy: [{ points: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        department: true,
        title: true,
        points: true,
      },
    });
    return users.map((u, i) => ({ ...u, rank: i + 1, isMe: u.id === ctx.user.id }));
  }),

  rewards: protectedProcedure.query(async ({ ctx }) => {
    const [rewards, redemptions, me] = await Promise.all([
      ctx.db.reward.findMany({
        where: { active: true },
        orderBy: { costPoints: "asc" },
      }),
      ctx.db.rewardRedemption.findMany({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: "desc" },
        include: { reward: { select: { name: true } } },
      }),
      ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { points: true },
      }),
    ]);
    return { rewards, redemptions, points: me?.points ?? 0 };
  }),

  redeem: protectedProcedure
    .input(z.object({ rewardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const reward = await ctx.db.reward.findUnique({
        where: { id: input.rewardId },
      });
      if (!reward || !reward.active) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: { points: true },
      });
      if (!user || user.points < reward.costPoints) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough points yet — keep completing missions.",
        });
      }
      await ctx.db.$transaction([
        ctx.db.rewardRedemption.create({
          data: {
            userId: ctx.user.id,
            rewardId: reward.id,
            pointsSpent: reward.costPoints,
            status: "pending",
          },
        }),
        ctx.db.pointsLedger.create({
          data: {
            userId: ctx.user.id,
            delta: -reward.costPoints,
            reason: `Redeemed reward: ${reward.name}`,
          },
        }),
        ctx.db.user.update({
          where: { id: ctx.user.id },
          data: { points: { decrement: reward.costPoints } },
        }),
      ]);
      return { ok: true };
    }),

  createReward: permissionProcedure(PERMISSIONS.REWARDS_MANAGE)
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        costPoints: z.number().int().min(1),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.reward.create({
        data: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          costPoints: input.costPoints,
        },
      }),
    ),

  removeReward: permissionProcedure(PERMISSIONS.REWARDS_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.reward.update({
        where: { id: input.id },
        data: { active: false },
      });
      return { ok: true };
    }),
});
