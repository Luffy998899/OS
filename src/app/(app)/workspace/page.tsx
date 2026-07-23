import type { Metadata } from "next";
import { WorkspaceGame } from "@/components/workspace/workspace-game";

export const metadata: Metadata = { title: "Gamified Workspace" };

export default function WorkspacePage() {
  return <WorkspaceGame />;
}
