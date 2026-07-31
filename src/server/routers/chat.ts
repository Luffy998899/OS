import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import {
  CHANNEL_KINDS,
  CHAT_SEED,
  DM_SERVER_KEY,
  VOICE_STALE_MS,
  dmKeyFor,
  dmPeerId,
  isDmKey,
  isDmMember,
  isReservedServerKey,
  slugifyChannel,
  slugifyServer,
  uniqueKey,
} from "@/lib/chat";

// In-app chat. Spaces ("servers") split the floor into HQ and the client side;
// channels split those into rooms. Direct messages are channels under one
// hidden server whose keys encode the two members (`dm:<a>:<b>`). Unread
// badges come from ChatRead — the last moment a person looked at a channel —
// so they survive reloads and devices.

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

/** DMs are private to their two members; everything else is open floor. */
function assertCanAccess(channelKey: string, userId: string): void {
  if (isDmKey(channelKey) && !isDmMember(channelKey, userId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That conversation isn't yours." });
  }
}

/** A DM channel can't be renamed, re-kinded or deleted like a room channel. */
function assertManageable(channelKey: string): void {
  if (isDmKey(channelKey)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "DMs can't be edited." });
  }
}

/** The hidden DM space is not a real space — it has no settings. */
function assertServerManageable(serverKey: string): void {
  if (serverKey === DM_SERVER_KEY) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Direct Messages isn't a space." });
  }
}

/** Presence for a set of users: their avatar status, or offline if never seen. */
async function presenceFor(
  db: typeof import("@/lib/db").db,
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.avatarState.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, status: true },
  });
  return new Map(rows.map((r) => [r.userId, r.status]));
}

export const chatRouter = router({
  /**
   * The rail, the channel list and the DM list, with an unread count on every
   * conversation. DM channels belonging to other people never leave the server.
   */
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

    const dmServer = servers.find((s) => s.key === DM_SERVER_KEY) ?? null;
    const spaceServers = servers.filter((s) => s.key !== DM_SERVER_KEY);
    const myDmChannels = (dmServer?.channels ?? []).filter((c) =>
      isDmMember(c.key, ctx.user.id),
    );

    const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
    const channelIds = [
      ...spaceServers.flatMap((s) => s.channels.map((c) => c.id)),
      ...myDmChannels.map((c) => c.id),
    ];
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

    // Who is sitting in each voice channel right now, so the channel list can
    // show the faces underneath it the way Discord does.
    const voiceRows = await ctx.db.chatVoicePresence.findMany({
      where: {
        channelId: { in: channelIds },
        updatedAt: { gt: new Date(Date.now() - VOICE_STALE_MS) },
      },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const voiceOf = new Map<string, typeof voiceRows>();
    for (const row of voiceRows) {
      const list = voiceOf.get(row.channelId) ?? [];
      list.push(row);
      voiceOf.set(row.channelId, list);
    }
    const voiceMembers = (channelId: string) =>
      (voiceOf.get(channelId) ?? []).map((v) => ({
        id: v.user.id,
        name: v.user.name,
        avatarUrl: v.user.avatarUrl,
        muted: v.muted,
        deafened: v.deafened,
        isMe: v.userId === ctx.user.id,
      }));

    // Resolve the person on the other side of each DM.
    const peerIds = myDmChannels
      .map((c) => dmPeerId(c.key, ctx.user.id))
      .filter((id): id is string => !!id);
    const [peers, presence] = await Promise.all([
      peerIds.length > 0
        ? ctx.db.user.findMany({
            where: { id: { in: peerIds } },
            select: { id: true, name: true, avatarUrl: true, title: true },
          })
        : Promise.resolve([]),
      presenceFor(ctx.db, peerIds),
    ]);
    const peerOf = new Map(peers.map((p) => [p.id, p]));

    return {
      servers: spaceServers.map((s) => ({
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
          voice: voiceMembers(c.id),
        })),
        unreadCount: s.channels.reduce((sum, c) => sum + (unreadOf.get(c.id) ?? 0), 0),
      })),
      dms: myDmChannels
        .map((c) => {
          const peerId = dmPeerId(c.key, ctx.user.id);
          const peer = peerId ? peerOf.get(peerId) : null;
          if (!peer) return null;
          return {
            id: c.id,
            key: c.key,
            peer: {
              id: peer.id,
              name: peer.name,
              avatarUrl: peer.avatarUrl,
              title: peer.title,
              status: presence.get(peer.id) ?? "offline",
            },
            unreadCount: unreadOf.get(c.id) ?? 0,
            lastMessageAt: lastOf.get(c.id) ?? null,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .sort(
          (a, b) =>
            new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
        ),
      dmUnread: myDmChannels.reduce((sum, c) => sum + (unreadOf.get(c.id) ?? 0), 0),
    };
  }),

  /** Everyone on the team, with presence — the member sidebar and DM picker. */
  members: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, avatarUrl: true, title: true, role: { select: { name: true } } },
    });
    const presence = await presenceFor(
      ctx.db,
      users.map((u) => u.id),
    );
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      title: u.title,
      roleName: u.role.name,
      status: presence.get(u.id) ?? "offline",
      isMe: u.id === ctx.user.id,
    }));
  }),

  /** Open (or create) the DM channel with one teammate and return its id. */
  openDm: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That's you." });
      }
      const other = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, status: true },
      });
      if (!other || other.status !== "active") {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such teammate." });
      }
      const server =
        (await ctx.db.chatServer.findUnique({ where: { key: DM_SERVER_KEY } })) ??
        (await ctx.db.chatServer.create({
          data: {
            key: DM_SERVER_KEY,
            name: "Direct Messages",
            description: "One-to-one conversations.",
            sortOrder: 99,
          },
        }));
      const key = dmKeyFor(ctx.user.id, input.userId);
      const channel =
        (await ctx.db.chatChannel.findUnique({
          where: { serverId_key: { serverId: server.id, key } },
        })) ??
        (await ctx.db.chatChannel.create({
          data: { serverId: server.id, key, name: "dm", kind: "dm" },
        }));
      return { channelId: channel.id };
    }),

  /** The newest slice of a channel, oldest-first so it reads top to bottom. */
  messages: protectedProcedure
    .input(z.object({ channelId: z.string(), limit: z.number().min(1).max(200).default(60) }))
    .query(async ({ ctx, input }) => {
      const channel = await requireChannel(ctx.db, input.channelId);
      assertCanAccess(channel.key, ctx.user.id);
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
      const channel = await requireChannel(ctx.db, input.channelId);
      assertCanAccess(channel.key, ctx.user.id);
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
      const channel = await requireChannel(ctx.db, input.channelId);
      assertCanAccess(channel.key, ctx.user.id);
      const now = new Date();
      await ctx.db.chatRead.upsert({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        create: { channelId: input.channelId, userId: ctx.user.id, lastReadAt: now },
        update: { lastReadAt: now },
      });
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Space + channel management
  // -------------------------------------------------------------------------

  /** Create a space. Its key is derived from the name and kept unique. */
  createServer: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(48),
        description: z.string().max(160).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const taken = (await ctx.db.chatServer.findMany({ select: { key: true } })).map((s) => s.key);
      const key = uniqueKey(slugifyServer(input.name), taken);
      const last = await ctx.db.chatServer.findFirst({ orderBy: { sortOrder: "desc" } });
      const server = await ctx.db.chatServer.create({
        data: {
          key,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          sortOrder: (last?.sortOrder ?? 0) + 1,
        },
      });
      // A space with no channels is a dead end — every new one opens with a
      // #general the way Discord does.
      await ctx.db.chatChannel.create({
        data: { serverId: server.id, key: "general", name: "general", kind: "text" },
      });
      return { serverId: server.id };
    }),

  /** Rename a space or change its description. */
  updateServer: protectedProcedure
    .input(
      z.object({
        serverId: z.string(),
        name: z.string().min(1).max(48).optional(),
        description: z.string().max(160).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await ctx.db.chatServer.findUnique({ where: { id: input.serverId } });
      if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "That space is gone." });
      assertServerManageable(server.key);
      await ctx.db.chatServer.update({
        where: { id: input.serverId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
        },
      });
      return { ok: true };
    }),

  /** Delete a space and everything in it. Seeded spaces stay put. */
  deleteServer: protectedProcedure
    .input(z.object({ serverId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const server = await ctx.db.chatServer.findUnique({ where: { id: input.serverId } });
      if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "That space is gone." });
      assertServerManageable(server.key);
      if (isReservedServerKey(server.key)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The built-in spaces can't be deleted.",
        });
      }
      await ctx.db.chatServer.delete({ where: { id: input.serverId } });
      return { ok: true };
    }),

  /** Add a text or voice channel to a space. */
  createChannel: protectedProcedure
    .input(
      z.object({
        serverId: z.string(),
        name: z.string().min(1).max(32),
        kind: z.enum(CHANNEL_KINDS).default("text"),
        topic: z.string().max(160).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const server = await ctx.db.chatServer.findUnique({
        where: { id: input.serverId },
        include: { channels: { select: { key: true, sortOrder: true } } },
      });
      if (!server) throw new TRPCError({ code: "NOT_FOUND", message: "That space is gone." });
      assertServerManageable(server.key);
      const name = slugifyChannel(input.name);
      if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "Give the channel a name." });
      const key = uniqueKey(
        name,
        server.channels.map((c) => c.key),
      );
      const channel = await ctx.db.chatChannel.create({
        data: {
          serverId: server.id,
          key,
          name,
          kind: input.kind,
          topic: input.topic?.trim() || null,
          sortOrder: Math.max(0, ...server.channels.map((c) => c.sortOrder)) + 1,
        },
      });
      return { channelId: channel.id };
    }),

  /** Rename a channel or reword its topic. */
  updateChannel: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        name: z.string().min(1).max(32).optional(),
        topic: z.string().max(160).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const channel = await requireChannel(ctx.db, input.channelId);
      assertManageable(channel.key);
      const name = input.name !== undefined ? slugifyChannel(input.name) : undefined;
      if (input.name !== undefined && !name) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Give the channel a name." });
      }
      await ctx.db.chatChannel.update({
        where: { id: input.channelId },
        data: {
          ...(name ? { name } : {}),
          ...(input.topic !== undefined ? { topic: input.topic?.trim() || null } : {}),
        },
      });
      return { ok: true };
    }),

  /** Delete a channel and its transcript. A space keeps at least one channel. */
  deleteChannel: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const channel = await requireChannel(ctx.db, input.channelId);
      assertManageable(channel.key);
      const siblings = await ctx.db.chatChannel.count({ where: { serverId: channel.serverId } });
      if (siblings <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A space needs at least one channel.",
        });
      }
      await ctx.db.chatChannel.delete({ where: { id: input.channelId } });
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Voice: presence + WebRTC signalling
  // -------------------------------------------------------------------------

  /**
   * Join a voice channel, or refresh the row while connected. The same call is
   * the heartbeat: `updatedAt` moving is what proves the tab is still open.
   */
  voiceJoin: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        muted: z.boolean().optional(),
        deafened: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const channel = await requireChannel(ctx.db, input.channelId);
      if (channel.kind !== "voice") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That isn't a voice channel." });
      }
      // One voice seat per person: joining a second channel leaves the first.
      await ctx.db.chatVoicePresence.deleteMany({
        where: { userId: ctx.user.id, channelId: { not: input.channelId } },
      });
      const patch = {
        ...(input.muted !== undefined ? { muted: input.muted } : {}),
        ...(input.deafened !== undefined ? { deafened: input.deafened } : {}),
      };
      await ctx.db.chatVoicePresence.upsert({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        create: {
          channelId: input.channelId,
          userId: ctx.user.id,
          muted: input.muted ?? false,
          deafened: input.deafened ?? false,
        },
        // Touch updatedAt even when nothing else changed — this is the beat.
        update: { ...patch, joinedAt: undefined },
      });
      // Prisma skips the @updatedAt bump when the update is a no-op, so force
      // a write the heartbeat can rely on.
      await ctx.db.chatVoicePresence.update({
        where: { channelId_userId: { channelId: input.channelId, userId: ctx.user.id } },
        data: { ...patch, updatedAt: new Date() },
      });
      return { ok: true };
    }),

  voiceLeave: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.chatVoicePresence.deleteMany({ where: { userId: ctx.user.id } });
    await ctx.db.chatVoiceSignal.deleteMany({
      where: { OR: [{ fromUserId: ctx.user.id }, { toUserId: ctx.user.id }] },
    });
    return { ok: true };
  }),

  /** Everyone currently connected to one voice channel. */
  voiceState: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.chatVoicePresence.findMany({
        where: {
          channelId: input.channelId,
          updatedAt: { gt: new Date(Date.now() - VOICE_STALE_MS) },
        },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { joinedAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        avatarUrl: r.user.avatarUrl,
        muted: r.muted,
        deafened: r.deafened,
        isMe: r.userId === ctx.user.id,
      }));
    }),

  /** Post one WebRTC offer/answer/candidate into a peer's mailbox. */
  voiceSignal: protectedProcedure
    .input(
      z.object({
        channelId: z.string(),
        toUserId: z.string(),
        kind: z.enum(["offer", "answer", "ice"]),
        payload: z.string().max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.chatVoiceSignal.create({
        data: {
          channelId: input.channelId,
          fromUserId: ctx.user.id,
          toUserId: input.toUserId,
          kind: input.kind,
          payload: input.payload,
        },
      });
      return { ok: true };
    }),

  /** Drain my signalling mailbox — reading a signal consumes it. */
  voicePoll: protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db.chatVoiceSignal.findMany({
        where: { channelId: input.channelId, toUserId: ctx.user.id },
        orderBy: { createdAt: "asc" },
        take: 60,
      });
      if (rows.length > 0) {
        await ctx.db.chatVoiceSignal.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      }
      return rows.map((r) => ({
        id: r.id,
        fromUserId: r.fromUserId,
        kind: r.kind as "offer" | "answer" | "ice",
        payload: r.payload,
      }));
    }),

  /** One number for the sidebar badge — cheap enough to poll app-wide. */
  unreadTotal: protectedProcedure.query(async ({ ctx }) => {
    const [channels, reads] = await Promise.all([
      ctx.db.chatChannel.findMany({ select: { id: true, key: true } }),
      ctx.db.chatRead.findMany({ where: { userId: ctx.user.id } }),
    ]);
    // Someone else's DM must never badge me.
    const mine = channels.filter((c) => !isDmKey(c.key) || isDmMember(c.key, ctx.user.id));
    if (mine.length === 0) return 0;
    const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
    return ctx.db.chatMessage.count({
      where: {
        userId: { not: ctx.user.id },
        OR: mine.map((c) => ({
          channelId: c.id,
          createdAt: { gt: readAt.get(c.id) ?? EPOCH },
        })),
      },
    });
  }),
});
