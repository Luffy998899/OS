"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV } from "@/lib/nav";
import { hasPermission, type PermissionKey } from "@/lib/auth/permissions";

export function NavContent({
  permissions,
  onNavigate,
}: {
  permissions: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((section, i) => {
        const items = section.items.filter(
          (it) =>
            !it.permission ||
            hasPermission(permissions, it.permission as PermissionKey),
        );
        if (items.length === 0) return null;

        return (
          <div key={section.label ?? i} className="space-y-0.5">
            {section.label ? (
              <p className="px-3 pb-1.5 font-mono text-[0.65rem] font-medium tracking-widest text-muted-foreground uppercase">
                {section.label}
              </p>
            ) : null}
            {items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
