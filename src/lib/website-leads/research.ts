import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { WebsiteLeadPayload, WebsiteWorkflowMetadata } from "@/lib/website-leads/schema";
import { normalizeWebsiteEmail, normalizeWebsiteString } from "@/lib/website-leads/schema";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

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

function normalizeLabel(value?: string): string {
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
  const core = domain.split(".")[0] ?? domain;
  return core
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function getCrmContacts(): Promise<Contact[]> {
  if (!shouldUseSupabaseBackend()) {
    const { getContacts } = await import("@/lib/crm/store");
    return getContacts();
  }
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.schema("crm").from("contacts").select("raw");
  if (error) throw error;
  return ((data ?? []) as Array<{ raw: Contact }>).map((row) => row.raw).filter(Boolean);
}

async function getCrmAccounts(): Promise<Account[]> {
  if (!shouldUseSupabaseBackend()) {
    const { getAccounts } = await import("@/lib/crm/store");
    return getAccounts();
  }
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.schema("crm").from("accounts").select("raw");
  if (error) throw error;
  return ((data ?? []) as Array<{ raw: Account }>).map((row) => row.raw).filter(Boolean);
}

async function listExistingInboundLeads(): Promise<InboundLeadRecord[]> {
  if (!shouldUseSupabaseBackend()) {
    const { listInboundLeads } = await import("@/modules/revenue/inboundLeadsStore");
    return listInboundLeads();
  }
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.schema("crm").from("inbound_leads").select("raw").limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<{ raw: InboundLeadRecord }>).map((row) => row.raw).filter(Boolean);
}

async function updateMatchedAccountDomain(account?: Account, emailDomain?: string): Promise<void> {
  if (!account || !emailDomain || account.domain) return;
  const patch = {
    domain: emailDomain,
    enrichmentSource: "Website lead email domain",
    enrichmentConfidence: "medium" as const,
    enrichedAt: new Date().toISOString(),
  };
  if (!shouldUseSupabaseBackend()) {
    const { updateAccount } = await import("@/lib/crm/store");
    updateAccount(account.id, patch);
    return;
  }
  const next = { ...account, ...patch };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .schema("crm")
    .from("accounts")
    .update({
      domain: next.domain ?? null,
      website: next.website ?? null,
      raw: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id);
  if (error) throw error;
}

function findContactMatches(contacts: Contact[], email: string): Contact[] {
  if (!email) return [];
  return contacts.filter((contact) =>
    contact.emails.some((candidate) => normalizeWebsiteEmail(candidate) === email)
  );
}

function findAccountMatches(accounts: Account[], companyName?: string, domain?: string): Account[] {
  const normalizedCompany = normalizeLabel(companyName);
  return accounts.filter((account) => {
    const accountDomain = normalizeWebsiteString(account.domain || account.website).replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]?.toLowerCase();
    if (domain && accountDomain === domain) return true;
    return Boolean(normalizedCompany && normalizeLabel(account.name) === normalizedCompany);
  });
}

function fitScore(payload: WebsiteLeadPayload, emailDomain?: string): number {
  let score = 0;
  if (emailDomain) score += 20;
  if (normalizeWebsiteString(payload.company)) score += 15;
  if (normalizeWebsiteString(payload.message).length > 200) score += 15;
  if (payload.budget === "15k-50k" || payload.budget === "50k-plus") score += 10;
  if (payload.timeline === "this-month" || payload.timeline === "this-quarter") score += 10;
  if (normalizeWebsiteString(payload.stack)) score += 10;
  if (normalizeWebsiteString(payload.successMetric)) score += 10;
  return Math.min(score, 100);
}

function ownerForOffering(offering: WebsiteLeadPayload["offering"]): NonNullable<WebsiteWorkflowMetadata["research"]>["recommendedOwner"] {
  if (offering === "openclaw-events") return "Mission Agent";
  if (offering === "agentic-workforce" || offering === "private-coaching" || offering === "consulting" || offering === "other") return "Alex";
  return "Unassigned";
}

async function fetchWebsiteMeta(domain?: string): Promise<NonNullable<WebsiteWorkflowMetadata["research"]>["companyWebsite"]> {
  if (!domain) return { attempted: false, ok: false, error: "No work email domain available" };
  const url = `https://${domain}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Example ClientMissionControl/1.0 website-lead-research" },
    });
    const html = await response.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
    const description = (
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
      ""
    ).replace(/\s+/g, " ").trim();
    return {
      attempted: true,
      ok: response.ok,
      url: response.url || url,
      title,
      description,
      error: response.ok ? undefined : `Website returned ${response.status}`,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      url,
      error: error instanceof Error ? error.message : "Website metadata fetch failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function researchWebsiteLead(
  lead: InboundLeadRecord,
  payload: WebsiteLeadPayload,
): Promise<NonNullable<WebsiteWorkflowMetadata["research"]> & { crmAccountId?: string }> {
  const email = normalizeWebsiteEmail(payload.email);
  const emailDomain = getEmailDomain(email);
  const [contacts, accounts, inboundLeads] = await Promise.all([
    getCrmContacts(),
    getCrmAccounts(),
    listExistingInboundLeads(),
  ]);
  const contactMatches = findContactMatches(contacts, email);
  const accountMatches = findAccountMatches(accounts, payload.company, emailDomain);
  const existingAccount = accountMatches[0];
  const score = fitScore(payload, emailDomain);
  const recommendedOwner = ownerForOffering(payload.offering);
  const duplicateLeadMatches = inboundLeads
    .filter((item) => item.id !== lead.id && item.email && normalizeWebsiteEmail(item.email) === email)
    .slice(0, 5);
  const duplicateCandidates: NonNullable<WebsiteWorkflowMetadata["research"]>["duplicateCandidates"] = [
    ...contactMatches.slice(0, 5).map((contact) => ({
      kind: "contact" as const,
      id: contact.id,
      label: contact.name,
      matchedBy: "email",
    })),
    ...accountMatches.slice(0, 5).map((account) => ({
      kind: "account" as const,
      id: account.id,
      label: account.name,
      matchedBy: account.domain && emailDomain && account.domain === emailDomain ? "domain" : "company-name",
    })),
    ...duplicateLeadMatches.map((item) => ({
      kind: "lead" as const,
      id: item.id,
      label: item.name,
      matchedBy: "email",
    })),
  ];
  const companyWebsite = await fetchWebsiteMeta(emailDomain);
  const recommendedAccount = existingAccount
    ? {
        name: existingAccount.name,
        domain: existingAccount.domain || emailDomain,
        website: existingAccount.website,
        source: "existing-crm-account" as const,
        crmAccountId: existingAccount.id,
      }
    : {
        name: normalizeWebsiteString(payload.company) || (emailDomain ? domainToCompanyName(emailDomain) : lead.name),
        domain: emailDomain,
        website: companyWebsite?.ok ? companyWebsite.url : emailDomain ? `https://${emailDomain}` : undefined,
        source: normalizeWebsiteString(payload.company) ? "company-name" as const : "email-domain" as const,
      };

  await updateMatchedAccountDomain(existingAccount, emailDomain);

  const summaryBits = [
    emailDomain ? `Work domain: ${emailDomain}` : "No work email domain",
    existingAccount ? `matched account ${existingAccount.name}` : `recommended account ${recommendedAccount.name}`,
    contactMatches.length ? `${contactMatches.length} contact match${contactMatches.length === 1 ? "" : "es"}` : "no contact match",
    `fit score ${score}`,
  ];

  return {
    attempted: true,
    ok: true,
    fitScore: score,
    researchSummary: summaryBits.join("; "),
    duplicateCandidates,
    recommendedOwner,
    recommendedNextAction: score >= 70 ? "Review immediately and book a scoping call" : "Review website lead and qualify fit before conversion",
    recommendedAccount,
    emailDomain,
    companyWebsite,
    crmAccountId: existingAccount?.id,
  };
}
