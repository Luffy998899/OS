import type { Metadata } from "next";
import { FloorSharePage } from "@/components/workspace/floor-share";

export const metadata: Metadata = { title: "Project floor" };

// The link a client gets to their floor of the pipeline tower. No login — the
// token is the key. They see progress and drop task requests to the on-floor
// agent; nothing internal (data board, credentials) is exposed here.
export default async function SharedFloorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FloorSharePage token={token} />;
}
