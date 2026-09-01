/* ─── Mission Control Role Definitions ─── */

import type { ModuleKey } from "./settings-users";

export type PermissionLevel = "hidden" | "view" | "edit";

export interface MCRole {
  id: string;
  name: string;
  description: string;
  permissions: Record<ModuleKey, PermissionLevel>;
}

export const PERMISSION_LEVEL_COLORS: Record<PermissionLevel, { bg: string; text: string }> = {
  hidden: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.25)" },
  view: { bg: "rgba(96,165,250,0.12)", text: "rgb(96,165,250)" },
  edit: { bg: "rgba(52,211,153,0.12)", text: "rgb(52,211,153)" },
};

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  hidden: "Hidden",
  view: "View",
  edit: "Edit",
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "rgba(52,211,153,0.12)", text: "rgb(52,211,153)" },
  invited: { bg: "rgba(251,191,36,0.12)", text: "rgb(251,191,36)" },
  disabled: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.35)" },
};
