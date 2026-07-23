import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  permissionProcedure,
} from "../trpc";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";

const statusEnum = z.enum([
  "todo",
  "in_progress",
  "review",
  "done",
  "blocked",
]);
const verticalEnum = z.enum([
  "website-dev",
  "digital-marketing",
  "roadmap",
  "client-outreach",
  "billing",
]);
const priorityEnum = z.enum(["low", "medium", "high", "urgent"]);

const taskInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true } },
  client: { select: { id: true, companyName: true } },
  room: { select: { id: true, name: true, key: true } },
} as const;

// Which department room a mission lands in, based on its vertical.
export const VERTICAL_ROOM_KEY: Record<string, string> = {
  "website-dev": "developer",
  "digital-marketing": "creative",
  roadmap: "managing-heads",
  "client-outreach": "client",
  billing: "managing-heads",
};

async function resolveRoomId(
  db: { room: { findUnique: (a: { where: { key: string }; select: { id: true } }) => Promise<{ id: string } | null> } },
  vertical: string,
  provided?: string | null,
): Promise<string | null> {
  if (provided) return provided;
  const key = VERTICAL_ROOM_KEY[vertical];
  if (!key) return null;
  const room = await db.room.findUnique({ where: { key }, select: { id: true } });
  return room?.id ?? null;
}

export const taskRouter = router({
  myWork: protectedProcedure.query(({ ctx }) =>
    ctx.db.task.findMany({
      where: { assigneeId: ctx.user.id, approvalStatus: "approved" },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: taskInclude,
    }),
  ),

  list: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z
        .object({
          status: statusEnum.optional(),
          vertical: verticalEnum.optional(),
          assigneeId: z.string().optional(),
          approvalStatus: z
            .enum(["draft", "pending_review", "approved", "rejected"])
            .optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.db.task.findMany({
        where: {
          status: input?.status,
          vertical: input?.vertical,
          assigneeId: input?.assigneeId,
          approvalStatus: input?.approvalStatus ?? "approved",
        },
        orderBy: [{ updatedAt: "desc" }],
        include: taskInclude,
      }),
    ),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: {
          ...taskInclude,
          comments: {
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
          activities: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      return task;
    }),

  create: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        title: z.string().min(3),
        description: z.string().optional(),
        vertical: verticalEnum.default("roadmap"),
        priority: priorityEnum.default("medium"),
        points: z.number().int().min(0).max(1000).default(10),
        assigneeId: z.string().optional(),
        clientId: z.string().optional(),
        roomId: z.string().optional(),
        dueAt: z.date().optional(),
        estimateMinutes: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const roomId = await resolveRoomId(ctx.db, input.vertical, input.roomId);
      const task = await ctx.db.task.create({
        data: {
          title: input.title,
          description: input.description,
          vertical: input.vertical,
          priority: input.priority,
          points: input.points,
          assigneeId: input.assigneeId || null,
          clientId: input.clientId || null,
          roomId,
          dueAt: input.dueAt,
          estimateMinutes: input.estimateMinutes,
          createdById: ctx.user.id,
          approvalStatus: "approved",
          activities: { create: { type: "created", actorId: ctx.user.id } },
        },
      });
      if (input.assigneeId) {
        await ctx.db.notification.create({
          data: {
            userId: input.assigneeId,
            type: "task_assigned",
            title: "New mission assigned",
            body: task.title,
            meta: JSON.stringify({ taskId: task.id }),
          },
        });
      }
      return task;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: statusEnum }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({ where: { id: input.id } });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      const isAssignee = task.assigneeId === ctx.user.id;
      const canManage = hasPermission(
        ctx.user.permissions,
        PERMISSIONS.TASKS_ASSIGN,
      );
      if (!isAssignee && !canManage) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Employees publish work for review; only a manager approves completion
      // (which awards XP). This is the "publish for further review" step.
      if (input.status === "done" && !canManage) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Publish for review — a manager approves completion.",
        });
      }

      const prev = task.status;
      if (prev === input.status) return task;

      const completing = input.status === "done" && prev !== "done";
      const reopening = prev === "done" && input.status !== "done";

      const updated = await ctx.db.$transaction(async (tx) => {
        const t = await tx.task.update({
          where: { id: task.id },
          data: {
            status: input.status,
            startedAt:
              !task.startedAt && input.status === "in_progress"
                ? new Date()
                : task.startedAt,
            completedAt: completing
              ? new Date()
              : reopening
                ? null
                : task.completedAt,
          },
        });
        await tx.taskActivity.create({
          data: {
            taskId: task.id,
            type: "status_changed",
            actorId: ctx.user.id,
            meta: JSON.stringify({ from: prev, to: input.status }),
          },
        });

        // Award / reverse mission points on the assignee's ledger.
        if (task.assigneeId && (completing || reopening)) {
          const delta = completing ? task.points : -task.points;
          await tx.pointsLedger.create({
            data: {
              userId: task.assigneeId,
              delta,
              reason: completing
                ? `Completed mission: ${task.title}`
                : `Reopened mission: ${task.title}`,
              taskId: task.id,
            },
          });
          await tx.user.update({
            where: { id: task.assigneeId },
            data: { points: { increment: delta } },
          });
        }
        return t;
      });

      return updated;
    }),

  addComment: protectedProcedure
    .input(z.object({ taskId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.taskComment.create({
        data: {
          taskId: input.taskId,
          authorId: ctx.user.id,
          body: input.body.trim(),
        },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      await ctx.db.taskActivity.create({
        data: { taskId: input.taskId, type: "commented", actorId: ctx.user.id },
      });
      return comment;
    }),

  pendingReview: permissionProcedure(PERMISSIONS.TASKS_REVIEW).query(({ ctx }) =>
    ctx.db.task.findMany({
      where: { approvalStatus: "pending_review" },
      orderBy: { createdAt: "desc" },
      include: taskInclude,
    }),
  ),

  // Work employees published for review (status "review") awaiting owner approval.
  completions: permissionProcedure(PERMISSIONS.TASKS_ASSIGN).query(({ ctx }) =>
    ctx.db.task.findMany({
      where: { status: "review", approvalStatus: "approved" },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      include: taskInclude,
    }),
  ),

  approveCompletion: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string(), approve: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      // Reuse the same status transition (which awards/reverses XP on done).
      const status = input.approve ? "done" : "in_progress";
      const task = await ctx.db.task.findUnique({ where: { id: input.id } });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });
      if (task.status !== "review") return task;

      const completing = status === "done";
      return ctx.db.$transaction(async (tx) => {
        const t = await tx.task.update({
          where: { id: task.id },
          data: {
            status,
            completedAt: completing ? new Date() : null,
          },
        });
        await tx.taskActivity.create({
          data: {
            taskId: task.id,
            type: completing ? "approved" : "sent_back",
            actorId: ctx.user.id,
          },
        });
        if (completing && task.assigneeId) {
          await tx.pointsLedger.create({
            data: {
              userId: task.assigneeId,
              delta: task.points,
              reason: `Completed mission: ${task.title}`,
              taskId: task.id,
            },
          });
          await tx.user.update({
            where: { id: task.assigneeId },
            data: { points: { increment: task.points } },
          });
          await tx.notification.create({
            data: {
              userId: task.assigneeId,
              type: "reward",
              title: "Mission approved",
              body: `${task.title} — +${task.points} XP`,
            },
          });
        }
        return t;
      });
    }),

  review: permissionProcedure(PERMISSIONS.TASKS_REVIEW)
    .input(
      z.object({
        id: z.string(),
        decision: z.enum(["approve", "reject"]),
        // optional edits applied on approval
        assigneeId: z.string().optional(),
        priority: priorityEnum.optional(),
        points: z.number().int().min(0).max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({ where: { id: input.id } });
      if (!task) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.decision === "reject") {
        return ctx.db.task.update({
          where: { id: task.id },
          data: {
            approvalStatus: "rejected",
            activities: {
              create: { type: "rejected", actorId: ctx.user.id },
            },
          },
        });
      }

      const assigneeId = input.assigneeId ?? task.assigneeId;
      const updated = await ctx.db.task.update({
        where: { id: task.id },
        data: {
          approvalStatus: "approved",
          assigneeId: assigneeId,
          priority: input.priority ?? task.priority,
          points: input.points ?? task.points,
          activities: { create: { type: "approved", actorId: ctx.user.id } },
        },
      });
      if (assigneeId) {
        await ctx.db.notification.create({
          data: {
            userId: assigneeId,
            type: "task_assigned",
            title: "New mission assigned",
            body: updated.title,
            meta: JSON.stringify({ taskId: updated.id }),
          },
        });
      }
      return updated;
    }),
});
