import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  protectedProcedure,
  permissionProcedure,
} from "../trpc";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { SKILLS, skillForVertical, MAX_SKILL_LEVEL } from "@/lib/skills";
import { applyMissionXp, missionXp } from "../missions";

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
export const skillEnum = z.enum(SKILLS);
export const skillLevelSchema = z.number().int().min(0).max(MAX_SKILL_LEVEL);

const taskInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true } },
  client: { select: { id: true, companyName: true } },
  room: { select: { id: true, name: true, key: true } },
  collaborators: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
} as const;

// Which department room a mission lands in, based on its vertical. Values are
// preference-ordered: legacy floors used key "client" for outreach.
export const VERTICAL_ROOM_KEYS: Record<string, string[]> = {
  "website-dev": ["developer"],
  "digital-marketing": ["creative"],
  roadmap: ["managing-heads"],
  "client-outreach": ["outreach", "client"],
  billing: ["managing-heads"],
};

async function resolveRoomId(
  db: typeof import("@/lib/db").db,
  opts: { vertical: string; clientId?: string | null; provided?: string | null },
): Promise<string | null> {
  if (opts.provided) return opts.provided;
  // A client's own area takes precedence, so their missions land there.
  if (opts.clientId) {
    const clientRoom = await db.room.findFirst({
      where: { clientId: opts.clientId },
      select: { id: true },
    });
    if (clientRoom) return clientRoom.id;
  }
  for (const key of VERTICAL_ROOM_KEYS[opts.vertical] ?? []) {
    const room = await db.room.findUnique({ where: { key }, select: { id: true } });
    if (room) return room.id;
  }
  return null;
}

export const taskRouter = router({
  myWork: protectedProcedure.query(({ ctx }) =>
    ctx.db.task.findMany({
      where: { assigneeId: ctx.user.id, approvalStatus: "approved" },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      include: taskInclude,
    }),
  ),

  // The task room wall: my own missions plus everything I'm co-assigned on,
  // with the squad visible on each card.
  taskRoom: protectedProcedure.query(async ({ ctx }) => {
    const [mine, coAssigned] = await Promise.all([
      ctx.db.task.findMany({
        where: { assigneeId: ctx.user.id, approvalStatus: "approved", status: { not: "done" } },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        include: taskInclude,
      }),
      ctx.db.task.findMany({
        where: {
          approvalStatus: "approved",
          status: { not: "done" },
          assigneeId: { not: ctx.user.id },
          collaborators: { some: { userId: ctx.user.id } },
        },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        include: taskInclude,
      }),
    ]);
    return { mine, coAssigned };
  }),

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
        skill: skillEnum.optional(),
        minSkillLevel: skillLevelSchema.optional(),
        coAssigneeIds: z.array(z.string()).max(10).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const roomId = await resolveRoomId(ctx.db, {
        vertical: input.vertical,
        clientId: input.clientId,
        provided: input.roomId,
      });
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
          skill: input.skill ?? skillForVertical(input.vertical),
          minSkillLevel: input.minSkillLevel ?? 0,
          createdById: ctx.user.id,
          approvalStatus: "approved",
          activities: { create: { type: "created", actorId: ctx.user.id } },
          // The squad working it alongside the owner.
          collaborators: input.coAssigneeIds?.length
            ? {
                create: input.coAssigneeIds
                  .filter((id) => id !== input.assigneeId)
                  .map((userId) => ({ userId })),
              }
            : undefined,
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

        // Award / reverse mission XP — lifetime total and the craft track alike.
        if (task.assigneeId && (completing || reopening)) {
          const xp = missionXp(task);
          await applyMissionXp(tx, {
            userId: task.assigneeId,
            skill: task.skill,
            delta: completing ? xp : -xp,
            reason: completing
              ? `Completed mission: ${task.title}`
              : `Reopened mission: ${task.title}`,
            taskId: task.id,
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
          const xp = missionXp(task);
          await applyMissionXp(tx, {
            userId: task.assigneeId,
            skill: task.skill,
            delta: xp,
            reason: `Completed mission: ${task.title}`,
            taskId: task.id,
          });
          await tx.notification.create({
            data: {
              userId: task.assigneeId,
              type: "reward",
              title: "Mission approved",
              body:
                task.bountyBonus > 0
                  ? `${task.title} — +${xp} XP (${task.points} + ${task.bountyBonus} urgency bonus)`
                  : `${task.title} — +${xp} XP`,
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
