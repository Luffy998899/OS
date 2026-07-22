"use client";

import { ChevronDown, LogOut, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/actions";
import { initials, formatNumber } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth/types";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-8">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div className="hidden text-left leading-tight sm:block">
          <p className="max-w-[9rem] truncate text-sm font-medium">
            {user.name}
          </p>
          <p className="max-w-[9rem] truncate text-xs text-muted-foreground">
            {user.roleName}
          </p>
        </div>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 p-2">
          <Avatar className="size-9">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt="" />
            ) : null}
            <AvatarFallback>{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between px-2 pb-2">
          <Badge variant="secondary">{user.roleName}</Badge>
          <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
            <Trophy className="size-3.5" />
            {formatNumber(user.points)} pts
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void signOutAction();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
