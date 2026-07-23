import "server-only";
import { db } from "@/lib/db";
import { renderInvoicePdf, type InvoicePdfData } from "@/lib/invoice-pdf";
import { sendEmail } from "@/lib/email";
import { formatINR } from "@/lib/finance";

function parse<T>(v: string | undefined, fallback: T): T {
  if (!v) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(v) as object) } as T;
  } catch {
    return fallback;
  }
}

export async function buildInvoicePdfData(
  invoiceId: string,
): Promise<InvoicePdfData | null> {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!inv) return null;

  const rows = await db.setting.findMany({
    where: { key: { in: ["org", "branding", "bank"] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    org: parse(map.org, { name: "", gstin: "", phone: "", email: "", address: "" }),
    branding: parse(map.branding, { logoUrl: "", primaryColor: "#6184d6" }),
    bank: parse(map.bank, { bankName: "", accountHolder: "", accountNumber: "", ifsc: "" }),
    invoice: {
      number: inv.number,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      poNumber: inv.poNumber,
      paymentTerms: inv.paymentTerms,
      billToName: inv.billToName,
      billToEmail: inv.billToEmail,
      billToPhone: inv.billToPhone,
      billToGstin: inv.billToGstin,
      billToAddress: inv.billToAddress,
      taxType: inv.taxType,
      taxRate: inv.taxRate,
      discount: inv.discount,
      subtotal: inv.subtotal,
      taxAmount: inv.taxAmount,
      total: inv.total,
      notes: inv.notes,
      items: inv.items.map((it) => ({
        description: it.description,
        hsnSac: it.hsnSac,
        qty: it.qty,
        rate: it.rate,
        amount: it.amount,
      })),
    },
  };
}

export async function getInvoicePdf(invoiceId: string): Promise<Buffer | null> {
  const data = await buildInvoicePdfData(invoiceId);
  if (!data) return null;
  return renderInvoicePdf(data);
}

export async function sendInvoiceEmail(invoiceId: string): Promise<{
  sent: boolean;
  skipped?: boolean;
  error?: string;
  to?: string;
}> {
  const data = await buildInvoicePdfData(invoiceId);
  if (!data) return { sent: false, error: "Invoice not found" };
  const inv = data.invoice;
  const to = inv.billToEmail?.trim();
  if (!to) return { sent: false, skipped: true, error: "Client has no email" };

  const pdf = await renderInvoicePdf(data);
  const orgName = data.org.name || "Auxa";
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2430">
    <h2 style="margin:0 0 12px">Invoice ${inv.number}</h2>
    <p style="font-size:14px;line-height:1.6;color:#3f3f46">
      Hi ${inv.billToName}, please find attached invoice <strong>${inv.number}</strong> from ${orgName}
      for <strong>${formatINR(inv.total)}</strong>${inv.dueDate ? `, due ${inv.dueDate}` : ""}.
    </p>
    <p style="font-size:12px;color:#a1a1aa">Thank you for your business.</p>
  </div>`;

  const res = await sendEmail({
    to,
    subject: `Invoice ${inv.number} from ${orgName}`,
    html,
    text: `Invoice ${inv.number} from ${orgName} — total ${formatINR(inv.total)}.`,
    attachments: [
      { filename: `${inv.number.replace(/\//g, "-")}.pdf`, content: pdf.toString("base64") },
    ],
  });
  return { ...res, to };
}
