import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";

const userSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  title: true,
  department: true,
  phone: true,
  status: true,
  points: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

export const userRouter = router({
  // Lightweight list for assignment UIs (managers can assign without managing people).
  assignable: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { status: { not: "suspended" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        department: true,
        role: { select: { name: true } },
      },
    }),
  ),

  list: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE).query(({ ctx }) =>
    ctx.db.user.findMany({ orderBy: { createdAt: "asc" }, select: userSelect }),
  ),

  create: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(
      z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        roleId: z.string(),
        department: z.string().optional(),
        title: z.string().optional(),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const email = input.email.toLowerCase().trim();
      const exists = await ctx.db.user.findUnique({ where: { email } });
      if (exists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That email is already in use.",
        });
      }
      const passwordHash = await hashPassword(input.password);
      return ctx.db.user.create({
        data: {
          email,
          name: input.name.trim(),
          passwordHash,
          roleId: input.roleId,
          department: input.department?.trim() || null,
          title: input.title?.trim() || null,
          phone: input.phone?.trim() || null,
        },
        select: userSelect,
      });
    }),

  update: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(2).optional(),
        roleId: z.string().optional(),
        department: z.string().optional(),
        title: z.string().optional(),
        phone: z.string().optional(),
        status: z.enum(["active", "suspended", "invited"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.status === "suspended" && input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't suspend your own account.",
        });
      }
      const { id, ...data } = input;
      return ctx.db.user.update({
        where: { id },
        data: {
          ...data,
          department:
            data.department !== undefined
              ? data.department.trim() || null
              : undefined,
          title:
            data.title !== undefined ? data.title.trim() || null : undefined,
        },
        select: userSelect,
      });
    }),

  resetPassword: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(z.object({ id: z.string(), password: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      await ctx.db.user.update({
        where: { id: input.id },
        data: { passwordHash },
      });
      return { ok: true };
    }),

  remove: permissionProcedure(PERMISSIONS.PEOPLE_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't remove your own account.",
        });
      }
      const target = await ctx.db.user.findUnique({
        where: { id: input.id },
        include: { role: true },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      if (target.role.name === "Admin") {
        const adminCount = await ctx.db.user.count({
          where: { role: { name: "Admin" } },
        });
        if (adminCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can't remove the last admin.",
          });
        }
      }
      await ctx.db.user.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
