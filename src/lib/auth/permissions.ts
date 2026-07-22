// Role-based access control. Permissions are string keys stored as a JSON array on
// each Role. The "*" wildcard grants everything (used by the admin/owner role).

export const PERMISSIONS = {
  ADMIN: "workspace:admin", // access the Admin panel at all
  PEOPLE_MANAGE: "people:manage", // add/remove/edit users & roles
  CLIENTS_MANAGE: "clients:manage",
  TASKS_ASSIGN: "tasks:assign", // create & assign work to others
  TASKS_REVIEW: "tasks:review", // approve AI / WhatsApp task drafts
  REPORTS_VIEW: "reports:view", // reports & workload
  SETTINGS_MANAGE: "settings:manage", // integrations (WhatsApp, email, AI)
  REWARDS_MANAGE: "rewards:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  [PERMISSIONS.ADMIN]: "Access the Admin panel",
  [PERMISSIONS.PEOPLE_MANAGE]: "Manage people & roles",
  [PERMISSIONS.CLIENTS_MANAGE]: "Manage clients",
  [PERMISSIONS.TASKS_ASSIGN]: "Assign & plan work",
  [PERMISSIONS.TASKS_REVIEW]: "Review AI / WhatsApp drafts",
  [PERMISSIONS.REPORTS_VIEW]: "View reports & workload",
  [PERMISSIONS.SETTINGS_MANAGE]: "Manage settings & integrations",
  [PERMISSIONS.REWARDS_MANAGE]: "Manage rewards",
};

// Default permission sets for the three system roles.
export const ROLE_DEFAULTS: Record<string, string[]> = {
  Admin: ["*"],
  Manager: [
    PERMISSIONS.ADMIN,
    PERMISSIONS.TASKS_ASSIGN,
    PERMISSIONS.TASKS_REVIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.CLIENTS_MANAGE,
  ],
  Employee: [],
};

export function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function hasPermission(
  permissions: string[] | string | null | undefined,
  key: PermissionKey,
): boolean {
  const list = Array.isArray(permissions)
    ? permissions
    : parsePermissions(permissions);
  return list.includes("*") || list.includes(key);
}
