import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./session";
import { hasPermission, type PermissionKey } from "./permissions";

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requirePermission(
  key: PermissionKey,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, key)) redirect("/dashboard");
  return user;
}
