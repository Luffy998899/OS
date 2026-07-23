import { z } from "zod";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { istDateString } from "@/lib/time";

export const expenseRouter = router({
  list: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.db.expense.findMany({
        where: input?.search
          ? { title: { contains: input.search } }
          : {},
        orderBy: { date: "desc" },
      }),
    ),

  create: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(
      z.object({
        title: z.string().min(1),
        category: z.string().optional(),
        amount: z.number().min(0),
        notes: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.expense.create({
        data: {
          title: input.title.trim(),
          category: input.category?.trim() || null,
          amount: input.amount,
          notes: input.notes?.trim() || null,
          date: input.date || istDateString(),
          createdById: ctx.user.id,
        },
      }),
    ),

  update: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        category: z.string().optional(),
        amount: z.number().min(0).optional(),
        notes: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.db.expense.update({ where: { id }, data: rest });
    }),

  remove: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.expense.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
