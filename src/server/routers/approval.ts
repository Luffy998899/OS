import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

// The managing heads' desk: leave applications, sign-offs on work, and any
// query the team wants a decision on. Everything gets a visible yes/no + note.

const kindEnum = z.enum(["leave", "approval", "query"]);

const reqInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const approvalRouter = router({
  mine: protectedProcedure.query(({ ctx }) =>
    ctx.db.approvalRequest.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: reqInclude,
    }),
  ),

  /** The heads' queue: pending first, then the recent decisions for context. */
  desk: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).query(async ({ ctx }) => {
    const [pending, decided] = await Promise.all([
      ctx.db.approvalRequest.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        include: reqInclude,
      }),
      ctx.db.approvalRequest.findMany({
        where: { status: { not: "pending" } },
        orderBy: { decidedAt: "desc" },
        take: 15,
        include: reqInclude,
      }),
    ]);
    return { pending, decided };
  }),

  create: protectedProcedure
    .input(
      z.object({
        kind: kindEnum,
        title: z.string().min(3).max(140),
        detail: z.string().max(2000).optional(),
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "leave" && !input.fromDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Leave needs at least a start date." });
      }
      return ctx.db.approvalRequest.create({
        data: {
          userId: ctx.user.id,
          kind: input.kind,
          title: input.title.trim(),
          detail: input.detail?.trim(),
          fromDate: input.fromDate,
          toDate: input.toDate ?? input.fromDate,
        },
      });
    }),

  decide: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        id: z.string(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.approvalRequest.findUnique({ where: { id: input.id } });
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") return req;

      const updated = await ctx.db.approvalRequest.update({
        where: { id: req.id },
        data: {
          status: input.decision,
          decisionNote: input.note?.trim(),
          decidedById: ctx.user.id,
          decidedAt: new Date(),
        },
      });
      await ctx.db.notification.create({
        data: {
          userId: req.userId,
          type: "approval",
          title: input.decision === "approved" ? "Request approved" : "Request declined",
          body: `${req.title}${input.note ? ` — ${input.note}` : ""}`,
        },
      });
      return updated;
    }),

  withdraw: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const req = await ctx.db.approvalRequest.findUnique({ where: { id: input.id } });
      if (!req || req.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already decided." });
      }
      await ctx.db.approvalRequest.delete({ where: { id: req.id } });
      return { ok: true };
    }),
});
