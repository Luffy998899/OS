import { router, publicProcedure, protectedProcedure } from "../trpc";
import { notificationRouter } from "./notification";
import { attendanceRouter } from "./attendance";
import { timesheetRouter } from "./timesheet";
import { taskRouter } from "./task";
import { dashboardRouter } from "./dashboard";
import { userRouter } from "./user";
import { roleRouter } from "./role";
import { clientRouter } from "./client";
import { assignRouter } from "./assign";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true, service: "auxa" })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  notification: notificationRouter,
  attendance: attendanceRouter,
  timesheet: timesheetRouter,
  task: taskRouter,
  dashboard: dashboardRouter,
  user: userRouter,
  role: roleRouter,
  clients: clientRouter,
  assign: assignRouter,
});

export type AppRouter = typeof appRouter;
