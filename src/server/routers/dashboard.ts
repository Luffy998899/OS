import { router, protectedProcedure } from "../trpc";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { istDateString } from "@/lib/time";

const miniInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  client: { select: { id: true, companyName: true } },
} as const;

export const dashboardRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const [
      assignedOpen,
      inProgress,
      inReview,
      completedThisWeek,
      myTasks,
      dueSoon,
      leaderboard,
    ] = await Promise.all([
      ctx.db.task.count({
        where: {
          assigneeId: userId,
          approvalStatus: "approved",
          status: { in: ["todo", "in_progress", "review", "blocked"] },
        },
      }),
      ctx.db.task.count({
        where: { assigneeId: userId, status: "in_progress" },
      }),
      ctx.db.task.count({ where: { assigneeId: userId, status: "review" } }),
      ctx.db.task.count({
        where: {
          assigneeId: userId,
          status: "done",
          completedAt: { gte: weekAgo },
        },
      }),
      ctx.db.task.findMany({
        where: {
          assigneeId: userId,
          approvalStatus: "approved",
          status: { in: ["todo", "in_progress", "review", "blocked"] },
        },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 6,
        include: miniInclude,
      }),
      ctx.db.task.findMany({
        where: {
          assigneeId: userId,
          approvalStatus: "approved",
          status: { not: "done" },
          dueAt: { not: null },
        },
        orderBy: { dueAt: "asc" },
        take: 5,
        include: miniInclude,
      }),
      ctx.db.user.findMany({
        where: { status: { not: "suspended" } },
        orderBy: { points: "desc" },
        select: { id: true },
      }),
    ]);

    const rank = leaderboard.findIndex((u) => u.id === userId) + 1;

    const personal = {
      assignedOpen,
      inProgress,
      inReview,
      completedThisWeek,
      points: ctx.user.points,
      rank,
      teamSize: leaderboard.length,
    };

    const isAdmin =
      hasPermission(ctx.user.permissions, PERMISSIONS.ADMIN) ||
      hasPermission(ctx.user.permissions, PERMISSIONS.REPORTS_VIEW);

    let admin:
      | {
          activeShifts: number;
          pendingReviews: number;
          openMissions: number;
          submittedReportsToday: number;
          byStatus: Record<string, number>;
          topPerformers: {
            id: string;
            name: string;
            avatarUrl: string | null;
            points: number;
            department: string | null;
          }[];
        }
      | undefined;

    if (isAdmin) {
      const today = istDateString();
      const [
        activeShifts,
        pendingReviews,
        byStatusRaw,
        topPerformers,
        openMissions,
        submittedReportsToday,
      ] = await Promise.all([
        ctx.db.shift.count({ where: { status: "active" } }),
        ctx.db.task.count({ where: { approvalStatus: "pending_review" } }),
        ctx.db.task.groupBy({
          by: ["status"],
          where: { approvalStatus: "approved" },
          _count: { _all: true },
        }),
        ctx.db.user.findMany({
          where: { status: { not: "suspended" } },
          orderBy: { points: "desc" },
          take: 5,
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            points: true,
            department: true,
          },
        }),
        ctx.db.task.count({
          where: { approvalStatus: "approved", status: { not: "done" } },
        }),
        ctx.db.dayReport.count({ where: { date: today } }),
      ]);

      const byStatus: Record<string, number> = {};
      for (const row of byStatusRaw) byStatus[row.status] = row._count._all;

      admin = {
        activeShifts,
        pendingReviews,
        openMissions,
        submittedReportsToday,
        byStatus,
        topPerformers,
      };
    }

    return { personal, myTasks, dueSoon, admin };
  }),
});
