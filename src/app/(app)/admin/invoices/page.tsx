import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { InvoicesView } from "@/components/admin/invoices-view";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  await requirePermission(PERMISSIONS.BILLING_MANAGE);
  return <InvoicesView />;
}
