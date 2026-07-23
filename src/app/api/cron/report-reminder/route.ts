import { NextResponse } from "next/server";
import { runReportReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (local dev)
  const header = req.headers.get("authorization");
  const url = new URL(req.url);
  return (
    header === `Bearer ${secret}` || url.searchParams.get("secret") === secret
  );
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReportReminders();
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
