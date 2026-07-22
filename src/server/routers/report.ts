import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { istDateString } from "@/lib/time";
import { ACTIVE_STATUSES } from "@/lib/constants";

export const reportRouter = router({
  data: permissionProcedure(PERMISSIONS.REPORTS_VIEW).query(async ({ ctx }) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const today = istDateString();

    const [users, tasks, activeShifts, weekEntries, reportsToday] =
      await Promise.all([
        ctx.db.user.findMany({
          where: { status: { not: "suspended" } },
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            department: true,
            points: true,
          },
          orderBy: { points: "desc" },
        }),
        ctx.db.task.findMany({
          where: { approvalStatus: "approved" },
          select: {
            assigneeId: true,
            status: true,
            vertical: true,
            completedAt: true,
          },
        }),
        ctx.db.shift.findMany({
          where: { status: "active" },
          select: { userId: true },
        }),
        ctx.db.timeEntry.findMany({
          where: { createdAt: { gte: weekAgo } },
          select: { userId: true, durationSeconds: true },
        }),
        ctx.db.dayReport.count({ where: { date: today } }),
      ]);

    const onShift = new Set(activeShifts.map((s) => s.userId));

    // Distribution by vertical & status
    const byVertical: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const t of tasks) {
      byVertical[t.vertical] = (byVertical[t.vertical] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    }

    // Completed per day for the last 14 days (IST)
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = istDateString(new Date(now.getTime() - i * 86400000));
      days.push({ date: d, count: 0 });
    }
    const dayIndex = new Map(days.map((d, i) => [d.date, i]));
    for (const t of tasks) {
      if (t.status === "done" && t.completedAt) {
        const d = istDateString(t.completedAt);
        const idx = dayIndex.get(d);
        if (idx !== undefined) days[idx].count += 1;
      }
    }

    // Per-user workload
    const hoursByUser: Record<string, number> = {};
    for (const e of weekEntries) {
      hoursByUser[e.userId] =
        (hoursByUser[e.userId] ?? 0) + e.durationSeconds / 3600;
    }

    const workload = users.map((u) => {
      const theirs = tasks.filter((t) => t.assigneeId === u.id);
      const open = theirs.filter((t) =>
        ACTIVE_STATUSES.includes(t.status),
      ).length;
      const inProgress = theirs.filter((t) => t.status === "in_progress").length;
      const done7d = theirs.filter(
        (t) =>
          t.status === "done" && t.completedAt && t.completedAt >= weekAgo,
      ).length;
      return {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        department: u.department,
        points: u.points,
        open,
        inProgress,
        done7d,
        hours7d: Math.round((hoursByUser[u.id] ?? 0) * 10) / 10,
        onShift: onShift.has(u.id),
      };
    });

    const totalOpen = tasks.filter((t) =>
      ACTIVE_STATUSES.includes(t.status),
    ).length;
    const completed7d = tasks.filter(
      (t) => t.status === "done" && t.completedAt && t.completedAt >= weekAgo,
    ).length;

    return {
      metrics: {
        totalOpen,
        completed7d,
        activeShifts: activeShifts.length,
        reportsToday,
        teamSize: users.length,
      },
      byVertical,
      byStatus,
      completedByDay: days,
      workload,
    };
  }),
});
