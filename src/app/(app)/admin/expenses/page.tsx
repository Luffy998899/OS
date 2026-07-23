import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { ExpensesView } from "@/components/admin/expenses-view";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage() {
  await requirePermission(PERMISSIONS.BILLING_MANAGE);
  return <ExpensesView />;
}
