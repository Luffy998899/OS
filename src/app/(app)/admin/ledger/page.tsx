import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { LedgerView } from "@/components/admin/ledger-view";

export const metadata: Metadata = { title: "Ledger" };

export default async function LedgerPage() {
  await requirePermission(PERMISSIONS.BILLING_MANAGE);
  return <LedgerView />;
}
