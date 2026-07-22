import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestWhatsAppTask } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Meta Cloud API verification handshake.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN || "auxa-verify";
  if (mode === "subscribe" && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

async function parseInbound(
  req: Request,
): Promise<{ from: string; body: string } | null> {
  const contentType = req.headers.get("content-type") ?? "";

  // Twilio: application/x-www-form-urlencoded (From="whatsapp:+123", Body="...")
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    const from = String(form.get("From") ?? "").replace("whatsapp:", "");
    const body = String(form.get("Body") ?? "");
    if (!body) return null;
    return { from, body };
  }

  // Meta Cloud API: JSON
  try {
    const data = (await req.json()) as {
      entry?: {
        changes?: {
          value?: {
            messages?: { from?: string; text?: { body?: string } }[];
          };
        }[];
      }[];
    };
    const msg = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (msg?.text?.body) {
      return { from: msg.from ?? "", body: msg.text.body };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function POST(req: Request) {
  const parsed = await parseInbound(req);
  if (!parsed) return NextResponse.json({ ok: true, ignored: true });

  const row = await db.setting.findUnique({ where: { key: "whatsapp" } });
  let cfg = { enabled: false, ownerPhone: "" };
  if (row) {
    try {
      cfg = { ...cfg, ...JSON.parse(row.value) };
    } catch {
      /* ignore */
    }
  }

  if (!cfg.enabled) {
    return NextResponse.json({ ok: true, ignored: "disabled" });
  }
  // Only accept messages from the configured owner phone (when set).
  if (cfg.ownerPhone && digits(cfg.ownerPhone) !== digits(parsed.from)) {
    return NextResponse.json({ ok: true, ignored: "unauthorized sender" });
  }

  const result = await ingestWhatsAppTask({
    fromPhone: parsed.from,
    body: parsed.body,
  });
  return NextResponse.json({ ok: true, taskId: result.taskId });
}
