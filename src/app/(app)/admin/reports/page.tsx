import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { ReportsView } from "@/components/admin/reports-view";

export const metadata: Metadata = { title: "Reports & Workload" };

export default async function ReportsPage() {
  await requirePermission(PERMISSIONS.REPORTS_VIEW);
  return <ReportsView />;
}
