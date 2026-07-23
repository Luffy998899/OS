import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "../trpc";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  computeTotals,
  financialYear,
  invoiceNumber,
  round2,
} from "@/lib/finance";
import { sendInvoiceEmail } from "@/lib/invoice-mail";

const itemSchema = z.object({
  description: z.string().min(1),
  hsnSac: z.string().optional(),
  qty: z.number().min(0),
  rate: z.number().min(0),
});

export const invoiceRouter = router({
  list: permissionProcedure(PERMISSIONS.BILLING_MANAGE).query(({ ctx }) =>
    ctx.db.invoice.findMany({
      orderBy: { createdAt: "desc" },
      include: { client: { select: { id: true, companyName: true } } },
    }),
  ),

  byId: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const inv = await ctx.db.invoice.findUnique({
        where: { id: input.id },
        include: {
          items: { orderBy: { position: "asc" } },
          client: true,
          createdBy: { select: { name: true } },
        },
      });
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      return inv;
    }),

  next: permissionProcedure(PERMISSIONS.BILLING_MANAGE).query(async ({ ctx }) => {
    const fy = financialYear();
    const prefix = `INV/${fy}/`;
    const count = await ctx.db.invoice.count({
      where: { number: { startsWith: prefix } },
    });
    return { number: invoiceNumber(fy, count + 1) };
  }),

  create: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(
      z.object({
        clientId: z.string().optional(),
        billTo: z.object({
          name: z.string().min(1),
          email: z.string().optional(),
          phone: z.string().optional(),
          gstin: z.string().optional(),
          address: z.string().optional(),
        }),
        saveClient: z.boolean().optional(),
        invoiceDate: z.string(),
        dueDate: z.string().optional(),
        paymentTerms: z.string().default("net_30"),
        poNumber: z.string().optional(),
        taxType: z.enum(["igst", "cgst_sgst", "none"]).default("igst"),
        taxRate: z.number().min(0).max(100).default(18),
        discount: z.number().min(0).default(0),
        notes: z.string().optional(),
        items: z.array(itemSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const totals = computeTotals(input.items, input.taxType, input.taxRate, input.discount);

      const dateObj = new Date(input.invoiceDate);
      const fy = financialYear(isNaN(dateObj.getTime()) ? new Date() : dateObj);
      const prefix = `INV/${fy}/`;
      const count = await ctx.db.invoice.count({
        where: { number: { startsWith: prefix } },
      });
      const number = invoiceNumber(fy, count + 1);

      let clientId = input.clientId || null;
      if (!clientId && input.saveClient) {
        const c = await ctx.db.client.create({
          data: {
            companyName: input.billTo.name.trim(),
            email: input.billTo.email?.trim() || null,
            phone: input.billTo.phone?.trim() || null,
            gstin: input.billTo.gstin?.trim() || null,
            address: input.billTo.address?.trim() || null,
          },
        });
        clientId = c.id;
      }

      return ctx.db.invoice.create({
        data: {
          number,
          clientId,
          billToName: input.billTo.name.trim(),
          billToEmail: input.billTo.email?.trim() || null,
          billToPhone: input.billTo.phone?.trim() || null,
          billToGstin: input.billTo.gstin?.trim() || null,
          billToAddress: input.billTo.address?.trim() || null,
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate || null,
          paymentTerms: input.paymentTerms,
          poNumber: input.poNumber?.trim() || null,
          taxType: input.taxType,
          taxRate: input.taxRate,
          discount: input.discount,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          total: totals.total,
          notes: input.notes?.trim() || null,
          createdById: ctx.user.id,
          items: {
            create: input.items.map((it, i) => ({
              description: it.description.trim(),
              hsnSac: it.hsnSac?.trim() || null,
              qty: it.qty,
              rate: it.rate,
              amount: round2(it.qty * it.rate),
              position: i,
            })),
          },
        },
      });
    }),

  setStatus: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.invoice.update({
        where: { id: input.id },
        data: {
          status: input.status,
          paidAt: input.status === "paid" ? new Date() : null,
        },
      }),
    ),

  send: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await sendInvoiceEmail(input.id);
      await ctx.db.invoice.update({
        where: { id: input.id },
        data: {
          sentAt: new Date(),
          status: "sent",
        },
      });
      return result;
    }),

  remove: permissionProcedure(PERMISSIONS.BILLING_MANAGE)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.invoice.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
