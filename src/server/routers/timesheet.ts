import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { istDateString } from "@/lib/time";

function canSeeAll(permissions: string[]): boolean {
  return hasPermission(permissions, PERMISSIONS.REPORTS_VIEW);
}

export const timesheetRouter = router({
  summary: protectedProcedure
    .input(z.object({ scope: z.enum(["me", "all"]).default("me") }).optional())
    .query(async ({ ctx, input }) => {
      const scope = input?.scope ?? "me";
      const where =
        scope === "all" && canSeeAll(ctx.user.permissions)
          ? {}
          : { userId: ctx.user.id };
      const entries = await ctx.db.timeEntry.findMany({ where });
      let total = 0;
      let invoiced = 0;
      let notInvoiced = 0;
      for (const e of entries) {
        total += e.durationSeconds;
        if (e.invoiceStatus === "invoiced") invoiced += e.durationSeconds;
        else notInvoiced += e.durationSeconds;
      }
      return { totalSeconds: total, invoicedSeconds: invoiced, notInvoicedSeconds: notInvoiced, count: entries.length };
    }),

  entries: protectedProcedure
    .input(z.object({ scope: z.enum(["me", "all"]).default("me") }).optional())
    .query(({ ctx, input }) => {
      const scope = input?.scope ?? "me";
      const where =
        scope === "all" && canSeeAll(ctx.user.permissions)
          ? {}
          : { userId: ctx.user.id };
      return ctx.db.timeEntry.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          client: { select: { id: true, companyName: true } },
          task: { select: { id: true, title: true } },
        },
      });
    }),

  add: protectedProcedure
    .input(
      z.object({
        description: z.string().max(280).optional(),
        date: z.string().optional(),
        startTime: z.string().optional(),
        hours: z.number().min(0).max(24),
        clientId: z.string().optional(),
        taskId: z.string().optional(),
        invoiceStatus: z.enum(["invoiced", "not_invoiced"]).default("not_invoiced"),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.timeEntry.create({
        data: {
          userId: ctx.user.id,
          description: input.description?.trim() || null,
          date: input.date || istDateString(),
          startTime: input.startTime || null,
          durationSeconds: Math.round(input.hours * 3600),
          clientId: input.clientId || null,
          taskId: input.taskId || null,
          invoiceStatus: input.invoiceStatus,
        },
      }),
    ),
});
