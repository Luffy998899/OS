import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { istDateString } from "@/lib/time";
import { callClaude, isAiEnabled } from "@/lib/ai/client";
import {
  REPORT_READY,
  fallbackReport,
  interviewSystemPrompt,
  isComplete,
  nextScriptedQuestion,
  openingQuestion,
  parseReport,
  reportSystemPrompt,
  transcriptText,
  type CheckinContext,
  type Turn,
} from "@/lib/ai/checkin";

const turnSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().max(4000),
});

export const journalRouter = router({
  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.dailyJournal.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ),

  create: protectedProcedure
    .input(z.object({ content: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      ctx.db.dailyJournal.create({
        data: {
          userId: ctx.user.id,
          date: istDateString(),
          content: input.content.trim(),
        },
      }),
    ),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.dailyJournal.deleteMany({
        where: { id: input.id, userId: ctx.user.id },
      });
      return { ok: true };
    }),

  // --- the conversational daily check-in ------------------------------------

  /** Whether today's check-in is already filed, plus the opening question. */
  checkinState: protectedProcedure.query(async ({ ctx }) => {
    const today = istDateString();
    const done = await ctx.db.dayReport.findFirst({
      where: { userId: ctx.user.id, date: today },
      select: { id: true, summary: true, blockers: true, submittedAt: true },
    });
    return { today, done, aiEnabled: isAiEnabled(), opening: openingQuestion() };
  }),

  /**
   * One turn of the interview. Sends the transcript, gets the next question —
   * from the model when configured, from the script otherwise.
   */
  checkinReply: protectedProcedure
    .input(z.object({ history: z.array(turnSchema).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const history = input.history as Turn[];
      if (isComplete(history)) return { question: null, done: true };

      const context = await checkinContext(ctx.db, ctx.user.id, ctx.user.name);
      if (isAiEnabled()) {
        const reply = await callClaude(
          interviewSystemPrompt(context),
          history.map((t) => ({
            role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: t.content,
          })),
          300,
        );
        if (reply) {
          if (reply.includes(REPORT_READY)) return { question: null, done: true };
          return { question: reply.trim(), done: false };
        }
        // Model unavailable mid-interview — fall through to the script.
      }
      const q = nextScriptedQuestion(history);
      return { question: q, done: q === null };
    }),

  /**
   * Close the interview: write the report, keep the transcript in the journal,
   * and put it in front of every admin.
   */
  checkinFinish: protectedProcedure
    .input(z.object({ history: z.array(turnSchema).max(40) }))
    .mutation(async ({ ctx, input }) => {
      const history = input.history as Turn[];
      const context = await checkinContext(ctx.db, ctx.user.id, ctx.user.name);

      let report = null;
      if (isAiEnabled()) {
        report = parseReport(
          await callClaude(
            reportSystemPrompt(context),
            [{ role: "user", content: transcriptText(history) }],
            700,
          ),
        );
      }
      if (!report) report = fallbackReport(history, context);

      const today = istDateString();
      const existing = await ctx.db.dayReport.findFirst({
        where: { userId: ctx.user.id, date: today },
        select: { id: true },
      });
      const data = {
        userId: ctx.user.id,
        date: today,
        summary: report.summary,
        blockers: report.blockers,
      };
      if (existing) {
        await ctx.db.dayReport.update({ where: { id: existing.id }, data });
      } else {
        await ctx.db.dayReport.create({ data });
      }

      await ctx.db.dailyJournal.create({
        data: {
          userId: ctx.user.id,
          date: today,
          content: transcriptText(history),
        },
      });

      // Hand it to the people who need to read it.
      const admins = await ctx.db.user.findMany({
        where: { status: "active", role: { name: { in: ["Admin", "Manager"] } } },
        select: { id: true },
      });
      const moodTag = report.mood === "strained" ? " ⚠️ workload strained" : "";
      await ctx.db.notification.createMany({
        data: admins
          .filter((a) => a.id !== ctx.user.id)
          .map((a) => ({
            userId: a.id,
            type: "day_report",
            title: `📋 ${ctx.user.name} filed today's check-in${moodTag}`,
            body: report.summary.slice(0, 400),
          })),
      });

      return { ok: true, report };
    }),
});

/** What the interviewer knows about the person before it starts asking. */
async function checkinContext(
  db: typeof import("@/lib/db").db,
  userId: string,
  userName: string,
): Promise<CheckinContext> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const tasks = await db.task.findMany({
    where: { assigneeId: userId, updatedAt: { gte: since } },
    select: { title: true },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
  return { userName, tasksToday: tasks.map((t) => t.title) };
}
