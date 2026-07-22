import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/app/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const firstName = user?.name.split(" ")[0] ?? "there";

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${firstName}`}
        description="Your floor at a glance — missions, attendance, and what needs you today."
      />
      <p className="text-sm text-muted-foreground">
        Dashboard widgets arrive in the next phase.
      </p>
    </>
  );
}
