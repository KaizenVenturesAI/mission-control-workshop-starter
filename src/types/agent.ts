export type AgentStatus = "healthy" | "degraded" | "blocked" | "parked";
export type AgentHealth = "live" | "warning" | "stale" | "offline";
export type AgentAuthState = "connected" | "expiring" | "missing" | "mock" | "unknown";
export type ActivitySeverity = "info" | "warning" | "critical";

export interface AgentChannel {
  type: "slack" | "email" | "api" | "webhook" | "calendar" | "github";
  name: string;
}

export interface AgentActivityItem {
  id: string;
  label: string;
  time: string;
  severity: ActivitySeverity;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  health: AgentHealth;
  authState: AgentAuthState;
  model: string;
  provider: string;
  meta: string;
  purpose: string;
  owner: string;
  statusReason: string;
  channels: AgentChannel[];
  capabilities: string[];
  lastAction: string;
  lastActionTime: string;
  notes: string;
  parentId: string | null;
  lastSeen: string;
  activityCount24h: number;
  blockers?: string[];
  fallbacks?: string[];
  activities: AgentActivityItem[];
}
