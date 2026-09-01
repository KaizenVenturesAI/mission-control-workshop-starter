import path from "path";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadEvent, InboundLeadEventsStore } from "@/modules/revenue/inboundLeadsTypes";

export const DATA_DIR = path.resolve(process.cwd(), ".data");
export const EVENTS_PATH = path.join(DATA_DIR, "inbound-lead-events.json");

function getNodeFs() {
  if (shouldUseSupabaseBackend()) throw new Error("INBOUND_EVENTS_JSON_BACKEND_DISABLED");
  const nodeRequire = eval("require") as NodeRequire;
  return nodeRequire("fs") as typeof import("fs");
}

function ensureDataDir(): void {
  getNodeFs().mkdirSync(DATA_DIR, { recursive: true });
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeEvent(input: unknown): InboundLeadEvent | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" && input.id ? input.id : null;
  const leadId = typeof input.leadId === "string" && input.leadId ? input.leadId : null;
  const type = typeof input.type === "string" && input.type ? input.type : null;
  const actor = typeof input.actor === "string" ? input.actor : "system";
  const timestamp = typeof input.timestamp === "string" && input.timestamp ? input.timestamp : null;
  const metadata = isObject(input.metadata) ? input.metadata : {};

  if (!id || !leadId || !type || !timestamp) return null;

  return { id, leadId, type: type as InboundLeadEvent["type"], actor, timestamp, metadata };
}

function readEventsStore(): InboundLeadEventsStore {
  const { readFileSync } = getNodeFs();
  try {
    const raw = readFileSync(EVENTS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeEventsStore(parsed);
  } catch {
    return { version: 1, events: [] };
  }
}

function normalizeEventsStore(input: unknown): InboundLeadEventsStore {
  if (!isObject(input)) return { version: 1, events: [] };
  const events = Array.isArray(input.events)
    ? input.events.map((e) => sanitizeEvent(e)).filter((e): e is InboundLeadEvent => !!e)
    : [];
  return { version: 1, events };
}

function writeEventsStore(store: InboundLeadEventsStore): void {
  ensureDataDir();
  const { writeFileSync, renameSync } = getNodeFs();
  const tmpPath = `${EVENTS_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  renameSync(tmpPath, EVENTS_PATH);
}

export function appendEvent(
  event: Omit<InboundLeadEvent, "id"> & { id?: string },
): InboundLeadEvent {
  const store = readEventsStore();
  const newEvent: InboundLeadEvent = {
    ...event,
    id: event.id ?? generateId(),
  };
  store.events.push(newEvent);
  writeEventsStore(store);
  return newEvent;
}

export function getEventsForLead(leadId: string): InboundLeadEvent[] {
  const store = readEventsStore();
  return store.events
    .filter((e) => e.leadId === leadId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getAllEvents(): InboundLeadEvent[] {
  return readEventsStore().events;
}
