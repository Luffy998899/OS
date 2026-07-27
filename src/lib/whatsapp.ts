import "server-only";
import { db } from "@/lib/db";
import { planMissions } from "@/lib/ai/plan";
import { VERTICAL_ROOM_KEYS } from "@/server/routers/task";

export type IngestResult = {
  taskId: string;
  title: string;
  assigneeName: string | null;
  rationale: string;
  usedAi: boolean;
};

/**
 * Turns an inbound WhatsApp message into a task DRAFT that lands in the owner's
 * review queue (approvalStatus: pending_review). Nothing is assigned until the
 * owner approves it in Assign & Plan.
 */
export async function ingestWhatsAppTask(input: {
  fromPhone: string;
  body: string;
}): Promise<IngestResult> {
  const message = await db.whatsAppMessage.create({
    data: { fromPhone: input.fromPhone, body: input.body },
  });

  const roster = await db.user.findMany({
    where: { status: { not: "suspended" } },
    select: {
      id: true,
      name: true,
      department: true,
      role: { select: { name: true } },
    },
  });

  const plan = await planMissions(
    input.body,
    roster.map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      role: r.role.name,
    })),
  );
  const draft = plan.drafts[0];

  // System creator = first admin.
  const admin = await db.user.findFirst({
    where: { role: { name: "Admin" } },
    select: { id: true },
  });
  const creatorId = admin?.id ?? roster[0]?.id;

  let room: { id: string } | null = null;
  for (const roomKey of VERTICAL_ROOM_KEYS[draft.vertical] ?? []) {
    room = await db.room.findUnique({ where: { key: roomKey }, select: { id: true } });
    if (room) break;
  }

  const task = await db.task.create({
    data: {
      title: draft.title,
      description: draft.description || input.body,
      vertical: draft.vertical,
      priority: draft.priority,
      points: draft.points,
      assigneeId: draft.assigneeId,
      roomId: room?.id ?? null,
      source: "whatsapp",
      aiGenerated: true,
      approvalStatus: "pending_review",
      aiRationale: draft.rationale,
      createdById: creatorId!,
    },
  });

  await db.whatsAppMessage.update({
    where: { id: message.id },
    data: { status: "parsed", parsedTaskId: task.id },
  });

  // Notify reviewers (Admin & Manager roles).
  const reviewers = await db.user.findMany({
    where: { role: { name: { in: ["Admin", "Manager"] } } },
    select: { id: true },
  });
  if (reviewers.length > 0) {
    await db.notification.createMany({
      data: reviewers.map((r) => ({
        userId: r.id,
        type: "approval",
        title: "WhatsApp draft to review",
        body: task.title,
        meta: JSON.stringify({ taskId: task.id }),
      })),
    });
  }

  return {
    taskId: task.id,
    title: task.title,
    assigneeName: draft.assigneeName,
    rationale: draft.rationale,
    usedAi: plan.usedAi,
  };
}
