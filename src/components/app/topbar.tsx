"use client";

import { Menu, Search } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { NotificationsBell } from "./notifications-bell";
import { CheckInControl } from "@/components/attendance/check-in-control";
import type { CurrentUser } from "@/lib/auth/types";

export function Topbar({
  user,
  onMenu,
}: {
  user: CurrentUser;
  onMenu: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-background px-4 sm:gap-3 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </Button>

      <div className="lg:hidden">
        <Wordmark textClassName="hidden sm:inline" />
      </div>

      <div className="relative hidden w-full max-w-sm md:block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search people, clients, missions…"
          aria-label="Search"
          className="h-9 w-full rounded-md border border-border bg-muted/40 pr-3 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <CheckInControl />
        <ThemeToggle />
        <NotificationsBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
