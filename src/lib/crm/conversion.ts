import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import { normalizeOpportunityStage, type Opportunity } from "@/data/opportunities";
import { matchOrCreateAccount, getDomainFromEmail, domainToCompanyName } from "@/lib/crm/contactMatcher";
import { isCRMOwner } from "@/lib/crm/owners";
import { type CRMStore } from "@/lib/crm/store";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export type LeadConvertPath = "A" | "B" | "C";

export interface LeadConversionResult {
  leadId: string;
  contact: Contact;
  account?: Account;
  accountCreated: boolean;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitName(lead: InboundLeadRecord): string {
  return lead.contactName || lead.name || lead.email?.split("@")[0] || "Unknown Lead";
}

function isInstallProgramLead(lead: InboundLeadRecord): boolean {
  return lead.type === "academy-la" || lead.type === "academy-miami";
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

function buildContact(lead: InboundLeadRecord, accountId?: string): Contact {
  const name = splitName(lead);
  return {
    id: generateId("c"),
    name,
    company: lead.companyName,
    accountId,
    emails: lead.email ? [lead.email.toLowerCase().trim()] : [],
    phone: lead.phone,
    tags: [],
    source: lead.source ? `Inbound: ${lead.source}` : "Inbound Lead",
    owner: isCRMOwner(lead.assignedTo) ? lead.assignedTo : undefined,
    interests: [],
    stage: "New",
    followUpState: "none",
    provenance: "manual",
    interactions: [],
    convertedFromLeadId: lead.id,
  };
}

export function convertLeadInStore(
  store: CRMStore,
  lead: InboundLeadRecord,
  path: LeadConvertPath,
  opts: { existingAccountId?: string; contactOverrides?: Partial<Contact>; accountOverrides?: Partial<Account> } = {},
): LeadConversionResult {
  if (lead.convertedToContactId || lead.crmContactId) {
    throw new Error("LEAD_ALREADY_CONVERTED");
  }

  let account: Account | undefined;
  let accountCreated = false;

  if (path === "C") {
    if (!opts.existingAccountId) throw new Error("EXISTING_ACCOUNT_REQUIRED");
    account = store.accounts.find((item) => item.id === opts.existingAccountId && !item.deletedAt);
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
  } else if (path === "B" && isInstallProgramLead(lead)) {
    const academyName = getInstallProgramAccountName(lead);
    const existing = store.accounts.find((item) => item.name.toLowerCase() === academyName.toLowerCase() && !item.deletedAt);
    account = existing ?? {
      id: generateId("acc"),
      name: academyName,
      type: "Client",
      subType: "Professional Services",
      operatingMarket: getInstallProgramLocation(lead),
      interests: [lead.type === "academy-la" ? "Half-Day Install" : "Full-Day Install"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provenance: "manual",
      convertedFromLeadId: lead.id,
      recordType: "company",
    };
    if (!existing) {
      store.accounts.push(account);
      accountCreated = true;
    }
  } else if (path === "B") {
    const contactName = splitName(lead);
    account = {
      id: generateId("acc"),
      name: contactName,
      type: "Prospect",
      operatingMarket: lead.market === "miami" ? "Miami" : lead.market === "la" ? "Los Angeles" : "Multi-Market",
      owner: isCRMOwner(lead.assignedTo) ? lead.assignedTo : undefined,
      interests: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      provenance: "manual",
      convertedFromLeadId: lead.id,
      ...opts.accountOverrides,
      recordType: "person_account",
    };
    store.accounts.push(account);
    accountCreated = true;
  } else {
    const domain = getDomainFromEmail(lead.email ?? "");
    if (opts.existingAccountId) {
      account = store.accounts.find((item) => item.id === opts.existingAccountId && !item.deletedAt);
      if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    } else {
      const companyName = lead.companyName || (domain ? domainToCompanyName(domain) : lead.name);
      const matched = matchOrCreateAccount(store, companyName);
      account = matched.account;
      accountCreated = matched.created;
    }
    account = {
      ...account,
      domain: account.domain || domain || undefined,
      owner: account.owner || (isCRMOwner(lead.assignedTo) ? lead.assignedTo : undefined),
      interests: account.interests ?? [],
      convertedFromLeadId: accountCreated ? lead.id : account.convertedFromLeadId,
      ...opts.accountOverrides,
      recordType: "company",
      updatedAt: new Date().toISOString(),
    };
    const idx = store.accounts.findIndex((item) => item.id === account!.id);
    if (idx !== -1) store.accounts[idx] = account;
  }

  if (!account) throw new Error("ACCOUNT_NOT_FOUND");

  const contact = {
    ...buildContact(lead, account.id),
    ...opts.contactOverrides,
    accountId: account.id,
    convertedFromLeadId: lead.id,
  };
  store.contacts.push(contact);

  return { leadId: lead.id, contact, account, accountCreated };
}

export function promoteAccountInStore(
  store: CRMStore,
  accountId: string,
  body: { opportunityName: string; stage?: Opportunity["stage"]; value: number; ownerId?: string; contactIds?: string[] },
): Opportunity {
  const account = store.accounts.find((item) => item.id === accountId && !item.deletedAt);
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");
  const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [];
  const firstContact = contactIds[0] || store.contacts.find((contact) => contact.accountId === accountId && !contact.deletedAt)?.id;
  if (!firstContact) throw new Error("CONTACT_REQUIRED");
  if (!store.contacts.some((contact) => contact.id === firstContact && !contact.deletedAt)) throw new Error("CONTACT_NOT_FOUND");

  const now = new Date().toISOString();
  const opportunity: Opportunity = {
    id: generateId("opp"),
    name: body.opportunityName?.trim() || `${account.name} - Deal`,
    accountId,
    contactId: firstContact,
    opportunityType: account.recordType === "person_account" || account.name.toLowerCase().includes("install") ? "Half-Day Install" : "Hourly Consulting",
    location: account.operatingMarket === "Fort Lauderdale" ? "Fort Lauderdale" : account.operatingMarket === "Los Angeles" ? "Los Angeles" : "Miami",
    stage: normalizeOpportunityStage(body.stage),
    openDate: now.slice(0, 10),
    forecastConfidence: "Medium",
    valueType: account.recordType === "person_account" ? "Project" : "Hourly",
    value: Number.isFinite(body.value) ? body.value : 0,
    source: "Manual",
    owner: isCRMOwner(body.ownerId) ? body.ownerId : "Unassigned",
    nextStep: "Follow up on promoted account",
    nextStepDueDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
    provenance: "manual",
    promotedFromAccountId: accountId,
  };
  store.opportunities.push(opportunity);
  const accountIndex = store.accounts.findIndex((item) => item.id === accountId);
  if (accountIndex !== -1) {
    store.accounts[accountIndex] = { ...store.accounts[accountIndex], lifecycleStage: "opportunity", updatedAt: now };
  }
  return opportunity;
}
