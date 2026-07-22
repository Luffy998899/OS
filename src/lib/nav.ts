import {
  LayoutDashboard,
  ListChecks,
  Clock,
  FileText,
  Users2,
  Trophy,
  Gamepad2,
  Sparkles,
  BarChart3,
  UserCog,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

export const NAV: NavSection[] = [
  {
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "My Work", href: "/my-work", icon: ListChecks },
      { title: "Gamified Workspace", href: "/workspace", icon: Gamepad2 },
      { title: "Timesheet", href: "/timesheet", icon: Clock },
      { title: "Documents", href: "/documents", icon: FileText },
      { title: "Clients", href: "/clients", icon: Users2 },
      { title: "Leaderboard", href: "/leaderboard", icon: Trophy },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        title: "Assign & Plan",
        href: "/admin/assign",
        icon: Sparkles,
        permission: PERMISSIONS.TASKS_ASSIGN,
      },
      {
        title: "Reports & Workload",
        href: "/admin/reports",
        icon: BarChart3,
        permission: PERMISSIONS.REPORTS_VIEW,
      },
      {
        title: "People & Role",
        href: "/admin/people",
        icon: UserCog,
        permission: PERMISSIONS.PEOPLE_MANAGE,
      },
      {
        title: "Settings",
        href: "/admin/settings",
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_MANAGE,
      },
    ],
  },
];
