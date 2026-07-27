import { z } from "zod";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { dateKey } from "@/lib/timetable";

// The shoot room: every camera day planned this week, filterable by
// indoor/outdoor, client/internal, and priority.

export const shootRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          location: z.enum(["indoor", "outdoor"]).optional(),
          scope: z.enum(["client", "internal"]).optional(),
          includeDone: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const today = dateKey();
      const rows = await ctx.db.shoot.findMany({
        where: {
          location: input?.location,
          scope: input?.scope,
          ...(input?.includeDone ? {} : { status: "planned" }),
        },
        orderBy: [{ date: "asc" }, { priority: "desc" }],
        take: 60,
        include: { client: { select: { id: true, companyName: true } } },
      });
      return rows.map((s) => ({
        ...s,
        isToday: s.date === today,
        isPast: s.date < today,
      }));
    }),

  create: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        title: z.string().min(2).max(140),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeNote: z.string().max(60).optional(),
        location: z.enum(["indoor", "outdoor"]).default("indoor"),
        scope: z.enum(["client", "internal"]).default("internal"),
        clientId: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.shoot.create({
        data: {
          title: input.title.trim(),
          date: input.date,
          timeNote: input.timeNote?.trim(),
          location: input.location,
          scope: input.scope,
          clientId: input.scope === "client" ? input.clientId || null : null,
          priority: input.priority,
          notes: input.notes?.trim(),
        },
      }),
    ),

  setStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["planned", "done", "cancelled"]) }))
    .mutation(({ ctx, input }) =>
      ctx.db.shoot.update({ where: { id: input.id }, data: { status: input.status } }),
    ),

  remove: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.shoot.delete({ where: { id: input.id } })),
});
