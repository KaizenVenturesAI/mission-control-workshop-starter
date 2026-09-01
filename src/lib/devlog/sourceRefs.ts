export type DevLogSourceSystem = "git" | "github" | "linear" | "manual";

export interface DevLogSourceRef {
  system: DevLogSourceSystem;
  id: string;
  label: string;
  url?: string;
  type: "commit" | "pull_request" | "issue" | "manual";
}

export interface DevLogLedgerEntry {
  id: string;
  title: string;
  summary: string;
  occurredAt: string;
  status: "completed" | "in-progress" | "planned" | "blocked" | "review";
  sources: DevLogSourceRef[];
  owners: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  payload?: Record<string, unknown>;
}

export interface DevLogSyncRun {
  id: string;
  sourceSystem: DevLogSourceSystem;
  sourceRepo: string;
  sourceBranch: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  created: number;
  updated: number;
  unchanged: number;
  total: number;
  latestSourceId?: string;
  latestOccurredAt?: string;
  error?: string;
}

export interface DevLogSyncStore {
  version: 1;
  updatedAt: string;
  entries: DevLogLedgerEntry[];
  syncRuns?: DevLogSyncRun[];
}

export interface DevLogReadModel {
  updatedAt: string;
  backend: "supabase" | "local-json";
  entries: DevLogLedgerEntry[];
  latestRun?: DevLogSyncRun | null;
}

export interface DevLogSyncStatus {
  backend: "supabase" | "local-json";
  configured: boolean;
  missing: string[];
  repo: string;
  branch: string;
  count: number;
  latestEntry?: DevLogLedgerEntry | null;
  latestRun?: DevLogSyncRun | null;
}
