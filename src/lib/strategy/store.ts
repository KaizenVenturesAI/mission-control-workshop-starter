// ── Strategy Runs Persistence Layer ──
// JSON file-backed store at .data/strategy-runs.json
// Normalizes legacy board-meeting records so the UI always gets sortable,
// expandable StrategyRun objects, even when cron posts older memoRef/memoPath shapes.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { STRATEGY_RUNS, type StrategyRun, type StrategyTheme } from "@/data/strategy-runs";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "strategy-runs.json");
const MEMOS_DIR = path.join(DATA_DIR, "memos");

try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }

interface StrategyStore {
  runs: unknown[];
}

type RawRun = Record<string, unknown>;

const DEFAULT_THEME = "Operations, People, and Process" as StrategyTheme;
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

function readStore(): StrategyStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as StrategyStore;
    if (Array.isArray(parsed.runs)) {
      return parsed;
    }
  } catch {
    // File missing or corrupt — fall through to seed
  }
  const seed: StrategyStore = { runs: STRATEGY_RUNS };
  writeStore(seed);
  return seed;
}

function writeStore(store: StrategyStore): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function extractDate(raw: RawRun): string {
  const candidates = [raw.date, raw.timestamp, raw.startTime, raw.endTime, raw.memoRef, raw.memoPath, raw.memo, raw.id];
  for (const candidate of candidates) {
    const match = asString(candidate).match(ISO_DATE_RE);
    if (match) return match[1];
  }
  return "";
}

function timestampForDate(date: string): string {
  return date ? `${date}T11:00:00.000Z` : "1970-01-01T00:00:00.000Z";
}

function resolveMemoPath(raw: RawRun, date: string): string | null {
  const explicit = [raw.memoPath, raw.memoRef, raw.memo]
    .map((v) => asString(v).trim())
    .find((v) => v.endsWith(".md"));

  const candidates: string[] = [];
  if (explicit) {
    candidates.push(explicit);
    candidates.push(explicit.replace(/^\.data\//, ""));
    candidates.push(path.basename(explicit));
  }
  if (date) candidates.push(`${date}-morning-board.md`);

  for (const candidate of candidates) {
    const clean = candidate.replace(/^\.data\//, "").replace(/^\/+/, "");
    const absolute = path.isAbsolute(candidate)
      ? candidate
      : clean.startsWith("memos/")
        ? path.join(DATA_DIR, clean)
        : path.join(MEMOS_DIR, path.basename(clean));
    if (existsSync(absolute)) return absolute;
  }
  return null;
}

function readMemo(raw: RawRun, date: string): string {
  const inline = asString(raw.memo);
  const inlineLooksLikePath = inline.trim().endsWith(".md") && !inline.includes("\n");
  if (inline && !inlineLooksLikePath) return inline;

  const memoPath = resolveMemoPath(raw, date);
  if (!memoPath) return "";

  try {
    return readFileSync(/*turbopackIgnore: true*/ memoPath, "utf-8");
  } catch {
    return "";
  }
}

function normalizeRun(input: unknown): StrategyRun {
  const raw = (input && typeof input === "object" ? input : {}) as RawRun;
  const date = extractDate(raw);
  const startTime = asString(raw.startTime) || asString(raw.timestamp) || timestampForDate(date);
  const endTime = asString(raw.endTime) || asString(raw.completedAt) || startTime;
  const tokenEstimate = (raw.tokenEstimate && typeof raw.tokenEstimate === "object")
    ? (raw.tokenEstimate as RawRun)
    : {};

  return {
    id: asString(raw.id, `sr-${date || "unknown"}-${Math.random().toString(36).slice(2, 8)}`),
    date,
    theme: (asString(raw.theme) || asString(raw.title) || "Morning Board Meeting") as StrategyTheme,
    status: (asString(raw.status, "completed") || "completed") as StrategyRun["status"],
    startTime,
    endTime,
    durationMs: asFiniteNumber(raw.durationMs, Math.max(0, Date.parse(endTime) - Date.parse(startTime)) || 0),
    signalSources: asStringArray(raw.signalSources).length > 0 ? asStringArray(raw.signalSources) : asStringArray(raw.sources),
    agentsConsulted: asStringArray(raw.agentsConsulted),
    tokenEstimate: {
      input: asFiniteNumber(tokenEstimate.input),
      output: asFiniteNumber(tokenEstimate.output),
      cost: asFiniteNumber(tokenEstimate.cost),
    },
    memo: readMemo(raw, date),
    skipReason: typeof raw.skipReason === "string" ? raw.skipReason : undefined,
  };
}

function runSortTime(run: StrategyRun): number {
  const start = Date.parse(run.startTime);
  if (Number.isFinite(start)) return start;
  const date = Date.parse(`${run.date}T11:00:00.000Z`);
  return Number.isFinite(date) ? date : 0;
}

export function getRuns(): StrategyRun[] {
  return readStore().runs
    .map(normalizeRun)
    .sort((a, b) => runSortTime(b) - runSortTime(a));
}

export function createRun(run: StrategyRun): StrategyRun {
  const store = readStore();
  const normalized = normalizeRun(run);
  const existingIndex = store.runs.findIndex((candidate) => {
    const raw = (candidate && typeof candidate === "object" ? candidate : {}) as RawRun;
    return asString(raw.id) === normalized.id;
  });

  if (existingIndex >= 0) store.runs[existingIndex] = run;
  else store.runs.unshift(run);

  writeStore(store);
  return normalized;
}
