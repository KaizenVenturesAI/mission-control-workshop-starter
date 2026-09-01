import { getDefaultAssignee } from "@/lib/inbound/leadAssignment";
import { readSupabaseCrmStore } from "@/lib/crm/supabaseStore";
import { hasSupabaseServerConfig, shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { toDisplayId } from "@/lib/crm/displayId";
import { computeOpportunityHealth } from "@/lib/crm/opportunityHealth";
import type { CRMStore } from "@/lib/crm/store";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { Opportunity } from "@/data/opportunities";
import type { CRMActivity } from "@/data/crm-activities";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";
import type {
  CRMConsoleDistributionItem,
  CRMConsoleHealthItem,
  CRMConsoleHealthTone,
  CRMConsolePayload,
  CRMConsoleQueueItem,
  CRMConsoleQueuePriority,
} from "@/lib/crm/consoleTypes";

const OPEN_OPPORTUNITY_STAGES = new Set(["Discovery", "Propose", "Contracting"]);
const ACTIVE_LEAD_STATUSES = new Set(["new", "contacted", "qualified", "scheduled"]);
const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  paid: "Paid",
  active: "Active",
  closed: "Closed",
  lost: "Lost",
};
const LEAD_TYPE_LABELS: Record<string, string> = {
  corporate: "Mission Control Builds",
  partnership: "Referral Partnerships",
  "academy-la": "Half-Day Installs",
  "academy-miami": "Full-Day Installs",
};
const LEAD_MARKET_LABELS: Record<string, string> = {
  la: "Los Angeles",
  miami: "Miami",
  other: "Other",
  Unspecified: "Unspecified",
};
const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  referral: "Referral",
  dm: "DM",
  partner: "Partner",
  event: "Event",
  other: "Other",
  Unspecified: "Unspecified",
};

function daysSince(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

function isOverdueDate(value?: string): boolean {
  if (!value) return false;
  return value < new Date().toISOString().slice(0, 10);
}

function newestActivityByContact(activities: CRMActivity[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const activity of activities) {
    if (!activity.contactId || !activity.occurredAt) continue;
    const current = index.get(activity.contactId);
    if (!current || activity.occurredAt > current) index.set(activity.contactId, activity.occurredAt);
  }
  return index;
}

function contactLastTouch(contact: Contact, activityIndex: Map<string, string>): string | undefined {
  return contact.lastTouchAt ?? contact.lastEmailAt ?? activityIndex.get(contact.id);
}

function healthTone(value: number, warnAt: number, riskAt: number): CRMConsoleHealthTone {
  if (value >= riskAt) return "risk";
  if (value >= warnAt) return "watch";
  return "ok";
}

function leadTitle(lead: InboundLeadRecord): string {
  return lead.companyName || lead.contactName || lead.name;
}

function distribution<T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined,
  getLabel: (key: string) => string = (key) => key,
): CRMConsoleDistributionItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row)?.trim() || "Unspecified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, value]) => ({ key, label: getLabel(key), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function buildQueueItems(args: {
  contacts: Contact[];
  accounts: Account[];
  opportunities: Opportunity[];
  leads: InboundLeadRecord[];
  unmatchedEmailCount: number;
  activityIndex: Map<string, string>;
  actionStateIndex: Map<string, { ignoredAt?: string; snoozedUntil?: string }>;
}): CRMConsoleQueueItem[] {
  const items: CRMConsoleQueueItem[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const opportunity of args.opportunities) {
    if (!OPEN_OPPORTUNITY_STAGES.has(opportunity.stage)) continue;
    if (isOverdueDate(opportunity.nextStepDueDate)) {
      items.push({
        id: `opp-overdue-${opportunity.id}`,
        kind: "opportunity",
        entityId: opportunity.id,
        title: opportunity.name,
        detail: `Next step overdue since ${opportunity.nextStepDueDate}: ${opportunity.nextStep || "No next step"}`,
        owner: opportunity.owner,
        dueAt: opportunity.nextStepDueDate,
        priority: "critical",
        href: `/contacts?object=opportunities&lens=stale&select=${toDisplayId(opportunity.id, "opportunity")}`,
      });
    } else if (!opportunity.nextStep?.trim()) {
      items.push({
        id: `opp-no-next-${opportunity.id}`,
        kind: "opportunity",
        entityId: opportunity.id,
        title: opportunity.name,
        detail: "Open opportunity has no next step.",
        owner: opportunity.owner,
        priority: "high",
        href: `/contacts?object=opportunities&lens=needs-next-step&select=${toDisplayId(opportunity.id, "opportunity")}`,
      });
    } else if (opportunity.nextStepDueDate === today) {
      items.push({
        id: `opp-due-today-${opportunity.id}`,
        kind: "opportunity",
        entityId: opportunity.id,
        title: opportunity.name,
        detail: `Next step due today: ${opportunity.nextStep}`,
        owner: opportunity.owner,
        dueAt: opportunity.nextStepDueDate,
        priority: "high",
        href: `/contacts?object=opportunities&select=${toDisplayId(opportunity.id, "opportunity")}`,
      });
    }
  }

  for (const lead of args.leads) {
    if (!ACTIVE_LEAD_STATUSES.has(lead.status)) continue;
    const age = daysSince(lead.receivedAt) ?? 0;
    const defaultAssignee = getDefaultAssignee(lead);
    if (!lead.assignedTo) {
      items.push({
        id: `lead-owner-${lead.id}`,
        kind: "lead",
        entityId: lead.id,
        title: leadTitle(lead),
        detail: `Unassigned ${lead.type} lead, ${age} day${age === 1 ? "" : "s"} old. Default: ${defaultAssignee}.`,
        defaultAssignee,
        priority: age >= 3 ? "critical" : "high",
        href: `/contacts?object=leads&select=${lead.id}`,
      });
    } else if (!lead.convertedToContactId && age >= 3) {
      items.push({
        id: `lead-stale-${lead.id}`,
        kind: "lead",
        entityId: lead.id,
        title: leadTitle(lead),
        detail: `${lead.status} lead has not converted after ${age} days.`,
        owner: lead.assignedTo,
        dueAt: lead.receivedAt,
        priority: "high",
        href: `/contacts?object=leads&select=${lead.id}`,
      });
    }
  }

  for (const contact of args.contacts) {
    const lastTouch = contactLastTouch(contact, args.activityIndex);
    const staleDays = daysSince(lastTouch);
    if (contact.followUpState && contact.followUpState !== "none") {
      items.push({
        id: `contact-followup-${contact.id}`,
        kind: "contact",
        entityId: contact.id,
        title: contact.name,
        detail: `Follow-up state: ${contact.followUpState}.`,
        owner: contact.owner,
        dueAt: lastTouch,
        priority: contact.followUpState === "needs-founder-response" ? "critical" : "high",
        href: `/contacts?select=${toDisplayId(contact.id, "contact")}`,
      });
    } else if ((contact.priority === "high" || contact.priority === "critical") && (staleDays ?? 0) >= 30) {
      items.push({
        id: `contact-stale-${contact.id}`,
        kind: "contact",
        entityId: contact.id,
        title: contact.name,
        detail: `High-priority contact has no recent touch in ${staleDays} days.`,
        owner: contact.owner,
        dueAt: lastTouch,
        priority: contact.priority === "critical" ? "critical" : "medium",
        href: `/contacts?lens=stale&select=${toDisplayId(contact.id, "contact")}`,
      });
    }
  }

  for (const account of args.accounts) {
    if (!account.owner && (account.relationshipStage === "Strategic" || account.tier === "strategic")) {
      items.push({
        id: `account-owner-${account.id}`,
        kind: "account",
        entityId: account.id,
        title: account.name,
        detail: "Strategic account is missing an owner.",
        priority: "medium",
        href: `/contacts?object=accounts&lens=missing-owner&select=${toDisplayId(account.id, "account")}`,
      });
    }
  }

  if (args.unmatchedEmailCount > 0) {
    items.push({
      id: "unmatched-emails",
      kind: "email",
      title: "Unmatched email queue",
      detail: `${args.unmatchedEmailCount} email${args.unmatchedEmailCount === 1 ? "" : "s"} need contact matching.`,
      priority: args.unmatchedEmailCount >= 10 ? "high" : "medium",
      href: "/contacts?object=health",
    });
  }

  const stateIndex = args.actionStateIndex;
  const now = Date.now();
  const rank: Record<CRMConsoleQueuePriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return items
    .filter((item) => {
      const state = stateIndex.get(item.id);
      if (!state) return true;
      if (state.ignoredAt) return false;
      if (!state.snoozedUntil) return true;
      return new Date(state.snoozedUntil).getTime() <= now;
    })
    .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
    .slice(0, 75);
}

async function loadCrmStore(): Promise<CRMStore> {
  if (shouldUseSupabaseBackend()) return readSupabaseCrmStore();
  const { readStore } = await import("@/lib/crm/store");
  return readStore();
}

export async function buildCRMConsolePayload(): Promise<CRMConsolePayload> {
  const startedAt = Date.now();
  const degradedSources: string[] = [];
  const useSupabase = shouldUseSupabaseBackend();
  const supabaseConfig = hasSupabaseServerConfig();
  const store = await loadCrmStore();
  const contacts = store.contacts.filter((contact) => !contact.deletedAt);
  const accounts = store.accounts.filter((account) => !account.deletedAt);
  const activities = store.activities;
  const opportunities = store.opportunities.filter((opportunity) => !opportunity.deletedAt);
  let leads: InboundLeadRecord[] = [];
  let unmatched: { id: string }[] = [];
  let bdDrafts: { id: string; status?: string }[] = [];
  let actionStateIndex = new Map<string, { ignoredAt?: string; snoozedUntil?: string }>();
  try {
    if (useSupabase) {
      leads = await listSupabaseInboundLeads();
    } else {
      const { listInboundLeads } = await import("@/modules/revenue/inboundLeadsStore");
      leads = listInboundLeads();
    }
  } catch {
    degradedSources.push("inbound-leads");
  }
  try {
    if (useSupabase) {
      degradedSources.push("unmatched-emails");
    } else {
      const { getPendingUnmatchedEmails } = await import("@/lib/crm/unmatchedEmails");
      unmatched = getPendingUnmatchedEmails();
    }
  } catch {
    degradedSources.push("unmatched-emails");
  }
  try {
    if (useSupabase) {
      degradedSources.push("bd-drafts");
    } else {
      const { listBDEmailDrafts } = await import("@/lib/crm/bdDrafts");
      bdDrafts = listBDEmailDrafts(200).filter((draft) => draft.status === "pending_approval");
    }
  } catch {
    degradedSources.push("bd-drafts");
  }
  try {
    if (!useSupabase) {
      const { getActionQueueStateIndex } = await import("@/lib/crm/actionQueueState");
      actionStateIndex = getActionQueueStateIndex();
    }
  } catch {
    degradedSources.push("action-queue-state");
  }
  const configuredReadModel = useSupabase ? "postgres" as const : "json" as const;
  const sourceMode = useSupabase ? "supabase" as const : "local-json" as const;
  const activityIndex = newestActivityByContact(activities);

  const openOpportunities = opportunities.filter((opportunity) => OPEN_OPPORTUNITY_STAGES.has(opportunity.stage));
  const overdueOpportunities = openOpportunities.filter((opportunity) => isOverdueDate(opportunity.nextStepDueDate));
  const noNextStepOpportunities = openOpportunities.filter((opportunity) => !opportunity.nextStep?.trim());
  const atRiskOpportunities = openOpportunities.filter((opportunity) => ["At Risk", "Critical"].includes(computeOpportunityHealth(opportunity).status));
  const activeLeads = leads.filter((lead) => ACTIVE_LEAD_STATUSES.has(lead.status));
  const unassignedLeads = activeLeads.filter((lead) => !lead.assignedTo);
  const staleLeads = activeLeads.filter((lead) => !lead.convertedToContactId && (daysSince(lead.receivedAt) ?? 0) >= 3);
  const staleContacts = contacts.filter((contact) => {
    const lastTouch = contactLastTouch(contact, activityIndex);
    return (daysSince(lastTouch) ?? 0) >= 30;
  });
  const contactsByAccount = contacts.reduce((map, contact) => {
    if (!contact.accountId) return map;
    map.set(contact.accountId, (map.get(contact.accountId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());

  const queue = buildQueueItems({
    contacts,
    accounts,
    opportunities,
    leads,
    unmatchedEmailCount: unmatched.length,
    activityIndex,
    actionStateIndex,
  });

  const healthSummary: CRMConsoleHealthItem[] = [
    {
      key: "overdueOpportunities",
      label: "Overdue opportunities",
      value: overdueOpportunities.length,
      tone: healthTone(overdueOpportunities.length, 1, 5),
      detail: "Open opportunities with past-due next steps.",
    },
    {
      key: "noNextStepOpportunities",
      label: "Missing next steps",
      value: noNextStepOpportunities.length,
      tone: healthTone(noNextStepOpportunities.length, 1, 5),
      detail: "Open opportunities without a next action.",
    },
    {
      key: "atRiskOpportunities",
      label: "At-risk opportunities",
      value: atRiskOpportunities.length,
      tone: healthTone(atRiskOpportunities.length, 1, 5),
      detail: "Open opportunities with At Risk or Critical health score.",
    },
    {
      key: "unassignedLeads",
      label: "Unassigned active leads",
      value: unassignedLeads.length,
      tone: healthTone(unassignedLeads.length, 1, 10),
      detail: "Active leads that need an owner.",
    },
    {
      key: "staleLeads",
      label: "Stale active leads",
      value: staleLeads.length,
      tone: healthTone(staleLeads.length, 1, 10),
      detail: "Active leads older than 3 days without conversion.",
    },
    {
      key: "staleContacts",
      label: "Stale contacts",
      value: staleContacts.length,
      tone: healthTone(staleContacts.length, 25, 100),
      detail: "Contacts with no activity, email, or touch in 30+ days.",
    },
    {
      key: "missingContactOwner",
      label: "Contacts missing owner",
      value: contacts.filter((contact) => !contact.owner).length,
      tone: healthTone(contacts.filter((contact) => !contact.owner).length, 25, 100),
      detail: "Contacts that are not assigned to a relationship owner.",
    },
    {
      key: "missingAccountOwner",
      label: "Accounts missing owner",
      value: accounts.filter((account) => !account.owner).length,
      tone: healthTone(accounts.filter((account) => !account.owner).length, 25, 100),
      detail: "Accounts that are not assigned to a relationship owner.",
    },
    {
      key: "unmatchedEmails",
      label: "Unmatched emails",
      value: unmatched.length,
      tone: healthTone(unmatched.length, 1, 10),
      detail: "Inbound/sync emails that could not be matched to contacts.",
    },
  ];

  const generatedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  return {
    generatedAt,
    durationMs,
    backend: {
      status: "ok",
      backend: useSupabase ? "supabase" : "local-json",
      readModel: configuredReadModel,
      readPath: "store-abstraction",
      sourceMode,
      urlConfigured: supabaseConfig.urlConfigured,
      secretConfigured: supabaseConfig.serviceRoleConfigured,
    },
    diagnostics: {
      generatedAt,
      durationMs,
      degradedSources,
      readPath: "store-abstraction",
      readModelNote: useSupabase ? "Console aggregates from Supabase CRM tables." : "Console aggregates from the local JSON CRM store.",
      recordCounts: {
        accounts: accounts.length,
        contacts: contacts.length,
        activities: activities.length,
        opportunities: opportunities.length,
      },
    },
    counts: {
      contacts: contacts.length,
      accounts: accounts.length,
      activities: activities.length,
      opportunities: opportunities.length,
      openOpportunities: openOpportunities.length,
      leads: leads.length,
      activeLeads: activeLeads.length,
      unmatchedEmails: unmatched.length,
      queue: queue.length,
      bdDrafts: bdDrafts.length,
    },
    accounts,
    contacts,
    activities,
    opportunities,
    leadsSummary: {
      total: leads.length,
      active: activeLeads.length,
      high: unassignedLeads.length,
      medium: staleLeads.length,
    },
    queueSummary: {
      total: queue.length,
      critical: queue.filter((item) => item.priority === "critical").length,
      high: queue.filter((item) => item.priority === "high").length,
      medium: queue.filter((item) => item.priority === "medium").length,
      low: queue.filter((item) => item.priority === "low").length,
      unmatchedEmails: unmatched.length,
      pendingDrafts: bdDrafts.length,
    },
    healthSummary,
    queue,
    reporting: {
      leads: {
        total: leads.length,
        active: activeLeads.length,
        unassigned: unassignedLeads.length,
        stale: staleLeads.length,
        status: distribution(leads, (lead) => lead.status, (key) => LEAD_STATUS_LABELS[key] ?? key),
        type: distribution(leads, (lead) => lead.type, (key) => LEAD_TYPE_LABELS[key] ?? key),
        market: distribution(leads, (lead) => lead.market, (key) => LEAD_MARKET_LABELS[key] ?? key),
        source: distribution(leads, (lead) => lead.source, (key) => LEAD_SOURCE_LABELS[key] ?? key),
      },
      accounts: {
        total: accounts.length,
        missingOwner: accounts.filter((account) => !account.owner).length,
        missingWebsite: accounts.filter((account) => !account.website && !account.domain).length,
        noLinkedContacts: accounts.filter((account) => !contactsByAccount.get(account.id)).length,
        strategic: accounts.filter((account) => account.relationshipStage === "Strategic" || account.tier === "strategic" || account.tier === "enterprise").length,
      },
      opportunities: {
        total: opportunities.length,
        open: openOpportunities.length,
        overdue: overdueOpportunities.length,
        missingNextStep: noNextStepOpportunities.length,
        pipelineValue: openOpportunities.reduce((sum, opportunity) => sum + (Number.isFinite(opportunity.value) ? opportunity.value : 0), 0),
        stage: distribution(opportunities, (opportunity) => opportunity.stage),
      },
      contacts: {
        total: contacts.length,
        missingOwner: contacts.filter((contact) => !contact.owner).length,
        stale: staleContacts.length,
        withoutAccount: contacts.filter((contact) => !contact.accountId).length,
        followUpNeeded: contacts.filter((contact) => contact.followUpState && contact.followUpState !== "none").length,
      },
    },
    search: {
      leads: leads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        companyName: lead.companyName,
        contactName: lead.contactName,
        email: lead.email,
        type: lead.type,
        status: lead.status,
        assignedTo: lead.assignedTo,
        receivedAt: lead.receivedAt,
      })),
    },
  };
}
