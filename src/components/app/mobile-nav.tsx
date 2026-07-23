"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Wordmark } from "@/components/brand/logo";
import { NavContent } from "./nav-content";
import { UserBadge } from "./user-badge";
import type { CurrentUser } from "@/lib/auth/types";

export function MobileNav({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: CurrentUser;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] gap-0 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-16 shrink-0 items-center px-5">
          <Wordmark />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavContent
            permissions={user.permissions}
            onNavigate={() => onOpenChange(false)}
          />
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <UserBadge user={user} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
