import type { Account } from "@/data/accounts";
import type { Contact, ContactLocation } from "@/data/contacts";
import type { Opportunity } from "@/data/opportunities";
import { createAccount, createContact, getAccounts, getContacts, getOpportunities, updateContact } from "@/lib/crm/store";
import { appendEvent } from "@/modules/revenue/inboundLeadEventsStore";
import { getInboundLead, updateInboundLead } from "@/modules/revenue/inboundLeadsStore";
import type { InboundLeadRecord, InboundLeadStatus } from "@/modules/revenue/inboundLeadsTypes";

const CRM_LINKAGE_TRIGGER_STATUSES = new Set<InboundLeadStatus>([
  "qualified",
  "scheduled",
  "confirmed",
  "paid",
  "active",
]);

export type LeadCrmLinkageMode = "prepare" | "apply-existing" | "promote";
export type LeadCrmLinkageStatus = "already-linked" | "linked-existing" | "review-needed" | "skipped" | "promoted";

type MatchSource =
  | "lead-link"
  | "email"
  | "lead-name"
  | "contact-account"
  | "account-name"
  | "contact-open-opportunity"
  | "account-open-opportunity";

export interface PromoteOptions {
  mergeContactId?: string;
  mergeAccountId?: string;
}

export interface LeadCrmLinkageResult {
  leadId: string;
  mode: LeadCrmLinkageMode;
  triggerStatus: InboundLeadStatus;
  triggeredAt: string;
  status: LeadCrmLinkageStatus;
  linked: {
    contactId?: string;
    accountId?: string;
    opportunityId?: string;
  };
  matchedBy: {
    contact?: MatchSource;
    account?: MatchSource;
    opportunity?: MatchSource;
  };
  recommendations: {
    createContact: boolean;
    createAccount: boolean;
    createOpportunity: boolean;
  };
  notes: string[];
  lead: InboundLeadRecord;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersonName(value?: string): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeEmail(value?: string): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeAccountLabel(value?: string): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function getLeadContactName(lead: InboundLeadRecord): string | null {
  if (lead.contactName?.trim()) return lead.contactName.trim();
  if (lead.type === "academy-la" || lead.type === "academy-miami") return lead.name.trim() || null;
  return null;
}

function getInstallProgramLocation(lead: InboundLeadRecord): "Los Angeles" | "Miami" | "Fort Lauderdale" {
  const metadataLocation = typeof lead.metadata?.location === "string" ? lead.metadata.location.trim().toLowerCase() : "";
  const contentLocation = (lead.content ?? "").toLowerCase();
  const locationHint = `${metadataLocation} ${contentLocation}`;
  if (locationHint.includes("fort lauderdale") || locationHint.includes("ft lauderdale")) return "Fort Lauderdale";
  if (lead.type === "academy-la") return "Los Angeles";
  return "Miami";
}

function getInstallProgramAccountName(lead: InboundLeadRecord): string {
  const location = getInstallProgramLocation(lead);
  if (location === "Los Angeles") return "Example Client Half-Day Installs";
  if (location === "Fort Lauderdale") return "Example Client Full-Day Installs - Fort Lauderdale";
  return "Example Client Full-Day Installs";
}

function getLeadAccountName(lead: InboundLeadRecord): string | null {
  if (lead.type === "academy-la" || lead.type === "academy-miami") return getInstallProgramAccountName(lead);
  if (lead.companyName?.trim()) return lead.companyName.trim();
  if (lead.name?.trim() && lead.contactName?.trim() !== lead.name.trim()) return lead.name.trim();
  return null;
}

function getOpportunityType(lead: InboundLeadRecord): Opportunity["opportunityType"] {
  switch (lead.type) {
    case "academy-la":
      return "Half-Day Install";
    case "academy-miami":
      return "Full-Day Install";
    case "partnership":
      return "Referral Partnership";
    case "corporate":
    default:
      return "Mission Control Build";
  }
}

function getContactById(id?: string): Contact | null {
  if (!id) return null;
  return getContacts().find((contact) => contact.id === id) ?? null;
}

function findContactByEmail(email?: string): Contact | null {
  const targetEmail = normalizeEmail(email);
  if (!targetEmail) return null;
  return getContacts().find((contact) => contact.emails.some((candidate) => normalizeEmail(candidate) === targetEmail)) ?? null;
}

function findContactByLeadName(lead: InboundLeadRecord): Contact | null {
  const targetName = normalizePersonName(getLeadContactName(lead) ?? undefined);
  if (!targetName) return null;
  return getContacts().find((contact) => normalizePersonName(contact.name) === targetName) ?? null;
}

function findAccountByName(name?: string): Account | null {
  const targetName = normalizeAccountLabel(name);
  if (!targetName) return null;
  return getAccounts().find((account) => normalizeAccountLabel(account.name) === targetName) ?? null;
}

function findOpenOpportunityForQualifiedContact(contactId: string, opportunityType: Opportunity["opportunityType"]): Opportunity | null {
  return findOpenOpportunities().find(
    (opportunity) => opportunity.contactId === contactId && opportunity.opportunityType === opportunityType,
  ) ?? null;
}

function findAccountForLead(lead: InboundLeadRecord, contact: Contact | null): { id?: string; matchedBy?: MatchSource; note?: string } {
  if (lead.crmAccountId && getAccounts().some((account) => account.id === lead.crmAccountId)) {
    return { id: lead.crmAccountId, matchedBy: "lead-link" };
  }

  if (contact?.accountId && getAccounts().some((account) => account.id === contact.accountId)) {
    return { id: contact.accountId, matchedBy: "contact-account" };
  }

  const accountName = getLeadAccountName(lead);
  const matched = findAccountByName(accountName ?? undefined);
  if (matched) {
    return { id: matched.id, matchedBy: "account-name" };
  }

  if (lead.type === "academy-la" || lead.type === "academy-miami") {
    return { note: "No Example Client install account exists yet in CRM, install linkage stays in review state." };
  }

  if (accountName && normalizeAccountLabel(accountName)) {
    return { note: `No CRM account matched \"${accountName}\".` };
  }

  return { note: "Lead has no stable account/company name yet, account creation should wait for review." };
}

function findOpportunityForLead(lead: InboundLeadRecord, contactId?: string, accountId?: string): { id?: string; matchedBy?: MatchSource; note?: string } {
  const opportunityType = getOpportunityType(lead);

  if (lead.crmOpportunityId) {
    const existing = findOpenOpportunityById(lead.crmOpportunityId);
    if (existing) return { id: existing.id, matchedBy: "lead-link" };
  }

  if (contactId) {
    const byContact = findOpenOpportunityForQualifiedContact(contactId, opportunityType);
    if (byContact) return { id: byContact.id, matchedBy: "contact-open-opportunity" };
  }

  if (accountId) {
    const accountCandidates = findOpenOpportunitiesByAccount(accountId, opportunityType);
    if (accountCandidates.length === 1) {
      return { id: accountCandidates[0].id, matchedBy: "account-open-opportunity" };
    }
    if (accountCandidates.length > 1) {
      return { note: `Found ${String(accountCandidates.length)} open CRM opportunities for this account, so auto-linking was skipped.` };
    }
  }

  return { note: "No open CRM opportunity matched this qualified lead yet." };
}

function findOpenOpportunityById(id: string): Opportunity | null {
  return findOpenOpportunities().find((opportunity) => opportunity.id === id) ?? null;
}

function findOpenOpportunitiesByAccount(accountId: string, opportunityType: Opportunity["opportunityType"]): Opportunity[] {
  return findOpenOpportunities().filter(
    (opportunity) => opportunity.accountId === accountId && opportunity.opportunityType === opportunityType,
  );
}

function findOpenOpportunities(): Opportunity[] {
  return getOpportunities().filter((opportunity) => ["Discovery", "Propose", "Contracting"].includes(opportunity.stage));
}

function buildMetadata(
  lead: InboundLeadRecord,
  result: Omit<LeadCrmLinkageResult, "lead">,
): Record<string, unknown> {
  const existingMetadata = isObject(lead.metadata) ? lead.metadata : {};
  return {
    ...existingMetadata,
    crmLinkage: {
      version: 1,
      mode: result.mode,
      status: result.status,
      triggerStatus: result.triggerStatus,
      triggeredAt: result.triggeredAt,
      matchedBy: result.matchedBy,
      linked: result.linked,
      recommendations: result.recommendations,
      notes: result.notes,
    },
  };
}

function deriveLocation(lead: InboundLeadRecord): Opportunity["location"] {
  if (lead.type === "academy-la" || lead.type === "academy-miami") return getInstallProgramLocation(lead);
  return "Miami";
}

function deriveAccountType(lead: InboundLeadRecord): Account["type"] {
  if (lead.type === "academy-la" || lead.type === "academy-miami") return "Client";
  if (lead.type === "partnership") return "Partner";
  return "Prospect";
}

function deriveAccountMarket(lead: InboundLeadRecord): Account["operatingMarket"] {
  if (lead.type === "academy-la" || lead.type === "academy-miami") return getInstallProgramLocation(lead);
  if (lead.market === "la") return "Los Angeles";
  if (lead.market === "miami") return "Miami";
  return "Multi-Market";
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function hasDirectLeadLinks(lead: InboundLeadRecord): boolean {
  return Boolean(lead.crmContactId || lead.crmAccountId || lead.crmOpportunityId);
}

export function shouldRunLeadCrmLinkage(previousStatus: InboundLeadStatus, nextStatus: InboundLeadStatus): boolean {
  return !CRM_LINKAGE_TRIGGER_STATUSES.has(previousStatus) && CRM_LINKAGE_TRIGGER_STATUSES.has(nextStatus);
}

export function resolveLeadCrmLinkage(lead: InboundLeadRecord, mode: LeadCrmLinkageMode = "prepare", options?: PromoteOptions): LeadCrmLinkageResult {
  const triggeredAt = new Date().toISOString();
  const notes: string[] = [];

  let contact: Contact | null = getContactById(lead.crmContactId);
  let contactMatch: MatchSource | undefined = contact ? "lead-link" : undefined;

  if (!contact && lead.email) {
    contact = findContactByEmail(lead.email);
    if (contact) contactMatch = "email";
  }

  if (!contact) {
    contact = findContactByLeadName(lead);
    if (contact) contactMatch = "lead-name";
  }

  if (!contact) {
    notes.push(lead.email ? `No CRM contact matched ${lead.email}.` : "No CRM contact matched this lead by email or exact name.");
  }

  const accountResult = findAccountForLead(lead, contact);
  if (accountResult.note) notes.push(accountResult.note);

  const opportunityResult = findOpportunityForLead(lead, contact?.id, accountResult.id);
  if (opportunityResult.note) notes.push(opportunityResult.note);

  const linked = {
    contactId: contact?.id ?? lead.crmContactId,
    accountId: accountResult.id ?? lead.crmAccountId,
    opportunityId: opportunityResult.id ?? lead.crmOpportunityId,
  };

  const matchedBy: LeadCrmLinkageResult["matchedBy"] = {
    contact: contactMatch,
    account: accountResult.matchedBy,
    opportunity: opportunityResult.matchedBy,
  };

  const recommendations = {
    createContact: !linked.contactId,
    createAccount: !linked.accountId,
    createOpportunity: Boolean(linked.contactId && linked.accountId && !linked.opportunityId),
  };

  let status: LeadCrmLinkageStatus = "review-needed";
  if (hasDirectLeadLinks(lead) && !recommendations.createContact && !recommendations.createAccount && !recommendations.createOpportunity) {
    status = "already-linked";
  } else if (!recommendations.createContact && !recommendations.createAccount && !recommendations.createOpportunity) {
    status = "linked-existing";
  }

  if (status === "linked-existing") {
    notes.push("Linked to existing CRM records only, no new CRM records were created.");
  } else if (status === "already-linked") {
    notes.push("Lead already had complete CRM linkage.");
  } else {
    notes.push("Qualification-triggered linkage ran safely, but at least one CRM record still needs review or explicit creation.");
  }

  let nextLead = lead;
  if (mode === "apply-existing") {
    nextLead =
      updateInboundLead(lead.id, {
        crmContactId: linked.contactId,
        crmAccountId: linked.accountId,
        crmOpportunityId: linked.opportunityId,
        metadata: buildMetadata(lead, {
          leadId: lead.id,
          mode,
          triggerStatus: lead.status,
          triggeredAt,
          status,
          linked,
          matchedBy,
          recommendations,
          notes,
        }),
      }) ?? lead;
  }

  if (mode === "promote") {
    // ── Contact resolution ──
    const mergeContactTarget = options?.mergeContactId
      ? getContacts().find((c) => c.id === options.mergeContactId)
      : null;

    if (mergeContactTarget) {
      // Explicit merge into provided contact
      linked.contactId = mergeContactTarget.id;
      matchedBy.contact = "lead-link" as MatchSource;
      const updates: Record<string, unknown> = {};
      if (lead.email && !mergeContactTarget.emails.includes(lead.email)) {
        updates.emails = [...mergeContactTarget.emails, lead.email];
      }
      if (lead.phone && !mergeContactTarget.phone) {
        updates.phone = lead.phone;
      }
      if (!mergeContactTarget.tags.includes("inbound-lead")) {
        updates.tags = [...mergeContactTarget.tags, "inbound-lead"];
      }
      if (Object.keys(updates).length > 0) {
        updateContact(mergeContactTarget.id, updates);
      }
      notes.push(`Merged into existing contact: ${mergeContactTarget.name}`);
    } else if (linked.contactId && !options?.mergeContactId) {
      // Matched during prepare phase — merge data into existing
      const existing = getContacts().find((c) => c.id === linked.contactId);
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (lead.email && !existing.emails.includes(lead.email)) {
          updates.emails = [...existing.emails, lead.email];
        }
        if (lead.phone && !existing.phone) {
          updates.phone = lead.phone;
        }
        if (!existing.tags.includes("inbound-lead")) {
          updates.tags = [...existing.tags, "inbound-lead"];
        }
        if (Object.keys(updates).length > 0) {
          updateContact(existing.id, updates);
        }
        notes.push(`Matched and merged with existing contact: ${existing.name}`);
      }
    } else {
      // Create new contact
      const contactName = getLeadContactName(lead) ?? lead.name;
      const { firstName, lastName } = splitName(contactName);
      const location: ContactLocation = lead.type === "academy-la" ? "Los Angeles"
        : lead.type === "academy-miami" ? "Miami"
        : "Miami";
      const newContact = createContact({
        firstName,
        lastName,
        email: lead.email,
        phone: lead.phone,
        tags: ["inbound-lead"],
        location,
        source: "Inbound Lead",
      });
      linked.contactId = newContact.id;
      matchedBy.contact = "lead-link" as MatchSource;
      notes.push(`Created new contact: ${newContact.name}`);
    }

    // ── Account resolution ──
    const isInstallProgram = lead.type === "academy-la" || lead.type === "academy-miami";

    if (isInstallProgram) {
      // Auto-resolve to house account
      const houseName = getInstallProgramAccountName(lead);
      const houseMarket = getInstallProgramLocation(lead);
      const existingHouse = getAccounts().find(
        (a) => a.name.toLowerCase() === houseName.toLowerCase()
      );
      if (existingHouse) {
        linked.accountId = existingHouse.id;
        matchedBy.account = "account-name" as MatchSource;
        notes.push(`Auto-mapped to ${houseName}`);
      } else {
        const newHouse = createAccount({
          name: houseName,
          type: "Client",
          subType: "Professional Services",
          operatingMarket: houseMarket,
        });
        linked.accountId = newHouse.id;
        matchedBy.account = "lead-link" as MatchSource;
        notes.push(`Created house account: ${houseName}`);
      }
    } else if (options?.mergeAccountId) {
      const mergeTarget = getAccounts().find((a) => a.id === options.mergeAccountId);
      if (mergeTarget) {
        linked.accountId = mergeTarget.id;
        matchedBy.account = "lead-link" as MatchSource;
        notes.push(`Merged into existing account: ${mergeTarget.name}`);
      }
    } else if (linked.accountId) {
      // Matched during prepare phase
      const existing = getAccounts().find((a) => a.id === linked.accountId);
      if (existing) {
        notes.push(`Matched existing account: ${existing.name}`);
      }
    } else {
      // Create new account
      const accountName = getLeadAccountName(lead) ?? getLeadContactName(lead) ?? lead.name;
      const newAccount = createAccount({
        name: accountName,
        type: deriveAccountType(lead),
        subType: "Inbound Lead",
        operatingMarket: deriveAccountMarket(lead),
      });
      linked.accountId = newAccount.id;
      matchedBy.account = "lead-link" as MatchSource;
      notes.push(`Created new account: ${newAccount.name}`);
    }

    // Link contact to account if not already linked
    if (linked.contactId && linked.accountId) {
      const existingContact = getContacts().find((c) => c.id === linked.contactId);
      if (existingContact && !existingContact.accountId) {
        updateContact(linked.contactId, { accountId: linked.accountId });
      }
    }

    // No opportunity creation — that happens later from the CRM
    linked.opportunityId = undefined;
    status = "promoted";
    recommendations.createContact = false;
    recommendations.createAccount = false;
    recommendations.createOpportunity = false;
    notes.push("Opportunity can be created from the CRM when this lead is ready for a deal.");

    // Determine next lead status
    const promotableStatuses: InboundLeadStatus[] = ["new", "contacted"];
    const nextStatus: InboundLeadStatus = promotableStatuses.includes(lead.status) ? "qualified" : lead.status;

    nextLead =
      updateInboundLead(lead.id, {
        status: nextStatus,
        crmContactId: linked.contactId,
        crmAccountId: linked.accountId,
        crmOpportunityId: undefined,
        metadata: buildMetadata(lead, {
          leadId: lead.id,
          mode,
          triggerStatus: lead.status,
          triggeredAt,
          status,
          linked,
          matchedBy,
          recommendations,
          notes,
        }),
      }) ?? lead;

    // Log conversion event
    appendEvent({
      leadId: lead.id,
      type: "conversion",
      actor: "system",
      timestamp: triggeredAt,
      metadata: {
        mode: "promote",
        contactId: linked.contactId,
        accountId: linked.accountId,
        previousStatus: lead.status,
        newStatus: nextStatus,
      },
    });
  }

  return {
    leadId: lead.id,
    mode,
    triggerStatus: lead.status,
    triggeredAt,
    status,
    linked,
    matchedBy,
    recommendations,
    notes,
    lead: nextLead,
  };
}

export function runLeadCrmLinkageById(id: string, mode: LeadCrmLinkageMode = "prepare", options?: PromoteOptions): LeadCrmLinkageResult | null {
  const lead = getInboundLead(id);
  if (!lead) return null;
  return resolveLeadCrmLinkage(lead, mode, options);
}
