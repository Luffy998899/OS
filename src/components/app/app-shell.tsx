"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { CurrentUserProvider } from "./user-context";
import type { CurrentUser } from "@/lib/auth/types";

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <CurrentUserProvider user={user}>
      <div className="flex h-dvh overflow-hidden bg-muted/30">
        <aside className="hidden shrink-0 lg:block">
          <Sidebar user={user} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} onMenu={() => setMobileOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
        <MobileNav
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          user={user}
        />
      </div>
    </CurrentUserProvider>
  );
}
