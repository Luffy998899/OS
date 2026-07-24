import "server-only";
import { db } from "@/lib/db";
import { sendEmail, reportReminderEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { istDateString } from "@/lib/time";

export type ReminderResult = {
  date: string;
  reminded: number;
  emailsSent: number;
  recipients: { userId: string; email: string; emailed: boolean }[];
};

/**
 * Sends the end-of-day "submit your report" reminder. Targets anyone with an
 * active (checked-in) shift who has not yet submitted a day report for the
 * current IST date. Always creates an in-app notification; emails via Resend
 * when configured. Meant to be invoked by a scheduler at 17:55 IST.
 */
export async function runReportReminders(): Promise<ReminderResult> {
  const date = istDateString();
  const appUrl = getAppUrl();

  const activeShifts = await db.shift.findMany({
    where: { status: "active" },
    include: { user: true },
  });

  const recipients: ReminderResult["recipients"] = [];
  let emailsSent = 0;

  for (const shift of activeShifts) {
    const existing = await db.dayReport.findFirst({
      where: { userId: shift.userId, date },
    });
    if (existing) continue;

    await db.notification.create({
      data: {
        userId: shift.userId,
        type: "report_reminder",
        title: "Submit today's report",
        body: "Before you leave, log what you got done today — check out to submit.",
      },
    });

    const { subject, html, text } = reportReminderEmail(shift.user.name, appUrl);
    const res = await sendEmail({ to: shift.user.email, subject, html, text });
    if (res.sent) emailsSent += 1;
    recipients.push({
      userId: shift.userId,
      email: shift.user.email,
      emailed: res.sent,
    });
  }

  return { date, reminded: recipients.length, emailsSent, recipients };
}
