import { z } from "zod";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { ingestWhatsAppTask } from "@/lib/whatsapp";

function parseJson<T>(v: string | undefined, fallback: T): T {
  if (!v) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(v) as object) } as T;
  } catch {
    return fallback;
  }
}

type WhatsAppCfg = {
  enabled: boolean;
  reviewRequired: boolean;
  ownerPhone: string;
};
type EmailCfg = {
  reportReminderTime: string;
  timezone: string;
  enabled: boolean;
};
type OrgCfg = { name: string; gstin: string; phone: string; email: string; address: string };
type BrandingCfg = { logoUrl: string; primaryColor: string };
type BankCfg = { bankName: string; accountHolder: string; accountNumber: string; ifsc: string };
type LegalCfg = { entityName: string; pan: string; cin: string; registeredAddress: string; notes: string };

const ORG_DEFAULT: OrgCfg = { name: "", gstin: "", phone: "", email: "", address: "" };
const BRANDING_DEFAULT: BrandingCfg = { logoUrl: "", primaryColor: "#6184d6" };
const BANK_DEFAULT: BankCfg = { bankName: "", accountHolder: "", accountNumber: "", ifsc: "" };
const LEGAL_DEFAULT: LegalCfg = { entityName: "", pan: "", cin: "", registeredAddress: "", notes: "" };

export const settingRouter = router({
  get: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE).query(
    async ({ ctx }) => {
      const rows = await ctx.db.setting.findMany();
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      return {
        whatsapp: parseJson<WhatsAppCfg>(map.whatsapp, {
          enabled: false,
          reviewRequired: true,
          ownerPhone: "",
        }),
        email: parseJson<EmailCfg>(map.email, {
          reportReminderTime: "17:55",
          timezone: "Asia/Kolkata",
          enabled: true,
        }),
        org: parseJson<OrgCfg>(map.org, ORG_DEFAULT),
        branding: parseJson<BrandingCfg>(map.branding, BRANDING_DEFAULT),
        bank: parseJson<BankCfg>(map.bank, BANK_DEFAULT),
        legal: parseJson<LegalCfg>(map.legal, LEGAL_DEFAULT),
        env: {
          aiEnabled: !!process.env.ANTHROPIC_API_KEY,
          emailEnabled: !!process.env.RESEND_API_KEY,
          whatsappConfigured: !!process.env.TWILIO_ACCOUNT_SID,
          verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "auxa-verify",
          appUrl: process.env.APP_URL || "http://localhost:3000",
          webhookPath: "/api/webhooks/whatsapp",
        },
      };
    },
  ),

  updateWhatsApp: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(
      z.object({
        enabled: z.boolean(),
        ownerPhone: z.string(),
        reviewRequired: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = JSON.stringify(input);
      await ctx.db.setting.upsert({
        where: { key: "whatsapp" },
        create: { key: "whatsapp", value },
        update: { value },
      });
      return { ok: true };
    }),

  updateEmail: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(
      z.object({
        reportReminderTime: z.string(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = JSON.stringify({ ...input, timezone: "Asia/Kolkata" });
      await ctx.db.setting.upsert({
        where: { key: "email" },
        create: { key: "email", value },
        update: { value },
      });
      return { ok: true };
    }),

  updateOrg: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(
      z.object({
        name: z.string(),
        gstin: z.string(),
        phone: z.string(),
        email: z.string(),
        address: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = JSON.stringify(input);
      await ctx.db.setting.upsert({ where: { key: "org" }, create: { key: "org", value }, update: { value } });
      return { ok: true };
    }),

  updateBranding: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(z.object({ logoUrl: z.string(), primaryColor: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const value = JSON.stringify(input);
      await ctx.db.setting.upsert({ where: { key: "branding" }, create: { key: "branding", value }, update: { value } });
      return { ok: true };
    }),

  updateBank: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(
      z.object({
        bankName: z.string(),
        accountHolder: z.string(),
        accountNumber: z.string(),
        ifsc: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = JSON.stringify(input);
      await ctx.db.setting.upsert({ where: { key: "bank" }, create: { key: "bank", value }, update: { value } });
      return { ok: true };
    }),

  updateLegal: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(
      z.object({
        entityName: z.string(),
        pan: z.string(),
        cin: z.string(),
        registeredAddress: z.string(),
        notes: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const value = JSON.stringify(input);
      await ctx.db.setting.upsert({ where: { key: "legal" }, create: { key: "legal", value }, update: { value } });
      return { ok: true };
    }),

  simulateWhatsApp: permissionProcedure(PERMISSIONS.SETTINGS_MANAGE)
    .input(
      z.object({ body: z.string().min(3), fromPhone: z.string().optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.setting.findUnique({ where: { key: "whatsapp" } });
      const cfg = parseJson<WhatsAppCfg>(row?.value, {
        enabled: false,
        reviewRequired: true,
        ownerPhone: "",
      });
      return ingestWhatsAppTask({
        fromPhone: input.fromPhone || cfg.ownerPhone || "+910000000000",
        body: input.body,
      });
    }),
});
