import type { Metadata } from "next";
import { BountiesView } from "@/components/workspace/bounties-view";

export const metadata: Metadata = { title: "Bounty Board" };

export default function BountiesPage() {
  return <BountiesView />;
}
