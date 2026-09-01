// ── Employee CRM Storage Layer ──
// JSON file-backed store at .data/employee-store.json
// Links org-chart people to CRM contacts and stores employee lifecycle data

import { readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import path from "path";
import type { PerformanceReview, EmployeeRecord, AuditEntry } from "../types";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "employee-store.json");

try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }

interface EmployeeStore {
  employees: Record<string, EmployeeRecord>; // keyed by org-chart person id
  lastSyncedAt: string | null;
}

function readStore(): EmployeeStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as EmployeeStore;
    if (parsed.employees && typeof parsed.employees === "object") return parsed;
  } catch { /* missing or corrupt */ }
  const seed: EmployeeStore = { employees: {}, lastSyncedAt: null };
  writeStore(seed);
  return seed;
}

function writeStore(store: EmployeeStore): void {
  const tmpPath = `${STORE_PATH}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
  renameSync(tmpPath, STORE_PATH);
}

const now = () => new Date().toISOString();

// ── Read ──

export function getEmployeeData(personId: string): EmployeeRecord {
  const store = readStore();
  return store.employees[personId] ?? {
    startDate: null,
    promotions: 0,
    lastPromotionDate: null,
    performanceReviews: [],
    crmContactId: null,
  };
}

export function getAllEmployeeData(): Record<string, EmployeeRecord> {
  return readStore().employees;
}

// ── Write ──

export function updateEmployeeData(personId: string, data: Partial<EmployeeRecord>): EmployeeRecord {
  const store = readStore();
  const existing = store.employees[personId] ?? {
    startDate: null,
    promotions: 0,
    lastPromotionDate: null,
    performanceReviews: [],
    crmContactId: null,
  };
  const updated = { ...existing, ...data };
  store.employees[personId] = updated;
  writeStore(store);
  return updated;
}

export function addPerformanceReview(personId: string, review: PerformanceReview): EmployeeRecord {
  const store = readStore();
  const existing = store.employees[personId] ?? {
    startDate: null,
    promotions: 0,
    lastPromotionDate: null,
    performanceReviews: [],
    crmContactId: null,
  };
  existing.performanceReviews = existing.performanceReviews ?? [];
  existing.performanceReviews.push(review);
  // Sort by date descending (newest first)
  existing.performanceReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  store.employees[personId] = existing;
  writeStore(store);
  return existing;
}

// ── CRM Sync ──

export function setCrmContactId(personId: string, crmContactId: string): void {
  const store = readStore();
  const existing = store.employees[personId] ?? {
    startDate: null,
    promotions: 0,
    lastPromotionDate: null,
    performanceReviews: [],
    crmContactId: null,
  };
  existing.crmContactId = crmContactId;
  store.employees[personId] = existing;
  store.lastSyncedAt = now();
  writeStore(store);
}

export function getLastSyncTime(): string | null {
  return readStore().lastSyncedAt;
}

export function appendAuditLog(personId: string, entries: AuditEntry[]): void {
  const store = readStore();
  const existing = store.employees[personId];
  if (!existing) return;
  existing.auditLog = existing.auditLog ?? [];
  existing.auditLog.push(...entries);
  // Keep last 100 entries per person
  if (existing.auditLog.length > 100) existing.auditLog = existing.auditLog.slice(-100);
  store.employees[personId] = existing;
  writeStore(store);
}
