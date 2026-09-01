import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STATE_PATH = path.join(DATA_DIR, "crm-action-queue-state.json");

export interface ActionQueueItemState {
  id: string;
  ignoredAt?: string;
  ignoredReason?: string;
  snoozedUntil?: string;
  updatedAt: string;
}

interface ActionQueueStateStore {
  version: 1;
  items: ActionQueueItemState[];
}

function emptyStore(): ActionQueueStateStore {
  return { version: 1, items: [] };
}

function normalizeStore(input: unknown): ActionQueueStateStore {
  if (!input || typeof input !== "object" || Array.isArray(input)) return emptyStore();
  const rawItems = Array.isArray((input as { items?: unknown }).items) ? (input as { items: unknown[] }).items : [];
  return {
    version: 1,
    items: rawItems
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      .map((item) => ({
        id: typeof item.id === "string" ? item.id : "",
        ignoredAt: typeof item.ignoredAt === "string" ? item.ignoredAt : undefined,
        ignoredReason: typeof item.ignoredReason === "string" ? item.ignoredReason : undefined,
        snoozedUntil: typeof item.snoozedUntil === "string" ? item.snoozedUntil : undefined,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      }))
      .filter((item) => item.id),
  };
}

export function readActionQueueState(): ActionQueueStateStore {
  try {
    return normalizeStore(JSON.parse(readFileSync(STATE_PATH, "utf-8")));
  } catch {
    return emptyStore();
  }
}

function writeActionQueueState(store: ActionQueueStateStore): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${STATE_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(normalizeStore(store), null, 2), "utf-8");
  renameSync(tmpPath, STATE_PATH);
}

export function getActionQueueStateIndex(): Map<string, ActionQueueItemState> {
  return new Map(readActionQueueState().items.map((item) => [item.id, item] as const));
}

export function isQueueItemSuppressed(id: string, now = new Date()): boolean {
  const state = getActionQueueStateIndex().get(id);
  if (!state) return false;
  if (state.ignoredAt) return true;
  if (!state.snoozedUntil) return false;
  return new Date(state.snoozedUntil).getTime() > now.getTime();
}

export function snoozeQueueItem(id: string, until: string): ActionQueueItemState {
  const store = readActionQueueState();
  const now = new Date().toISOString();
  const index = store.items.findIndex((item) => item.id === id);
  const next: ActionQueueItemState = { id, snoozedUntil: until, updatedAt: now };
  if (index >= 0) {
    store.items[index] = { ...store.items[index], ...next, ignoredAt: undefined, ignoredReason: undefined };
  } else {
    store.items.push(next);
  }
  writeActionQueueState(store);
  return next;
}

export function ignoreQueueItem(id: string, reason?: string): ActionQueueItemState {
  const store = readActionQueueState();
  const now = new Date().toISOString();
  const index = store.items.findIndex((item) => item.id === id);
  const next: ActionQueueItemState = {
    id,
    ignoredAt: now,
    ignoredReason: reason,
    snoozedUntil: undefined,
    updatedAt: now,
  };
  if (index >= 0) {
    store.items[index] = { ...store.items[index], ...next };
  } else {
    store.items.push(next);
  }
  writeActionQueueState(store);
  return next;
}
