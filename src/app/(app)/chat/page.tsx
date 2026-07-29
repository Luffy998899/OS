import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return (
    <>
      <PageHeader
        eyebrow="Team chat"
        title="Chat"
        description="Spaces for the agency and the client side, split into channels. The same window opens inside the virtual office."
      />

      <ChatPanel className="h-[calc(100dvh-15rem)] min-h-[480px]" />
    </>
  );
}
