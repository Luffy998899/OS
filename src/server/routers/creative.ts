import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";

// The creative studio. Two doors — Clients and Internal — each opening onto a
// space: brand kit pinned, the infinite board (a whiteboard document scaffolded
// from the creative-space template), references & reels, scripts, the monthly
// timeline, competitor research, and the green/red advance-prep zone.

const itemKind = z.enum(["reference", "reel", "note", "script", "timeline"]);

function nextMonthKey(now = new Date()): string {
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const m = (now.getMonth() + 1) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function thisMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseBrandKit(raw: string): { colors: string[]; fonts: string[]; links: { label: string; url: string }[] } {
  try {
    const o = JSON.parse(raw);
    return {
      colors: Array.isArray(o.colors) ? o.colors.map(String) : [],
      fonts: Array.isArray(o.fonts) ? o.fonts.map(String) : [],
      links: Array.isArray(o.links)
        ? o.links.map((l: { label?: unknown; url?: unknown }) => ({
            label: String(l.label ?? ""),
            url: String(l.url ?? ""),
          }))
        : [],
    };
  } catch {
    return { colors: [], fonts: [], links: [] };
  }
}

export const creativeRouter = router({
  /** Behind each door: the internal space plus one per client. */
  doors: protectedProcedure.query(async ({ ctx }) => {
    const [clients, spaces] = await Promise.all([
      ctx.db.client.findMany({
        where: { status: { not: "churned" } },
        orderBy: { companyName: "asc" },
        select: { id: true, companyName: true },
      }),
      ctx.db.creativeSpace.findMany({
        select: { key: true, id: true, items: { select: { kind: true, monthKey: true } } },
      }),
    ]);
    const byKey = new Map(spaces.map((s) => [s.key, s]));
    const month = nextMonthKey();
    const greenOf = (key: string) => {
      const space = byKey.get(key);
      if (!space) return false;
      return space.items.some((i) => i.kind === "timeline" && (i.monthKey ?? "") >= month);
    };
    return {
      internal: { key: "internal", name: "Internal — Auxa", exists: byKey.has("internal"), green: greenOf("internal") },
      clients: clients.map((c) => ({
        key: `client:${c.id}`,
        clientId: c.id,
        name: c.companyName,
        exists: byKey.has(`client:${c.id}`),
        green: greenOf(`client:${c.id}`),
      })),
    };
  }),

  /**
   * Walk through a door. Creates the space (and its infinite board, scaffolded
   * from the creative-space template) the first time anyone enters.
   */
  open: protectedProcedure
    .input(z.object({ key: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.creativeSpace.findUnique({ where: { key: input.key } });
      if (existing) return { id: existing.id, key: existing.key };

      let name = "Internal — Auxa";
      let clientId: string | null = null;
      if (input.key.startsWith("client:")) {
        clientId = input.key.slice("client:".length);
        const client = await ctx.db.client.findUnique({ where: { id: clientId } });
        if (!client) throw new TRPCError({ code: "NOT_FOUND" });
        name = client.companyName;
      } else if (input.key !== "internal") {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }

      const board = await ctx.db.document.create({
        data: {
          title: `${name} — Creative board`,
          type: "whiteboard",
          visibility: "team",
          content: JSON.stringify({ __auxaTemplate: "creative-space" }),
          ownerId: ctx.user.id,
        },
      });
      const space = await ctx.db.creativeSpace.create({
        data: { key: input.key, name, clientId, boardDocId: board.id },
      });
      return { id: space.id, key: space.key };
    }),

  /** Everything pinned inside one space. */
  space: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const space = await ctx.db.creativeSpace.findUnique({
        where: { key: input.key },
        include: {
          client: { select: { id: true, companyName: true } },
          items: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
        },
      });
      if (!space) throw new TRPCError({ code: "NOT_FOUND" });

      // Green zone = advance content prepared (next month's timeline exists) and
      // nothing for this client is overdue. Red zone = behind.
      const nextMonth = nextMonthKey();
      const hasAdvance = space.items.some(
        (i) => i.kind === "timeline" && (i.monthKey ?? "") >= nextMonth,
      );
      const overdue = space.clientId
        ? await ctx.db.task.count({
            where: {
              clientId: space.clientId,
              status: { notIn: ["done"] },
              dueAt: { lt: new Date() },
            },
          })
        : 0;
      const green = hasAdvance && overdue === 0;

      return {
        id: space.id,
        key: space.key,
        name: space.name,
        client: space.client,
        boardDocId: space.boardDocId,
        brandKit: parseBrandKit(space.brandKit),
        competitorNotes: space.competitorNotes,
        items: space.items,
        zone: green ? ("green" as const) : ("red" as const),
        zoneWhy: green
          ? "Advance content planned and nothing overdue."
          : !hasAdvance
            ? `No timeline entries for ${nextMonth} yet — plan next month to go green.`
            : `${overdue} overdue task${overdue === 1 ? "" : "s"} for this client.`,
        months: [thisMonthKey(), nextMonth],
      };
    }),

  addItem: protectedProcedure
    .input(
      z.object({
        spaceId: z.string(),
        kind: itemKind,
        title: z.string().min(1).max(200),
        url: z.string().max(500).optional(),
        content: z.string().max(10_000).optional(),
        monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        pinned: z.boolean().default(false),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.creativeItem.create({
        data: {
          spaceId: input.spaceId,
          kind: input.kind,
          title: input.title.trim(),
          url: input.url?.trim() || null,
          content: input.content,
          monthKey: input.monthKey,
          pinned: input.pinned,
          createdById: ctx.user.id,
        },
      }),
    ),

  togglePin: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.creativeItem.findUnique({ where: { id: input.id } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.creativeItem.update({
        where: { id: item.id },
        data: { pinned: !item.pinned },
      });
    }),

  removeItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.creativeItem.findUnique({ where: { id: input.id } });
      if (!item) return { ok: true };
      const canManage = hasPermission(ctx.user.permissions, PERMISSIONS.TASKS_ASSIGN);
      if (!canManage && item.createdById !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db.creativeItem.delete({ where: { id: item.id } });
      return { ok: true };
    }),

  setBrandKit: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        spaceId: z.string(),
        colors: z.array(z.string().max(24)).max(12),
        fonts: z.array(z.string().max(60)).max(8),
        links: z.array(z.object({ label: z.string().max(60), url: z.string().max(500) })).max(12),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.creativeSpace.update({
        where: { id: input.spaceId },
        data: {
          brandKit: JSON.stringify({
            colors: input.colors,
            fonts: input.fonts,
            links: input.links,
          }),
        },
      }),
    ),

  setCompetitorNotes: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ spaceId: z.string(), notes: z.string().max(8000) }))
    .mutation(({ ctx, input }) =>
      ctx.db.creativeSpace.update({
        where: { id: input.spaceId },
        data: { competitorNotes: input.notes },
      }),
    ),
});
