import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { ClientsView } from "@/components/clients/clients-view";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await getCurrentUser();
  const canManage = hasPermission(
    user?.permissions ?? [],
    PERMISSIONS.CLIENTS_MANAGE,
  );
  return <ClientsView canManage={canManage} />;
}
