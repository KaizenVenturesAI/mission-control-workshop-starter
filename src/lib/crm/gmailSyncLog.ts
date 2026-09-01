// ── Gmail Sync Log ──
// Persists per-run sync summaries to .data/gmail-sync-log.json
// Keeps the last 100 entries (trimmed on every write).

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const LOG_PATH = path.join(DATA_DIR, "gmail-sync-log.json");
const MAX_ENTRIES = 100;

export interface GmailSyncLogEntry {
  runAt: string;
  inbox: string;
  fetched: number;
  synced: number;
  skipped: number;
  created: number;
  errors: string[];
}

export function readSyncLog(): GmailSyncLogEntry[] {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const raw = readFileSync(LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GmailSyncLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendSyncLog(entry: GmailSyncLogEntry): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch { /* exists */ }

  const existing = readSyncLog();
  existing.push(entry);

  // Keep only the last MAX_ENTRIES
  const trimmed = existing.length > MAX_ENTRIES
    ? existing.slice(existing.length - MAX_ENTRIES)
    : existing;

  writeFileSync(LOG_PATH, JSON.stringify(trimmed, null, 2), "utf-8");
}

/** Returns the last `limit` log entries for a given inbox, newest-first. */
export function getRecentRunsForInbox(inbox: string, limit = 3): GmailSyncLogEntry[] {
  const all = readSyncLog();
  return all
    .filter((e) => e.inbox === inbox)
    .slice(-limit)
    .reverse();
}
