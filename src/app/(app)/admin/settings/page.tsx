import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { SettingsView } from "@/components/admin/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
  return <SettingsView />;
}
