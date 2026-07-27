import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";

// The conference hall. Urgent meetings get announced here, disclosures and
// incentives get posted here, and the weekly do's & don'ts feedback round lives
// here. Acks tell the poster who has actually seen it.

const kindEnum = z.enum(["urgent_meeting", "disclosure", "incentive", "feedback"]);

export const conferenceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.announcement.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: { acks: { select: { userId: true } } },
    });
    const people = await ctx.db.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      meetingAt: r.meetingAt,
      pinned: r.pinned,
      createdAt: r.createdAt,
      postedBy: nameOf.get(r.createdById) ?? "—",
      ackCount: r.acks.length,
      acked: r.acks.some((a) => a.userId === ctx.user.id),
      mine: r.createdById === ctx.user.id,
    }));
  }),

  /** The next urgent meeting — the floor shows a banner while one is live. */
  next: protectedProcedure.query(({ ctx }) =>
    ctx.db.announcement.findFirst({
      where: {
        kind: "urgent_meeting",
        meetingAt: { gte: new Date(Date.now() - 30 * 60_000) },
      },
      orderBy: { meetingAt: "asc" },
      select: { id: true, title: true, meetingAt: true },
    }),
  ),

  post: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        kind: kindEnum,
        title: z.string().min(2).max(140),
        body: z.string().max(4000).optional(),
        meetingAt: z.date().optional(),
        pinned: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "urgent_meeting" && !input.meetingAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An urgent meeting needs a time." });
      }
      const ann = await ctx.db.announcement.create({
        data: {
          kind: input.kind,
          title: input.title.trim(),
          body: input.body?.trim(),
          meetingAt: input.meetingAt,
          pinned: input.pinned,
          createdById: ctx.user.id,
        },
      });
      // Urgent meetings ping everyone; the rest wait on the hall screen.
      if (input.kind === "urgent_meeting") {
        const team = await ctx.db.user.findMany({
          where: { status: "active", id: { not: ctx.user.id } },
          select: { id: true },
        });
        await ctx.db.notification.createMany({
          data: team.map((u) => ({
            userId: u.id,
            type: "system",
            title: "Urgent meeting called",
            body: `${input.title} — head to the conference hall.`,
          })),
        });
      }
      return ann;
    }),

  ack: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.announcementAck.upsert({
        where: { announcementId_userId: { announcementId: input.id, userId: ctx.user.id } },
        create: { announcementId: input.id, userId: ctx.user.id },
        update: {},
      });
      return { ok: true };
    }),

  remove: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.db.announcement.delete({ where: { id: input.id } })),
});
