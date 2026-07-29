import type { Metadata } from "next";
import { HotLeadsView } from "@/components/outreach/hot-leads-view";

export const metadata: Metadata = { title: "Hot Leads" };

export default function HotLeadsPage() {
  return <HotLeadsView />;
}
