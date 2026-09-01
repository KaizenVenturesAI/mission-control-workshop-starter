/* ─── Mission Control User Management ─── */

export type UserStatus = "active" | "invited" | "disabled";

export interface MCUser {
  id: string;
  email: string;
  name: string;
  role_id: string;
  status: UserStatus;
  invited_by: string;
  invited_at: string;
  last_login: string | null;
  created_at: string;
  auth_user_id?: string;
  auth_email_confirmed_at?: string | null;
  auth_last_sign_in_at?: string | null;
  auth_created_at?: string | null;
  auth_updated_at?: string | null;
  auth_providers?: string[];
  auth_is_sso_user?: boolean;
  auth_banned_until?: string | null;
}

export const MODULE_KEYS = [
  "dashboard",
  "crm",
  "revenue",
  "hr",
  "strategy",
  "brain",
  "devlog",
  "calendar",
  "usage",
  "permissions",
  "rulebook",
  "settings",
  "action_board",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  crm: "CRM",
  revenue: "Revenue",
  hr: "HR",
  strategy: "Strategy",
  brain: "Knowledge Brain",
  devlog: "Activity",
  calendar: "Calendar",
  usage: "Usage & Spend",
  permissions: "Permissions",
  rulebook: "Rulebook",
  settings: "Settings",
  action_board: "Action Board",
};

export const MODULE_ICONS: Record<ModuleKey, string> = {
  dashboard: "◈",
  crm: "☷",
  revenue: "$",
  hr: "👥",
  strategy: "◆",
  brain: "◇",
  devlog: "◉",
  calendar: "▦",
  usage: "◎",
  permissions: "⛨",
  rulebook: "⊟",
  settings: "⚙",
  action_board: "☰",
};
