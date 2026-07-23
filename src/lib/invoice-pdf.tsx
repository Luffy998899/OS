import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { PAYMENT_TERMS } from "@/lib/finance";

export type InvoicePdfData = {
  org: { name: string; gstin: string; phone: string; email: string; address: string };
  branding: { logoUrl: string; primaryColor: string };
  bank: { bankName: string; accountHolder: string; accountNumber: string; ifsc: string };
  invoice: {
    number: string;
    invoiceDate: string;
    dueDate?: string | null;
    poNumber?: string | null;
    paymentTerms: string;
    billToName: string;
    billToEmail?: string | null;
    billToPhone?: string | null;
    billToGstin?: string | null;
    billToAddress?: string | null;
    taxType: string;
    taxRate: number;
    discount: number;
    subtotal: number;
    taxAmount: number;
    total: number;
    notes?: string | null;
    items: { description: string; hsnSac?: string | null; qty: number; rate: number; amount: number }[];
  };
};

const money = (n: number) =>
  "Rs. " +
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const termLabel = (v: string) =>
  PAYMENT_TERMS.find((t) => t.value === v)?.label ?? v;

function build(accent: string) {
  return StyleSheet.create({
    page: { padding: 40, fontSize: 10, color: "#1f2430", fontFamily: "Helvetica" },
    row: { flexDirection: "row" },
    between: { flexDirection: "row", justifyContent: "space-between" },
    orgName: { fontSize: 18, fontFamily: "Helvetica-Bold", color: accent },
    muted: { color: "#6b7280" },
    invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right" },
    section: { marginTop: 22 },
    label: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    strong: { fontFamily: "Helvetica-Bold" },
    tableHead: { flexDirection: "row", backgroundColor: accent, color: "#ffffff", paddingVertical: 6, paddingHorizontal: 8, marginTop: 8 },
    tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
    cDesc: { width: "46%" },
    cHsn: { width: "16%" },
    cQty: { width: "10%", textAlign: "right" },
    cRate: { width: "14%", textAlign: "right" },
    cAmt: { width: "14%", textAlign: "right" },
    totals: { marginTop: 12, alignSelf: "flex-end", width: "45%" },
    totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    grand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: accent },
    footerBox: { marginTop: 26, padding: 12, backgroundColor: "#f6f7f9", borderRadius: 4 },
  });
}

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const { org, bank, invoice } = data;
  const accent = data.branding.primaryColor || "#6184d6";
  const s = build(accent);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.between}>
          <View>
            <Text style={s.orgName}>{org.name || "Your Company"}</Text>
            {org.address ? <Text style={s.muted}>{org.address}</Text> : null}
            {org.gstin ? <Text style={s.muted}>GSTIN: {org.gstin}</Text> : null}
            {org.email ? <Text style={s.muted}>{org.email}</Text> : null}
            {org.phone ? <Text style={s.muted}>{org.phone}</Text> : null}
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={{ textAlign: "right", marginTop: 4 }}>{invoice.number}</Text>
          </View>
        </View>

        <View style={[s.between, s.section]}>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.strong}>{invoice.billToName}</Text>
            {invoice.billToAddress ? <Text style={s.muted}>{invoice.billToAddress}</Text> : null}
            {invoice.billToGstin ? <Text style={s.muted}>GSTIN: {invoice.billToGstin}</Text> : null}
            {invoice.billToEmail ? <Text style={s.muted}>{invoice.billToEmail}</Text> : null}
            {invoice.billToPhone ? <Text style={s.muted}>{invoice.billToPhone}</Text> : null}
          </View>
          <View style={{ width: "40%" }}>
            <View style={s.between}>
              <Text style={s.muted}>Invoice date</Text>
              <Text>{invoice.invoiceDate}</Text>
            </View>
            {invoice.dueDate ? (
              <View style={s.between}>
                <Text style={s.muted}>Due date</Text>
                <Text>{invoice.dueDate}</Text>
              </View>
            ) : null}
            <View style={s.between}>
              <Text style={s.muted}>Terms</Text>
              <Text>{termLabel(invoice.paymentTerms)}</Text>
            </View>
            {invoice.poNumber ? (
              <View style={s.between}>
                <Text style={s.muted}>PO number</Text>
                <Text>{invoice.poNumber}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={s.cDesc}>Description</Text>
          <Text style={s.cHsn}>HSN/SAC</Text>
          <Text style={s.cQty}>Qty</Text>
          <Text style={s.cRate}>Rate</Text>
          <Text style={s.cAmt}>Amount</Text>
        </View>
        {invoice.items.map((it, i) => (
          <View style={s.tr} key={i}>
            <Text style={s.cDesc}>{it.description}</Text>
            <Text style={s.cHsn}>{it.hsnSac || "-"}</Text>
            <Text style={s.cQty}>{it.qty}</Text>
            <Text style={s.cRate}>{money(it.rate)}</Text>
            <Text style={s.cAmt}>{money(it.amount)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{money(invoice.subtotal)}</Text>
          </View>
          {invoice.discount > 0 ? (
            <View style={s.totRow}>
              <Text style={s.muted}>Discount</Text>
              <Text>- {money(invoice.discount)}</Text>
            </View>
          ) : null}
          {invoice.taxType !== "none" ? (
            <View style={s.totRow}>
              <Text style={s.muted}>
                {invoice.taxType === "cgst_sgst" ? "CGST + SGST" : "IGST"} @ {invoice.taxRate}%
              </Text>
              <Text>{money(invoice.taxAmount)}</Text>
            </View>
          ) : null}
          <View style={s.grand}>
            <Text style={s.strong}>Total</Text>
            <Text style={s.strong}>{money(invoice.total)}</Text>
          </View>
        </View>

        {bank.bankName || bank.accountNumber ? (
          <View style={s.footerBox}>
            <Text style={s.label}>Payment details</Text>
            {bank.accountHolder ? <Text>{bank.accountHolder}</Text> : null}
            <Text style={s.muted}>
              {[bank.bankName, bank.accountNumber ? `A/C ${bank.accountNumber}` : "", bank.ifsc ? `IFSC ${bank.ifsc}` : ""]
                .filter(Boolean)
                .join("  •  ")}
            </Text>
          </View>
        ) : null}

        {invoice.notes ? (
          <View style={s.section}>
            <Text style={s.label}>Notes</Text>
            <Text style={s.muted}>{invoice.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
