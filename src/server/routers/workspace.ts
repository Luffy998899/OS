import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { assignCharacter, characterById } from "@/lib/characters";
import { ROOM_SKILL, normalizeSkill } from "@/lib/skills";
import { currentSlot, dateKey, minutesNow, needsRelogin, nextSlot } from "@/lib/timetable";
import { craftLevelsFor } from "../missions";

// The canonical campus. `enter` upserts these so existing floors migrate live —
// legacy keys ("client" → outreach, "creativity" → shoot) keep their rows and
// simply bind to the new zone.
const CAMPUS_ROOMS: { key: string; name: string; department: string; legacy?: string }[] = [
  { key: "developer", name: "Developer City", department: "Engineering" },
  { key: "video-editing", name: "Video Editing Bay", department: "Media" },
  { key: "common-board", name: "Conference Hall", department: "All-hands" },
  { key: "creative", name: "Creative Studio", department: "Design & Marketing" },
  { key: "tasks", name: "Task Room", department: "Everyone" },
  { key: "managing-heads", name: "Managing Heads", department: "Leadership" },
  { key: "timetable", name: "Timetable Room", department: "Everyone" },
  { key: "outreach", name: "Outreach Room", department: "Client Success", legacy: "client" },
  { key: "shoot", name: "Shoot Room", department: "Media", legacy: "creativity" },
];

const INTERNAL_TOOLS = [
  { name: "Sync AI", toolDesc: "The agency's AI copilot — check-ins, planning, routing." },
  { name: "Prompt Library", toolDesc: "Battle-tested prompts for every craft, versioned." },
  { name: "Portfolio Website", toolDesc: "The public face — case studies and reels." },
  { name: "Niche Research Documents", toolDesc: "Sector playbooks and research packs." },
];

async function ensureCampus(db: typeof import("@/lib/db").db): Promise<void> {
  const existing = await db.room.findMany({ select: { key: true } });
  const keys = new Set(existing.map((r) => r.key));
  for (const room of CAMPUS_ROOMS) {
    if (keys.has(room.key)) {
      await db.room.update({
        where: { key: room.key },
        data: { name: room.name, department: room.department },
      });
    } else if (room.legacy && keys.has(room.legacy)) {
      // The legacy row keeps its key (tasks point at it); the zone plan binds it.
      await db.room.update({
        where: { key: room.legacy },
        data: { name: room.name, department: room.department },
      });
    } else {
      await db.room.create({
        data: { key: room.key, name: room.name, department: room.department, kind: "department" },
      });
    }
  }
  // Furnish the bungalow once.
  const tools = await db.project.count({ where: { buildingKey: "tools" } });
  if (tools === 0) {
    for (const [i, tool] of INTERNAL_TOOLS.entries()) {
      await db.project.create({
        data: { name: tool.name, toolDesc: tool.toolDesc, buildingKey: "tools", floor: i + 1, status: "active" },
      });
    }
  }
}

export const workspaceRouter = router({
  state: protectedProcedure.query(async ({ ctx }) => {
    const [rooms, avatars, openByRoom, aiCheckin, bountyByRoom, levels, editingJob, meeting, mySlots, relog, scare] = await Promise.all([
      ctx.db.room.findMany({
        orderBy: [{ posY: "asc" }, { posX: "asc" }],
        include: { client: { select: { companyName: true } } },
      }),
      ctx.db.avatarState.findMany({
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              department: true,
              title: true,
              points: true,
            },
          },
        },
      }),
      ctx.db.task.groupBy({
        by: ["roomId"],
        where: { approvalStatus: "approved", status: { not: "done" } },
        _count: { _all: true },
      }),
      ctx.db.aiCheckin.findFirst({ orderBy: { createdAt: "desc" } }),
      ctx.db.task.groupBy({
        by: ["roomId"],
        where: {
          isBounty: true,
          assigneeId: null,
          approvalStatus: "approved",
          status: { not: "done" },
        },
        _count: { _all: true },
      }),
      craftLevelsFor(ctx.db, ctx.user.id),
      ctx.db.videoJob.findFirst({
        where: { status: "editing" },
        include: {
          client: { select: { companyName: true } },
          editor: { select: { name: true } },
        },
      }),
      ctx.db.announcement.findFirst({
        where: { kind: "urgent_meeting", meetingAt: { gte: new Date(Date.now() - 30 * 60_000) } },
        orderBy: { meetingAt: "asc" },
        select: { id: true, title: true, meetingAt: true },
      }),
      ctx.db.timetableSlot.findMany({
        where: { userId: ctx.user.id, date: dateKey() },
        orderBy: { startMin: "asc" },
      }),
      ctx.db.timetableLog.findUnique({
        where: {
          userId_date_type: { userId: ctx.user.id, date: dateKey(), type: "back_from_lunch" },
        },
      }),
      ctx.db.notification.findFirst({
        where: { userId: ctx.user.id, type: "demogorgon", read: false },
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, createdAt: true },
      }),
    ]);

    const countFor = (roomId: string) =>
      openByRoom.find((o) => o.roomId === roomId)?._count._all ?? 0;
    const bountiesFor = (roomId: string) =>
      bountyByRoom.find((o) => o.roomId === roomId)?._count._all ?? 0;

    const roomsOut = rooms.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      department: r.department,
      kind: r.kind,
      clientName: r.client?.companyName ?? null,
      posX: r.posX,
      posY: r.posY,
      missionCount: countFor(r.id),
      bountyCount: bountiesFor(r.id),
      skill: r.kind === "client" ? "ops" : (ROOM_SKILL[r.key] ?? "ops"),
    }));

    const players = avatars.map((a) => ({
      userId: a.user.id,
      name: a.user.name,
      avatarUrl: a.user.avatarUrl,
      title: a.user.title,
      department: a.user.department,
      characterId: a.characterId,
      x: a.x,
      y: a.y,
      facing: a.facing,
      roomId: a.roomId,
      status: a.status,
      points: a.user.points,
      isMe: a.user.id === ctx.user.id,
    }));

    const me = players.find((p) => p.isMe) ?? null;

    let importantTasks: string[] = [];
    if (aiCheckin?.importantTasks) {
      try {
        importantTasks = JSON.parse(aiCheckin.importantTasks);
      } catch {
        importantTasks = [];
      }
    }

    const nowMin = minutesNow();
    return {
      rooms: roomsOut,
      players,
      me,
      levels,
      online: avatars.filter((a) => a.status !== "away").length,
      totalOpen: openByRoom.reduce((s, o) => s + o._count._all, 0),
      totalBounties: bountyByRoom.reduce((s, o) => s + o._count._all, 0),
      ai: aiCheckin
        ? { summary: aiCheckin.summary, importantTasks, at: aiCheckin.createdAt }
        : null,
      // Live floor signals for the HUD.
      nowEditing: editingJob
        ? {
            title: editingJob.title,
            clientName: editingJob.client?.companyName ?? null,
            editorName: editingJob.editor?.name ?? null,
            deliverBy: editingJob.deliverBy,
            startedAt: editingJob.startedAt,
          }
        : null,
      meeting,
      timeslot: {
        current: currentSlot(mySlots, nowMin),
        next: nextSlot(mySlots, nowMin),
        needsRelogin: needsRelogin(mySlots, nowMin, !!relog),
        hasPlan: mySlots.length > 0,
      },
      // An unread demogorgon means the Upside Down noticed you slacking.
      myScare: scare,
    };
  }),

  /**
   * The view from the Upside Down: every active teammate with the signals an
   * admin needs to spot slackers — presence, the block they should be in, and
   * how much is actually moving on their desk.
   */
  lair: permissionProcedure(PERMISSIONS.ADMIN).query(async ({ ctx }) => {
    const today = dateKey();
    const nowMin = minutesNow();
    const [users, avatars, slots, inProgress, doneToday] = await Promise.all([
      ctx.db.user.findMany({
        where: { status: "active" },
        select: { id: true, name: true, department: true, points: true },
        orderBy: { name: "asc" },
      }),
      ctx.db.avatarState.findMany({ select: { userId: true, status: true, updatedAt: true } }),
      ctx.db.timetableSlot.findMany({ where: { date: today } }),
      ctx.db.task.groupBy({
        by: ["assigneeId"],
        where: { status: "in_progress", approvalStatus: "approved" },
        _count: { _all: true },
      }),
      ctx.db.task.groupBy({
        by: ["assigneeId"],
        where: {
          status: "done",
          completedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        _count: { _all: true },
      }),
    ]);
    const avatarOf = new Map(avatars.map((a) => [a.userId, a]));
    const activeOf = new Map(inProgress.map((g) => [g.assigneeId, g._count._all]));
    const doneOf = new Map(doneToday.map((g) => [g.assigneeId, g._count._all]));
    return users
      .filter((u) => u.id !== ctx.user.id)
      .map((u) => {
        const avatar = avatarOf.get(u.id);
        const mySlots = slots.filter((s) => s.userId === u.id);
        const current = currentSlot(mySlots, nowMin);
        const active = activeOf.get(u.id) ?? 0;
        const done = doneOf.get(u.id) ?? 0;
        // Slacking: away (or absent) while the timetable says work, with
        // nothing in progress and nothing shipped today.
        const inWorkBlock = !!current && current.kind !== "lunch";
        const idle = !avatar || avatar.status === "away";
        return {
          id: u.id,
          name: u.name,
          department: u.department,
          points: u.points,
          presence: avatar?.status ?? "offline",
          lastMoveAt: avatar?.updatedAt ?? null,
          currentSlot: current ? { label: current.label, kind: current.kind } : null,
          inProgress: active,
          doneToday: done,
          slacking: inWorkBlock && idle && active === 0 && done === 0,
        };
      });
  }),

  /**
   * Cheap app-wide poll: is a demogorgon waiting on my screen? Kept tiny so the
   * shell can ask often — the scare has to land even when the victim is nowhere
   * near the workspace page.
   */
  myScare: protectedProcedure.query(({ ctx }) =>
    ctx.db.notification.findFirst({
      where: { userId: ctx.user.id, type: "demogorgon", read: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, createdAt: true },
    }),
  ),

  /** Vecna's finger: drop a demogorgon on someone's screen. */
  scare: permissionProcedure(PERMISSIONS.ADMIN)
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, name: true, status: true },
      });
      if (!target || target.status !== "active") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      // One live demogorgon per victim — a horde is just noise.
      const pending = await ctx.db.notification.findFirst({
        where: { userId: target.id, type: "demogorgon", read: false },
      });
      if (pending) {
        return { ok: true, already: true };
      }
      await ctx.db.notification.create({
        data: {
          userId: target.id,
          type: "demogorgon",
          title: "👹 The Upside Down is watching",
          body: `${ctx.user.name} noticed the slack. Back to work before it crawls out again.`,
        },
      });
      return { ok: true, already: false };
    }),

  /**
   * Step onto the floor. Makes sure the player has an avatar and claims them a
   * character from the crew roster — one slot each, held by a unique index, so
   * two people are never the same crewmate.
   */
  enter: protectedProcedure.mutation(async ({ ctx }) => {
    await ensureCampus(ctx.db);
    const existing = await ctx.db.avatarState.findUnique({
      where: { userId: ctx.user.id },
    });
    if (existing && characterById(existing.characterId)) {
      return { characterId: existing.characterId, x: existing.x, y: existing.y };
    }

    // Read-then-claim can lose a race with someone entering at the same moment;
    // the unique index catches it and we pick again from a fresh roster.
    for (let attempt = 0; attempt < 4; attempt++) {
      const claimed = await ctx.db.avatarState.findMany({
        where: { characterId: { not: null } },
        select: { characterId: true },
      });
      const pick = assignCharacter(
        ctx.user.id,
        claimed.map((c) => c.characterId as string),
      );
      try {
        const saved = await ctx.db.avatarState.upsert({
          where: { userId: ctx.user.id },
          create: { userId: ctx.user.id, characterId: pick.id, status: "online" },
          update: { characterId: pick.id },
        });
        return { characterId: saved.characterId, x: saved.x, y: saved.y };
      } catch {
        // Slot taken between the read and the write — try the next free one.
      }
    }

    // Rather than block entry, let the client fall back to a derived character.
    const fallback = await ctx.db.avatarState.upsert({
      where: { userId: ctx.user.id },
      create: { userId: ctx.user.id, status: "online" },
      update: {},
    });
    return { characterId: fallback.characterId, x: fallback.x, y: fallback.y };
  }),

  roomMissions: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [missions, levels] = await Promise.all([
        ctx.db.task.findMany({
          where: {
            roomId: input.roomId,
            approvalStatus: "approved",
          },
          orderBy: [{ status: "asc" }, { priority: "desc" }],
          take: 30,
          include: {
            assignee: { select: { id: true, name: true, avatarUrl: true } },
          },
        }),
        craftLevelsFor(ctx.db, ctx.user.id),
      ]);

      return missions.map((m) => {
        const skill = normalizeSkill(m.skill);
        return {
          ...m,
          skill,
          eligible: levels[skill] >= m.minSkillLevel,
          yourLevel: levels[skill],
        };
      });
    }),

  move: protectedProcedure
    .input(
      z.object({
        x: z.number(),
        y: z.number(),
        facing: z.number().optional(),
        roomId: z.string().nullable().optional(),
        status: z.enum(["online", "away", "busy"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.avatarState.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          x: input.x,
          y: input.y,
          facing: input.facing ?? 0,
          roomId: input.roomId ?? null,
          status: input.status ?? "online",
        },
        update: {
          x: input.x,
          y: input.y,
          roomId: input.roomId ?? null,
          ...(input.facing === undefined ? {} : { facing: input.facing }),
          ...(input.status ? { status: input.status } : {}),
        },
      });
      return { ok: true };
    }),

  setStatus: protectedProcedure
    .input(z.object({ status: z.enum(["online", "away", "busy"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.avatarState.upsert({
        where: { userId: ctx.user.id },
        create: { userId: ctx.user.id, status: input.status },
        update: { status: input.status },
      });
      return { ok: true };
    }),

  // Clients that don't yet have a dedicated office area.
  unassignedClients: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE).query(
    ({ ctx }) =>
      ctx.db.client.findMany({
        where: { rooms: { none: {} } },
        orderBy: { companyName: "asc" },
        select: { id: true, companyName: true },
      }),
  ),

  // Expand the map: create a dedicated area for a client at the next free cell.
  addClientArea: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE)
    .input(z.object({ clientId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.client.findUnique({
        where: { id: input.clientId },
      });
      if (!client) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = await ctx.db.room.findFirst({
        where: { clientId: input.clientId },
      });
      if (existing) return existing;

      const rooms = await ctx.db.room.findMany({
        select: { posX: true, posY: true },
      });
      const occ = new Set(rooms.map((r) => `${r.posX},${r.posY}`));
      let cx = 0;
      let cy = 0;
      outer: for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 3; x++) {
          if (!occ.has(`${x},${y}`)) {
            cx = x;
            cy = y;
            break outer;
          }
        }
      }
      return ctx.db.room.create({
        data: {
          key: `client-${input.clientId}`,
          name: client.companyName,
          department: "Client area",
          kind: "client",
          clientId: input.clientId,
          posX: cx,
          posY: cy,
        },
      });
    }),

  removeArea: permissionProcedure(PERMISSIONS.CLIENTS_MANAGE)
    .input(z.object({ roomId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.db.room.findUnique({ where: { id: input.roomId } });
      if (!room || room.kind !== "client") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only client areas can be removed.",
        });
      }
      await ctx.db.$transaction([
        ctx.db.task.updateMany({
          where: { roomId: input.roomId },
          data: { roomId: null },
        }),
        ctx.db.avatarState.updateMany({
          where: { roomId: input.roomId },
          data: { roomId: null },
        }),
        ctx.db.room.delete({ where: { id: input.roomId } }),
      ]);
      return { ok: true };
    }),
});
