export type BoardAuditStatus = "started" | "completed" | "qa_failed" | "failed" | "unknown";
export type BoardQaStatus = "pass" | "warn" | "fail" | "pending" | "unknown";

export interface BoardAuditIssue {
  severity: "high" | "medium" | "low" | "unknown";
  issue: string;
  detail?: string;
}

export interface BoardAuditSourcePlanItem {
  platform: string;
  name: string;
  id?: string;
  lastScannedAt: string | null;
  suggestedInitialLimit?: number;
  deepReadLimit?: number;
}

export interface BoardAuditCoverage {
  slack: {
    scanned: string[];
    deepRead: string[];
    unavailable: string[];
    messageCount: number;
  };
  discord: {
    scanned: string[];
    deepRead: string[];
    unavailable: string[];
    messageCount: number;
  };
  email: {
    available: boolean | null;
    scanned: string[];
    unavailable: string[];
    notes: string;
  };
  calls: {
    available: boolean | null;
    scanned: string[];
    unavailable: string[];
    notes: string;
  };
  durable: {
    contextPackChars: number | null;
    files: string[];
  };
}

export interface BoardAuditRun {
  runId: string;
  date: string;
  startedAt: string;
  finishedAt: string | null;
  status: BoardAuditStatus;
  qaStatus: BoardQaStatus;
  budgets: Record<string, number>;
  sourcePlan: BoardAuditSourcePlanItem[];
  coverage: BoardAuditCoverage | null;
  issueCounts: { high: number; medium: number; low: number };
  issues: BoardAuditIssue[];
  memoPath: string | null;
  runPath: string | null;
  artifactPath: string | null;
  qaPath: string | null;
}

export interface BoardAuditSnapshot {
  runs: BoardAuditRun[];
  latest: BoardAuditRun | null;
  watchdog: {
    date: string;
    status: "ok" | "warn" | "fail" | "unknown";
    needsRecovery: boolean;
    checkedAtLocal: string | null;
    issues: string[];
    warnings: string[];
    path: string;
  } | null;
  sourceStateUpdatedAt: string | null;
  optimizationReport: {
    date: string;
    path: string;
    markdown: string;
  } | null;
}
