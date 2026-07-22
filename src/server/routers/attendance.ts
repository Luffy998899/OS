import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { istDateString } from "@/lib/time";

export const attendanceRouter = router({
  current: protectedProcedure.query(async ({ ctx }) => {
    const shift = await ctx.db.shift.findFirst({
      where: { userId: ctx.user.id, status: "active" },
      orderBy: { checkInAt: "desc" },
    });
    const date = istDateString();
    const todayReport = await ctx.db.dayReport.findFirst({
      where: { userId: ctx.user.id, date },
    });
    return { shift, todayReport, date };
  }),

  checkIn: protectedProcedure
    .input(z.object({ note: z.string().max(280).optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.shift.findFirst({
        where: { userId: ctx.user.id, status: "active" },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have an active shift.",
        });
      }
      return ctx.db.shift.create({
        data: { userId: ctx.user.id, checkInNote: input.note?.trim() || null },
      });
    }),

  checkOut: protectedProcedure
    .input(
      z.object({
        summary: z.string().min(5, "Add a short summary of your day."),
        blockers: z.string().max(1000).optional(),
        hoursWorked: z.number().min(0).max(24).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const shift = await ctx.db.shift.findFirst({
        where: { userId: ctx.user.id, status: "active" },
        orderBy: { checkInAt: "desc" },
      });
      if (!shift) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active shift to check out from.",
        });
      }
      const now = new Date();
      const autoHours =
        (now.getTime() - shift.checkInAt.getTime()) / 3_600_000;
      const hoursWorked =
        input.hoursWorked ?? Math.round(autoHours * 100) / 100;
      const date = istDateString(shift.checkInAt);

      const report = await ctx.db.dayReport.create({
        data: {
          userId: ctx.user.id,
          shiftId: shift.id,
          date,
          summary: input.summary.trim(),
          blockers: input.blockers?.trim() || null,
          hoursWorked,
        },
      });
      await ctx.db.shift.update({
        where: { id: shift.id },
        data: { checkOutAt: now, status: "completed" },
      });
      return report;
    }),

  history: protectedProcedure.query(({ ctx }) =>
    ctx.db.shift.findMany({
      where: { userId: ctx.user.id },
      orderBy: { checkInAt: "desc" },
      take: 30,
      include: { report: true },
    }),
  ),
});
