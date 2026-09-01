export type InboundLeadType = "corporate" | "partnership" | "academy-la" | "academy-miami";

export type InboundLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "scheduled"
  | "confirmed"
  | "paid"
  | "active"
  | "closed"
  | "lost";

export type InboundLeadMarket = "la" | "miami" | "other";

export type InboundLeadSource = "referral" | "website" | "dm" | "partner" | "event" | "other";

export type InboundLeadSyncKey = InboundLeadType;

export interface InboundLeadRecord {
  id: string;
  date?: string;
  type: InboundLeadType;
  name: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  status: InboundLeadStatus;
  substatus?: string;
  /** Acquisition channel — typed union replacing the old free-form string field */
  source?: InboundLeadSource;
  /** Market this lead belongs to — derived from type or parsed from form data */
  market?: InboundLeadMarket;
  /** Expected deal value in USD. Seeded by type default; editable per-lead. */
  expectedValue?: number;
  sourceSheet?: string;
  sourceTab?: string;
  sourceRow?: number;
  receivedAt: string;
  contactedAt?: string | null;
  lastUpdated: string;
  assignedTo?: string;
  expectedRecordType?: "company" | "person_account";
  tags?: string[];
  responseTimeMs?: number | null;
  notes?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  crmContactId?: string;
  crmAccountId?: string;
  crmOpportunityId?: string;
  convertedToContactId?: string;
  convertedToAccountId?: string;
  convertedAt?: string;
  convertedBy?: string;
  deletedAt?: string;
}

export interface InboundLeadsStore {
  version: 1;
  leads: InboundLeadRecord[];
  lastSync: Partial<Record<InboundLeadSyncKey, string>>;
}

export interface InboundLeadFilters {
  type?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number | null;
}

export interface InboundSyncSourceReport {
  type: InboundLeadType;
  status: "success" | "blocked" | "error";
  synced: number;
  created: number;
  updated: number;
  tab?: string;
  syncedAt?: string;
  error?: string;
  detail?: string;
}

export interface InboundSyncResult {
  success: boolean;
  mode: "live" | "scaffold";
  synced: number;
  created: number;
  updated: number;
  sources: InboundSyncSourceReport[];
  errors: string[];
  lastSync: Partial<Record<InboundLeadSyncKey, string>>;
}

export const INBOUND_LEAD_TYPES: InboundLeadType[] = ["corporate", "partnership", "academy-la", "academy-miami"];

export const INBOUND_LEAD_STATUSES: InboundLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "scheduled",
  "confirmed",
  "paid",
  "active",
  "closed",
  "lost",
];

export const INBOUND_LEAD_MARKETS: InboundLeadMarket[] = ["la", "miami", "other"];

export const INBOUND_LEAD_SOURCES: InboundLeadSource[] = ["referral", "website", "dm", "partner", "event", "other"];

/** Statuses that count as "qualified or better" for pipeline value totals */
export const PIPELINE_STATUSES: InboundLeadStatus[] = [
  "qualified",
  "scheduled",
  "confirmed",
  "paid",
  "active",
];

/** Default expected value (USD) seeded at sync time, editable per-lead */
export const DEFAULT_EXPECTED_VALUE: Partial<Record<InboundLeadType, number>> = {
  corporate: 5000,
  "academy-la": 2500,
  "academy-miami": 5000,
  partnership: 2500,
};

export function isInboundLeadType(value: string | null | undefined): value is InboundLeadType {
  return !!value && INBOUND_LEAD_TYPES.includes(value as InboundLeadType);
}

export function isInboundLeadStatus(value: string | null | undefined): value is InboundLeadStatus {
  return !!value && INBOUND_LEAD_STATUSES.includes(value as InboundLeadStatus);
}

export function isInboundLeadMarket(value: string | null | undefined): value is InboundLeadMarket {
  return !!value && INBOUND_LEAD_MARKETS.includes(value as InboundLeadMarket);
}

export function isInboundLeadSource(value: string | null | undefined): value is InboundLeadSource {
  return !!value && INBOUND_LEAD_SOURCES.includes(value as InboundLeadSource);
}

/** Normalize legacy free-form `source` strings to the typed union. */
export interface InboundLeadEvent {
  id: string;
  leadId: string;
  type:
    | "status_change"
    | "assignment_change"
    | "note_added"
    | "crm_linked"
    | "synced"
    | "created"
    | "expected_value_change"
    | "conversion"
    | string;
  actor: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface InboundLeadEventsStore {
  version: 1;
  events: InboundLeadEvent[];
}

export function normalizeLegacySource(raw: unknown): InboundLeadSource | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (!v || v === "local-json") return undefined;
  if (v === "website-form" || v === "website") return "website";
  if (isInboundLeadSource(v)) return v as InboundLeadSource;
  // Best-effort mapping for other legacy strings
  if (v.includes("referral")) return "referral";
  if (v.includes("dm") || v.includes("direct")) return "dm";
  if (v.includes("partner")) return "partner";
  if (v.includes("event")) return "event";
  return "other";
}
