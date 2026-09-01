import { readStore } from "@/lib/crm/store";
import { readSupabaseCrmStore } from "@/lib/crm/supabaseStore";
import { hasSupabaseServerConfig, shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { fromDisplayId, toDisplayId, type CRMEntityType } from "@/lib/crm/displayId";
import { listInboundLeads } from "@/modules/revenue/inboundLeadsStore";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import type { CRMActivity } from "@/data/crm-activities";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { Opportunity } from "@/data/opportunities";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export type CRMContextObject = CRMEntityType;
export type CRMContextTone = "ok" | "watch" | "risk";
export type CRMContextActionPriority = "high" | "medium" | "low";

export interface CRMContextRelatedRecord {
  object: CRMContextObject;
  id: string;
  displayId: string;
  label: string;
  href: string;
}

export interface CRMContextSignal {
  key: string;
  label: string;
  tone: CRMContextTone;
  detail: string;
}

export interface CRMContextNextAction {
  key: string;
  label: string;
  priority: CRMContextActionPriority;
  href?: string;
}

export interface CRMContextActivitySlice {
  id: string;
  type: string;
  occurredAt: string;
  summary: string;
}

export interface CRMRecordContext {
  generatedAt: string;
  durationMs: number;
  object: CRMContextObject;
  id: string;
  displayId: string;
  title: string;
  keyFields: Record<string, string | number | boolean | null>;
  relatedRecords: CRMContextRelatedRecord[];
  signals: CRMContextSignal[];
  nextActions: CRMContextNextAction[];
  recentActivity: CRMContextActivitySlice[];
    backend: {
    backend: "local-json" | "supabase";
    readModel: "json" | "postgres";
    readPath: "store-abstraction";
    sourceMode: "local-json" | "supabase";
    urlConfigured: boolean;
    secretConfigured: boolean;
  };
  contextBudget: {
    keyFieldCount: number;
    relatedRecordCount: number;
    signalCount: number;
    nextActionCount: number;
    activityCount: number;
  };
}

export interface CRMRecordContextResult {
  context: CRMRecordContext | null;
  notFound?: boolean;
}

const OPEN_OPPORTUNITY_STAGES = new Set(["Discovery", "Propose", "Contracting"]);
const ACTIVE_LEAD_STATUSES = new Set(["new", "contacted", "qualified", "scheduled"]);

function normalizeObject(value: string): CRMContextObject | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "lead" || normalized === "leads") return "lead";
  if (normalized === "contact" || normalized === "contacts") return "contact";
  if (normalized === "account" || normalized === "accounts") return "account";
  if (normalized === "opportunity" || normalized === "opportunities") return "opportunity";
  return null;
}

function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function isOverdueDate(value?: string): boolean {
  return Boolean(value && value < new Date().toISOString().slice(0, 10));
}

function hrefFor(object: CRMContextObject, id: string): string {
  const displayId = toDisplayId(id, object);
  if (object === "contact") return `/contacts?select=${displayId}`;
  return `/contacts?object=${object}s&select=${displayId}`;
}

function relatedRecord(object: CRMContextObject, id: string, label: string): CRMContextRelatedRecord {
  return {
    object,
    id,
    displayId: toDisplayId(id, object),
    label,
    href: hrefFor(object, id),
  };
}

function recentActivity(activities: CRMActivity[]): CRMContextActivitySlice[] {
  return activities
    .slice()
    .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))
    .slice(0, 5)
    .map((activity) => ({
      id: activity.id,
      type: activity.type,
      occurredAt: activity.occurredAt,
      summary: activity.summary || activity.emailSubject || activity.meetingTitle || activity.content,
    }));
}

function compactContext(args: {
  startedAt: number;
  object: CRMContextObject;
  id: string;
  title: string;
  keyFields: Record<string, string | number | boolean | null>;
  relatedRecords: CRMContextRelatedRecord[];
  signals: CRMContextSignal[];
  nextActions: CRMContextNextAction[];
  recentActivity: CRMContextActivitySlice[];
  backend?: CRMRecordContext["backend"];
}): CRMRecordContext {
  const supabaseConfig = hasSupabaseServerConfig();
  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - args.startedAt,
    object: args.object,
    id: args.id,
    displayId: toDisplayId(args.id, args.object),
    title: args.title,
    keyFields: args.keyFields,
    relatedRecords: args.relatedRecords,
    signals: args.signals,
    nextActions: args.nextActions,
    recentActivity: args.recentActivity,
    backend: {
      backend: args.backend?.backend ?? "local-json",
      readModel: args.backend?.readModel ?? "json",
      readPath: "store-abstraction",
      sourceMode: args.backend?.sourceMode ?? "local-json",
      urlConfigured: args.backend?.urlConfigured ?? supabaseConfig.urlConfigured,
      secretConfigured: args.backend?.secretConfigured ?? supabaseConfig.serviceRoleConfigured,
    },
    contextBudget: {
      keyFieldCount: Object.keys(args.keyFields).length,
      relatedRecordCount: args.relatedRecords.length,
      signalCount: args.signals.length,
      nextActionCount: args.nextActions.length,
      activityCount: args.recentActivity.length,
    },
  };
}

type CrmContextStore = ReturnType<typeof readStore>;

function backendInfo(): CRMRecordContext["backend"] {
  const supabaseConfig = hasSupabaseServerConfig();
  const useSupabase = shouldUseSupabaseBackend();
  return {
    backend: useSupabase ? "supabase" : "local-json",
    readModel: useSupabase ? "postgres" : "json",
    readPath: "store-abstraction",
    sourceMode: useSupabase ? "supabase" : "local-json",
    urlConfigured: supabaseConfig.urlConfigured,
    secretConfigured: supabaseConfig.serviceRoleConfigured,
  };
}

function accountContext(startedAt: number, account: Account, store: CrmContextStore): CRMRecordContext {
  const contacts = store.contacts.filter((contact) => !contact.deletedAt && contact.accountId === account.id);
  const opportunities = store.opportunities.filter((opportunity) => !opportunity.deletedAt && opportunity.accountId === account.id);
  const activities = store.activities.filter((activity) => activity.accountId === account.id || contacts.some((contact) => contact.id === activity.contactId));
  const openOpportunities = opportunities.filter((opportunity) => OPEN_OPPORTUNITY_STAGES.has(opportunity.stage));
  const lastActivity = recentActivity(activities)[0]?.occurredAt ?? null;
  const signals: CRMContextSignal[] = [
    account.owner
      ? { key: "owner", label: "Owner assigned", tone: "ok", detail: account.owner }
      : { key: "missing-owner", label: "Missing owner", tone: "risk", detail: "Assign a relationship owner." },
    account.website || account.domain
      ? { key: "website", label: "Domain present", tone: "ok", detail: account.website || account.domain || "" }
      : { key: "missing-website", label: "Missing website/domain", tone: "watch", detail: "Add a website or domain for enrichment and matching." },
    contacts.length > 0
      ? { key: "linked-contacts", label: "Linked contacts", tone: "ok", detail: `${contacts.length} contact${contacts.length === 1 ? "" : "s"}` }
      : { key: "no-linked-contacts", label: "No linked contacts", tone: "risk", detail: "Add a primary relationship contact." },
  ];
  const staleDays = daysSince(lastActivity);
  if ((staleDays ?? 0) >= 30) signals.push({ key: "stale-activity", label: "No recent activity", tone: "watch", detail: `${staleDays} days since last activity.` });

  return compactContext({
    startedAt,
    object: "account",
    id: account.id,
    title: account.name,
    keyFields: {
      type: account.type,
      subtype: account.subType ?? null,
      market: account.operatingMarket,
      lifecycle: account.lifecycleStage ?? account.relationshipStage ?? null,
      owner: account.owner ?? null,
      openOpportunities: openOpportunities.length,
    },
    relatedRecords: [
      ...contacts.slice(0, 8).map((contact) => relatedRecord("contact", contact.id, contact.name)),
      ...opportunities.slice(0, 8).map((opportunity) => relatedRecord("opportunity", opportunity.id, opportunity.name)),
    ],
    signals,
    nextActions: [
      ...(!account.owner ? [{ key: "assign-owner", label: "Assign account owner", priority: "high" as const, href: `/contacts?object=accounts&lens=missing-owner&select=${toDisplayId(account.id, "account")}` }] : []),
      ...(contacts.length === 0 ? [{ key: "add-contact", label: "Add or link a primary contact", priority: "high" as const, href: hrefFor("account", account.id) }] : []),
      ...(openOpportunities.length === 0 ? [{ key: "create-opportunity", label: "Create or qualify next opportunity", priority: "medium" as const, href: hrefFor("account", account.id) }] : []),
    ],
    recentActivity: recentActivity(activities),
    backend: backendInfo(),
  });
}

function contactContext(startedAt: number, contact: Contact, store: CrmContextStore): CRMRecordContext {
  const account = contact.accountId ? store.accounts.find((item) => item.id === contact.accountId && !item.deletedAt) : undefined;
  const opportunities = store.opportunities.filter((opportunity) => !opportunity.deletedAt && opportunity.contactId === contact.id);
  const activities = store.activities.filter((activity) => activity.contactId === contact.id);
  const lastTouch = contact.lastTouchAt ?? contact.lastEmailAt ?? recentActivity(activities)[0]?.occurredAt ?? null;
  const staleDays = daysSince(lastTouch);
  const signals: CRMContextSignal[] = [
    contact.owner
      ? { key: "owner", label: "Owner assigned", tone: "ok", detail: contact.owner }
      : { key: "missing-owner", label: "Missing owner", tone: "watch", detail: "Assign a relationship owner." },
    account
      ? { key: "linked-account", label: "Linked account", tone: "ok", detail: account.name }
      : { key: "missing-account", label: "No account", tone: "watch", detail: "Link this contact to an account." },
  ];
  if (contact.followUpState && contact.followUpState !== "none") {
    signals.push({ key: "follow-up", label: "Follow-up needed", tone: "risk", detail: contact.followUpState });
  }
  if ((staleDays ?? 0) >= 30) {
    signals.push({ key: "stale", label: "No recent activity", tone: "watch", detail: `${staleDays} days since last touch.` });
  }

  return compactContext({
    startedAt,
    object: "contact",
    id: contact.id,
    title: contact.name,
    keyFields: {
      title: contact.title ?? null,
      company: contact.company ?? null,
      owner: contact.owner ?? null,
      stage: contact.stage,
      priority: contact.priority ?? null,
      followUpState: contact.followUpState,
    },
    relatedRecords: [
      ...(account ? [relatedRecord("account", account.id, account.name)] : []),
      ...opportunities.slice(0, 8).map((opportunity) => relatedRecord("opportunity", opportunity.id, opportunity.name)),
    ],
    signals,
    nextActions: [
      ...(!contact.owner ? [{ key: "assign-owner", label: "Assign contact owner", priority: "medium" as const, href: `/contacts?lens=missing-owner&select=${toDisplayId(contact.id, "contact")}` }] : []),
      ...(contact.followUpState && contact.followUpState !== "none" ? [{ key: "follow-up", label: "Complete follow-up", priority: "high" as const, href: `/contacts?lens=follow-up&select=${toDisplayId(contact.id, "contact")}` }] : []),
    ],
    recentActivity: recentActivity(activities),
    backend: backendInfo(),
  });
}

function opportunityContext(startedAt: number, opportunity: Opportunity, store: CrmContextStore): CRMRecordContext {
  const account = store.accounts.find((item) => item.id === opportunity.accountId && !item.deletedAt);
  const contact = store.contacts.find((item) => item.id === opportunity.contactId && !item.deletedAt);
  const activities = store.activities.filter((activity) => activity.accountId === opportunity.accountId || activity.contactId === opportunity.contactId);
  const overdue = isOverdueDate(opportunity.nextStepDueDate);
  const open = OPEN_OPPORTUNITY_STAGES.has(opportunity.stage);
  const signals: CRMContextSignal[] = [
    opportunity.nextStep?.trim()
      ? { key: "next-step", label: "Next step present", tone: overdue ? "risk" : "ok", detail: opportunity.nextStep }
      : { key: "missing-next-step", label: "Missing next step", tone: "risk", detail: "Add a concrete next action." },
    overdue
      ? { key: "overdue", label: "Overdue opportunity", tone: "risk", detail: `Due ${opportunity.nextStepDueDate}.` }
      : { key: "due-date", label: "Due date", tone: "ok", detail: opportunity.nextStepDueDate },
  ];

  return compactContext({
    startedAt,
    object: "opportunity",
    id: opportunity.id,
    title: opportunity.name,
    keyFields: {
      stage: opportunity.stage,
      owner: opportunity.owner,
      value: opportunity.value,
      valueType: opportunity.valueType,
      forecastConfidence: opportunity.forecastConfidence,
      nextStepDueDate: opportunity.nextStepDueDate,
    },
    relatedRecords: [
      ...(account ? [relatedRecord("account", account.id, account.name)] : []),
      ...(contact ? [relatedRecord("contact", contact.id, contact.name)] : []),
    ],
    signals,
    nextActions: [
      ...(!opportunity.nextStep?.trim() ? [{ key: "add-next-step", label: "Add next step", priority: "high" as const, href: `/contacts?object=opportunities&lens=needs-next-step&select=${toDisplayId(opportunity.id, "opportunity")}` }] : []),
      ...(open && overdue ? [{ key: "resolve-overdue", label: "Resolve overdue next step", priority: "high" as const, href: `/contacts?object=opportunities&lens=stale&select=${toDisplayId(opportunity.id, "opportunity")}` }] : []),
    ],
    recentActivity: recentActivity(activities),
    backend: backendInfo(),
  });
}

function leadContext(startedAt: number, lead: InboundLeadRecord): CRMRecordContext {
  const age = daysSince(lead.receivedAt) ?? 0;
  const active = ACTIVE_LEAD_STATUSES.has(lead.status);
  const linkedContactId = lead.convertedToContactId ?? lead.crmContactId;
  const linkedAccountId = lead.convertedToAccountId ?? lead.crmAccountId;
  const signals: CRMContextSignal[] = [
    lead.assignedTo
      ? { key: "owner", label: "Owner assigned", tone: "ok", detail: lead.assignedTo }
      : { key: "missing-owner", label: "Unassigned lead", tone: "risk", detail: "Assign owner before follow-up." },
    linkedContactId || linkedAccountId
      ? { key: "crm-linked", label: "CRM linkage", tone: "ok", detail: "Lead is linked to CRM records." }
      : { key: "not-converted", label: "Not converted", tone: active && age >= 3 ? "risk" : "watch", detail: `${age} day${age === 1 ? "" : "s"} since received.` },
  ];

  return compactContext({
    startedAt,
    object: "lead",
    id: lead.id,
    title: lead.companyName || lead.contactName || lead.name,
    keyFields: {
      status: lead.status,
      type: lead.type,
      market: lead.market ?? null,
      source: lead.source ?? null,
      assignedTo: lead.assignedTo ?? null,
      expectedValue: lead.expectedValue ?? null,
      receivedAt: lead.receivedAt,
    },
    relatedRecords: [
      ...(linkedContactId ? [relatedRecord("contact", linkedContactId, "Converted contact")] : []),
      ...(linkedAccountId ? [relatedRecord("account", linkedAccountId, "Converted account")] : []),
      ...(lead.crmOpportunityId ? [relatedRecord("opportunity", lead.crmOpportunityId, "Linked opportunity")] : []),
    ],
    signals,
    nextActions: [
      ...(!lead.assignedTo ? [{ key: "assign-owner", label: "Assign lead owner", priority: "high" as const, href: `/contacts?object=leads&lens=unassigned&select=${lead.id}` }] : []),
      ...(!linkedContactId && active ? [{ key: "qualify-convert", label: "Qualify or convert lead", priority: age >= 3 ? "high" as const : "medium" as const, href: `/contacts?object=leads&select=${lead.id}` }] : []),
    ],
    recentActivity: [],
    backend: backendInfo(),
  });
}

export async function buildCRMRecordContext(rawObject: string, rawId: string): Promise<CRMRecordContextResult> {
  const startedAt = Date.now();
  const object = normalizeObject(rawObject);
  if (!object) return { context: null, notFound: true };

  if (object === "lead") {
    const leads = shouldUseSupabaseBackend() ? await listSupabaseInboundLeads() : listInboundLeads();
    const id = fromDisplayId(rawId, leads.map((lead) => lead.id), "lead");
    const lead = leads.find((item) => item.id === id);
    return lead ? { context: leadContext(startedAt, lead) } : { context: null, notFound: true };
  }

  const store = shouldUseSupabaseBackend() ? await readSupabaseCrmStore() : readStore();
  if (object === "account") {
    const id = fromDisplayId(rawId, store.accounts.map((account) => account.id), "account");
    const account = store.accounts.find((item) => item.id === id && !item.deletedAt);
    return account ? { context: accountContext(startedAt, account, store) } : { context: null, notFound: true };
  }
  if (object === "contact") {
    const id = fromDisplayId(rawId, store.contacts.map((contact) => contact.id), "contact");
    const contact = store.contacts.find((item) => item.id === id && !item.deletedAt);
    return contact ? { context: contactContext(startedAt, contact, store) } : { context: null, notFound: true };
  }

  const id = fromDisplayId(rawId, store.opportunities.map((opportunity) => opportunity.id), "opportunity");
  const opportunity = store.opportunities.find((item) => item.id === id && !item.deletedAt);
  return opportunity ? { context: opportunityContext(startedAt, opportunity, store) } : { context: null, notFound: true };
}
