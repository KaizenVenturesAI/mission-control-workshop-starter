import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { Opportunity, OpportunityOwner, OpportunityType } from "@/data/opportunities";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import {
  WEBSITE_OFFERING_LABELS,
  normalizeWebsiteEmail,
  normalizeWebsiteString,
  type WebsiteLeadPayload,
  type WebsiteWorkflowMetadata,
} from "@/lib/website-leads/schema";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

type CrmMappingResult = NonNullable<WebsiteWorkflowMetadata["crmMapping"]>;
type AccountCreateInput = Parameters<typeof import("@/lib/crm/store").createAccount>[0];
type ContactCreateInput = Parameters<typeof import("@/lib/crm/store").createContact>[0];
type OpportunityCreateInput = Parameters<typeof import("@/lib/crm/store").createOpportunity>[0];
type ContactUpdateInput = Parameters<typeof import("@/lib/crm/store").updateContact>[1];
type CrmAdapter = {
  getContacts: () => Promise<Contact[]> | Contact[];
  getAccounts: () => Promise<Account[]> | Account[];
  getOpportunities: () => Promise<Opportunity[]> | Opportunity[];
  createAccount: (data: AccountCreateInput) => Promise<Account> | Account;
  createContact: (data: ContactCreateInput) => Promise<Contact> | Contact;
  createOpportunity: (data: OpportunityCreateInput) => Promise<Opportunity> | Opportunity;
  updateContact: (id: string, data: ContactUpdateInput) => Promise<Contact | null> | Contact | null;
};

const OPEN_STAGES = new Set<Opportunity["stage"]>(["Discovery", "Propose", "Contracting"]);
const CONSUMER_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

function normalizeName(value?: string): string {
  return normalizeWebsiteString(value)
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|limited)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getEmailDomain(email?: string): string | undefined {
  const domain = normalizeWebsiteEmail(email).split("@")[1]?.trim();
  if (!domain || !domain.includes(".") || CONSUMER_EMAIL_DOMAINS.has(domain)) return undefined;
  return domain;
}

function domainToCompanyName(domain: string): string {
  return domain
    .split(".")[0]
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function splitName(value?: string): { firstName: string; lastName: string; fullName: string } {
  const fullName = normalizeWebsiteString(value) || "Unknown Lead";
  const parts = fullName.split(" ");
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Lead",
    fullName,
  };
}

function accountDomain(account: Account): string | undefined {
  const value = normalizeWebsiteString(account.domain || account.website);
  if (!value) return undefined;
  return value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.toLowerCase();
}

function findContactByEmail(contacts: Contact[], email?: string): Contact | undefined {
  const normalized = normalizeWebsiteEmail(email);
  if (!normalized) return undefined;
  return contacts.find((contact) => contact.emails.some((candidate) => normalizeWebsiteEmail(candidate) === normalized));
}

function findAccount(accounts: Account[], lead: InboundLeadRecord, research: NonNullable<WebsiteWorkflowMetadata["research"]> | undefined, domain?: string): Account | undefined {
  const knownId = lead.crmAccountId || research?.crmAccountId || research?.recommendedAccount?.crmAccountId;
  if (knownId) {
    const account = accounts.find((candidate) => candidate.id === knownId && !candidate.deletedAt);
    if (account) return account;
  }

  const companyName = normalizeName(lead.companyName || research?.recommendedAccount?.name);
  return accounts.find((account) => {
    if (account.deletedAt) return false;
    if (domain && accountDomain(account) === domain) return true;
    return Boolean(companyName && normalizeName(account.name) === companyName);
  });
}

function opportunityTypeForOffering(offering: WebsiteLeadPayload["offering"]): OpportunityType {
  if (offering === "agentic-workforce") return "Mission Control Build";
  if (offering === "openclaw-events") return "Event - General Admission";
  if (offering === "private-coaching") return "AI Consulting";
  return "AI Consulting";
}

function valueForBudget(budget: WebsiteLeadPayload["budget"]): number {
  if (budget === "under-5k") return 2500;
  if (budget === "5k-15k") return 10000;
  if (budget === "15k-50k") return 25000;
  if (budget === "50k-plus") return 50000;
  return 5000;
}

function ownerForResearch(research?: NonNullable<WebsiteWorkflowMetadata["research"]>): OpportunityOwner {
  if (research?.recommendedOwner === "Alex" || research?.recommendedOwner === "Mission Agent") return research.recommendedOwner;
  return "Alex";
}

function recordOwner(owner: OpportunityOwner): "Alex" | "Mission Agent" | "Morgan" | undefined {
  if (owner === "Alex" || owner === "Mission Agent" || owner === "Morgan") return owner;
  return undefined;
}

function nextStepDueDate(payload: WebsiteLeadPayload): string {
  const now = new Date();
  const days = payload.timeline === "this-month" ? 1 : payload.timeline === "this-quarter" ? 2 : 5;
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

function buildOpportunityNotes(payload: WebsiteLeadPayload, research?: NonNullable<WebsiteWorkflowMetadata["research"]>): string {
  return [
    `Website lead: ${WEBSITE_OFFERING_LABELS[payload.offering]}.`,
    `Budget: ${payload.budget}. Timeline: ${payload.timeline}. Team: ${payload.team}.`,
    normalizeWebsiteString(payload.role) ? `Role: ${normalizeWebsiteString(payload.role)}.` : "",
    normalizeWebsiteString(payload.stack) ? `Stack: ${normalizeWebsiteString(payload.stack)}.` : "",
    normalizeWebsiteString(payload.successMetric) ? `Success metric: ${normalizeWebsiteString(payload.successMetric)}.` : "",
    normalizeWebsiteString(payload.message),
    research?.researchSummary ? `Research: ${research.researchSummary}.` : "",
  ].filter(Boolean).join("\n");
}

function findOpenOpportunity(opportunities: Opportunity[], contactId: string, accountId: string, type: OpportunityType): Opportunity | undefined {
  return opportunities.find((opportunity) =>
    !opportunity.deletedAt &&
    OPEN_STAGES.has(opportunity.stage) &&
    opportunity.opportunityType === type &&
    (opportunity.contactId === contactId || opportunity.accountId === accountId)
  );
}

async function getCrmAdapter(): Promise<CrmAdapter> {
  if (shouldUseSupabaseBackend()) {
    const crm = await import("@/lib/crm/supabaseStore");
    return {
      getContacts: crm.getSupabaseContacts,
      getAccounts: crm.getSupabaseAccounts,
      getOpportunities: () => crm.getSupabaseOpportunities(),
      createAccount: crm.createSupabaseAccount,
      createContact: crm.createSupabaseContact,
      createOpportunity: crm.createSupabaseOpportunity,
      updateContact: crm.updateSupabaseContact,
    };
  }

  const crm = await import("@/lib/crm/store");
  return {
    getContacts: crm.getContacts,
    getAccounts: crm.getAccounts,
    getOpportunities: crm.getOpportunities,
    createAccount: crm.createAccount,
    createContact: crm.createContact,
    createOpportunity: crm.createOpportunity,
    updateContact: crm.updateContact,
  };
}

export async function mapWebsiteLeadToCrm(
  lead: InboundLeadRecord,
  payload: WebsiteLeadPayload,
  research?: NonNullable<WebsiteWorkflowMetadata["research"]>,
): Promise<CrmMappingResult> {
  try {
    const crm = await getCrmAdapter();
    const [contacts, accounts, opportunities] = await Promise.all([
      crm.getContacts(),
      crm.getAccounts(),
      crm.getOpportunities(),
    ]);

    const domain = getEmailDomain(lead.email);
    const contactName = splitName(lead.contactName || payload.name || lead.name);
    const opportunityType = opportunityTypeForOffering(payload.offering);
    const owner = ownerForResearch(research);
    let createdContact = false;
    let createdAccount = false;
    let createdOpportunity = false;

    let account = findAccount(accounts, lead, research, domain);
    if (!account) {
      const recommended = research?.recommendedAccount;
      const accountName = normalizeWebsiteString(lead.companyName || recommended?.name) || (domain ? domainToCompanyName(domain) : contactName.fullName);
      account = await crm.createAccount({
            name: accountName,
            recordType: lead.companyName || domain ? "company" : "person_account",
            type: "Prospect",
            subType: "Inbound Lead",
            operatingMarket: "Multi-Market",
            website: recommended?.website || (domain ? `https://${domain}` : undefined),
            domain: recommended?.domain || domain,
            owner: recordOwner(owner),
            interests: [WEBSITE_OFFERING_LABELS[payload.offering]],
            lifecycleStage: "opportunity",
            convertedFromLeadId: lead.id,
            sourceRefs: [{ system: "Example Client Website", externalId: lead.id, label: "Website lead form", importedAt: new Date().toISOString() }],
          });
      createdAccount = true;
    }

    let contact = findContactByEmail(contacts, lead.email);
    if (!contact) {
      contact = await crm.createContact({
            firstName: contactName.firstName,
            lastName: contactName.lastName,
            email: lead.email,
            phone: lead.phone,
            accountId: account.id,
            tags: ["website-form", payload.offering, WEBSITE_OFFERING_LABELS[payload.offering]],
            source: "Website Form",
            sourceRefs: [{ system: "Example Client Website", externalId: lead.id, label: "Website lead form", importedAt: new Date().toISOString() }],
          });
      createdContact = true;
    } else {
      const tags = Array.from(new Set([...(contact.tags ?? []), "website-form", payload.offering, WEBSITE_OFFERING_LABELS[payload.offering]]));
      const update = {
        accountId: contact.accountId || account.id,
        phone: contact.phone || lead.phone,
        company: contact.company || account.name,
        owner: contact.owner || (owner === "Alex" || owner === "Mission Agent" ? owner : undefined),
        tags,
        convertedFromLeadId: contact.convertedFromLeadId || lead.id,
      };
      contact = await crm.updateContact(contact.id, update) ?? contact;
    }

    const existingOpportunity = lead.crmOpportunityId
      ? opportunities.find((opportunity: Opportunity) => opportunity.id === lead.crmOpportunityId && !opportunity.deletedAt)
      : findOpenOpportunity(opportunities, contact.id, account.id, opportunityType);
    const openDate = new Date().toISOString().slice(0, 10);
    const opportunity = existingOpportunity ?? await crm.createOpportunity({
          accountId: account.id,
          contactId: contact.id,
          name: `${account.name} ${WEBSITE_OFFERING_LABELS[payload.offering]} Website Lead`,
          opportunityType,
          location: "Remote",
          stage: "Discovery",
          openDate,
          forecastConfidence: payload.timeline === "this-month" ? "Medium" : "Low",
          valueType: "Project",
          value: valueForBudget(payload.budget),
          source: "Website Form",
          owner,
          nextStep: research?.recommendedNextAction || "Review website form and schedule a discovery call",
          nextStepDueDate: nextStepDueDate(payload),
          notes: buildOpportunityNotes(payload, research),
        });

    createdOpportunity = !existingOpportunity;

    return {
      attempted: true,
      ok: true,
      contactId: contact.id,
      accountId: account.id,
      opportunityId: opportunity.id,
      createdContact,
      createdAccount,
      createdOpportunity,
      duplicateOpenOpportunity: Boolean(existingOpportunity),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      createdContact: false,
      createdAccount: false,
      createdOpportunity: false,
      duplicateOpenOpportunity: false,
      error: error instanceof Error ? error.message : "Unable to map website lead to CRM",
    };
  }
}
