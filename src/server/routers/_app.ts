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
import { reportRouter } from "./report";
import { documentRouter } from "./document";
import { settingRouter } from "./setting";
import { leaderboardRouter } from "./leaderboard";
import { serviceRouter } from "./service";
import { expenseRouter } from "./expense";
import { invoiceRouter } from "./invoice";
import { ledgerRouter } from "./ledger";
import { journalRouter } from "./journal";
import { bountyRouter } from "./bounty";
import { skillRouter } from "./skill";
import { outreachRoomRouter } from "./outreach-room";
import { chatRouter } from "./chat";

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
  report: reportRouter,
  document: documentRouter,
  setting: settingRouter,
  leaderboard: leaderboardRouter,
  service: serviceRouter,
  expense: expenseRouter,
  invoice: invoiceRouter,
  ledger: ledgerRouter,
  journal: journalRouter,
  bounty: bountyRouter,
  skill: skillRouter,
  outreachRoom: outreachRoomRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
