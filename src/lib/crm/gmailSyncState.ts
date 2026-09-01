// ── Gmail Sync State Persistence ──

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STATE_PATH = path.join(DATA_DIR, "gmail-sync-state.json");

export interface GmailInboxState {
  lastMessageId?: string;
  lastSyncAt?: string;
  retryCount?: number;
  status?: "ok" | "partial_error";
}

export type GmailSyncState = Record<string, GmailInboxState>;

export function getGmailSyncState(): GmailSyncState {
  try {
    const raw = readFileSync(STATE_PATH, "utf-8");
    return JSON.parse(raw) as GmailSyncState;
  } catch {
    return {};
  }
}

export function setGmailSyncState(state: GmailSyncState): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch { /* exists */ }
  const tmpPath = STATE_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  renameSync(tmpPath, STATE_PATH);
}
