// ── Unmatched Email Overflow Queue ──
// Stores emails to free-email-domain recipients that couldn't be matched to existing contacts.

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const QUEUE_PATH = path.join(DATA_DIR, "crm-unmatched-emails.json");

export interface UnmatchedEmail {
  id: string;
  messageId: string;
  toEmail: string;
  toName?: string;
  subject: string;
  sentAt: string;
  inbox: string;
  status: "pending" | "skipped";
}

function ensureDir(): void {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* exists */ }
}

export function readUnmatchedEmails(): UnmatchedEmail[] {
  try {
    const raw = readFileSync(QUEUE_PATH, "utf-8");
    return JSON.parse(raw) as UnmatchedEmail[];
  } catch {
    return [];
  }
}

export function writeUnmatchedEmails(items: UnmatchedEmail[]): void {
  ensureDir();
  const tmpPath = QUEUE_PATH + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(items, null, 2), "utf-8");
  renameSync(tmpPath, QUEUE_PATH);
}

export function appendUnmatchedEmail(item: UnmatchedEmail): void {
  const existing = readUnmatchedEmails();
  // Deduplicate by messageId + toEmail
  const isDuplicate = existing.some(
    (e) => e.messageId === item.messageId && e.toEmail === item.toEmail,
  );
  if (isDuplicate) return;
  existing.push(item);
  writeUnmatchedEmails(existing);
}

export function updateUnmatchedEmailStatus(id: string, status: "pending" | "skipped"): UnmatchedEmail | null {
  const items = readUnmatchedEmails();
  const idx = items.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  items[idx].status = status;
  writeUnmatchedEmails(items);
  return items[idx];
}

export function getPendingUnmatchedEmails(): UnmatchedEmail[] {
  return readUnmatchedEmails().filter((e) => e.status === "pending");
}
