import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { TimesheetView } from "@/components/timesheet/timesheet-view";

export const metadata: Metadata = { title: "Timesheet" };

export default async function TimesheetPage() {
  const user = await getCurrentUser();
  const canSeeAll = hasPermission(
    user?.permissions ?? [],
    PERMISSIONS.REPORTS_VIEW,
  );
  return <TimesheetView canSeeAll={canSeeAll} />;
}
