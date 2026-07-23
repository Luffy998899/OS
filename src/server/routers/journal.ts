import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { istDateString } from "@/lib/time";

export const journalRouter = router({
  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.dailyJournal.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ),

  create: protectedProcedure
    .input(z.object({ content: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.db.dailyJournal.create({
        data: {
          userId: ctx.user.id,
          date: istDateString(),
          content: input.content.trim(),
        },
      }),
    ),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.dailyJournal.deleteMany({
        where: { id: input.id, userId: ctx.user.id },
      });
      return { ok: true };
    }),
});
