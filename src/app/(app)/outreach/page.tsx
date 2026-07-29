import type { Metadata } from "next";
import { OutreachCrmView } from "@/components/outreach/outreach-crm-view";

export const metadata: Metadata = { title: "Outreach CRM" };

export default function OutreachCrmPage() {
  return <OutreachCrmView />;
}
