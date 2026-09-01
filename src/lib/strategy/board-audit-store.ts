import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import type {
  BoardAuditCoverage,
  BoardAuditIssue,
  BoardAuditRun,
  BoardAuditSnapshot,
  BoardAuditSourcePlanItem,
  BoardAuditStatus,
  BoardQaStatus,
} from "@/data/board-audit";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const RUNS_DIR = path.join(DATA_DIR, "board-runs");
const REPORTS_DIR = path.join(DATA_DIR, "board-optimization-reports");
const WATCHDOG_DIR = path.join(DATA_DIR, "board-watchdog");
const SOURCE_STATE_PATH = path.join(DATA_DIR, "board-source-state.json");

try { mkdirSync(RUNS_DIR, { recursive: true }); } catch { /* already exists */ }

type RawObject = Record<string, unknown>;

function asObject(value: unknown): RawObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawObject : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map((item) => typeof item === "string" ? item : asString(asObject(item).name))
      .filter(Boolean)
    : [];
}

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readText(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function relativeDataPath(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  const absolute = path.isAbsolute(raw) ? raw : path.join(DATA_DIR, raw.replace(/^\.data\//, ""));
  const resolved = path.resolve(absolute);
  const dataRoot = `${DATA_DIR}${path.sep}`;
  if (resolved !== DATA_DIR && !resolved.startsWith(dataRoot)) return null;
  return path.relative(process.cwd(), resolved);
}

function resolveDataPath(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;
  const absolute = path.isAbsolute(raw) ? raw : path.join(DATA_DIR, raw.replace(/^\.data\//, ""));
  const resolved = path.resolve(absolute);
  const dataRoot = `${DATA_DIR}${path.sep}`;
  if (resolved !== DATA_DIR && !resolved.startsWith(dataRoot)) return null;
  return resolved;
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith("test-") && !entry.name.startsWith("discarded-")) {
      files.push(...listJsonFiles(fullPath));
    }
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(fullPath);
  }
  return files;
}

function normalizeStatus(value: unknown): BoardAuditStatus {
  const status = asString(value, "unknown");
  if (["started", "completed", "qa_failed", "failed"].includes(status)) return status as BoardAuditStatus;
  return "unknown";
}

function normalizeQaStatus(value: unknown): BoardQaStatus {
  const status = asString(value, "unknown");
  if (["pass", "warn", "fail", "pending"].includes(status)) return status as BoardQaStatus;
  return "unknown";
}

function normalizeIssue(value: unknown): BoardAuditIssue {
  const raw = asObject(value);
  const severity = asString(raw.severity, "unknown");
  return {
    severity: severity === "high" || severity === "medium" || severity === "low" ? severity : "unknown",
    issue: asString(raw.issue, "unknown_issue"),
    detail: asNullableString(raw.detail) ?? undefined,
  };
}

function normalizeSourcePlanItem(value: unknown): BoardAuditSourcePlanItem {
  const raw = asObject(value);
  return {
    platform: asString(raw.platform, "unknown"),
    name: asString(raw.name, "unknown"),
    id: asNullableString(raw.id) ?? undefined,
    lastScannedAt: asNullableString(raw.lastScannedAt),
    suggestedInitialLimit: asNumber(raw.suggestedInitialLimit, 0) || undefined,
    deepReadLimit: asNumber(raw.deepReadLimit, 0) || undefined,
  };
}

function normalizeCoverage(value: unknown): BoardAuditCoverage | null {
  const raw = asObject(value);
  if (Object.keys(raw).length === 0) return null;
  const slack = asObject(raw.slack);
  const discord = asObject(raw.discord);
  const email = asObject(raw.email);
  const calls = asObject(raw.calls);
  const durable = asObject(raw.durable);

  return {
    slack: {
      scanned: asStringArray(slack.scanned),
      deepRead: asStringArray(slack.deepRead),
      unavailable: asStringArray(slack.unavailable),
      messageCount: asNumber(slack.messageCount),
    },
    discord: {
      scanned: asStringArray(discord.scanned),
      deepRead: asStringArray(discord.deepRead),
      unavailable: asStringArray(discord.unavailable),
      messageCount: asNumber(discord.messageCount),
    },
    email: {
      available: asBooleanOrNull(email.available),
      scanned: asStringArray(email.scanned),
      unavailable: asStringArray(email.unavailable),
      notes: asString(email.notes),
    },
    calls: {
      available: asBooleanOrNull(calls.available),
      scanned: asStringArray(calls.scanned),
      unavailable: asStringArray(calls.unavailable),
      notes: asString(calls.notes),
    },
    durable: {
      contextPackChars: asNullableNumber(durable.contextPackChars),
      files: asStringArray(durable.files),
    },
  };
}

function readLinkedJson(runPath: string, linkedPath: unknown): unknown {
  const resolved = resolveDataPath(linkedPath);
  if (resolved && existsSync(/*turbopackIgnore: true*/ resolved)) return readJson(resolved);

  const linkedBase = path.basename(asString(linkedPath));
  if (!linkedBase) return null;
  const fallback = path.join(path.dirname(runPath), linkedBase);
  return existsSync(/*turbopackIgnore: true*/ fallback) ? readJson(fallback) : null;
}

function normalizeRun(filePath: string, rawValue: unknown): BoardAuditRun | null {
  const raw = asObject(rawValue);
  if (raw.schema !== "client.morning_board.run.v1") return null;

  const artifact = asObject(readLinkedJson(filePath, raw.artifactPath));
  const qa = asObject(readLinkedJson(filePath, raw.qaPath));
  const issueCounts = asObject(qa.issueCounts);
  const qaStatus = normalizeQaStatus(raw.qaStatus ?? qa.status ?? artifact.qa);
  const runPath = relativeDataPath(raw.runPath) ?? path.relative(process.cwd(), filePath);

  return {
    runId: asString(raw.runId, path.basename(filePath, ".json")),
    date: asString(raw.date),
    startedAt: asString(raw.startedAt),
    finishedAt: asNullableString(raw.finishedAt),
    status: normalizeStatus(raw.status),
    qaStatus,
    budgets: Object.fromEntries(
      Object.entries(asObject(raw.budgets)).filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    ) as Record<string, number>,
    sourcePlan: Array.isArray(raw.sourcePlan) ? raw.sourcePlan.map(normalizeSourcePlanItem) : [],
    coverage: normalizeCoverage(artifact.sourceCoverage),
    issueCounts: {
      high: asNumber(issueCounts.high),
      medium: asNumber(issueCounts.medium),
      low: asNumber(issueCounts.low),
    },
    issues: Array.isArray(qa.issues) ? qa.issues.map(normalizeIssue) : [],
    memoPath: relativeDataPath(raw.memoPath),
    runPath,
    artifactPath: relativeDataPath(raw.artifactPath),
    qaPath: relativeDataPath(raw.qaPath),
  };
}

function sortRunTime(run: BoardAuditRun): number {
  const finished = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
  if (Number.isFinite(finished)) return finished;
  const started = Date.parse(run.startedAt);
  return Number.isFinite(started) ? started : 0;
}

function latestOptimizationReport(): BoardAuditSnapshot["optimizationReport"] {
  if (!existsSync(REPORTS_DIR)) return null;
  const reports = readdirSync(REPORTS_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .map((name) => {
      const filePath = path.join(REPORTS_DIR, name);
      return { name, filePath, mtime: statSync(filePath).mtimeMs };
    })
    .sort((a, b) => b.name.localeCompare(a.name) || b.mtime - a.mtime);

  const latest = reports[0];
  if (!latest) return null;
  return {
    date: latest.name.replace(/\.md$/, ""),
    path: path.relative(process.cwd(), latest.filePath),
    markdown: readText(latest.filePath),
  };
}

function latestWatchdog(): BoardAuditSnapshot["watchdog"] {
  if (!existsSync(WATCHDOG_DIR)) return null;
  const reports = readdirSync(WATCHDOG_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(WATCHDOG_DIR, name);
      return { name, filePath, mtime: statSync(filePath).mtimeMs, data: asObject(readJson(filePath)) };
    })
    .sort((a, b) => b.name.localeCompare(a.name) || b.mtime - a.mtime);
  const latest = reports[0];
  if (!latest) return null;
  const status = asString(latest.data.status, "unknown");
  return {
    date: asString(latest.data.date, latest.name.replace(/\.json$/, "")),
    status: status === "ok" || status === "warn" || status === "fail" ? status : "unknown",
    needsRecovery: Boolean(latest.data.needsRecovery),
    checkedAtLocal: asNullableString(latest.data.checkedAtLocal),
    issues: asStringArray(latest.data.issues),
    warnings: asStringArray(latest.data.warnings),
    path: path.relative(process.cwd(), latest.filePath),
  };
}

export function getBoardAuditSnapshot(): BoardAuditSnapshot {
  const runs = listJsonFiles(RUNS_DIR)
    .map((filePath) => normalizeRun(filePath, readJson(filePath)))
    .filter((run): run is BoardAuditRun => Boolean(run))
    .sort((a, b) => sortRunTime(b) - sortRunTime(a));

  const sourceState = asObject(readJson(SOURCE_STATE_PATH));

  return {
    runs,
    latest: runs[0] ?? null,
    watchdog: latestWatchdog(),
    sourceStateUpdatedAt: asNullableString(sourceState.updatedAt),
    optimizationReport: latestOptimizationReport(),
  };
}
