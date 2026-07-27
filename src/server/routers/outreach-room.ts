import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { dateKey } from "@/lib/timetable";

// The outreach room. Managers push sector lists into the pending pool; each
// agent gets one sector a day, the day-plan orders it for efficiency, and a hot
// lead confirms an OTP on the spot — verifying it auto-fills them into the CRM.

const targetShape = {
  id: true,
  sector: true,
  name: true,
  phone: true,
  niche: true,
  notes: true,
  status: true,
  order: true,
  assignedDate: true,
} as const;

function otpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Day-plan ordering: leads with phone numbers first (callable now), grouped by
 * niche so the pitch stays warm, alphabetical inside a group for determinism.
 */
export function planOrder<T extends { phone?: string | null; niche?: string | null; name: string }>(
  targets: T[],
): T[] {
  return [...targets].sort((a, b) => {
    const ap = a.phone ? 0 : 1;
    const bp = b.phone ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const an = (a.niche ?? "zz").toLowerCase();
    const bn = (b.niche ?? "zz").toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return a.name.localeCompare(b.name);
  });
}

export const outreachRoomRouter = router({
  /** My day: today's sector, the ordered run, and the size of the pending pool. */
  today: protectedProcedure.query(async ({ ctx }) => {
    const today = dateKey();
    const [mine, pendingPool, sectors] = await Promise.all([
      ctx.db.outreachTarget.findMany({
        where: { assignedToId: ctx.user.id, assignedDate: today },
        orderBy: { order: "asc" },
        select: targetShape,
      }),
      ctx.db.outreachTarget.count({ where: { status: "pending", assignedToId: null } }),
      ctx.db.outreachTarget.groupBy({
        by: ["sector"],
        where: { status: "pending", assignedToId: null },
        _count: { _all: true },
      }),
    ]);
    return {
      targets: mine,
      pendingPool,
      sectors: sectors.map((s) => ({ sector: s.sector, count: s._count._all })),
      done: mine.filter((t) => t.status !== "pending").length,
    };
  }),

  /** Manager pushes a sector list into the pending room. */
  push: permissionProcedure(PERMISSIONS.TASKS_ASSIGN)
    .input(
      z.object({
        sector: z.string().min(2).max(80),
        niche: z.string().max(80).optional(),
        entries: z
          .array(
            z.object({
              name: z.string().min(1).max(120),
              phone: z.string().max(20).optional(),
              notes: z.string().max(300).optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.outreachTarget.createMany({
        data: input.entries.map((e) => ({
          sector: input.sector.trim(),
          niche: input.niche?.trim() || null,
          name: e.name.trim(),
          phone: e.phone?.trim() || null,
          notes: e.notes?.trim() || null,
        })),
      });
      return { ok: true, added: input.entries.length };
    }),

  /**
   * Grab (or get handed) today's sector: every pending lead in it becomes my
   * ordered run for the day.
   */
  assignSector: protectedProcedure
    .input(z.object({ sector: z.string(), userId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const forUser = input.userId ?? ctx.user.id;
      if (forUser !== ctx.user.id) {
        // Only managers assign someone else's day.
        const { hasPermission, PERMISSIONS: P } = await import("@/lib/auth/permissions");
        if (!hasPermission(ctx.user.permissions, P.TASKS_ASSIGN)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      const pool = await ctx.db.outreachTarget.findMany({
        where: { sector: input.sector, status: "pending", assignedToId: null },
      });
      if (pool.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That sector's pool is empty." });
      }
      const ordered = planOrder(pool);
      const today = dateKey();
      await ctx.db.$transaction(
        ordered.map((t, i) =>
          ctx.db.outreachTarget.update({
            where: { id: t.id },
            data: { assignedToId: forUser, assignedDate: today, order: i + 1 },
          }),
        ),
      );
      return { ok: true, count: ordered.length };
    }),

  /** Re-run the day-plan ordering over what's left of my run. */
  planMyDay: protectedProcedure.mutation(async ({ ctx }) => {
    const today = dateKey();
    const mine = await ctx.db.outreachTarget.findMany({
      where: { assignedToId: ctx.user.id, assignedDate: today, status: "pending" },
    });
    const ordered = planOrder(mine);
    await ctx.db.$transaction(
      ordered.map((t, i) =>
        ctx.db.outreachTarget.update({ where: { id: t.id }, data: { order: i + 1 } }),
      ),
    );
    return { ok: true, count: ordered.length };
  }),

  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["pending", "contacted", "hot", "dropped"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.outreachTarget.update({ where: { id: input.id }, data: { status: input.status } }),
    ),

  // ---- the OTP handshake ------------------------------------------------

  /**
   * A lead went hot on the call: fire an OTP at their number. Without an SMS
   * provider configured the code comes back for the agent to read out — the
   * demo path is explicit about itself.
   */
  sendOtp: protectedProcedure
    .input(z.object({ phone: z.string().min(6).max(20), targetId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const code = otpCode();
      await ctx.db.leadOtp.create({
        data: {
          phone: input.phone.trim(),
          code,
          targetId: input.targetId ?? null,
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      });
      const smsConfigured = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
      // With Twilio configured the code would go out by SMS; the demo path
      // hands it to the agent to relay verbally.
      return { ok: true, demo: !smsConfigured, code: smsConfigured ? null : code };
    }),

  /** Lead reads the code back → they land in the CRM as a hot client. */
  verifyOtp: protectedProcedure
    .input(z.object({ phone: z.string().min(6).max(20), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const phone = input.phone.trim();
      const otp = await ctx.db.leadOtp.findFirst({
        where: { phone, code: input.code, verified: false, expiresAt: { gte: new Date() } },
        orderBy: { createdAt: "desc" },
      });
      if (!otp) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Wrong or expired code." });
      }

      const target = otp.targetId
        ? await ctx.db.outreachTarget.findUnique({ where: { id: otp.targetId } })
        : null;

      const existing = await ctx.db.client.findFirst({ where: { phone } });
      const client =
        existing ??
        (await ctx.db.client.create({
          data: {
            companyName: target?.name ?? `Lead ${phone}`,
            phone,
            category: target?.niche ?? undefined,
            status: "new",
            temperature: "hot",
            notes: target
              ? `Auto-filled from outreach (sector ${target.sector}) after OTP confirmation.`
              : "Auto-filled from outreach after OTP confirmation.",
            managerId: ctx.user.id,
          },
        }));

      await ctx.db.$transaction([
        ctx.db.leadOtp.update({
          where: { id: otp.id },
          data: { verified: true, clientId: client.id },
        }),
        ctx.db.outreachLog.create({
          data: {
            clientId: client.id,
            channel: "call",
            outcome: "interested",
            note: "OTP confirmed on the spot — lead self-verified into the CRM.",
          },
        }),
        ...(target
          ? [
              ctx.db.outreachTarget.update({
                where: { id: target.id },
                data: { status: "converted" },
              }),
            ]
          : []),
      ]);

      return { ok: true, clientId: client.id, companyName: client.companyName };
    }),
});
