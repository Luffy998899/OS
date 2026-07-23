import { z } from "zod";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const serviceRouter = router({
  list: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.db.service.findMany({
        where: input?.includeInactive ? {} : { active: true },
        orderBy: { createdAt: "desc" },
      }),
    ),

  active: permissionProcedure(PERMISSIONS.BILLING_MANAGE).query(({ ctx }) =>
    ctx.db.service.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ),

  create: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(
      z.object({
        name: z.string().min(1),
        category: z.string().optional(),
        description: z.string().optional(),
        hsnSac: z.string().optional(),
        basePrice: z.number().min(0).default(0),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.service.create({
        data: {
          name: input.name.trim(),
          category: input.category?.trim() || null,
          description: input.description?.trim() || null,
          hsnSac: input.hsnSac?.trim() || null,
          basePrice: input.basePrice,
        },
      }),
    ),

  update: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        category: z.string().optional(),
        description: z.string().optional(),
        hsnSac: z.string().optional(),
        basePrice: z.number().min(0).optional(),
        active: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.db.service.update({ where: { id }, data: rest });
    }),

  remove: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.service.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
