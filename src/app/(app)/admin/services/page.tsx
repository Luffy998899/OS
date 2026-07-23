import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { ServicesView } from "@/components/admin/services-view";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  await requirePermission(PERMISSIONS.BILLING_MANAGE);
  return <ServicesView />;
}
