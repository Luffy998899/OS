import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { AssignPlanView } from "@/components/admin/assign-plan-view";

export const metadata: Metadata = { title: "Assign & Plan" };

export default async function AssignPage() {
  await requirePermission(PERMISSIONS.TASKS_ASSIGN);
  return <AssignPlanView />;
}
