import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const workspaceRouter = router({
  state: protectedProcedure.query(async ({ ctx }) => {
    const [rooms, avatars, openByRoom, aiCheckin] = await Promise.all([
      ctx.db.room.findMany({ orderBy: [{ posY: "asc" }, { posX: "asc" }] }),
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
      description: r.description,
      posX: r.posX,
      posY: r.posY,
      missionCount: countFor(r.id),
      occupants: avatars
        .filter((a) => a.roomId === r.id)
        .map((a) => ({
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl,
          title: a.user.title,
          department: a.user.department,
          status: a.status,
          isMe: a.user.id === ctx.user.id,
        })),
    }));

    const me = avatars.find((a) => a.userId === ctx.user.id);

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
      myRoomId: me?.roomId ?? null,
      myStatus: me?.status ?? "online",
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
          status: { not: "done" },
        },
        orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        take: 20,
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
    ),

  move: protectedProcedure
    .input(
      z.object({
        roomId: z.string().nullable(),
        status: z.enum(["online", "away", "busy"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const x = 15 + Math.random() * 60;
      const y = 20 + Math.random() * 50;
      await ctx.db.avatarState.upsert({
        where: { userId: ctx.user.id },
        create: {
          userId: ctx.user.id,
          roomId: input.roomId,
          x,
          y,
          status: input.status ?? "online",
        },
        update: {
          roomId: input.roomId,
          x,
          y,
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
});
