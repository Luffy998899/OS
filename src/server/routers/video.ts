import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

// The video editing bay. One job on the timeline at a time — the whole team can
// see what's being cut right now, what's queued on the whiteboard, and the
// delivery timer on each job. The script rides along so the editor can copy it.

const jobInclude = {
  client: { select: { id: true, companyName: true } },
  editor: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const videoRouter = router({
  /** The bay's live state: what's on the timeline, the queue, recent deliveries. */
  state: protectedProcedure.query(async ({ ctx }) => {
    const [editing, queued, delivered] = await Promise.all([
      ctx.db.videoJob.findFirst({
        where: { status: "editing" },
        include: jobInclude,
        orderBy: { startedAt: "desc" },
      }),
      ctx.db.videoJob.findMany({
        where: { status: "queued" },
        include: jobInclude,
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
      ctx.db.videoJob.findMany({
        where: { status: "delivered" },
        include: jobInclude,
        orderBy: { deliveredAt: "desc" },
        take: 5,
      }),
    ]);
    return { editing, queued, delivered };
  }),

  add: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        title: z.string().min(2),
        clientId: z.string().optional(),
        script: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        deliverBy: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tail = await ctx.db.videoJob.findFirst({
        where: { status: "queued" },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return ctx.db.videoJob.create({
        data: {
          title: input.title.trim(),
          clientId: input.clientId || null,
          script: input.script,
          priority: input.priority,
          deliverBy: input.deliverBy,
          position: (tail?.position ?? 0) + 1,
        },
      });
    }),

  /** Sit down at the chair: pull a queued job onto the timeline. */
  start: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const busy = await ctx.db.videoJob.findFirst({ where: { status: "editing" } });
      if (busy) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `“${busy.title}” is on the timeline — deliver or requeue it first.`,
        });
      }
      const claimed = await ctx.db.videoJob.updateMany({
        where: { id: input.id, status: "queued" },
        data: { status: "editing", editorId: ctx.user.id, startedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "That job left the queue already." });
      }
      return { ok: true };
    }),

  /** Put the current cut back on the whiteboard (front of the queue). */
  requeue: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.videoJob.findUnique({ where: { id: input.id } });
      if (!job || job.status !== "editing") throw new TRPCError({ code: "NOT_FOUND" });
      const head = await ctx.db.videoJob.findFirst({
        where: { status: "queued" },
        orderBy: { position: "asc" },
        select: { position: true },
      });
      await ctx.db.videoJob.update({
        where: { id: job.id },
        data: {
          status: "queued",
          position: (head?.position ?? 1) - 1,
          editorId: null,
          startedAt: null,
        },
      });
      return { ok: true };
    }),

  deliver: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.videoJob.findUnique({ where: { id: input.id } });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      if (job.status !== "editing") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only the job on the timeline delivers." });
      }
      await ctx.db.videoJob.update({
        where: { id: job.id },
        data: { status: "delivered", deliveredAt: new Date() },
      });
      return { ok: true };
    }),

  /** Nudge a queued job up or down the whiteboard. */
  reorder: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string(), direction: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      const queue = await ctx.db.videoJob.findMany({
        where: { status: "queued" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      });
      const i = queue.findIndex((j) => j.id === input.id);
      if (i === -1) throw new TRPCError({ code: "NOT_FOUND" });
      const j = input.direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= queue.length) return { ok: true };
      await ctx.db.$transaction([
        ctx.db.videoJob.update({ where: { id: queue[i].id }, data: { position: queue[j].position } }),
        ctx.db.videoJob.update({ where: { id: queue[j].id }, data: { position: queue[i].position } }),
      ]);
      return { ok: true };
    }),

  updateScript: protectedProcedure
    .input(z.object({ id: z.string(), script: z.string().max(20_000) }))
    .mutation(({ ctx, input }) =>
      ctx.db.videoJob.update({ where: { id: input.id }, data: { script: input.script } }),
    ),

  updateMeta: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(2).optional(),
        deliverBy: z.date().nullable().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.videoJob.update({ where: { id }, data });
    }),

  remove: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.videoJob.delete({ where: { id: input.id } })),
});
