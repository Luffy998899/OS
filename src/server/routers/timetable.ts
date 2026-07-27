import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  generateDayPlan,
  currentSlot,
  nextSlot,
  needsRelogin,
  minutesNow,
  dateKey,
  type PlanTask,
} from "@/lib/timetable";

// The timetable room. The AI seeks everyone's workload and splits the day into
// school-style periods; the bell rings on every change, lunch is protected, and
// after lunch the team logs back in so tracking has no silent gap.

export const timetableRouter = router({
  /** My day (or, for managers, anyone's): slots, the running block, the gate. */
  today: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = input?.userId ?? ctx.user.id;
      if (userId !== ctx.user.id && !hasPermission(ctx.user.permissions, PERMISSIONS.TASKS_ASSIGN)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const date = dateKey();
      const [slots, relog] = await Promise.all([
        ctx.db.timetableSlot.findMany({
          where: { userId, date },
          orderBy: { startMin: "asc" },
        }),
        ctx.db.timetableLog.findUnique({
          where: { userId_date_type: { userId, date, type: "back_from_lunch" } },
        }),
      ]);
      const nowMin = minutesNow();
      return {
        date,
        slots,
        current: currentSlot(slots, nowMin),
        next: nextSlot(slots, nowMin),
        relogged: !!relog,
        needsRelogin: needsRelogin(slots, nowMin, !!relog),
      };
    }),

  /** The wall view: everyone's day side by side. */
  team: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).query(async ({ ctx }) => {
    const date = dateKey();
    const [users, slots] = await Promise.all([
      ctx.db.user.findMany({
        where: { status: "active" },
        select: { id: true, name: true, department: true },
        orderBy: { name: "asc" },
      }),
      ctx.db.timetableSlot.findMany({ where: { date }, orderBy: { startMin: "asc" } }),
    ]);
    const nowMin = minutesNow();
    return users.map((u) => {
      const mine = slots.filter((s) => s.userId === u.id);
      return {
        ...u,
        slots: mine,
        current: currentSlot(mine, nowMin),
      };
    });
  }),

  /**
   * The AI seeks the workload and lays the day out. Developers get project-basis
   * blocks; everyone else gets the school template with client periods filled
   * from their open missions.
   */
  generate: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const userId = input?.userId ?? ctx.user.id;
      if (userId !== ctx.user.id && !hasPermission(ctx.user.permissions, PERMISSIONS.TASKS_ASSIGN)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
        select: { department: true },
      });
      const open = await ctx.db.task.findMany({
        where: { assigneeId: userId, approvalStatus: "approved", status: { notIn: ["done"] } },
        include: { client: { select: { id: true, companyName: true } } },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take: 12,
      });
      const tasks: PlanTask[] = open.map((t) => ({
        id: t.id,
        title: t.title,
        clientId: t.clientId,
        clientName: t.client?.companyName ?? null,
        priority: t.priority,
        dueAt: t.dueAt,
      }));
      const developer = (user?.department ?? "").toLowerCase().includes("engineer");
      const plan = generateDayPlan(tasks, { developer });

      const date = dateKey();
      await ctx.db.$transaction([
        ctx.db.timetableSlot.deleteMany({ where: { userId, date, source: "ai" } }),
        ctx.db.timetableSlot.createMany({
          data: plan.map((s) => ({
            userId,
            date,
            startMin: s.startMin,
            endMin: s.endMin,
            label: s.label,
            kind: s.kind,
            clientId: s.clientId ?? null,
            source: "ai",
          })),
        }),
      ]);
      return { ok: true, slots: plan.length };
    }),

  /** Lay out the whole team's day in one go. */
  generateAll: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).mutation(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { status: "active" },
      select: { id: true, department: true },
    });
    const date = dateKey();
    let made = 0;
    for (const u of users) {
      const open = await ctx.db.task.findMany({
        where: { assigneeId: u.id, approvalStatus: "approved", status: { notIn: ["done"] } },
        include: { client: { select: { id: true, companyName: true } } },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take: 12,
      });
      const plan = generateDayPlan(
        open.map((t) => ({
          id: t.id,
          title: t.title,
          clientId: t.clientId,
          clientName: t.client?.companyName ?? null,
          priority: t.priority,
          dueAt: t.dueAt,
        })),
        { developer: (u.department ?? "").toLowerCase().includes("engineer") },
      );
      await ctx.db.$transaction([
        ctx.db.timetableSlot.deleteMany({ where: { userId: u.id, date, source: "ai" } }),
        ctx.db.timetableSlot.createMany({
          data: plan.map((s) => ({
            userId: u.id,
            date,
            startMin: s.startMin,
            endMin: s.endMin,
            label: s.label,
            kind: s.kind,
            clientId: s.clientId ?? null,
            source: "ai",
          })),
        }),
      ]);
      made++;
    }
    return { ok: true, users: made };
  }),

  /** The post-lunch gate: log back in so the afternoon is tracked. */
  relogin: protectedProcedure.mutation(async ({ ctx }) => {
    const date = dateKey();
    await ctx.db.timetableLog.upsert({
      where: { userId_date_type: { userId: ctx.user.id, date, type: "back_from_lunch" } },
      create: { userId: ctx.user.id, date, type: "back_from_lunch" },
      update: {},
    });
    return { ok: true };
  }),
});
