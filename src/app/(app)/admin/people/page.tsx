import type { Metadata } from "next";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { PeopleAdmin } from "@/components/admin/people-admin";

export const metadata: Metadata = { title: "People & Role" };

export default async function PeoplePage() {
  await requirePermission(PERMISSIONS.PEOPLE_MANAGE);
  return <PeopleAdmin />;
}
