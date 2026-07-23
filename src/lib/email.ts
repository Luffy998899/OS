import "server-only";

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string /* base64 */ }[];
};

export type SendEmailResult = {
  sent: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
};

/**
 * Sends an email via Resend. Degrades gracefully: when RESEND_API_KEY is not
 * configured it logs the message and returns { sent: false, skipped: true } so
 * the rest of the flow (in-app notifications, etc.) still runs in local dev.
 */
export async function sendEmail(
  args: SendEmailArgs,
): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Auxa <noreply@auxa.local>";

  if (!key) {
    console.log(`[email:skipped] "${args.subject}" -> ${args.to}`);
    return {
      sent: false,
      skipped: true,
      error: "Email provider not configured — add RESEND_API_KEY to send.",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        attachments: args.attachments,
      }),
    });
    if (!res.ok) {
      return { sent: false, error: await res.text() };
    }
    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, error: String(e) };
  }
}

export function reportReminderEmail(name: string, appUrl: string) {
  const firstName = name.split(" ")[0];
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0b0b0c">
    <h2 style="font-size:18px;margin:0 0 12px">Wrap up your day, ${firstName}</h2>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 16px">
      It's almost 6 PM. Before you head out, take a minute to log what you got
      done today. Open Auxa and check out to submit your day report.
    </p>
    <a href="${appUrl}/timesheet"
       style="display:inline-block;background:#0b0b0c;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
      Submit today's report
    </a>
    <p style="font-size:12px;color:#a1a1aa;margin:20px 0 0">Auxa · Work OS</p>
  </div>`;
  const text = `Wrap up your day, ${firstName}. Before you leave, log what you got done today at ${appUrl}/timesheet`;
  return { subject: "Auxa — submit today's report", html, text };
}
