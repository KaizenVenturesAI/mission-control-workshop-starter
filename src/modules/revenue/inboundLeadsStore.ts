import path from "path";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { EMPTY_INBOUND_LEADS_STORE } from "@/modules/revenue/inboundLeadsSeed";
import { expectedRecordTypeFromEmail } from "@/lib/crm/leadRecordType";
import { normalizeInterests } from "@/lib/crm/interests";
import {
  isInboundLeadMarket,
  isInboundLeadStatus,
  isInboundLeadType,
  normalizeLegacySource,
  type InboundLeadFilters,
  type InboundLeadRecord,
  type InboundLeadSyncKey,
  type InboundLeadsStore,
} from "@/modules/revenue/inboundLeadsTypes";

export const DATA_DIR = path.resolve(process.cwd(), ".data");
export const STORE_PATH = path.join(DATA_DIR, "inbound-leads.json");
const EVENTS_PATH = path.join(DATA_DIR, "inbound-lead-events.json");

function getNodeFs() {
  if (shouldUseSupabaseBackend()) throw new Error("INBOUND_JSON_BACKEND_DISABLED");
  const nodeRequire = eval("require") as NodeRequire;
  return nodeRequire("fs") as typeof import("fs");
}

function ensureDataDir(): void {
  getNodeFs().mkdirSync(DATA_DIR, { recursive: true });
}

function cloneEmptyStore(): InboundLeadsStore {
  return {
    version: 1,
    leads: [],
    lastSync: {},
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveDate(iso: string): string | undefined {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : undefined;
}

function sanitizeLead(input: unknown): InboundLeadRecord | null {
  if (!isObject(input)) return null;

  const id = typeof input.id === "string" ? input.id : "";
  const type = typeof input.type === "string" && isInboundLeadType(input.type) ? input.type : null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const receivedAt = typeof input.receivedAt === "string" ? input.receivedAt : "";
  const lastUpdated = typeof input.lastUpdated === "string" ? input.lastUpdated : receivedAt;
  const status = typeof input.status === "string" && isInboundLeadStatus(input.status) ? input.status : "new";
  if (!id || !type || !name || !receivedAt) return null;

  return {
    id,
    date: typeof input.date === "string" ? input.date : deriveDate(receivedAt),
    type,
    name,
    companyName: typeof input.companyName === "string" ? input.companyName : undefined,
    contactName: typeof input.contactName === "string" ? input.contactName : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    status,
    substatus: typeof input.substatus === "string" ? input.substatus : undefined,
    source: normalizeLegacySource(input.source),
    market: typeof input.market === "string" && isInboundLeadMarket(input.market) ? input.market : undefined,
    expectedValue:
      typeof input.expectedValue === "number" && Number.isFinite(input.expectedValue) && input.expectedValue >= 0
        ? input.expectedValue
        : undefined,
    sourceSheet: typeof input.sourceSheet === "string" ? input.sourceSheet : undefined,
    sourceTab: typeof input.sourceTab === "string" ? input.sourceTab : undefined,
    sourceRow: typeof input.sourceRow === "number" ? input.sourceRow : undefined,
    receivedAt,
    contactedAt:
      typeof input.contactedAt === "string" || input.contactedAt === null ? input.contactedAt : undefined,
    lastUpdated,
    assignedTo: typeof input.assignedTo === "string" ? input.assignedTo : undefined,
    expectedRecordType:
      input.expectedRecordType === "company" || input.expectedRecordType === "person_account"
        ? input.expectedRecordType
        : expectedRecordTypeFromEmail(typeof input.email === "string" ? input.email : undefined),
    tags: normalizeInterests(input.tags),
    responseTimeMs: typeof input.responseTimeMs === "number" ? input.responseTimeMs : null,
    notes: typeof input.notes === "string" ? input.notes : undefined,
    content: typeof input.content === "string" ? input.content : undefined,
    metadata: isObject(input.metadata) ? input.metadata : undefined,
    crmContactId: typeof input.crmContactId === "string" ? input.crmContactId : undefined,
    crmAccountId: typeof input.crmAccountId === "string" ? input.crmAccountId : undefined,
    crmOpportunityId: typeof input.crmOpportunityId === "string" ? input.crmOpportunityId : undefined,
    convertedToContactId: typeof input.convertedToContactId === "string" ? input.convertedToContactId : undefined,
    convertedToAccountId: typeof input.convertedToAccountId === "string" ? input.convertedToAccountId : undefined,
    convertedAt: typeof input.convertedAt === "string" ? input.convertedAt : undefined,
    convertedBy: typeof input.convertedBy === "string" ? input.convertedBy : undefined,
    deletedAt: typeof input.deletedAt === "string" ? input.deletedAt : undefined,
  };
}

function normalizeStore(input: unknown): InboundLeadsStore {
  if (!isObject(input)) return cloneEmptyStore();

  const leads = Array.isArray(input.leads)
    ? input.leads.map((lead) => sanitizeLead(lead)).filter((lead): lead is InboundLeadRecord => !!lead)
    : [];

  const lastSync = isObject(input.lastSync)
    ? Object.fromEntries(
        Object.entries(input.lastSync).filter(
          ([key, value]) => isInboundLeadType(key) && typeof value === "string" && value.length > 0,
        ),
      )
    : {};

  return {
    version: 1,
    leads: sortLeads(leads),
    lastSync,
  };
}

function writeStore(store: InboundLeadsStore): void {
  ensureDataDir();
  const { writeFileSync, renameSync } = getNodeFs();
  const normalized = normalizeStore(store);
  const tmpPath = `${STORE_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(normalized, null, 2), "utf-8");
  renameSync(tmpPath, STORE_PATH);
}

function readStore(): InboundLeadsStore {
  const { readFileSync } = getNodeFs();
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    return normalizeStore(JSON.parse(raw));
  } catch {
    const initialStore = normalizeStore(EMPTY_INBOUND_LEADS_STORE);
    writeStore(initialStore);
    return initialStore;
  }
}

function sortLeads(leads: InboundLeadRecord[]): InboundLeadRecord[] {
  return [...leads].sort((a, b) => {
    const aKey = a.receivedAt || a.lastUpdated || "";
    const bKey = b.receivedAt || b.lastUpdated || "";
    return bKey.localeCompare(aKey);
  });
}

function mergeSyncedLead(existing: InboundLeadRecord, incoming: InboundLeadRecord): InboundLeadRecord {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    type: existing.type,
    date: incoming.date ?? deriveDate(incoming.receivedAt) ?? existing.date,
    assignedTo: existing.assignedTo ?? incoming.assignedTo,
    notes: existing.notes ?? incoming.notes,
    contactedAt: existing.contactedAt ?? incoming.contactedAt ?? null,
    responseTimeMs: existing.responseTimeMs ?? incoming.responseTimeMs ?? null,
    // Prefer incoming market (re-derived from type/form), fall back to existing
    market: incoming.market ?? existing.market,
    // Preserve user-set source; fall back to incoming (e.g. 'website' from sync)
    source: existing.source ?? incoming.source,
    // Preserve user-edited expectedValue; fall back to seeded default from sync
    expectedValue: existing.expectedValue ?? incoming.expectedValue,
    tags: existing.tags ?? incoming.tags ?? [],
    crmContactId: existing.crmContactId ?? incoming.crmContactId,
    crmAccountId: existing.crmAccountId ?? incoming.crmAccountId,
    crmOpportunityId: existing.crmOpportunityId ?? incoming.crmOpportunityId,
    lastUpdated: new Date().toISOString(),
  };
}

export function getStore(): InboundLeadsStore {
  return readStore();
}

export function listInboundLeads(filters: InboundLeadFilters = {}): InboundLeadRecord[] {
  let leads = readStore().leads.filter((lead) => !lead.deletedAt);

  if (filters.type && isInboundLeadType(filters.type)) {
    leads = leads.filter((lead) => lead.type === filters.type);
  }

  if (filters.status && isInboundLeadStatus(filters.status)) {
    leads = leads.filter((lead) => lead.status === filters.status);
  }

  if (filters.from) {
    leads = leads.filter((lead) => (lead.date ?? deriveDate(lead.receivedAt) ?? "") >= filters.from!);
  }

  if (filters.to) {
    leads = leads.filter((lead) => (lead.date ?? deriveDate(lead.receivedAt) ?? "") <= filters.to!);
  }

  if (typeof filters.limit === "number" && filters.limit > 0) {
    leads = leads.slice(0, filters.limit);
  }

  return sortLeads(leads);
}

export function getInboundLead(id: string): InboundLeadRecord | null {
  return readStore().leads.find((lead) => lead.id === id) ?? null;
}

export function createInboundLead(lead: InboundLeadRecord): InboundLeadRecord {
  const store = readStore();
  const normalizedLead = sanitizeLead(lead);

  if (!normalizedLead) {
    throw new Error("Invalid inbound lead payload");
  }

  store.leads = sortLeads([normalizedLead, ...store.leads.filter((item) => item.id !== normalizedLead.id)]);
  writeStore(store);
  return normalizedLead;
}

export function updateInboundLead(id: string, updates: Partial<InboundLeadRecord>): InboundLeadRecord | null {
  const store = readStore();
  const index = store.leads.findIndex((lead) => lead.id === id);
  if (index === -1) return null;

  const current = store.leads[index];
  const nextStatus =
    typeof updates.status === "string" && isInboundLeadStatus(updates.status) ? updates.status : current.status;
  const inferredContactedAt =
    current.contactedAt ??
    (nextStatus !== "new" ? new Date().toISOString() : null);
  const contactedAt =
    updates.contactedAt === null || typeof updates.contactedAt === "string"
      ? updates.contactedAt
      : inferredContactedAt;
  const assignedTo =
    typeof updates.assignedTo === "string"
      ? updates.assignedTo.trim() || undefined
      : current.assignedTo;
  const tags = Object.prototype.hasOwnProperty.call(updates, "tags")
    ? normalizeInterests(updates.tags)
    : current.tags ?? [];

  const responseTimeMs =
    typeof updates.responseTimeMs === "number"
      ? updates.responseTimeMs
      : contactedAt
        ? Math.max(new Date(contactedAt).getTime() - new Date(current.receivedAt).getTime(), 0)
        : current.responseTimeMs ?? null;

  const updatedLead: InboundLeadRecord = {
    ...current,
    ...updates,
    id: current.id,
    type: current.type,
    date: updates.date ?? current.date ?? deriveDate(current.receivedAt),
    status: nextStatus,
    assignedTo,
    tags,
    contactedAt,
    responseTimeMs,
    lastUpdated: new Date().toISOString(),
  };

  store.leads[index] = updatedLead;
  store.leads = sortLeads(store.leads);
  writeStore(store);
  return updatedLead;
}

export function deleteInboundLead(id: string): boolean {
  const store = readStore();
  const index = store.leads.findIndex((lead) => lead.id === id);
  if (index === -1) return false;
  store.leads[index] = { ...store.leads[index], deletedAt: new Date().toISOString(), lastUpdated: new Date().toISOString() };
  writeStore(store);
  return true;
}

export function upsertInboundLeads(
  incoming: InboundLeadRecord[],
  dedupeKeyFn: (lead: InboundLeadRecord) => string,
): { created: number; updated: number } {
  const store = readStore();
  const existingByKey = new Map<string, number>();

  store.leads.forEach((lead, index) => {
    existingByKey.set(dedupeKeyFn(lead), index);
  });

  let created = 0;
  let updated = 0;

  for (const rawLead of incoming) {
    const lead = sanitizeLead(rawLead);
    if (!lead) continue;

    const key = dedupeKeyFn(lead);
    const existingIndex = existingByKey.get(key);

    if (existingIndex === undefined) {
      store.leads.push(lead);
      existingByKey.set(key, store.leads.length - 1);
      created += 1;
      continue;
    }

    store.leads[existingIndex] = mergeSyncedLead(store.leads[existingIndex], lead);
    updated += 1;
  }

  store.leads = sortLeads(store.leads);
  writeStore(store);
  return { created, updated };
}

export function updateSyncMeta(source: InboundLeadSyncKey, timestamp: string): void {
  const store = readStore();
  store.lastSync[source] = timestamp;
  writeStore(store);
}

export function getSyncMeta(): Partial<Record<InboundLeadSyncKey, string>> {
  return readStore().lastSync;
}
