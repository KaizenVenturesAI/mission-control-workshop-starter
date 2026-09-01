// ── CRM Persistence Layer ──
// Uses the project-local .data/crm-store.json file as the starter backend.
// This keeps the Example Client template portable while a durable backend is selected.

import path from "path";
import { CONTACTS, type Contact, type ContactLocation } from "@/data/contacts";
import { ACCOUNTS, backfillAccountRecordType, normalizeAccountLifecycleStage, normalizeAccountType, type Account } from "@/data/accounts";
import { CRM_ACTIVITIES, type CRMActivity } from "@/data/crm-activities";
import { OPPORTUNITIES, normalizeOpportunityStage, type Opportunity } from "@/data/opportunities";
import type { DismissedDuplicatePair, HygieneRunSummary } from "@/lib/crm/hygiene";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "crm-store.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const MAX_BACKUPS = 50;
const DEFAULT_READ_CACHE_TTL_MS = 15_000;

function getNodeFs() {
  if (shouldUseSupabaseBackend()) {
    throw new Error("CRM_JSON_BACKEND_DISABLED");
  }
  // Keep Node fs out of browser/client module initialization. Local JSON
  // fallback paths call this lazily only when Supabase backend is disabled.
  const nodeRequire = eval("require") as NodeRequire;
  return nodeRequire("fs") as typeof import("fs");
}

function ensureLocalDataDirs(): void {
  const { mkdirSync } = getNodeFs();
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }
  try { mkdirSync(BACKUP_DIR, { recursive: true }); } catch { /* already exists */ }
}

export interface CRMStore {
  contacts: Contact[];
  accounts: Account[];
  activities: CRMActivity[];
  opportunities: Opportunity[];
  dismissedDuplicatePairs?: DismissedDuplicatePair[];
  hygieneRuns?: HygieneRunSummary[];
}

type StoreReadCache = {
  store: CRMStore;
  expiresAt: number;
};

let storeReadCache: StoreReadCache | null = null;

function getReadCacheTtlMs(): number {
  const raw = Number(process.env.CRM_READ_CACHE_TTL_MS ?? DEFAULT_READ_CACHE_TTL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_READ_CACHE_TTL_MS;
  return Math.max(0, raw);
}

function getCachedStore(): CRMStore | null {
  if (!storeReadCache) return null;
  if (Date.now() >= storeReadCache.expiresAt) {
    storeReadCache = null;
    return null;
  }
  return storeReadCache.store;
}

function primeStoreCache(store: CRMStore): CRMStore {
  const ttl = getReadCacheTtlMs();
  if (ttl > 0) {
    storeReadCache = {
      store,
      expiresAt: Date.now() + ttl,
    };
  } else {
    storeReadCache = null;
  }
  return store;
}

type LegacyOpportunity = Partial<Opportunity> & {
  id?: string;
  accountId?: string;
  contactId?: string;
  opportunityType?: string;
  location?: string;
  stage?: string;
  forecastConfidence?: string;
  source?: string;
  owner?: string;
  lossReason?: string;
  value?: number | string;
};

function normalizeStore(input: Partial<CRMStore>): CRMStore | null {
  if (
    !Array.isArray(input.contacts) ||
    !Array.isArray(input.accounts) ||
    !Array.isArray(input.activities)
  ) {
    return null;
  }

  const accounts = backfillAccountRecordType(input.accounts);
  return {
    contacts: input.contacts,
    accounts,
    activities: input.activities,
    opportunities: normalizeOpportunities(input.opportunities, input.contacts, accounts),
    dismissedDuplicatePairs: Array.isArray((input as CRMStore).dismissedDuplicatePairs)
      ? (input as CRMStore).dismissedDuplicatePairs
      : [],
    hygieneRuns: Array.isArray((input as CRMStore).hygieneRuns)
      ? (input as CRMStore).hygieneRuns
      : [],
  };
}

function readLocalMetadata(): Pick<CRMStore, "dismissedDuplicatePairs" | "hygieneRuns"> {
  try {
    const { readFileSync } = getNodeFs();
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as Partial<CRMStore>;
    return {
      dismissedDuplicatePairs: Array.isArray(raw.dismissedDuplicatePairs) ? raw.dismissedDuplicatePairs : [],
      hygieneRuns: Array.isArray(raw.hygieneRuns) ? raw.hygieneRuns : [],
    };
  } catch {
    return { dismissedDuplicatePairs: [], hygieneRuns: [] };
  }
}

// ── Backup-on-write ──
// Copy the current store to .data/backups/crm-store.<ISO>.json before each write.
// Keep last MAX_BACKUPS by mtime; prune older ones. Failures here are non-fatal —
// we still want the write to proceed if backup pruning hiccups.
function backupCurrentStore(): void {
  const { copyFileSync, readdirSync, statSync, unlinkSync } = getNodeFs();
  try {
    // Only back up if a real store file exists (skip first-run seed).
    statSync(STORE_PATH);
  } catch {
    return;
  }
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(BACKUP_DIR, `crm-store.${stamp}.json`);
    copyFileSync(STORE_PATH, dest);
  } catch {
    // Backup is best-effort; do not block the write.
    return;
  }
  try {
    const entries = readdirSync(BACKUP_DIR)
      .filter((name) => name.startsWith("crm-store.") && name.endsWith(".json"))
      .map((name) => {
        const full = path.join(BACKUP_DIR, name);
        try { return { full, mtime: statSync(full).mtimeMs }; } catch { return null; }
      })
      .filter((e): e is { full: string; mtime: number } => e !== null)
      .sort((a, b) => b.mtime - a.mtime);
    if (entries.length > MAX_BACKUPS) {
      for (const old of entries.slice(MAX_BACKUPS)) {
        try { unlinkSync(old.full); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore prune errors */ }
}

// ── Atomic write ──
// Write to .tmp, fsync, rename. POSIX rename is atomic on the same filesystem.
// Crash mid-write leaves either the previous file intact or an orphan .tmp,
// never a half-written canonical file.
function writeStoreAtomic(store: CRMStore): void {
  ensureLocalDataDirs();
  const { writeFileSync, openSync, fsyncSync, closeSync, renameSync } = getNodeFs();
  backupCurrentStore();
  const tmpPath = `${STORE_PATH}.tmp`;
  const data = JSON.stringify(store, null, 2);
  writeFileSync(tmpPath, data, "utf-8");
  // Open + fsync + close to guarantee bytes are on disk before rename.
  const fd = openSync(tmpPath, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, STORE_PATH);
}

// ── Write serialization mutex ──
// All store mutations route through this Promise chain so concurrent writes
// from parallel route handlers serialize. Single-process only; multi-process
// would need a real lock file.
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(store: CRMStore): void {
  // Schedule the write at the tail of the queue. We don't await here because
  // existing call sites are synchronous; the rename is atomic so even if
  // tail writes are still queued, on-disk state is always a complete snapshot.
  // The queue ensures ordering and prevents tmp-file collisions.
  writeQueue = writeQueue.then(() => {
    try {
      writeStoreAtomic(store);
    } catch (err) {
      // Surface the error on the queue but don't kill the chain.
      // eslint-disable-next-line no-console
      console.error("[crm/store] writeStore failed:", err);
    }
  });
}

export function writeStore(store: CRMStore): void {
  // Synchronous fast-path: write the local JSON backend inline so the immediate
  // caller sees read-after-write state on return.
  try {
    writeStoreAtomic(store);
    primeStoreCache(store);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[crm/store] writeStore failed:", err);
    throw err;
  }
  // Touch the queue so any later async writers serialize behind in-flight work.
  writeQueue = writeQueue.then(() => undefined);
}

// Exposed for tests / future async call sites.
export function flushPendingWrites(): Promise<void> {
  return writeQueue;
}

void enqueueWrite; // referenced for future async write paths

// ── Mutation mutex ──
// Serializes read-modify-write transactions so concurrent route handlers
// can't race each other on the JSON store. The mutator runs while no other
// mutator is active; its return value is forwarded to the caller.
let mutationChain: Promise<unknown> = Promise.resolve();

export function withStoreMutation<T>(mutator: (store: CRMStore) => T): Promise<T> {
  const next = mutationChain.then(() => {
    const store = readStore();
    const result = mutator(store);
    writeStore(store);
    return result;
  });
  mutationChain = next.catch(() => undefined);
  return next;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);

// ── Patch sanitization ──
// Strip `undefined` values so partial updates never silently overwrite real
// fields with `undefined` when callers omit them from the request body.
// (See: 2026-05-02 P0 bug — InlineEditEnum sent { id, revenueTier } and the
// PUT handler destructured the rest as `undefined`, wiping name/type/etc.)
function definedPatch<T extends object>(data: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(data) as (keyof T)[]) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  return out;
}

function mapOpportunityType(value?: string): Opportunity["opportunityType"] {
  switch (value) {
    case "AI Consulting":
    case "Half-Day Install":
    case "Full-Day Install":
    case "Hourly Consulting":
    case "Agentic Employee Installation":
    case "Mission Control Build":
    case "Event - General Admission":
    case "Event - VIP":
    case "OpenClaw Install Day":
    case "Managed Agent Ops":
    case "Referral Partnership":
      return value;
    case "Install Program":
      return "Half-Day Install";
    case "Corporate Events":
    case "Corporate Event":
    case "Private Event":
    case "League":
    case "Other":
      return "Mission Control Build";
    case "Brand Partnerships":
    case "Brand Partnership":
    case "Sponsorship":
    case "Activation":
      return "Referral Partnership";
    default:
      return "AI Consulting";
  }
}

function mapLocation(value?: string): Opportunity["location"] {
  switch (value) {
    case "Miami":
    case "Los Angeles":
    case "New York":
    case "Remote":
    case "Multi-Market":
    case "International":
      return value;
    case "Chicago":
      return "Remote";
    case "Rio de Janeiro":
      return "International";
    case "Fort Lauderdale":
      return "Miami";
    default:
      return "Remote";
  }
}

function mapStage(value?: string): Opportunity["stage"] {
  if (value === "Lead" || value === "Qualified") return "Discovery";
  if (value === "Negotiation") return "Contracting";
  return normalizeOpportunityStage(value);
}

function mapForecastConfidence(value?: string): Opportunity["forecastConfidence"] {
  switch (value) {
    case "High":
      return "High";
    case "Low":
      return "Low";
    case "Medium":
    case "Commit":
    default:
      return "Medium";
  }
}

function mapSource(value?: string): Opportunity["source"] {
  switch (value) {
    case "Website":
    case "Referral":
    case "Direct Outreach":
    case "Existing Network":
    case "Event":
    case "Import":
    case "Partner Intro":
    case "Manual":
      return value;
    case "Website Form":
      return "Website";
    case "Email":
      return "Direct Outreach";
    case "In Person":
      return "Existing Network";
    default:
      return "Manual";
  }
}

function mapOwner(value?: string): Opportunity["owner"] {
  switch (value) {
    case "Alex":
    case "Morgan":
    case "Mission Agent":
    case "Unassigned":
      return value;
    case "Brian":
    case "Glenda":
    case "Duda":
      return "Mission Agent";
    default:
      return "Unassigned";
  }
}

function mapLossReason(value?: string): Opportunity["lossReason"] {
  switch (value) {
    case "Too Expensive":
    case "Timing":
    case "No Response":
    case "Not a Fit":
    case "Competitor":
    case "Internal Deprioritization":
    case "Other":
      return value;
    default:
      return undefined;
  }
}

function normalizeValue(value: LegacyOpportunity["value"]): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeOptionalValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function resolveContactId(record: LegacyOpportunity, contacts: Contact[]): string | null {
  if (record.contactId && contacts.some((contact) => contact.id === record.contactId)) {
    return record.contactId;
  }

  if (record.accountId) {
    const linkedContact = contacts.find((contact) => contact.accountId === record.accountId);
    if (linkedContact) return linkedContact.id;
  }

  return contacts[0]?.id ?? null;
}

function normalizeOpportunity(record: LegacyOpportunity, contacts: Contact[], accounts: Account[]): Opportunity | null {
  if (!record.accountId || !accounts.some((account) => account.id === record.accountId)) {
    return null;
  }

  const contactId = resolveContactId(record, contacts);
  if (!contactId) return null;

  const account = accounts.find((item) => item.id === record.accountId);
  if (!account) return null;

  const openDate = typeof record.openDate === "string" && record.openDate ? record.openDate : today();
  const closeDate = typeof record.closeDate === "string" && record.closeDate ? record.closeDate : undefined;
  const nextStepDueDate = typeof record.nextStepDueDate === "string" && record.nextStepDueDate
    ? record.nextStepDueDate
    : closeDate || openDate;

  return {
    id: typeof record.id === "string" && record.id ? record.id : generateId("opp"),
    name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : `${account.name} ${mapOpportunityType(record.opportunityType)}`,
    contactId,
    accountId: record.accountId,
    opportunityType: mapOpportunityType(record.opportunityType),
    location: mapLocation(record.location),
    stage: mapStage(record.stage),
    openDate,
    closeDate,
    forecastConfidence: mapForecastConfidence(record.forecastConfidence),
    valueType: record.valueType === "Hourly" || record.valueType === "Retainer" || record.valueType === "Referral" ? record.valueType : "Project",
    value: normalizeValue(record.value),
    pricingUnit: record.pricingUnit === "hour" || record.pricingUnit === "seat" || record.pricingUnit === "fixed" ? record.pricingUnit : undefined,
    quantity: normalizeOptionalValue(record.quantity),
    unitPrice: normalizeOptionalValue(record.unitPrice),
    computedValue: normalizeOptionalValue(record.computedValue),
    source: mapSource(record.source),
    owner: mapOwner(record.owner),
    nextStep: typeof record.nextStep === "string" && record.nextStep.trim() ? record.nextStep.trim() : "Follow up with contact",
    nextStepDueDate,
    notes: typeof record.notes === "string" && record.notes.trim() ? record.notes : undefined,
    lossReason: mapLossReason(record.lossReason),
    createdAt: typeof record.createdAt === "string" && record.createdAt ? record.createdAt : now(),
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : now(),
    provenance: record.provenance ?? "manual",
    promotedFromAccountId: typeof record.promotedFromAccountId === "string" ? record.promotedFromAccountId : undefined,
    payoutAllocations: Array.isArray(record.payoutAllocations) ? record.payoutAllocations : undefined,
    deletedAt: typeof record.deletedAt === "string" ? record.deletedAt : undefined,
  };
}

function normalizeOpportunities(opportunities: unknown, contacts: Contact[], accounts: Account[]): Opportunity[] {
  if (!Array.isArray(opportunities)) return [...OPPORTUNITIES];

  return opportunities
    .map((record) => normalizeOpportunity(record as LegacyOpportunity, contacts, accounts))
    .filter((record): record is Opportunity => Boolean(record));
}

export function readStore(): CRMStore {
  if (shouldUseSupabaseBackend()) {
    throw new Error("CRM_SYNC_STORE_DISABLED");
  }
  const cached = getCachedStore();
  if (cached) return cached;

  try {
    const { readFileSync } = getNodeFs();
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CRMStore>;
    const store = normalizeStore(parsed);
    if (store) {
      if (
        JSON.stringify(parsed.accounts ?? null) !== JSON.stringify(store.accounts) ||
        JSON.stringify(parsed.opportunities ?? null) !== JSON.stringify(store.opportunities)
      ) {
        writeStoreAtomic(store);
      }
      return primeStoreCache(store);
    }
  } catch {
    // File missing, corrupt, or invalid, fall through to seed
  }

  const seed: CRMStore = {
    contacts: CONTACTS,
    accounts: backfillAccountRecordType(ACCOUNTS),
    activities: CRM_ACTIVITIES,
    opportunities: normalizeOpportunities(OPPORTUNITIES, CONTACTS, backfillAccountRecordType(ACCOUNTS)),
    dismissedDuplicatePairs: [],
    hygieneRuns: [],
  };
  writeStoreAtomic(seed);
  return primeStoreCache(seed);
}

function assertAccountExists(accounts: Account[], accountId: string): void {
  if (!accounts.some((item) => item.id === accountId)) throw new Error("ACCOUNT_NOT_FOUND");
}

function assertContactExists(contacts: Contact[], contactId: string): void {
  if (!contacts.some((item) => item.id === contactId)) throw new Error("CONTACT_NOT_FOUND");
}

export function getContacts(opts?: { includeMerged?: boolean }): Contact[] {
  const all = readStore().contacts;
  if (opts?.includeMerged) return all;
  return all.filter((c) => !c.deletedAt);
}

export function getAccounts(opts?: { includeMerged?: boolean }): Account[] {
  const all = readStore().accounts;
  if (opts?.includeMerged) return all;
  return all.filter((a) => !a.deletedAt);
}

export function getActivities(contactId?: string, accountId?: string): CRMActivity[] {
  const store = readStore();
  const all = store.activities;

  if (contactId) return all.filter((a) => a.contactId === contactId);

  if (accountId) {
    const linkedContactIds = new Set(
      store.contacts.filter((contact) => contact.accountId === accountId).map((contact) => contact.id)
    );
    return all.filter(
      (activity) =>
        activity.accountId === accountId ||
        (activity.contactId ? linkedContactIds.has(activity.contactId) : false)
    );
  }

  return all;
}

export function getOpportunities(accountId?: string, contactId?: string): Opportunity[] {
  const store = readStore();
  const all = store.opportunities.filter((opportunity) => !opportunity.deletedAt);

  if (contactId) return all.filter((opportunity) => opportunity.contactId === contactId);
  if (accountId) return all.filter((opportunity) => opportunity.accountId === accountId);

  return all;
}

export function createContact(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  accountId?: string;
  tags?: string[];
  location?: ContactLocation;
  source?: string;
  sourceRefs?: Contact["sourceRefs"];
}): Contact {
  const store = readStore();
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
  store.contacts.push(contact);
  writeStore(store);
  return contact;
}

export function createAccount(data: {
  name: string;
  aliases?: string[];
  recordType?: Account["recordType"];
  type: Account["type"];
  subType?: Account["subType"];
  category?: string;
  operatingMarket?: Account["operatingMarket"];
  address?: Account["address"];
  website?: string;
  notes?: string;
  industry?: Account["industry"];
  revenueTier?: Account["revenueTier"];
  relationshipStage?: Account["relationshipStage"];
  geo?: Account["geo"];
  domain?: Account["domain"];
    tier?: Account["tier"];
    lifecycleStage?: Account["lifecycleStage"];
    owner?: Account["owner"];
    interests?: Account["interests"];
    convertedFromLeadId?: string;
    referralPartnerAccountId?: Account["referralPartnerAccountId"];
    sourceRefs?: Account["sourceRefs"];
    logoAssetId?: Account["logoAssetId"];
    assets?: Account["assets"];
    linkedinUrl?: Account["linkedinUrl"];
    linkedinDescription?: Account["linkedinDescription"];
    employeeRange?: Account["employeeRange"];
    associatedMembers?: Account["associatedMembers"];
    linkedinIndustry?: Account["linkedinIndustry"];
    linkedinHeadquarters?: Account["linkedinHeadquarters"];
    linkedinCompanyType?: Account["linkedinCompanyType"];
    enrichmentSource?: Account["enrichmentSource"];
    enrichmentConfidence?: Account["enrichmentConfidence"];
    enrichedAt?: Account["enrichedAt"];
}): Account {
  const store = readStore();
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
    revenueTier: data.revenueTier,
    relationshipStage: data.relationshipStage,
    geo: data.geo,
    domain: data.domain,
    tier: data.tier,
    lifecycleStage: normalizeAccountLifecycleStage(data.lifecycleStage),
    owner: data.owner,
    interests: data.interests,
    convertedFromLeadId: data.convertedFromLeadId,
    referralPartnerAccountId: data.referralPartnerAccountId,
    sourceRefs: data.sourceRefs,
    logoAssetId: data.logoAssetId,
    assets: data.assets,
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
    createdAt: now(),
    updatedAt: now(),
    provenance: "manual",
  };
  store.accounts.push(account);
  writeStore(store);
  return account;
}

export function createActivity(data: {
  contactId?: string;
  accountId?: string;
  type: CRMActivity["type"];
  content: string;
  occurredAt?: string;
  source?: CRMActivity["source"];
  provenance?: CRMActivity["provenance"];
  externalRef?: string;
  meetingTitle?: string;
  participants?: string[];
  durationMinutes?: number;
  summary?: string;
  recordingLink?: string;
  sourceSheet?: string;
  sourceUrl?: string;
  importBatchId?: string;
  sourceRecordTitle?: string;
  matchType?: CRMActivity["matchType"];
}): CRMActivity {
  const store = readStore();
  if (!data.contactId && !data.accountId) {
    throw new Error("ACTIVITY_REQUIRES_CONTACT_OR_ACCOUNT");
  }
  const relatedContact = data.contactId
    ? store.contacts.find((contact) => contact.id === data.contactId)
    : undefined;
  if (data.contactId && !relatedContact) {
    throw new Error("CONTACT_NOT_FOUND");
  }
  const accountId = data.accountId ?? relatedContact?.accountId;
  if (accountId) assertAccountExists(store.accounts, accountId);
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
  store.activities.push(activity);
  writeStore(store);
  return activity;
}

export function createOpportunity(data: {
  accountId: string;
  contactId: string;
  name?: string;
  opportunityType: Opportunity["opportunityType"];
  location: Opportunity["location"];
  stage: Opportunity["stage"];
  openDate: string;
  closeDate?: string;
  forecastConfidence: Opportunity["forecastConfidence"];
  valueType: Opportunity["valueType"];
  value: number;
  pricingUnit?: Opportunity["pricingUnit"];
  quantity?: number;
  unitPrice?: number;
  computedValue?: number;
  source: Opportunity["source"];
  owner: Opportunity["owner"];
  nextStep: string;
  nextStepDueDate: string;
  notes?: string;
  lossReason?: Opportunity["lossReason"];
  promotedFromAccountId?: string;
  referralPartnerAccountId?: Opportunity["referralPartnerAccountId"];
  referralPartnerContactId?: Opportunity["referralPartnerContactId"];
  payoutAllocations?: Opportunity["payoutAllocations"];
}): Opportunity {
  const store = readStore();
  assertAccountExists(store.accounts, data.accountId);
  assertContactExists(store.contacts, data.contactId);

  const account = store.accounts.find((item) => item.id === data.accountId)!;
  const opportunity: Opportunity = {
    id: generateId("opp"),
    accountId: data.accountId,
    contactId: data.contactId,
    name: data.name?.trim() || `${account.name} ${data.opportunityType}`,
    opportunityType: data.opportunityType,
    location: data.location,
    stage: normalizeOpportunityStage(data.stage),
    openDate: data.openDate,
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

  store.opportunities.push(opportunity);
  const accountIndex = store.accounts.findIndex((item) => item.id === opportunity.accountId);
  if (accountIndex !== -1) {
    store.accounts[accountIndex] = { ...store.accounts[accountIndex], lifecycleStage: "opportunity", updatedAt: now() };
  }
  writeStore(store);
  return opportunity;
}

export function updateContact(
  id: string,
  data: Partial<Pick<Contact, "name" | "title" | "company" | "emails" | "phone" | "tags" | "stage" | "priority" | "followUpState" | "accountId" | "notes" | "owner" | "interests" | "convertedFromLeadId" | "linkedinUrl" | "lastTouchAt" | "sourceRefs">>
): Contact | null {
  const store = readStore();
  const idx = store.contacts.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const patch = definedPatch(data);
  // Defense-in-depth identity guard (mirrors updateAccount). Even if a route
  // handler forgets to validate, we refuse to clear identity fields here:
  // refuse to wipe `name` (empty/whitespace) or `emails` (empty array).
  if ("name" in patch && (typeof patch.name !== "string" || patch.name.trim() === "")) {
    delete (patch as Record<string, unknown>).name;
  }
  if ("emails" in patch && (!Array.isArray(patch.emails) || patch.emails.length === 0)) {
    delete (patch as Record<string, unknown>).emails;
  }
  store.contacts[idx] = { ...store.contacts[idx], ...patch };
  writeStore(store);
  return store.contacts[idx];
}

export function updateAccount(
  id: string,
  data: Partial<Pick<Account, "name" | "aliases" | "recordType" | "type" | "subType" | "category" | "operatingMarket" | "address" | "website" | "notes" | "industry" | "linkedinUrl" | "linkedinDescription" | "employeeRange" | "associatedMembers" | "linkedinIndustry" | "linkedinHeadquarters" | "linkedinCompanyType" | "enrichmentSource" | "enrichmentConfidence" | "enrichedAt" | "revenueTier" | "relationshipStage" | "geo" | "domain" | "owner" | "interests" | "tier" | "lifecycleStage" | "convertedFromLeadId" | "referralPartnerAccountId" | "sourceRefs" | "logoAssetId" | "assets">>
): Account | null {
  const store = readStore();
  const idx = store.accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const patch = definedPatch(data);
  // Hard guard: never allow `name` or `type` to be cleared via update. These
  // are the searchable identity fields. If a future caller tries, ignore the
  // attempt rather than silently corrupting the record.
  if ("name" in patch && (typeof patch.name !== "string" || patch.name.trim() === "")) {
    delete (patch as Record<string, unknown>).name;
  }
  if ("type" in patch && !patch.type) {
    delete (patch as Record<string, unknown>).type;
  }
  if ("type" in patch) {
    patch.type = normalizeAccountType(patch.type);
  }
  if ("lifecycleStage" in patch) {
    patch.lifecycleStage = normalizeAccountLifecycleStage(patch.lifecycleStage);
  }
  store.accounts[idx] = { ...store.accounts[idx], ...patch, updatedAt: now() };
  writeStore(store);
  return store.accounts[idx];
}

export function updateActivity(
  id: string,
  data: Partial<Pick<CRMActivity, "content" | "type">>
): CRMActivity | null {
  const store = readStore();
  const idx = store.activities.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const patch = definedPatch(data);
  store.activities[idx] = { ...store.activities[idx], ...patch, updatedAt: now() };
  writeStore(store);
  return store.activities[idx];
}

export function updateOpportunity(
  id: string,
  data: Partial<Omit<Pick<Opportunity, "accountId" | "contactId" | "name" | "opportunityType" | "location" | "stage" | "openDate" | "closeDate" | "forecastConfidence" | "valueType" | "value" | "pricingUnit" | "quantity" | "unitPrice" | "computedValue" | "source" | "owner" | "nextStep" | "nextStepDueDate" | "notes" | "lossReason" | "promotedFromAccountId" | "referralPartnerAccountId" | "referralPartnerContactId" | "payoutAllocations" | "deletedAt">, "closeDate">> & { closeDate?: Opportunity["closeDate"] | null }
): Opportunity | null {
  const store = readStore();
  const idx = store.opportunities.findIndex((opportunity) => opportunity.id === id);
  if (idx === -1) return null;

  const current = store.opportunities[idx];
  const patch = definedPatch(data);
  if ("stage" in patch) {
    patch.stage = normalizeOpportunityStage(patch.stage);
  }
  const nextAccountId = patch.accountId ?? current.accountId;
  const nextContactId = patch.contactId ?? current.contactId;
  const hasCloseDatePatch = Object.prototype.hasOwnProperty.call(data, "closeDate");
  const nextCloseDate = hasCloseDatePatch
    ? (data.closeDate || undefined)
    : (patch.stage === "Closed Won" || patch.stage === "Closed Lost") && !current.closeDate
      ? now().slice(0, 10)
      : current.closeDate;

  assertAccountExists(store.accounts, nextAccountId);
  assertContactExists(store.contacts, nextContactId);

  const nextOpportunity: Opportunity = {
    ...current,
    ...patch,
    accountId: nextAccountId,
    contactId: nextContactId,
    closeDate: nextCloseDate,
    nextStep: patch.nextStep !== undefined ? patch.nextStep.trim() : current.nextStep,
    updatedAt: now(),
  };
  if (!nextOpportunity.closeDate) delete (nextOpportunity as unknown as Record<string, unknown>).closeDate;
  store.opportunities[idx] = nextOpportunity;
  const accountIndex = store.accounts.findIndex((item) => item.id === nextOpportunity.accountId);
  if (accountIndex !== -1 && nextOpportunity.stage === "Closed Won") {
    store.accounts[accountIndex] = { ...store.accounts[accountIndex], type: "Client", updatedAt: now() };
  }
  writeStore(store);
  return store.opportunities[idx];
}

export function deleteAccount(id: string): boolean {
  const store = readStore();
  const idx = store.accounts.findIndex((account) => account.id === id);
  if (idx === -1) return false;

  store.accounts[idx] = { ...store.accounts[idx], deletedAt: now(), updatedAt: now() };
  writeStore(store);
  return true;
}

export function linkContactToAccount(
  contactId: string,
  accountId: string
): Contact | null {
  return updateContact(contactId, { accountId });
}

export function deleteActivity(id: string): boolean {
  const store = readStore();
  const idx = store.activities.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  store.activities.splice(idx, 1);
  writeStore(store);
  return true;
}

export function deleteOpportunity(id: string): boolean {
  const store = readStore();
  const idx = store.opportunities.findIndex((opportunity) => opportunity.id === id);
  if (idx === -1) return false;
  store.opportunities[idx] = { ...store.opportunities[idx], updatedAt: now(), deletedAt: now() };
  writeStore(store);
  return true;
}

export function deleteContact(id: string): boolean {
  const store = readStore();
  const idx = store.contacts.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.contacts[idx] = { ...store.contacts[idx], deletedAt: now() };
  writeStore(store);
  return true;
}

export function getEmailActivities(contactId?: string): CRMActivity[] {
  const store = readStore();
  const emails = store.activities.filter((a) => a.type === "Email");
  if (contactId) return emails.filter((a) => a.contactId === contactId);
  return emails;
}

export function addEmailActivity(data: Partial<CRMActivity> & {
  contactId: string;
  emailSubject: string;
  emailBodyText: string;
  emailFrom: string;
  occurredAt: string;
}): CRMActivity {
  const source: CRMActivity["source"] = (data.source as CRMActivity["source"]) || "Gmail Sync";
  // Internal dedupe on (source, externalRef, contactId). If a row already
  // exists for this triple, return it instead of creating a duplicate. The
  // route layer enforces the same key today; mirroring it here means any
  // future caller that bypasses the route still gets dedup.
  if (data.externalRef) {
    const existing = readStore().activities.find(
      (a) => a.source === source && a.externalRef === data.externalRef && a.contactId === data.contactId,
    );
    if (existing) return existing;
  }
  const activity = createActivity({
    contactId: data.contactId,
    type: "Email",
    content: data.emailSubject,
  });
  // Enrich with email fields
  const store = readStore();
  const idx = store.activities.findIndex((a) => a.id === activity.id);
  if (idx !== -1) {
    store.activities[idx] = {
      ...store.activities[idx],
      occurredAt: data.occurredAt,
      source: (data.source as CRMActivity["source"]) || "Gmail Sync",
      provenance: data.provenance || "imported",
      externalRef: data.externalRef,
      emailSubject: data.emailSubject,
      emailFrom: data.emailFrom,
      emailTo: data.emailTo,
      emailBodyText: data.emailBodyText,
      accountId: data.accountId || store.activities[idx].accountId,
      updatedAt: now(),
    };
    // Update contact.lastEmailAt if this email is more recent
    const contactIdx = store.contacts.findIndex((c) => c.id === data.contactId);
    if (contactIdx !== -1) {
      const current = store.contacts[contactIdx].lastEmailAt;
      if (!current || data.occurredAt > current) {
        store.contacts[contactIdx] = { ...store.contacts[contactIdx], lastEmailAt: data.occurredAt };
      }
    }
    writeStore(store);
    return store.activities[idx];
  }
  return activity;
}

// Canonical helper for Fireflies meeting sync. Mirrors addEmailActivity's
// pattern: createActivity for the base record, then enrich with meeting-
// specific fields. Routes all writes through writeStore so we get atomic
// writes + backups + serialization for free.
export function addMeetingActivity(data: {
  contactId: string;
  accountId?: string;
  occurredAt: string;
  meetingTitle: string;
  briefingContent: string;
  externalRef: string;
  participants?: string[];
  durationMinutes?: number;
  recordingLink?: string;
}): CRMActivity {
  // Internal dedupe on (source, externalRef, contactId). Source is always
  // "Fireflies" for this helper. The sync-meeting route also dedupes
  // upstream; this guard catches any future caller that forgets to.
  if (data.externalRef) {
    const existing = readStore().activities.find(
      (a) => a.source === "Fireflies" && a.externalRef === data.externalRef && a.contactId === data.contactId,
    );
    if (existing) return existing;
  }
  const activity = createActivity({
    contactId: data.contactId,
    type: "Meeting",
    content: data.briefingContent,
  });
  const store = readStore();
  const idx = store.activities.findIndex((a) => a.id === activity.id);
  if (idx === -1) return activity;
  store.activities[idx] = {
    ...store.activities[idx],
    occurredAt: data.occurredAt,
    source: "Fireflies",
    provenance: "imported",
    externalRef: data.externalRef,
    meetingTitle: data.meetingTitle,
    participants: data.participants ?? [],
    durationMinutes: data.durationMinutes,
    summary: data.briefingContent.slice(0, 500),
    recordingLink: data.recordingLink,
    accountId: data.accountId ?? store.activities[idx].accountId,
    updatedAt: now(),
  };
  writeStore(store);
  return store.activities[idx];
}

export function getLastActivityDate(contactId: string): string | null {
  const activities = getActivities(contactId);
  if (activities.length === 0) return null;
  const sorted = [...activities].sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  return sorted[0].occurredAt;
}
