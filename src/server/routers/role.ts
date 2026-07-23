import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS, ALL_PERMISSIONS } from "@/lib/auth/permissions";

const permsSchema = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]]));

export const roleRouter = router({
  list: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE).query(({ ctx }) =>
    ctx.db.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    }),
  ),

  create: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(
      z.object({
        name: z.string().min(2),
        description: z.string().optional(),
        permissions: permsSchema.default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.db.role.findUnique({
        where: { name: input.name.trim() },
      });
      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A role with that name already exists.",
        });
      }
      return ctx.db.role.create({
        data: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          permissions: JSON.stringify(input.permissions),
          isSystem: false,
        },
      });
    }),

  update: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(
      z.object({
        id: z.string(),
        description: z.string().optional(),
        permissions: permsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.role.findUnique({ where: { id: input.id } });
      if (!role) throw new TRPCError({ code: "NOT_FOUND" });

      // The Admin role must always keep the wildcard so the workspace can't be
      // locked out.
      const permissions =
        role.name === "Admin" ? ["*"] : input.permissions;

      return ctx.db.role.update({
        where: { id: input.id },
        data: {
          description: input.description?.trim() ?? role.description,
          permissions: JSON.stringify(permissions),
        },
      });
    }),

  remove: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.db.role.findUnique({
        where: { id: input.id },
        include: { _count: { select: { users: true } } },
      });
      if (!role) throw new TRPCError({ code: "NOT_FOUND" });
      if (role.isSystem) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "System roles can't be deleted.",
        });
      }
      if (role._count.users > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Reassign this role's members before deleting it.",
        });
      }
      await ctx.db.role.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
