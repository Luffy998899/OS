import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePermission(PERMISSIONS.ADMIN);
  return <>{children}</>;
}
