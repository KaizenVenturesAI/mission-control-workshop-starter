// ── Audit Log Persistence ──
// Append-only JSONL at .data/audit-log.jsonl. One entry per line.
// Append-only design keeps writes concurrent-safe (POSIX append on small
// records is atomic) and avoids the read-modify-write race we'd hit with a
// single JSON array.

import { appendFileSync, mkdirSync, readFileSync, statSync } from "fs";
import path from "path";
import type {
  AuditAction,
  AuditEntityType,
  AuditFieldChange,
  AuditLogEntry,
} from "@/types/audit-log";
import { appendSupabaseAuditEntry, readSupabaseAuditEntries } from "@/lib/audit/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const LOG_PATH = path.join(DATA_DIR, "audit-log.jsonl");

try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }

function generateId(): string {
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `al-${Date.now()}-${rand}`;
}

export interface AuditEmitInput {
  actor: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: AuditFieldChange[];
  context?: AuditLogEntry["context"];
}

export function appendAuditEntry(input: AuditEmitInput): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    actor: input.actor,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    changes: input.changes,
    context: input.context,
  };
  if (shouldUseSupabaseBackend()) {
    appendSupabaseAuditEntry(entry).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[audit/store] appendSupabaseAuditEntry failed:", err);
    });
    return entry;
  }
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch (err) {
    // Persistence failure is non-fatal — caller has already wrapped in
    // try/catch, but guard here too so a disk hiccup doesn't bubble up.
    // eslint-disable-next-line no-console
    console.error("[audit/store] appendAuditEntry failed:", err);
  }
  return entry;
}

export interface ReadAuditOpts {
  entityType?: AuditEntityType;
  entityId?: string;
  actor?: string;
  since?: string;
  limit?: number;
  cursor?: string;
}

export interface ReadAuditResult {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

function parseLines(raw: string): AuditLogEntry[] {
  const out: AuditLogEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as AuditLogEntry;
      if (parsed && typeof parsed.id === "string") out.push(parsed);
    } catch {
      // Skip malformed lines rather than failing the whole read.
    }
  }
  return out;
}

export function readAuditEntries(opts: ReadAuditOpts = {}): ReadAuditResult {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);

  if (shouldUseSupabaseBackend()) {
    // Existing callers are synchronous, so Supabase-backed reads are exposed
    // through API routes during the backend migration. Return an empty page
    // rather than touching local production disk.
    void readSupabaseAuditEntries;
    return { entries: [], nextCursor: null };
  }

  let raw = "";
  try {
    statSync(LOG_PATH);
    raw = readFileSync(LOG_PATH, "utf-8");
  } catch {
    return { entries: [], nextCursor: null };
  }

  // Most-recent-first. Dataset is small enough that whole-file slurp + reverse
  // is fine; if this grows past ~50k entries we should switch to streaming.
  const all = parseLines(raw).reverse();

  let filtered = all;
  if (opts.entityType) filtered = filtered.filter((e) => e.entityType === opts.entityType);
  if (opts.entityId) filtered = filtered.filter((e) => e.entityId === opts.entityId);
  if (opts.actor) filtered = filtered.filter((e) => e.actor === opts.actor);
  if (opts.since) {
    const sinceMs = Date.parse(opts.since);
    if (!Number.isNaN(sinceMs)) {
      filtered = filtered.filter((e) => Date.parse(e.timestamp) >= sinceMs);
    }
  }

  let startIdx = 0;
  if (opts.cursor) {
    const cursorIdx = filtered.findIndex((e) => e.id === opts.cursor);
    if (cursorIdx !== -1) startIdx = cursorIdx + 1;
  }

  const page = filtered.slice(startIdx, startIdx + limit);
  const nextCursor = startIdx + limit < filtered.length ? page[page.length - 1]?.id ?? null : null;

  return { entries: page, nextCursor };
}

// ── Diff helper ──
// Compares two records over a known field list and returns the changed
// fields as AuditFieldChange[]. Uses JSON-stringify equality for arrays/
// objects so order matters but reference identity does not.
export function diffFields<T extends object>(
  before: Partial<T>,
  after: Partial<T>,
  fields: readonly (keyof T)[],
): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (!fieldsEqual(a, b)) {
      changes.push({ field: String(field), before: a, after: b });
    }
  }
  return changes;
}

function fieldsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

// ── Actor extraction ──
// Pulls the X-Actor header off a request. If absent or invalid, returns
// "system". This is the single chokepoint for actor identification — when
// real auth lands, swap the implementation here.
import { isAuditActor } from "@/types/audit-log";

export function actorFromRequest(request: Request): string {
  const header = request.headers.get("x-actor");
  if (header && isAuditActor(header)) return header;
  return "system";
}

// ── Safe emit wrapper ──
// Audit log is observability, not a blocker. Wrap every emit at the call
// site or use this helper which never throws.
export function safeAppendAuditEntry(input: AuditEmitInput): void {
  try {
    appendAuditEntry(input);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("audit emit failed", err);
  }
}
