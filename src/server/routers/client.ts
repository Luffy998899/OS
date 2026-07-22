import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

const clientInclude = {
  manager: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { tasks: true, outreach: true } },
} as const;

const statusEnum = z.enum(["new", "active", "suspended", "churned"]);
const tempEnum = z.enum(["hot", "warm", "cold"]);

export const clientRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.client.findMany({
      orderBy: { createdAt: "asc" },
      include: clientInclude,
    }),
  ),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const client = await ctx.db.client.findUnique({
        where: { id: input.id },
        include: {
          manager: { select: { id: true, name: true, avatarUrl: true } },
          outreach: { orderBy: { createdAt: "desc" }, take: 20 },
          tasks: {
            orderBy: { updatedAt: "desc" },
            take: 20,
            include: {
              assignee: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      return client;
    }),

  managers: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE).query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { status: { not: "suspended" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ),

  create: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE)
    .input(
      z.object({
        companyName: z.string().min(1),
        ownerName: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        category: z.string().optional(),
        status: statusEnum.default("new"),
        temperature: tempEnum.default("cold"),
        managerId: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.client.create({
        data: {
          companyName: input.companyName.trim(),
          ownerName: input.ownerName?.trim() || null,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          category: input.category?.trim() || null,
          status: input.status,
          temperature: input.temperature,
          managerId: input.managerId || null,
          notes: input.notes?.trim() || null,
        },
      }),
    ),

  update: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE)
    .input(
      z.object({
        id: z.string(),
        companyName: z.string().min(1).optional(),
        ownerName: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        category: z.string().optional(),
        status: statusEnum.optional(),
        temperature: tempEnum.optional(),
        managerId: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...rest } = input;
      return ctx.db.client.update({
        where: { id },
        data: {
          ...rest,
          managerId: rest.managerId !== undefined ? rest.managerId || null : undefined,
        },
      });
    }),

  remove: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.client.delete({ where: { id: input.id } });
      return { ok: true };
    }),

  addOutreach: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE)
    .input(
      z.object({
        clientId: z.string(),
        channel: z.enum(["call", "email", "whatsapp", "meeting"]),
        outcome: z
          .enum(["followup", "interested", "not_interested", "closed"])
          .optional(),
        note: z.string().optional(),
        nextFollowUpAt: z.date().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.outreachLog.create({
        data: {
          clientId: input.clientId,
          channel: input.channel,
          outcome: input.outcome,
          note: input.note?.trim() || null,
          nextFollowUpAt: input.nextFollowUpAt,
        },
      }),
    ),
});
