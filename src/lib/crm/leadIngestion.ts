import type { Account, AccountSubType, AccountType } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type {
  Opportunity,
  OpportunityLocation,
  OpportunityStage,
  OpportunityType,
} from "@/data/opportunities";
import {
  createAccount,
  createContact,
  createOpportunity,
  getAccounts,
  getContacts,
  getOpportunities,
  linkContactToAccount,
  updateContact,
} from "@/lib/crm/store";

export type InboundOpportunityType =
  | "Half-Day Install"
  | "Full-Day Install"
  | "Hourly Consulting"
  | "Event - General Admission"
  | "Event - VIP"
  | "OpenClaw Install Day"
  | "AI Consulting"
  | "Mission Control Build"
  | "Referral Partnership"
  | "Install Program"
  | "Corporate Events"
  | "Brand Partnerships";

export interface InboundLeadInput {
  opportunityType: InboundOpportunityType;
  contact: {
    firstName?: string;
    lastName?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    tags?: string[];
    title?: string;
    notes?: string;
  };
  account?: {
    name?: string;
    website?: string;
    notes?: string;
    category?: string;
  };
  opportunity?: {
    name?: string;
    location?: Opportunity["location"];
    openDate?: string;
    closeDate?: string;
    forecastConfidence?: Opportunity["forecastConfidence"];
    valueType?: Opportunity["valueType"];
    value?: number;
    source?: Opportunity["source"];
    owner?: Opportunity["owner"];
    nextStep?: string;
    nextStepDueDate?: string;
    notes?: string;
  };
}

export interface InboundLeadResult {
  contact: Contact;
  account: Account;
  opportunity: Opportunity;
  created: {
    contact: boolean;
    account: boolean;
    opportunity: boolean;
  };
  duplicateOpenOpportunity: boolean;
}

const OPEN_OPPORTUNITY_STAGES = new Set<OpportunityStage>(["Discovery", "Propose", "Contracting"]);
const ACADEMY_ACCOUNT_NAME = "Example Client Install Clients";
const ACADEMY_LOCATION_ACCOUNTS: Record<"Miami" | "Fort Lauderdale" | "Los Angeles", string> = {
  Miami: "Example Client Full-Day Installs",
  "Fort Lauderdale": "Example Client Full-Day Installs - Fort Lauderdale",
  "Los Angeles": "Example Client Half-Day Installs",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeEmail(email?: string): string | null {
  if (!email) return null;
  const normalized = normalizeWhitespace(email).toLowerCase();
  return normalized || null;
}

export function normalizeAccountName(name?: string): string | null {
  if (!name) return null;
  return normalizeWhitespace(name)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited)\b/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function parseFullName(fullName?: string): { firstName: string; lastName: string } {
  const cleaned = normalizeWhitespace(fullName || "");
  if (!cleaned) return { firstName: "Unknown", lastName: "Lead" };
  const parts = cleaned.split(" ");
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Lead",
  };
}

function resolveContactName(input: InboundLeadInput["contact"]): { firstName: string; lastName: string } {
  if (input.firstName || input.lastName) {
    return {
      firstName: normalizeWhitespace(input.firstName || "Unknown"),
      lastName: normalizeWhitespace(input.lastName || "Lead"),
    };
  }

  return parseFullName(input.fullName);
}

export function findContactByNormalizedEmail(email?: string): Contact | null {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  return getContacts().find((contact) =>
    contact.emails.some((candidate) => normalizeEmail(candidate) === normalizedEmail)
  ) ?? null;
}

export function findAccountByNormalizedName(name?: string): Account | null {
  const normalizedName = normalizeAccountName(name);
  if (!normalizedName) return null;

  return getAccounts().find((account) => normalizeAccountName(account.name) === normalizedName) ?? null;
}

function mapOpportunityType(type: InboundOpportunityType): OpportunityType {
  if (type === "Install Program" || type === "OpenClaw Install Day") return "Half-Day Install";
  if (type === "Corporate Events") return "Mission Control Build";
  if (type === "Brand Partnerships") return "Referral Partnership";
  return type;
}

function getAccountDefaults(type: InboundOpportunityType): Pick<Account, "type" | "subType" | "operatingMarket"> {
  if (type === "Half-Day Install" || type === "Full-Day Install" || type === "OpenClaw Install Day" || type === "Install Program") {
    return {
      type: "Client",
      subType: "Professional Services",
      operatingMarket: "Miami",
    };
  }

  if (type === "Mission Control Build" || type === "AI Consulting" || type === "Corporate Events") {
    return {
      type: "Client",
      subType: "Professional Services",
      operatingMarket: "Los Angeles",
    };
  }

  return {
    type: "Partner",
    subType: "Referral Partner",
    operatingMarket: "Los Angeles",
  };
}

function mapMarketToOpportunityLocation(market: Account["operatingMarket"]): OpportunityLocation {
  switch (market) {
    case "Miami":
      return "Miami";
    case "Fort Lauderdale":
      return "Fort Lauderdale";
    case "Los Angeles":
      return "Los Angeles";
    case "International":
    case "Multi-Market":
    default:
      return "Miami";
  }
}

function normalizeLocationHint(value?: string): "Miami" | "Fort Lauderdale" | "Los Angeles" | null {
  if (!value) return null;
  const normalized = normalizeWhitespace(value).toLowerCase();
  if (normalized === "miami") return "Miami";
  if (normalized === "fort lauderdale" || normalized === "ft lauderdale" || normalized === "ft. lauderdale") {
    return "Fort Lauderdale";
  }
  if (normalized === "los angeles" || normalized === "la" || normalized === "l.a.") return "Los Angeles";
  return null;
}

function resolveInstallProgramLocation(input: InboundLeadInput): "Miami" | "Fort Lauderdale" | "Los Angeles" {
  return normalizeLocationHint(input.opportunity?.location)
    ?? normalizeLocationHint(input.account?.name)
    ?? normalizeLocationHint(input.account?.category)
    ?? "Miami";
}

function academyAccountName(input: InboundLeadInput): string {
  return ACADEMY_LOCATION_ACCOUNTS[resolveInstallProgramLocation(input)] ?? ACADEMY_ACCOUNT_NAME;
}

function defaultOpportunityName(accountName: string, contactName: string, type: InboundOpportunityType): string {
  if (type === "Half-Day Install" || type === "Full-Day Install" || type === "OpenClaw Install Day" || type === "Install Program") return `${contactName} ${mapOpportunityType(type)} Lead`;
  return `${accountName} ${type}`;
}

function defaultOpportunityOwner(type: InboundOpportunityType): Opportunity["owner"] {
  switch (type) {
    case "Half-Day Install":
    case "Full-Day Install":
    case "Install Program":
    case "OpenClaw Install Day":
      return "Mission Agent";
    case "AI Consulting":
    case "Hourly Consulting":
    case "Mission Control Build":
    case "Corporate Events":
      return "Alex";
    case "Referral Partnership":
    case "Brand Partnerships":
      return "Mission Agent";
    default:
      return "Unassigned";
  }
}

function defaultNextStep(type: InboundOpportunityType): string {
  switch (type) {
    case "Half-Day Install":
    case "Full-Day Install":
    case "Install Program":
    case "OpenClaw Install Day":
      return "Schedule install discovery call and confirm scope";
    case "AI Consulting":
      return "Schedule consulting discovery call and confirm operating pain";
    case "Mission Control Build":
    case "Corporate Events":
      return "Schedule build discovery call and confirm Mission Control scope";
    case "Referral Partnership":
    case "Brand Partnerships":
      return "Review fit and draft referral partnership follow-up";
    default:
      return "Follow up with lead";
  }
}

export function findOpenOpportunityForContact(contactId: string, opportunityType: InboundOpportunityType): Opportunity | null {
  const mappedType = mapOpportunityType(opportunityType);
  return getOpportunities().find((opportunity) =>
    opportunity.contactId === contactId &&
    opportunity.opportunityType === mappedType &&
    OPEN_OPPORTUNITY_STAGES.has(opportunity.stage)
  ) ?? null;
}

export function ingestInboundLead(input: InboundLeadInput): InboundLeadResult {
  const contactName = resolveContactName(input.contact);
  const normalizedEmail = normalizeEmail(input.contact.email);
  let contact = findContactByNormalizedEmail(normalizedEmail ?? undefined);
  let createdContact = false;

  const isInstallType = input.opportunityType === "Half-Day Install" || input.opportunityType === "Full-Day Install" || input.opportunityType === "Install Program" || input.opportunityType === "OpenClaw Install Day";
  const academyLocation = isInstallType ? resolveInstallProgramLocation(input) : null;
  const accountName = isInstallType
    ? academyAccountName(input)
    : normalizeWhitespace(input.account?.name || "");

  if (!accountName) {
    throw new Error("ACCOUNT_NAME_REQUIRED");
  }

  let account = findAccountByNormalizedName(accountName);
  let createdAccount = false;

  if (!account) {
    const defaults = getAccountDefaults(input.opportunityType);
    account = createAccount({
      name: accountName,
      type: defaults.type as AccountType,
      subType: defaults.subType as AccountSubType,
      operatingMarket: academyLocation ?? defaults.operatingMarket,
      website: input.account?.website,
      notes: input.account?.notes,
      category: input.account?.category,
    });
    createdAccount = true;
  }

  if (!contact) {
    contact = createContact({
      firstName: contactName.firstName,
      lastName: contactName.lastName,
      email: normalizedEmail ?? undefined,
      phone: input.contact.phone,
      accountId: account.id,
      tags: input.contact.tags ?? [input.opportunityType],
    });
    createdContact = true;
  } else {
    const nextEmails = normalizedEmail && !contact.emails.some((email) => normalizeEmail(email) === normalizedEmail)
      ? [...contact.emails, normalizedEmail]
      : contact.emails;

    const nextTags = Array.from(new Set([...(contact.tags ?? []), ...(input.contact.tags ?? []), input.opportunityType]));
    const nextCompany = isInstallType ? account.name : (contact.company || account.name);

    updateContact(contact.id, {
      accountId: isInstallType ? account.id : (contact.accountId || account.id),
      emails: nextEmails,
      phone: contact.phone || input.contact.phone,
      title: contact.title || input.contact.title,
      company: nextCompany,
      notes: contact.notes || input.contact.notes,
      tags: nextTags,
    });

    if (!contact.accountId || isInstallType) {
      linkContactToAccount(contact.id, account.id);
    }

    contact = getContacts().find((candidate) => candidate.id === contact!.id) ?? contact;
  }

  const existingOpportunity = findOpenOpportunityForContact(contact.id, input.opportunityType);
  if (existingOpportunity) {
    return {
      contact,
      account,
      opportunity: existingOpportunity,
      created: {
        contact: createdContact,
        account: createdAccount,
        opportunity: false,
      },
      duplicateOpenOpportunity: true,
    };
  }

  const openDate = input.opportunity?.openDate || new Date().toISOString().slice(0, 10);
  const defaultStage: OpportunityStage = "Discovery";

  const opportunity = createOpportunity({
    accountId: account.id,
    contactId: contact.id,
    name: input.opportunity?.name || defaultOpportunityName(account.name, contact.name, input.opportunityType),
    opportunityType: mapOpportunityType(input.opportunityType),
    location: input.opportunity?.location || academyLocation || mapMarketToOpportunityLocation(account.operatingMarket),
    stage: defaultStage,
    openDate,
    closeDate: input.opportunity?.closeDate || undefined,
    forecastConfidence: input.opportunity?.forecastConfidence || "Low",
    valueType: input.opportunity?.valueType || (mapOpportunityType(input.opportunityType) === "Hourly Consulting" ? "Hourly" : "Project"),
    value: input.opportunity?.value ?? 0,
    source: input.opportunity?.source || "Manual",
    owner: input.opportunity?.owner || defaultOpportunityOwner(input.opportunityType),
    nextStep: input.opportunity?.nextStep || defaultNextStep(input.opportunityType),
    nextStepDueDate: input.opportunity?.nextStepDueDate || openDate,
    notes: input.opportunity?.notes,
  });

  return {
    contact,
    account,
    opportunity,
    created: {
      contact: createdContact,
      account: createdAccount,
      opportunity: true,
    },
    duplicateOpenOpportunity: false,
  };
}
