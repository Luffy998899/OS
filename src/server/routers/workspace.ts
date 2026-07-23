import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const workspaceRouter = router({
  state: protectedProcedure.query(async ({ ctx }) => {
    const [rooms, avatars, openByRoom, aiCheckin] = await Promise.all([
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
    ]);

    const countFor = (roomId: string) =>
      openByRoom.find((o) => o.roomId === roomId)?._count._all ?? 0;

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
    }));

    const players = avatars.map((a) => ({
      userId: a.user.id,
      name: a.user.name,
      avatarUrl: a.user.avatarUrl,
      title: a.user.title,
      department: a.user.department,
      x: a.x,
      y: a.y,
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

    return {
      rooms: roomsOut,
      players,
      me,
      online: avatars.filter((a) => a.status !== "away").length,
      totalOpen: openByRoom.reduce((s, o) => s + o._count._all, 0),
      ai: aiCheckin
        ? { summary: aiCheckin.summary, importantTasks, at: aiCheckin.createdAt }
        : null,
    };
  }),

  roomMissions: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(({ ctx, input }) =>
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
    ),

  move: protectedProcedure
    .input(
      z.object({
        x: z.number(),
        y: z.number(),
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
          roomId: input.roomId ?? null,
          status: input.status ?? "online",
        },
        update: {
          x: input.x,
          y: input.y,
          roomId: input.roomId ?? null,
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
