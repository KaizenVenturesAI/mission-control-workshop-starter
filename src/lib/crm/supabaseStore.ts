import { normalizeAccountLifecycleStage, normalizeAccountType, type Account } from "@/data/accounts";
import type { Contact, ContactLocation } from "@/data/contacts";
import type { CRMActivity } from "@/data/crm-activities";
import { normalizeOpportunityStage, type Opportunity } from "@/data/opportunities";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { CRMStore } from "@/lib/crm/store";
import type { DismissedDuplicatePair, HygieneRunSummary } from "@/lib/crm/hygiene";

type EntityTable = "accounts" | "contacts" | "activities" | "opportunities";

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeName(value?: string): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeDomain(value?: string): string | null {
  const normalized = value?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  return normalized || null;
}

function normalizeEmail(value?: string): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function definedPatch<T extends object>(data: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(data) as (keyof T)[]) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

function rowToRaw<T>(row: { raw: T }): T {
  return row.raw;
}

function accountRow(account: Account) {
  return {
    id: account.id,
    name: account.name,
    domain: account.domain ?? normalizeDomain(account.website),
    normalized_name: normalizeName(account.name),
    normalized_domain: normalizeDomain(account.domain ?? account.website),
    record_type: account.recordType ?? "company",
    owner: account.owner ?? null,
    status: account.deletedAt ? "deleted" : normalizeAccountLifecycleStage(account.lifecycleStage) ?? account.relationshipStage ?? null,
    raw: { ...account, type: normalizeAccountType(account.type), lifecycleStage: normalizeAccountLifecycleStage(account.lifecycleStage) },
    updated_at: new Date().toISOString(),
  };
}

function contactRow(contact: Contact) {
  const primaryEmail = contact.emails[0] ?? contact.additionalEmails?.[0];
  return {
    id: contact.id,
    account_id: contact.accountId ?? null,
    name: contact.name,
    email: primaryEmail ?? null,
    normalized_email: normalizeEmail(primaryEmail),
    phone: contact.phone ?? null,
    owner: contact.owner ?? null,
    status: contact.deletedAt ? "deleted" : contact.stage ?? null,
    converted_from_lead_id: contact.convertedFromLeadId ?? null,
    raw: contact,
    updated_at: new Date().toISOString(),
  };
}

function opportunityRow(opportunity: Opportunity) {
  return {
    id: opportunity.id,
    account_id: opportunity.accountId ?? null,
    contact_id: opportunity.contactId ?? null,
    name: opportunity.name,
    stage: normalizeOpportunityStage(opportunity.stage) ?? null,
    value: opportunity.value ?? null,
    owner: opportunity.owner ?? null,
    raw: { ...opportunity, stage: normalizeOpportunityStage(opportunity.stage) },
    updated_at: new Date().toISOString(),
  };
}

function activityRow(activity: CRMActivity) {
  return {
    id: activity.id,
    account_id: activity.accountId ?? null,
    contact_id: activity.contactId ?? null,
    opportunity_id: null,
    type: activity.type ?? null,
    subject: activity.emailSubject ?? activity.meetingTitle ?? activity.content?.slice(0, 160) ?? null,
    activity_at: activity.occurredAt ?? null,
    owner: null,
    raw: activity,
    updated_at: new Date().toISOString(),
  };
}

async function selectRaw<T>(table: EntityTable): Promise<T[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.schema("crm").from(table).select("raw");
  if (error) throw error;
  return ((data ?? []) as Array<{ raw: T }>).map(rowToRaw).filter(Boolean);
}

export async function readSupabaseCrmStore(): Promise<CRMStore> {
  const supabase = createServiceSupabaseClient();
  const [contacts, accounts, activities, opportunities, dismissedPairs, hygieneRuns] = await Promise.all([
    selectRaw<Contact>("contacts"),
    selectRaw<Account>("accounts"),
    selectRaw<CRMActivity>("activities"),
    selectRaw<Opportunity>("opportunities"),
    supabase.schema("crm").from("dismissed_duplicate_pairs").select("raw"),
    supabase.schema("crm").from("hygiene_runs").select("raw"),
  ]);

  if (dismissedPairs.error) throw dismissedPairs.error;
  if (hygieneRuns.error) throw hygieneRuns.error;

  return {
    contacts,
    accounts: accounts.map((account) => ({ ...account, type: normalizeAccountType(account.type), lifecycleStage: normalizeAccountLifecycleStage(account.lifecycleStage) })),
    activities,
    opportunities: opportunities.map((opportunity) => ({ ...opportunity, stage: normalizeOpportunityStage(opportunity.stage) })),
    dismissedDuplicatePairs: ((dismissedPairs.data ?? []) as Array<{ raw: DismissedDuplicatePair }>).map(rowToRaw),
    hygieneRuns: ((hygieneRuns.data ?? []) as Array<{ raw: HygieneRunSummary }>).map(rowToRaw),
  };
}

export async function writeSupabaseCrmStore(store: CRMStore): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const operations = [
    store.accounts.length
      ? supabase.schema("crm").from("accounts").upsert(store.accounts.map(accountRow), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    store.contacts.length
      ? supabase.schema("crm").from("contacts").upsert(store.contacts.map(contactRow), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    store.opportunities.length
      ? supabase.schema("crm").from("opportunities").upsert(store.opportunities.map(opportunityRow), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    store.activities.length
      ? supabase.schema("crm").from("activities").upsert(store.activities.map(activityRow), { onConflict: "id" })
      : Promise.resolve({ error: null }),
    store.dismissedDuplicatePairs?.length
      ? supabase.schema("crm").from("dismissed_duplicate_pairs").upsert(
          store.dismissedDuplicatePairs.map((pair) => ({
            id: pair.key,
            left_id: pair.ids[0] ?? null,
            right_id: pair.ids[1] ?? null,
            reason: `${pair.kind} dismissed by ${pair.dismissedBy}`,
            raw: pair,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" },
        )
      : Promise.resolve({ error: null }),
    store.hygieneRuns?.length
      ? supabase.schema("crm").from("hygiene_runs").upsert(
          store.hygieneRuns.map((run) => ({
            id: run.id,
            status: run.errors.length ? "completed_with_errors" : "completed",
            started_at: run.ranAt,
            completed_at: run.ranAt,
            raw: run,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "id" },
        )
      : Promise.resolve({ error: null }),
  ];
  const results = await Promise.all(operations);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
}

let mutationChain: Promise<unknown> = Promise.resolve();

export function withSupabaseStoreMutation<T>(mutator: (store: CRMStore) => T | Promise<T>): Promise<T> {
  const next = mutationChain.then(async () => {
    const store = await readSupabaseCrmStore();
    const result = await mutator(store);
    await writeSupabaseCrmStore(store);
    return result;
  });
  mutationChain = next.catch(() => undefined);
  return next;
}

export async function getSupabaseContacts(opts?: { includeMerged?: boolean }): Promise<Contact[]> {
  const contacts = await selectRaw<Contact>("contacts");
  return opts?.includeMerged ? contacts : contacts.filter((contact) => !contact.deletedAt);
}

export async function getSupabaseAccounts(opts?: { includeMerged?: boolean }): Promise<Account[]> {
  const accounts = (await selectRaw<Account>("accounts")).map((account) => ({ ...account, type: normalizeAccountType(account.type), lifecycleStage: normalizeAccountLifecycleStage(account.lifecycleStage) }));
  return opts?.includeMerged ? accounts : accounts.filter((account) => !account.deletedAt);
}

export async function getSupabaseOpportunities(accountId?: string, contactId?: string): Promise<Opportunity[]> {
  const opportunities = (await selectRaw<Opportunity>("opportunities")).filter((opportunity) => !opportunity.deletedAt).map((opportunity) => ({ ...opportunity, stage: normalizeOpportunityStage(opportunity.stage) }));
  if (contactId) return opportunities.filter((opportunity) => opportunity.contactId === contactId);
  if (accountId) return opportunities.filter((opportunity) => opportunity.accountId === accountId);
  return opportunities;
}

export async function getSupabaseActivities(contactId?: string, accountId?: string): Promise<CRMActivity[]> {
  const store = await readSupabaseCrmStore();
  if (contactId) return store.activities.filter((activity) => activity.contactId === contactId);
  if (accountId) {
    const linkedContactIds = new Set(store.contacts.filter((contact) => contact.accountId === accountId).map((contact) => contact.id));
    return store.activities.filter((activity) => activity.accountId === accountId || Boolean(activity.contactId && linkedContactIds.has(activity.contactId)));
  }
  return store.activities;
}

export async function createSupabaseContact(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  accountId?: string;
  tags?: string[];
  location?: ContactLocation;
  source?: string;
  sourceRefs?: Contact["sourceRefs"];
}): Promise<Contact> {
  const contact: Contact = {
    id: generateId("c"),
    name: `${data.firstName} ${data.lastName}`,
    emails: data.email ? [data.email] : [],
    phone: data.phone,
    accountId: data.accountId || undefined,
    tags: data.tags ?? [],
    source: data.source ?? "Manual",
    stage: "New",
    followUpState: "none",
    provenance: "manual",
    location: data.location,
    sourceRefs: data.sourceRefs,
    interactions: [],
  };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.schema("crm").from("contacts").upsert(contactRow(contact), { onConflict: "id" });
  if (error) throw error;
  return contact;
}

export async function createSupabaseAccount(data: Omit<Partial<Account>, "id" | "createdAt" | "updatedAt" | "provenance"> & Pick<Account, "name" | "type">): Promise<Account> {
  const account: Account = {
    id: generateId("acc"),
    name: data.name,
    aliases: data.aliases,
    recordType: data.recordType ?? "company",
    type: normalizeAccountType(data.type),
    subType: data.subType,
    category: data.category,
    operatingMarket: data.operatingMarket ?? "Los Angeles",
    address: data.address,
    website: data.website,
    notes: data.notes,
    industry: data.industry,
    linkedinUrl: data.linkedinUrl,
    linkedinDescription: data.linkedinDescription,
    employeeRange: data.employeeRange,
    associatedMembers: data.associatedMembers,
    linkedinIndustry: data.linkedinIndustry,
    linkedinHeadquarters: data.linkedinHeadquarters,
    linkedinCompanyType: data.linkedinCompanyType,
    enrichmentSource: data.enrichmentSource,
    enrichmentConfidence: data.enrichmentConfidence,
    enrichedAt: data.enrichedAt,
    revenueTier: data.revenueTier,
    relationshipStage: data.relationshipStage,
    geo: data.geo,
    domain: data.domain,
    owner: data.owner,
    interests: data.interests,
    tier: data.tier,
    lifecycleStage: normalizeAccountLifecycleStage(data.lifecycleStage),
    convertedFromLeadId: data.convertedFromLeadId,
    referralPartnerAccountId: data.referralPartnerAccountId,
    sourceRefs: data.sourceRefs,
    logoAssetId: data.logoAssetId,
    assets: data.assets,
    createdAt: now(),
    updatedAt: now(),
    provenance: "manual",
  };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.schema("crm").from("accounts").upsert(accountRow(account), { onConflict: "id" });
  if (error) throw error;
  return account;
}

export async function createSupabaseActivity(data: Parameters<typeof import("@/lib/crm/store").createActivity>[0]): Promise<CRMActivity> {
  const contacts = await getSupabaseContacts({ includeMerged: true });
  const accounts = await getSupabaseAccounts({ includeMerged: true });
  if (!data.contactId && !data.accountId) throw new Error("ACTIVITY_REQUIRES_CONTACT_OR_ACCOUNT");
  const relatedContact = data.contactId ? contacts.find((contact) => contact.id === data.contactId) : undefined;
  if (data.contactId && !relatedContact) throw new Error("CONTACT_NOT_FOUND");
  const accountId = data.accountId ?? relatedContact?.accountId;
  if (accountId && !accounts.some((account) => account.id === accountId)) throw new Error("ACCOUNT_NOT_FOUND");
  const activity: CRMActivity = {
    id: generateId("act"),
    contactId: data.contactId,
    accountId,
    type: data.type,
    occurredAt: data.occurredAt ?? now(),
    content: data.content,
    source: data.source ?? "Manual",
    provenance: data.provenance ?? "manual",
    externalRef: data.externalRef,
    meetingTitle: data.meetingTitle,
    participants: data.participants,
    durationMinutes: data.durationMinutes,
    summary: data.summary,
    recordingLink: data.recordingLink,
    sourceSheet: data.sourceSheet,
    sourceUrl: data.sourceUrl,
    importBatchId: data.importBatchId,
    sourceRecordTitle: data.sourceRecordTitle,
    matchType: data.matchType,
    createdAt: now(),
    updatedAt: now(),
  };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.schema("crm").from("activities").upsert(activityRow(activity), { onConflict: "id" });
  if (error) throw error;
  return activity;
}

export async function createSupabaseOpportunity(data: Parameters<typeof import("@/lib/crm/store").createOpportunity>[0]): Promise<Opportunity> {
  const [accounts, contacts] = await Promise.all([getSupabaseAccounts({ includeMerged: true }), getSupabaseContacts({ includeMerged: true })]);
  const account = accounts.find((item) => item.id === data.accountId);
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");
  if (!contacts.some((item) => item.id === data.contactId)) throw new Error("CONTACT_NOT_FOUND");
  const opportunity: Opportunity = {
    id: generateId("opp"),
    accountId: data.accountId,
    contactId: data.contactId,
    name: data.name?.trim() || `${account.name} ${data.opportunityType}`,
    opportunityType: data.opportunityType,
    location: data.location,
    stage: normalizeOpportunityStage(data.stage),
    openDate: data.openDate || today(),
    closeDate: data.closeDate,
    forecastConfidence: data.forecastConfidence,
    valueType: data.valueType,
    value: data.value,
    pricingUnit: data.pricingUnit,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    computedValue: data.computedValue,
    source: data.source,
    owner: data.owner,
    nextStep: data.nextStep.trim(),
    nextStepDueDate: data.nextStepDueDate,
    notes: data.notes,
    lossReason: data.lossReason,
    promotedFromAccountId: data.promotedFromAccountId,
    referralPartnerAccountId: data.referralPartnerAccountId,
    referralPartnerContactId: data.referralPartnerContactId,
    payoutAllocations: data.payoutAllocations,
    createdAt: now(),
    updatedAt: now(),
    provenance: "manual",
  };
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.schema("crm").from("opportunities").upsert(opportunityRow(opportunity), { onConflict: "id" });
  if (error) throw error;
  const nextAccount = { ...account, lifecycleStage: "opportunity" as const, updatedAt: now() };
  const { error: accountError } = await supabase.schema("crm").from("accounts").upsert(accountRow(nextAccount), { onConflict: "id" });
  if (accountError) throw accountError;
  return opportunity;
}

async function updateRaw<T extends { id: string }>(table: EntityTable, id: string, patch: Partial<T>, rowBuilder: (item: T) => object): Promise<T | null> {
  const supabase = createServiceSupabaseClient();
  const { data: row, error: readError } = await supabase.schema("crm").from(table).select("raw").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!row) return null;
  const next = { ...(row.raw as T), ...definedPatch(patch), updatedAt: now() };
  const { error } = await supabase.schema("crm").from(table).upsert(rowBuilder(next), { onConflict: "id" });
  if (error) throw error;
  return next;
}

export async function updateSupabaseContact(id: string, data: Partial<Contact>): Promise<Contact | null> {
  const patch = definedPatch(data);
  if ("name" in patch && (typeof patch.name !== "string" || patch.name.trim() === "")) delete (patch as Record<string, unknown>).name;
  if ("emails" in patch && (!Array.isArray(patch.emails) || patch.emails.length === 0)) delete (patch as Record<string, unknown>).emails;
  return updateRaw<Contact>("contacts", id, patch, contactRow);
}

export async function updateSupabaseAccount(id: string, data: Partial<Account>): Promise<Account | null> {
  const patch = definedPatch(data);
  if ("name" in patch && (typeof patch.name !== "string" || patch.name.trim() === "")) delete (patch as Record<string, unknown>).name;
  if ("type" in patch && !patch.type) delete (patch as Record<string, unknown>).type;
  if ("type" in patch) patch.type = normalizeAccountType(patch.type);
  if ("lifecycleStage" in patch) patch.lifecycleStage = normalizeAccountLifecycleStage(patch.lifecycleStage);
  return updateRaw<Account>("accounts", id, patch, accountRow);
}

export async function updateSupabaseActivity(id: string, data: Partial<CRMActivity>): Promise<CRMActivity | null> {
  return updateRaw<CRMActivity>("activities", id, data, activityRow);
}

export async function updateSupabaseOpportunity(id: string, data: Partial<Omit<Opportunity, "closeDate">> & { closeDate?: string | null }): Promise<Opportunity | null> {
  const patch = definedPatch(data);
  const hasCloseDatePatch = Object.prototype.hasOwnProperty.call(data, "closeDate");
  if ("stage" in patch) patch.stage = normalizeOpportunityStage(patch.stage);
  if (hasCloseDatePatch && !data.closeDate) {
    (patch as Record<string, unknown>).closeDate = null;
  }
  const updated = await updateRaw<Opportunity>("opportunities", id, patch as Partial<Opportunity>, opportunityRow);
  if (updated?.stage === "Closed Won") {
    await updateSupabaseAccount(updated.accountId, { type: "Client" });
  }
  if (updated && !hasCloseDatePatch && (updated.stage === "Closed Won" || updated.stage === "Closed Lost") && !updated.closeDate) {
    return updateRaw<Opportunity>("opportunities", id, { closeDate: today() } as Partial<Opportunity>, opportunityRow);
  }
  return updated;
}

export async function deleteSupabaseAccount(id: string): Promise<boolean> {
  return Boolean(await updateSupabaseAccount(id, { deletedAt: now() }));
}

export async function deleteSupabaseContact(id: string): Promise<boolean> {
  return Boolean(await updateSupabaseContact(id, { deletedAt: now() }));
}

export async function deleteSupabaseOpportunity(id: string): Promise<boolean> {
  return Boolean(await updateSupabaseOpportunity(id, { deletedAt: now() }));
}

export async function deleteSupabaseActivity(id: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { error, count } = await supabase.schema("crm").from("activities").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  return Boolean(count);
}

export async function getSupabaseEmailActivities(contactId?: string): Promise<CRMActivity[]> {
  const emails = (await getSupabaseActivities()).filter((activity) => activity.type === "Email");
  return contactId ? emails.filter((activity) => activity.contactId === contactId) : emails;
}
