import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NavContent } from "./nav-content";
import { UserBadge } from "./user-badge";
import type { CurrentUser } from "@/lib/auth/types";

export function Sidebar({ user }: { user: CurrentUser }) {
  return (
    <div className="flex h-full w-[260px] flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/workspace" aria-label="Auxa home">
          <Wordmark />
        </Link>
      </div>
      {/* min-h-0: without it the flex child refuses to shrink below its content,
          so the nav grew past the viewport and the lower items were unreachable. */}
      <ScrollArea className="min-h-0 flex-1 overflow-hidden px-3">
        <div className="py-2">
          <NavContent permissions={user.permissions} />
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-border p-3">
        <UserBadge user={user} />
      </div>
    </div>
  );
}
