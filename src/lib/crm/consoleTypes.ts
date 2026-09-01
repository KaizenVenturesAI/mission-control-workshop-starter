import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { CRMActivity } from "@/data/crm-activities";
import type { Opportunity } from "@/data/opportunities";

export type CRMConsoleBackendName = "local-json" | "supabase";
export type CRMConsoleBackendStatus = "ok";
export type CRMConsoleReadModel = "json" | "postgres";
export type CRMConsoleHealthTone = "ok" | "watch" | "risk";
export type CRMConsoleQueueKind = "lead" | "opportunity" | "contact" | "account" | "email";
export type CRMConsoleQueuePriority = "critical" | "high" | "medium" | "low";

export interface CRMConsoleBackend {
  status: CRMConsoleBackendStatus;
  backend: CRMConsoleBackendName;
  readModel: CRMConsoleReadModel;
  readPath: "store-abstraction";
  sourceMode: "local-json" | "supabase";
  urlConfigured: boolean;
  secretConfigured: boolean;
}

export interface CRMConsoleCounts {
  contacts: number;
  accounts: number;
  activities: number;
  opportunities: number;
  openOpportunities: number;
  leads: number;
  activeLeads: number;
  unmatchedEmails: number;
  queue: number;
  bdDrafts: number;
}

export interface CRMConsoleHealthItem {
  key: string;
  label: string;
  value: number;
  tone: CRMConsoleHealthTone;
  detail: string;
}

export interface CRMConsoleQueueItem {
  id: string;
  kind: CRMConsoleQueueKind;
  entityId?: string;
  title: string;
  detail: string;
  owner?: string;
  defaultAssignee?: string;
  dueAt?: string;
  priority: CRMConsoleQueuePriority;
  href: string;
}

export interface CRMConsoleSummary {
  total: number;
  active?: number;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  unmatchedEmails?: number;
  pendingDrafts?: number;
}

export interface CRMConsoleDiagnostics {
  generatedAt: string;
  durationMs: number;
  degradedSources: string[];
  readPath: string;
  readModelNote: string;
  recordCounts: {
    accounts: number;
    contacts: number;
    activities: number;
    opportunities: number;
  };
}

export interface CRMConsoleDistributionItem {
  key: string;
  label: string;
  value: number;
}

export interface CRMConsoleReporting {
  leads: {
    total: number;
    active: number;
    unassigned: number;
    stale: number;
    status: CRMConsoleDistributionItem[];
    type: CRMConsoleDistributionItem[];
    market: CRMConsoleDistributionItem[];
    source: CRMConsoleDistributionItem[];
  };
  accounts: {
    total: number;
    missingOwner: number;
    missingWebsite: number;
    noLinkedContacts: number;
    strategic: number;
  };
  opportunities: {
    total: number;
    open: number;
    overdue: number;
    missingNextStep: number;
    pipelineValue: number;
    stage: CRMConsoleDistributionItem[];
  };
  contacts: {
    total: number;
    missingOwner: number;
    stale: number;
    withoutAccount: number;
    followUpNeeded: number;
  };
}

export interface CRMConsoleLeadSearchItem {
  id: string;
  name?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  type?: string;
  status?: string;
  assignedTo?: string;
  receivedAt?: string;
}

export interface CRMConsoleSearchIndex {
  leads: CRMConsoleLeadSearchItem[];
}

export interface CRMConsolePayload {
  generatedAt: string;
  durationMs: number;
  backend: CRMConsoleBackend;
  diagnostics: CRMConsoleDiagnostics;
  counts: CRMConsoleCounts;
  accounts: Account[];
  contacts: Contact[];
  activities: CRMActivity[];
  opportunities: Opportunity[];
  leadsSummary: CRMConsoleSummary;
  queueSummary: CRMConsoleSummary;
  healthSummary: CRMConsoleHealthItem[];
  queue: CRMConsoleQueueItem[];
  reporting: CRMConsoleReporting;
  search: CRMConsoleSearchIndex;
}
