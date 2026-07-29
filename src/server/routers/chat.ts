import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { CHAT_SEED } from "@/lib/chat";

// In-app chat. Spaces ("servers") split the floor into HQ and the client side;
// channels split those into rooms. Unread badges come from ChatRead — the last
// moment a person looked at a channel — so they survive reloads and devices.

// Everyone who has ever read a channel started somewhere; a person who has
// never opened one sees every message in it as unread.
const EPOCH = new Date(0);

async function ensureDefaults(db: typeof import("@/lib/db").db): Promise<void> {
  const existing = await db.chatServer.findMany({
    select: { id: true, key: true, channels: { select: { key: true } } },
  });
  const byKey = new Map(existing.map((s) => [s.key, s]));

  for (const [order, seed] of CHAT_SEED.entries()) {
    const found = byKey.get(seed.key);
    // Upserting channels too means an install from before a channel existed
    // grows it on the next visit instead of needing a reset.
    const serverId = found
      ? found.id
      : (
          await db.chatServer.create({
            data: {
              key: seed.key,
              name: seed.name,
              description: seed.description,
              sortOrder: order,
            },
          })
        ).id;
    const have = new Set(found?.channels.map((c) => c.key) ?? []);
    for (const [i, channel] of seed.channels.entries()) {
      if (have.has(channel.key)) continue;
      await db.chatChannel.create({
        data: {
          serverId,
          key: channel.key,
          name: channel.name,
          topic: channel.topic,
          kind: channel.kind ?? "text",
          sortOrder: i,
        },
      });
    }
  }
}

/** Throws unless the channel exists — every mutation takes an id from the client. */
async function requireChannel(db: typeof import("@/lib/db").db, channelId: string) {
  const channel = await db.chatChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "That channel is gone." });
  return channel;
}

export const chatRouter = router({
  /** The rail and the channel list, with an unread count on every channel. */
  list: protectedProcedure.query(async ({ ctx }) => {
    await ensureDefaults(ctx.db);
    const [servers, reads] = await Promise.all([
      ctx.db.chatServer.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          channels: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        },
      }),
      ctx.db.chatRead.findMany({ where: { userId: ctx.user.id } }),
    ]);

    const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
    const channelIds = servers.flatMap((s) => s.channels.map((c) => c.id));
    const [unread, newest] = await Promise.all([
      ctx.db.chatMessage.groupBy({
        by: ["channelId"],
        where: {
          channelId: { in: channelIds },
          userId: { not: ctx.user.id },
          // One grouped scan for every channel: each row only counts messages
          // newer than that channel's own read mark.
          OR: channelIds.map((id) => ({ channelId: id, createdAt: { gt: readAt.get(id) ?? EPOCH } })),
        },
        _count: { _all: true },
      }),
      ctx.db.chatMessage.groupBy({
        by: ["channelId"],
        where: { channelId: { in: channelIds } },
        _max: { createdAt: true },
      }),
    ]);

    const unreadOf = new Map(unread.map((u) => [u.channelId, u._count._all]));
    const lastOf = new Map(newest.map((n) => [n.channelId, n._max.createdAt]));

    return servers.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      description: s.description,
      channels: s.channels.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        topic: c.topic,
        kind: c.kind,
        unreadCount: unreadOf.get(c.id) ?? 0,
        lastMessageAt: lastOf.get(c.id) ?? null,
      })),
      unreadCount: s.channels.reduce((sum, c) => sum + (unreadOf.get(c.id) ?? 0), 0),
    }));
  }),

  /** The newest slice of a channel, oldest-first so it reads top to bottom. */
  messages: protectedProcedure
    .input(z.object({ channelId: z.string(), limit: z.number().min(1).max(200).default(60) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.chatMessage.findMany({
        where: { channelId: input.channelId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      });
      return rows.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        user: m.user,
        mine: m.userId === ctx.user.id,
      }));
    }),

  send: protectedProcedure
    .input(z.object({ channelId: z.string(), body: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await requireChannel(ctx.db, input.channelId);
      const now = new Date();
      const message = await ctx.db.chatMessage.create({
        data: { channelId: input.channelId, userId: ctx.user.id, body: input.body.trim() },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      });
      // Posting counts as reading — your own message must never badge you.
      await ctx.db.chatRead.upsert({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        create: { channelId: input.channelId, userId: ctx.user.id, lastReadAt: now },
        update: { lastReadAt: now },
      });
      return {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        user: message.user,
        mine: true,
      };
    }),

  markRead: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireChannel(ctx.db, input.channelId);
      const now = new Date();
      await ctx.db.chatRead.upsert({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        create: { channelId: input.channelId, userId: ctx.user.id, lastReadAt: now },
        update: { lastReadAt: now },
      });
      return { ok: true };
    }),

  /** One number for the sidebar badge — cheap enough to poll app-wide. */
  unreadTotal: protectedProcedure.query(async ({ ctx }) => {
    const [channels, reads] = await Promise.all([
      ctx.db.chatChannel.findMany({ select: { id: true } }),
      ctx.db.chatRead.findMany({ where: { userId: ctx.user.id } }),
    ]);
    if (channels.length === 0) return 0;
    const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
    return ctx.db.chatMessage.count({
      where: {
        userId: { not: ctx.user.id },
        OR: channels.map((c) => ({
          channelId: c.id,
          createdAt: { gt: readAt.get(c.id) ?? EPOCH },
        })),
      },
    });
  }),
});
