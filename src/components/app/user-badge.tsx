import { Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, formatNumber } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth/types";

export function UserBadge({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <Avatar className="size-9">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.roleName}</p>
      </div>
      <div className="flex items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-xs font-medium tabular-nums">
        <Trophy className="size-3 text-muted-foreground" />
        {formatNumber(user.points)}
      </div>
    </div>
  );
}
