import { z } from "zod";
import type { ModuleKey } from "@/data/settings-users";

export const moduleConfigSchema = z.object({
  key: z.string(),
  label: z.string().min(2),
  href: z.string().startsWith("/"),
  icon: z.string().min(1),
  core: z.boolean(),
  enabled: z.boolean(),
  configured: z.boolean(),
  nav: z.boolean(),
  description: z.string(),
});

export type ModuleConfig = z.infer<typeof moduleConfigSchema> & { key: ModuleKey | "search" };

export const modules = [
  { key: "search", label: "Search", href: "/search", icon: "⌕", core: true, enabled: true, configured: true, nav: true, description: "Global search across starter records." },
  { key: "dashboard", label: "Dashboard", href: "/", icon: "◈", core: true, enabled: true, configured: true, nav: true, description: "Executive overview and operating queue." },
  { key: "crm", label: "CRM", href: "/contacts", icon: "☷", core: true, enabled: true, configured: true, nav: true, description: "Accounts, contacts, opportunities, activities, and hygiene." },
  { key: "action_board", label: "Action Board", href: "/action-board", icon: "☰", core: true, enabled: true, configured: true, nav: true, description: "Task and follow-up execution board." },
  { key: "settings", label: "Settings", href: "/settings", icon: "⚙", core: true, enabled: true, configured: true, nav: false, description: "Users, roles, and local configuration." },
  { key: "strategy", label: "Strategy", href: "/strategy", icon: "◆", core: false, enabled: true, configured: false, nav: true, description: "Optional planning and strategy workspace." },
  { key: "brain", label: "Knowledge Brain", href: "/brain", icon: "◇", core: false, enabled: true, configured: false, nav: true, description: "Optional memory review and source processing." },
  { key: "hr", label: "People", href: "/people", icon: "▥", core: false, enabled: true, configured: false, nav: true, description: "Optional people, org, payroll, and compensation surfaces." },
  { key: "revenue", label: "Revenue", href: "/revenue", icon: "$", core: false, enabled: true, configured: false, nav: true, description: "Optional inbound and revenue dashboards." },
  { key: "usage", label: "Expenses", href: "/usage", icon: "▧", core: false, enabled: true, configured: false, nav: true, description: "Optional usage and spend dashboard." },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: "▦", core: false, enabled: true, configured: false, nav: true, description: "Optional cadence and calendar view." },
  { key: "devlog", label: "Activity", href: "/activity", icon: "◉", core: false, enabled: true, configured: false, nav: true, description: "Optional activity and development ledger." },
  { key: "permissions", label: "Permissions", href: "/permissions", icon: "⛨", core: false, enabled: true, configured: false, nav: true, description: "Optional agent permission registry." },
  { key: "rulebook", label: "Rulebook", href: "/rulebook", icon: "⊟", core: false, enabled: true, configured: false, nav: true, description: "Optional operating rules and escalation catalog." },
] as const satisfies readonly ModuleConfig[];

export const moduleConfig = z.array(moduleConfigSchema).parse(modules) as ModuleConfig[];

export function getModuleConfig(key: ModuleConfig["key"]): ModuleConfig | undefined {
  return moduleConfig.find((module) => module.key === key);
}

export function getNavigationModules(): ModuleConfig[] {
  return moduleConfig.filter((module) => module.enabled && module.nav);
}
