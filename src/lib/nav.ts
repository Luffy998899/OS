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
  ReceiptText,
  BookText,
  MessageSquare,
  Wallet,
  Package,
  NotebookPen,
  ScrollText,
  Contact,
  Flame,
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
      { title: "Gamified Workspace", href: "/workspace", icon: Gamepad2 },
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "My Work", href: "/my-work", icon: ListChecks },
      { title: "Chat", href: "/chat", icon: MessageSquare },
      { title: "Bounty Board", href: "/bounties", icon: ScrollText },
      { title: "Daily check-in", href: "/journal", icon: NotebookPen },
      { title: "Timesheet", href: "/timesheet", icon: Clock },
      { title: "Documents", href: "/documents", icon: FileText },
      { title: "Clients", href: "/clients", icon: Users2 },
      { title: "Outreach CRM", href: "/outreach", icon: Contact },
      { title: "Hot Leads", href: "/hot-leads", icon: Flame },
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
        title: "Invoices",
        href: "/admin/invoices",
        icon: ReceiptText,
        permission: PERMISSIONS.BILLING_MANAGE,
      },
      {
        title: "Ledger",
        href: "/admin/ledger",
        icon: BookText,
        permission: PERMISSIONS.BILLING_MANAGE,
      },
      {
        title: "Expenses",
        href: "/admin/expenses",
        icon: Wallet,
        permission: PERMISSIONS.BILLING_MANAGE,
      },
      {
        title: "Services",
        href: "/admin/services",
        icon: Package,
        permission: PERMISSIONS.BILLING_MANAGE,
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
