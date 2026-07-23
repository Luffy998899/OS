import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";

const ownerSelect = { select: { id: true, name: true, avatarUrl: true } };

export const documentRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const docs = await ctx.db.document.findMany({
      where: {
        OR: [
          { ownerId: ctx.user.id },
          { visibility: { in: ["team", "public"] } },
          { shares: { some: { userId: ctx.user.id } } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: { owner: ownerSelect },
    });
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      visibility: d.visibility,
      updatedAt: d.updatedAt,
      owner: d.owner,
      isOwner: d.ownerId === ctx.user.id,
    }));
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({
        where: { id: input.id },
        include: { owner: ownerSelect, shares: true },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });

      const isOwner = doc.ownerId === ctx.user.id;
      const share = doc.shares.find((s) => s.userId === ctx.user.id);
      const canView =
        isOwner ||
        doc.visibility === "public" ||
        doc.visibility === "team" ||
        !!share;
      if (!canView) throw new TRPCError({ code: "FORBIDDEN" });

      return {
        id: doc.id,
        title: doc.title,
        type: doc.type,
        visibility: doc.visibility,
        content: doc.content,
        owner: doc.owner,
        updatedAt: doc.updatedAt,
        isOwner,
        canEdit: isOwner || share?.permission === "edit",
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        type: z.enum(["whiteboard", "doc"]).default("whiteboard"),
        visibility: z.enum(["private", "team", "public"]).default("private"),
        template: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      // Whiteboard templates are stored as a marker and materialized into real
      // tldraw shapes the first time the owner opens the board.
      const content =
        input.type === "whiteboard" &&
        input.template &&
        input.template !== "blank"
          ? JSON.stringify({ __auxaTemplate: input.template })
          : null;
      return ctx.db.document.create({
        data: {
          title: input.title.trim(),
          type: input.type,
          visibility: input.visibility,
          content,
          ownerId: ctx.user.id,
        },
      });
    }),

  updateContent: protectedProcedure
    .input(z.object({ id: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({
        where: { id: input.id },
        include: { shares: true },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      const canEdit =
        doc.ownerId === ctx.user.id ||
        doc.shares.some(
          (s) => s.userId === ctx.user.id && s.permission === "edit",
        );
      if (!canEdit) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db.document.update({
        where: { id: input.id },
        data: { content: input.content },
      });
      return { ok: true };
    }),

  updateMeta: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        visibility: z.enum(["private", "team", "public"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({ where: { id: input.id } });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      if (doc.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.db.document.update({
        where: { id: input.id },
        data: {
          title: input.title?.trim(),
          visibility: input.visibility,
        },
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findUnique({ where: { id: input.id } });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      if (doc.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db.document.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
