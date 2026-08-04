import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { BLOCKS } from "@/lib/blockworld/blocks";
import { WORLD_SIZE, buildEmptyWorld, buildWorld } from "@/lib/blockworld/world";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

// The world is data in the database, not something the app generates for you.
// These procedures are the only way blocks, signs, regions and interactive
// spots get into it — every one of them is a deliberate act by a builder.
//
// Blocks travel as a flat Int array [x,y,z,id, x,y,z,id, ...]. A world with
// 40k placed blocks is 160k numbers, which is a fraction of the JSON the same
// data costs as objects.

const MAX_BATCH = 40_000;

/** Building rearranges everyone's workspace, so it is a managed action. */
function assertBuilder(user: { roleName: string; permissions: string[] }): void {
  if (
    user.roleName !== "Admin" &&
    !hasPermission(user.permissions, PERMISSIONS.SETTINGS_MANAGE)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You need build rights to edit the world.",
    });
  }
}

const inBounds = (x: number, y: number, z: number): boolean =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  Number.isInteger(z) &&
  x >= 0 &&
  y >= 0 &&
  z >= 0 &&
  x < WORLD_SIZE.sx &&
  y < WORLD_SIZE.sy &&
  z < WORLD_SIZE.sz;

const validBlock = (id: number): boolean =>
  Number.isInteger(id) && id >= 0 && id < BLOCKS.length;

/** Bump the revision so other clients notice there is something to pull. */
async function bump(db: typeof import("@/lib/db").db): Promise<number> {
  const meta = await db.worldMeta.upsert({
    where: { id: "world" },
    create: { id: "world", revision: 1 },
    update: { revision: { increment: 1 } },
  });
  return meta.revision;
}

const signInput = z.object({
  id: z.string().optional(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  face: z.enum(["n", "s", "e", "w"]),
  text: z.string().min(1).max(64),
  size: z.number().min(0.2).max(4).default(0.9),
  color: z.string().max(16).nullable().optional(),
  bg: z.string().max(16).nullable().optional(),
});

/**
 * First run: lay the ground plane and record the spawn. Without this a fresh
 * install is pure air and you fall out of the world. It happens exactly once —
 * the WorldMeta row is the marker — so a builder who later digs the floor out
 * keeps their hole.
 */
async function ensureWorld(db: typeof import("@/lib/db").db): Promise<void> {
  const meta = await db.worldMeta.findUnique({ where: { id: "world" } });
  if (meta) return;

  const empty = buildEmptyWorld();
  const rows: { x: number; y: number; z: number; blockId: number }[] = [];
  for (let y = 0; y < empty.sy; y++)
    for (let z = 0; z < empty.sz; z++)
      for (let x = 0; x < empty.sx; x++) {
        const id = empty.blocks[(y * empty.sz + z) * empty.sx + x];
        if (id !== 0) rows.push({ x, y, z, blockId: id });
      }
  for (let i = 0; i < rows.length; i += 5000) {
    await db.worldBlock.createMany({ data: rows.slice(i, i + 5000) });
  }
  await db.worldMeta.create({
    data: {
      id: "world",
      spawnX: empty.spawn.x,
      spawnY: empty.spawn.y,
      spawnZ: empty.spawn.z,
      spawnYaw: empty.spawnYaw,
      revision: 1,
    },
  });
}

export const worldRouter = router({
  /** Everything needed to render the world, in one call. */
  load: protectedProcedure.query(async ({ ctx }) => {
    await ensureWorld(ctx.db);
    const [blocks, signs, pois, regions, meta] = await Promise.all([
      ctx.db.worldBlock.findMany({ select: { x: true, y: true, z: true, blockId: true } }),
      ctx.db.worldSign.findMany(),
      ctx.db.worldPoi.findMany(),
      ctx.db.worldRegion.findMany(),
      ctx.db.worldMeta.findUnique({ where: { id: "world" } }),
    ]);

    const flat = new Array<number>(blocks.length * 4);
    blocks.forEach((b, i) => {
      flat[i * 4] = b.x;
      flat[i * 4 + 1] = b.y;
      flat[i * 4 + 2] = b.z;
      flat[i * 4 + 3] = b.blockId;
    });

    return {
      size: WORLD_SIZE,
      blocks: flat,
      signs: signs.map((s) => ({
        id: s.id,
        text: s.text,
        x: s.x,
        y: s.y,
        z: s.z,
        face: s.face as "n" | "s" | "e" | "w",
        size: s.size,
        color: s.color,
        bg: s.bg,
      })),
      pois: pois.map((p) => ({
        id: p.id,
        label: p.label,
        sublabel: p.sublabel,
        panel: p.panel,
        refId: p.refId,
        adminOnly: p.adminOnly,
        x: p.x,
        y: p.y,
        z: p.z,
      })),
      regions: regions.map((r) => ({
        key: r.key,
        label: r.label,
        roomId: r.roomId,
        min: { x: r.minX, y: r.minY, z: r.minZ },
        max: { x: r.maxX, y: r.maxY, z: r.maxZ },
        lair: r.lair,
      })),
      spawn: {
        x: meta?.spawnX ?? WORLD_SIZE.sx / 2,
        y: meta?.spawnY ?? 1,
        z: meta?.spawnZ ?? WORLD_SIZE.sz / 2,
        yaw: meta?.spawnYaw ?? 0,
      },
      revision: meta?.revision ?? 0,
      canBuild:
        ctx.user.roleName === "Admin" ||
        hasPermission(ctx.user.permissions, PERMISSIONS.SETTINGS_MANAGE),
    };
  }),

  /** Cheap poll: has anyone changed anything since the revision I hold? */
  revision: protectedProcedure.query(async ({ ctx }) => {
    const meta = await ctx.db.worldMeta.findUnique({ where: { id: "world" } });
    return meta?.revision ?? 0;
  }),

  /**
   * Place or clear blocks. `blockId` 0 means "break". Sent in batches so a
   * click-drag or a fill costs one round trip instead of hundreds.
   */
  place: protectedProcedure
    .input(z.object({ blocks: z.array(z.number().int()).max(MAX_BATCH * 4) }))
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      if (input.blocks.length % 4 !== 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed block batch." });
      }
      const puts: { x: number; y: number; z: number; blockId: number }[] = [];
      const dels: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < input.blocks.length; i += 4) {
        const [x, y, z, id] = input.blocks.slice(i, i + 4);
        if (!inBounds(x, y, z) || !validBlock(id)) continue;
        if (id === 0) dels.push({ x, y, z });
        else puts.push({ x, y, z, blockId: id });
      }

      await ctx.db.$transaction(async (tx) => {
        if (dels.length > 0) {
          await tx.worldBlock.deleteMany({ where: { OR: dels } });
          // Breaking a block takes whatever was wired to it with it.
          await tx.worldPoi.deleteMany({ where: { OR: dels } });
        }
        for (const b of puts) {
          await tx.worldBlock.upsert({
            where: { x_y_z: { x: b.x, y: b.y, z: b.z } },
            create: { ...b, updatedBy: ctx.user.id },
            update: { blockId: b.blockId, updatedBy: ctx.user.id },
          });
        }
      });
      return { revision: await bump(ctx.db), placed: puts.length, removed: dels.length };
    }),

  /** Wipe every block, sign, region and interactive spot. */
  clear: protectedProcedure.mutation(async ({ ctx }) => {
    assertBuilder(ctx.user);
    await ctx.db.$transaction([
      ctx.db.worldBlock.deleteMany({}),
      ctx.db.worldSign.deleteMany({}),
      ctx.db.worldPoi.deleteMany({}),
      ctx.db.worldRegion.deleteMany({}),
    ]);
    return { revision: await bump(ctx.db) };
  }),

  /**
   * Stamp the old generated office into the world as a starting point. It is a
   * template now — nothing regenerates it, and you can edit or wipe it freely.
   */
  loadTemplate: protectedProcedure
    .input(z.object({ replace: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      const [rooms, projects] = await Promise.all([
        ctx.db.room.findMany({ select: { id: true, key: true, name: true, kind: true } }),
        ctx.db.project.findMany({
          select: { id: true, name: true, floor: true, buildingKey: true },
        }),
      ]);
      const world = buildWorld({ rooms, projects });

      if (input.replace) {
        await ctx.db.$transaction([
          ctx.db.worldBlock.deleteMany({}),
          ctx.db.worldSign.deleteMany({}),
          ctx.db.worldPoi.deleteMany({}),
          ctx.db.worldRegion.deleteMany({}),
        ]);
      }

      // Only non-air cells become rows: the template is mostly solid, so this
      // is written in chunks rather than one enormous statement.
      const rows: { x: number; y: number; z: number; blockId: number }[] = [];
      for (let y = 0; y < world.sy; y++)
        for (let z = 0; z < world.sz; z++)
          for (let x = 0; x < world.sx; x++) {
            const id = world.blocks[(y * world.sz + z) * world.sx + x];
            if (id !== 0) rows.push({ x, y, z, blockId: id });
          }
      for (let i = 0; i < rows.length; i += 5000) {
        await ctx.db.worldBlock.createMany({ data: rows.slice(i, i + 5000) });
      }

      await ctx.db.worldSign.createMany({
        data: world.signs.map((s) => ({
          x: s.x,
          y: s.y,
          z: s.z,
          face: s.face,
          text: s.text,
          size: s.size ?? 0.9,
          color: s.color ?? null,
          bg: s.bg ?? null,
        })),
      });
      await ctx.db.worldPoi.createMany({
        data: world.pois
          // Lifts and rifts teleport rather than open a panel; those are not
          // expressible as a placed block yet, so the template drops them.
          .filter((p) => p.panel !== "rift")
          .map((p) => ({
            x: Math.floor(p.min.x),
            y: Math.floor(p.min.y),
            z: Math.floor(p.min.z),
            label: p.label,
            sublabel: p.sublabel ?? null,
            panel: p.panel,
            refId: p.refId ?? null,
            adminOnly: p.adminOnly ?? false,
          })),
      });
      await ctx.db.worldRegion.createMany({
        data: world.regions.map((r) => ({
          key: r.key,
          label: r.label,
          roomId: r.roomId ?? null,
          minX: r.min.x,
          minY: r.min.y,
          minZ: r.min.z,
          maxX: r.max.x,
          maxY: r.max.y,
          maxZ: r.max.z,
          lair: r.lair ?? false,
        })),
      });
      await ctx.db.worldMeta.upsert({
        where: { id: "world" },
        create: {
          id: "world",
          spawnX: world.spawn.x,
          spawnY: world.spawn.y,
          spawnZ: world.spawn.z,
          spawnYaw: world.spawnYaw,
        },
        update: {
          spawnX: world.spawn.x,
          spawnY: world.spawn.y,
          spawnZ: world.spawn.z,
          spawnYaw: world.spawnYaw,
        },
      });
      return { revision: await bump(ctx.db), blocks: rows.length };
    }),

  // ---- signs --------------------------------------------------------------

  setSign: protectedProcedure.input(signInput).mutation(async ({ ctx, input }) => {
    assertBuilder(ctx.user);
    const { id, ...data } = input;
    if (id) {
      await ctx.db.worldSign.update({ where: { id }, data });
    } else {
      await ctx.db.worldSign.create({ data });
    }
    return { revision: await bump(ctx.db) };
  }),

  deleteSign: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      await ctx.db.worldSign.deleteMany({ where: { id: input.id } });
      return { revision: await bump(ctx.db) };
    }),

  // ---- interactive spots --------------------------------------------------

  /** Wire a placed block to a tool panel, so pressing E on it opens the app. */
  setPoi: protectedProcedure
    .input(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
        z: z.number().int(),
        label: z.string().min(1).max(48),
        sublabel: z.string().max(64).nullable().optional(),
        panel: z.string().min(1).max(24),
        refId: z.string().nullable().optional(),
        adminOnly: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      if (!inBounds(input.x, input.y, input.z)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That is outside the world." });
      }
      const { x, y, z, ...rest } = input;
      await ctx.db.worldPoi.upsert({
        where: { x_y_z: { x, y, z } },
        create: { x, y, z, ...rest, sublabel: rest.sublabel ?? null, refId: rest.refId ?? null },
        update: { ...rest, sublabel: rest.sublabel ?? null, refId: rest.refId ?? null },
      });
      return { revision: await bump(ctx.db) };
    }),

  deletePoi: protectedProcedure
    .input(z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      await ctx.db.worldPoi.deleteMany({ where: { x: input.x, y: input.y, z: input.z } });
      return { revision: await bump(ctx.db) };
    }),

  // ---- named volumes ------------------------------------------------------

  setRegion: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(48),
        label: z.string().min(1).max(48),
        roomId: z.string().nullable().optional(),
        min: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }),
        max: z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() }),
        lair: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      const data = {
        label: input.label,
        roomId: input.roomId ?? null,
        minX: input.min.x,
        minY: input.min.y,
        minZ: input.min.z,
        maxX: input.max.x,
        maxY: input.max.y,
        maxZ: input.max.z,
        lair: input.lair,
      };
      await ctx.db.worldRegion.upsert({
        where: { key: input.key },
        create: { key: input.key, ...data },
        update: data,
      });
      return { revision: await bump(ctx.db) };
    }),

  deleteRegion: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      await ctx.db.worldRegion.deleteMany({ where: { key: input.key } });
      return { revision: await bump(ctx.db) };
    }),

  /** Move the point everyone arrives at. */
  setSpawn: protectedProcedure
    .input(
      z.object({ x: z.number(), y: z.number(), z: z.number(), yaw: z.number() }),
    )
    .mutation(async ({ ctx, input }) => {
      assertBuilder(ctx.user);
      await ctx.db.worldMeta.upsert({
        where: { id: "world" },
        create: {
          id: "world",
          spawnX: input.x,
          spawnY: input.y,
          spawnZ: input.z,
          spawnYaw: input.yaw,
        },
        update: { spawnX: input.x, spawnY: input.y, spawnZ: input.z, spawnYaw: input.yaw },
      });
      return { revision: await bump(ctx.db) };
    }),

  /**
   * What a wired block can point at. The wiring dialog offers these instead of
   * free text, so a block can never open a room or client that isn't there.
   */
  targets: protectedProcedure.query(async ({ ctx }) => {
    assertBuilder(ctx.user);
    const [rooms, clients, projects] = await Promise.all([
      ctx.db.room.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ctx.db.client.findMany({
        select: { id: true, companyName: true },
        orderBy: { companyName: "asc" },
      }),
      ctx.db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return {
      rooms,
      clients: clients.map((c) => ({ id: c.id, name: c.companyName })),
      projects,
    };
  }),
});
