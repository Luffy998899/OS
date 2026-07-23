import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { InvoiceBuilder } from "@/components/admin/invoice-builder";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage() {
  await requirePermission(PERMISSIONS.BILLING_MANAGE);
  return <InvoiceBuilder />;
}
