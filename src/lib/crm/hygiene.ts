import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { AuditFieldChange } from "@/types/audit-log";
import type { CRMStore } from "@/lib/crm/store";
import { normalizeOrgName, type MatchedOn } from "@/lib/crm/resolve";

export type DuplicateKind = "account" | "contact";

export interface DismissedDuplicatePair {
  key: string;
  kind: DuplicateKind;
  ids: [string, string];
  dismissedAt: string;
  dismissedBy: string;
}

export interface HygieneRunSummary {
  id: string;
  ranAt: string;
  trigger: "realtime" | "weekly" | "manual";
  contactsScanned: number;
  accountsScanned: number;
  contactsMerged: number;
  accountsMerged: number;
  malformedEmailsCleaned: number;
  skippedForReview: number;
  errors: string[];
  mergedRecords: {
    kind: DuplicateKind;
    winnerId: string;
    loserId: string;
    confidence: number;
    canonicalReason: string;
    winnerChanges: AuditFieldChange[];
    loserChanges: AuditFieldChange[];
  }[];
}

export interface DuplicatePairInfo {
  kind: DuplicateKind;
  idA: string;
  idB: string;
  confidence: number;
  matchedOn: MatchedOn[];
}

export interface MergeResult {
  ok: true;
  winner: Account | Contact;
  mergedActivityCount: number;
  mergedContactCount: number;
  mergedOpportunityCount: number;
  winnerChanges: AuditFieldChange[];
  loserChanges: AuditFieldChange[];
  canonicalReason: string;
}

const AUTO_MERGE_THRESHOLD = 0.9;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.(?:com|co|net|org|io|edu|gov|us|ca|ai|app|dev|br|co\.uk)/gi;

function now(): string {
  return new Date().toISOString();
}

function dedupeStrings(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = String(value).trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function mergeArrays<T>(a: T[] | undefined, b: T[] | undefined, keyFn: (value: T) => string): T[] | undefined {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.length > 0 ? out : undefined;
}

function appendNote(existing: string | undefined, line: string): string {
  if (!existing?.trim()) return line;
  if (existing.includes(line)) return existing;
  return `${existing.trim()}\n\n${line}`;
}

export function duplicatePairKey(kind: DuplicateKind, idA: string, idB: string): string {
  const [low, high] = idA < idB ? [idA, idB] : [idB, idA];
  return `${kind}:${low}::${high}`;
}

export function isPairDismissed(store: CRMStore, kind: DuplicateKind, idA: string, idB: string): boolean {
  const key = duplicatePairKey(kind, idA, idB);
  return (store.dismissedDuplicatePairs ?? []).some((pair) => pair.key === key);
}

export function dismissDuplicatePair(store: CRMStore, kind: DuplicateKind, idA: string, idB: string, actor: string): DismissedDuplicatePair {
  const key = duplicatePairKey(kind, idA, idB);
  const existing = (store.dismissedDuplicatePairs ?? []).find((pair) => pair.key === key);
  if (existing) return existing;
  const [low, high] = idA < idB ? [idA, idB] : [idB, idA];
  const dismissed: DismissedDuplicatePair = {
    key,
    kind,
    ids: [low, high],
    dismissedAt: now(),
    dismissedBy: actor,
  };
  store.dismissedDuplicatePairs = [...(store.dismissedDuplicatePairs ?? []), dismissed];
  return dismissed;
}

export function extractCleanEmails(values: (string | undefined | null)[]): string[] {
  const found: string[] = [];
  for (const raw of values) {
    if (!raw) continue;
    const matches = String(raw).match(EMAIL_RE) ?? [];
    found.push(...matches.map((email) => email.toLowerCase()));
  }
  return dedupeStrings(found);
}

export function cleanMalformedContactEmails(contact: Contact): { changed: boolean; before: string[]; after: string[] } {
  const before = [...(contact.emails ?? [])];
  const cleanedPrimary = extractCleanEmails(before);
  if (cleanedPrimary.length === 0) return { changed: false, before, after: before };

  const cleanedAdditional = extractCleanEmails(contact.additionalEmails ?? []);
  const after = dedupeStrings(cleanedPrimary);
  const additionalEmails = dedupeStrings([...cleanedAdditional, ...after.slice(1)]).filter(
    (email) => !after.some((primary) => primary.toLowerCase() === email.toLowerCase()),
  );
  const changed =
    JSON.stringify(before) !== JSON.stringify(after) ||
    JSON.stringify(contact.additionalEmails ?? []) !== JSON.stringify(additionalEmails);

  if (changed) {
    contact.emails = after;
    contact.additionalEmails = additionalEmails.length > 0 ? additionalEmails : undefined;
  }
  return { changed, before, after };
}

function emailDomains(contact: Contact): Set<string> {
  const emails = extractCleanEmails([...(contact.emails ?? []), ...(contact.additionalEmails ?? [])]);
  return new Set(emails.map((email) => email.split("@")[1]).filter(Boolean));
}

function normalizeName(value?: string): string {
  return (value ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizedPhone(value?: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function recordPair(
  pairs: Map<string, DuplicatePairInfo>,
  kind: DuplicateKind,
  idA: string,
  idB: string,
  confidence: number,
  matchedOn: MatchedOn[],
): void {
  if (idA === idB) return;
  const key = duplicatePairKey(kind, idA, idB);
  const existing = pairs.get(key);
  if (!existing || confidence > existing.confidence) {
    pairs.set(key, { kind, idA, idB, confidence, matchedOn: Array.from(new Set(matchedOn)) });
  } else if (confidence === existing.confidence) {
    existing.matchedOn = Array.from(new Set([...existing.matchedOn, ...matchedOn]));
  }
}

function indexGroup(index: Map<string, string[]>, key: string | undefined, id: string): void {
  const normalized = (key ?? "").trim().toLowerCase();
  if (!normalized) return;
  const ids = index.get(normalized) ?? [];
  ids.push(id);
  index.set(normalized, ids);
}

function recordGroups(
  pairs: Map<string, DuplicatePairInfo>,
  kind: DuplicateKind,
  index: Map<string, string[]>,
  confidence: number,
  matchedOn: MatchedOn[],
): void {
  for (const ids of index.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        recordPair(pairs, kind, ids[i], ids[j], confidence, matchedOn);
      }
    }
  }
}

export function findDuplicatePairs(store: CRMStore, opts?: { includeDismissed?: boolean }): DuplicatePairInfo[] {
  const accounts = store.accounts.filter((account) => !account.deletedAt);
  const contacts = store.contacts.filter((contact) => !contact.deletedAt);
  const pairs = new Map<string, DuplicatePairInfo>();

  const accountsByDomain = new Map<string, string[]>();
  const accountsByName = new Map<string, string[]>();
  const accountsByAlias = new Map<string, string[]>();
  for (const account of accounts) {
    indexGroup(accountsByDomain, account.domain || account.website?.replace(/^https?:\/\//, "").split("/")[0], account.id);
    indexGroup(accountsByName, normalizeOrgName(account.name), account.id);
    for (const alias of account.aliases ?? []) indexGroup(accountsByAlias, normalizeOrgName(alias), account.id);
  }
  recordGroups(pairs, "account", accountsByDomain, 1, ["domain"]);
  recordGroups(pairs, "account", accountsByName, 0.95, ["name"]);
  recordGroups(pairs, "account", accountsByAlias, 0.9, ["alias"]);

  const contactsByEmail = new Map<string, string[]>();
  const contactsByPhone = new Map<string, string[]>();
  const contactsByNameAccount = new Map<string, string[]>();
  const contactsByNameDomain = new Map<string, string[]>();
  const accountById = new Map(accounts.map((account) => [account.id, account] as const));

  for (const contact of contacts) {
    for (const email of extractCleanEmails([...(contact.emails ?? []), ...(contact.additionalEmails ?? [])])) {
      indexGroup(contactsByEmail, email, contact.id);
    }
    const phone = normalizedPhone(contact.phone);
    if (phone.length >= 7) indexGroup(contactsByPhone, phone, contact.id);

    const name = normalizeName(contact.name);
    if (!name) continue;
    if (contact.accountId) indexGroup(contactsByNameAccount, `${name}::${contact.accountId}`, contact.id);
    const domains = emailDomains(contact);
    for (const domain of domains) indexGroup(contactsByNameDomain, `${name}::${domain}`, contact.id);

    const account = contact.accountId ? accountById.get(contact.accountId) : undefined;
    const company = normalizeOrgName(contact.company || account?.name);
    if (company) indexGroup(contactsByNameAccount, `${name}::${company}`, contact.id);
  }
  recordGroups(pairs, "contact", contactsByEmail, 1, ["email"]);
  recordGroups(pairs, "contact", contactsByPhone, 0.95, ["fuzzy"]);
  recordGroups(pairs, "contact", contactsByNameAccount, 0.92, ["name"]);
  recordGroups(pairs, "contact", contactsByNameDomain, 0.9, ["name", "domain"]);

  return Array.from(pairs.values())
    .filter((pair) => opts?.includeDismissed || !isPairDismissed(store, pair.kind, pair.idA, pair.idB))
    .sort((a, b) => b.confidence - a.confidence);
}

function contactCompleteness(store: CRMStore, contact: Contact): number {
  const populated = [
    contact.name,
    contact.title,
    contact.company,
    contact.accountId,
    contact.phone,
    contact.notes,
    contact.rates,
    contact.owner,
    contact.priority,
    contact.relationshipOwner,
    contact.supportingAgent,
    contact.primarySourceAccount,
    contact.location,
    contact.linkedinUrl,
    contact.lastTouchAt,
    contact.lastEmailAt,
  ].filter(Boolean).length;
  const activities = store.activities.filter((activity) => activity.contactId === contact.id).length;
  const opportunities = store.opportunities.filter((opp) => !opp.deletedAt && opp.contactId === contact.id).length;
  return populated + (contact.emails?.length ?? 0) * 2 + (contact.additionalEmails?.length ?? 0) + (contact.tags?.length ?? 0) + (contact.interests?.length ?? 0) + activities * 2 + opportunities * 3;
}

function accountCompleteness(store: CRMStore, account: Account): number {
  const populated = [
    account.name,
    account.domain,
    account.website,
    account.notes,
    account.industry,
    account.linkedinUrl,
    account.linkedinDescription,
    account.employeeRange,
    account.associatedMembers,
    account.owner,
    account.revenueTier,
    account.relationshipStage,
    account.geo,
    account.logoAssetId,
  ].filter(Boolean).length;
  const contacts = store.contacts.filter((contact) => !contact.deletedAt && contact.accountId === account.id).length;
  const activities = store.activities.filter((activity) => activity.accountId === account.id).length;
  const opportunities = store.opportunities.filter((opp) => !opp.deletedAt && opp.accountId === account.id).length;
  return populated + (account.aliases?.length ?? 0) + (account.interests?.length ?? 0) + (account.assets?.length ?? 0) * 2 + contacts * 2 + activities * 2 + opportunities * 3;
}

export function chooseCanonical(store: CRMStore, kind: DuplicateKind, idA: string, idB: string): { winnerId: string; loserId: string; reason: string } | null {
  if (kind === "contact") {
    const a = store.contacts.find((contact) => contact.id === idA);
    const b = store.contacts.find((contact) => contact.id === idB);
    if (!a || !b) return null;
    const scoreA = contactCompleteness(store, a);
    const scoreB = contactCompleteness(store, b);
    return scoreA >= scoreB
      ? { winnerId: idA, loserId: idB, reason: `contact completeness ${scoreA} vs ${scoreB}` }
      : { winnerId: idB, loserId: idA, reason: `contact completeness ${scoreB} vs ${scoreA}` };
  }
  const a = store.accounts.find((account) => account.id === idA);
  const b = store.accounts.find((account) => account.id === idB);
  if (!a || !b) return null;
  const scoreA = accountCompleteness(store, a);
  const scoreB = accountCompleteness(store, b);
  return scoreA >= scoreB
    ? { winnerId: idA, loserId: idB, reason: `account completeness ${scoreA} vs ${scoreB}` }
    : { winnerId: idB, loserId: idA, reason: `account completeness ${scoreB} vs ${scoreA}` };
}

function changeIfDifferent<T extends Account | Contact>(field: keyof T, before: T, after: T, changes: AuditFieldChange[]): void {
  if (JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)) {
    changes.push({ field: String(field), before: before[field], after: after[field] });
  }
}

export function mergeRecords(store: CRMStore, kind: DuplicateKind, winnerId: string, loserId: string, canonicalReason = "manual selection"): MergeResult | { ok: false; error: string; status: number } {
  if (winnerId === loserId) return { ok: false, error: "winnerId and loserId must differ", status: 400 };
  const timestamp = now();

  if (kind === "account") {
    const winnerIdx = store.accounts.findIndex((account) => account.id === winnerId);
    const loserIdx = store.accounts.findIndex((account) => account.id === loserId);
    if (winnerIdx === -1) return { ok: false, error: "winner not found", status: 404 };
    if (loserIdx === -1) return { ok: false, error: "loser not found", status: 404 };
    const winner = store.accounts[winnerIdx];
    const loser = store.accounts[loserIdx];
    if (winner.deletedAt) return { ok: false, error: `already merged into ${winner.mergedInto ?? "deleted-winner"}`, status: 409 };
    if (loser.mergedInto === winnerId) return { ok: true, winner, mergedActivityCount: 0, mergedContactCount: 0, mergedOpportunityCount: 0, winnerChanges: [], loserChanges: [], canonicalReason };
    if (loser.mergedInto && loser.mergedInto !== winnerId) return { ok: false, error: `already merged into ${loser.mergedInto}`, status: 409 };

    let mergedContactCount = 0;
    let mergedActivityCount = 0;
    let mergedOpportunityCount = 0;
    store.contacts = store.contacts.map((contact) => {
      if (contact.accountId !== loserId) return contact;
      mergedContactCount += 1;
      return { ...contact, accountId: winnerId };
    });
    store.activities = store.activities.map((activity) => {
      if (activity.accountId !== loserId) return activity;
      mergedActivityCount += 1;
      return { ...activity, accountId: winnerId, updatedAt: timestamp };
    });
    store.opportunities = store.opportunities.map((opp) => {
      if (opp.accountId !== loserId) return opp;
      mergedOpportunityCount += 1;
      return { ...opp, accountId: winnerId, updatedAt: timestamp };
    });

    const updated: Account = {
      ...winner,
      aliases: dedupeStrings([...(winner.aliases ?? []), loser.name, ...(loser.aliases ?? [])]),
      domain: winner.domain || loser.domain,
      website: winner.website || loser.website,
      notes: loser.notes && loser.notes !== winner.notes ? appendNote(winner.notes, `Merged note from ${loser.name}: ${loser.notes}`) : winner.notes,
      industry: winner.industry || loser.industry,
      linkedinUrl: winner.linkedinUrl || loser.linkedinUrl,
      linkedinDescription: winner.linkedinDescription || loser.linkedinDescription,
      employeeRange: winner.employeeRange || loser.employeeRange,
      associatedMembers: winner.associatedMembers ?? loser.associatedMembers,
      linkedinIndustry: winner.linkedinIndustry || loser.linkedinIndustry,
      linkedinHeadquarters: winner.linkedinHeadquarters || loser.linkedinHeadquarters,
      linkedinCompanyType: winner.linkedinCompanyType || loser.linkedinCompanyType,
      enrichmentSource: winner.enrichmentSource || loser.enrichmentSource,
      enrichmentConfidence: winner.enrichmentConfidence || loser.enrichmentConfidence,
      enrichedAt: winner.enrichedAt || loser.enrichedAt,
      revenueTier: winner.revenueTier || loser.revenueTier,
      relationshipStage: winner.relationshipStage || loser.relationshipStage,
      geo: winner.geo || loser.geo,
      owner: winner.owner || loser.owner,
      interests: mergeArrays(winner.interests, loser.interests, (value) => value.toLowerCase()),
      tier: winner.tier || loser.tier,
      lifecycleStage: winner.lifecycleStage || loser.lifecycleStage,
      sourceRefs: mergeArrays(winner.sourceRefs, loser.sourceRefs, (value) => `${value.system}:${value.externalId ?? value.url ?? value.label ?? ""}`),
      assets: mergeArrays(winner.assets, loser.assets, (value) => value.id || value.url || value.fileName),
      logoAssetId: winner.logoAssetId || loser.logoAssetId,
      updatedAt: timestamp,
    };
    const archivedLoser: Account = { ...loser, deletedAt: timestamp, mergedInto: winnerId, updatedAt: timestamp };
    store.accounts[winnerIdx] = updated;
    store.accounts[loserIdx] = archivedLoser;

    const winnerChanges: AuditFieldChange[] = [];
    const loserChanges: AuditFieldChange[] = [];
    for (const field of ["aliases", "domain", "website", "notes", "industry", "linkedinUrl", "interests", "sourceRefs", "assets", "updatedAt"] as (keyof Account)[]) changeIfDifferent(field, winner, updated, winnerChanges);
    for (const field of ["deletedAt", "mergedInto", "updatedAt"] as (keyof Account)[]) changeIfDifferent(field, loser, archivedLoser, loserChanges);
    return { ok: true, winner: updated, mergedActivityCount, mergedContactCount, mergedOpportunityCount, winnerChanges, loserChanges, canonicalReason };
  }

  const winnerIdx = store.contacts.findIndex((contact) => contact.id === winnerId);
  const loserIdx = store.contacts.findIndex((contact) => contact.id === loserId);
  if (winnerIdx === -1) return { ok: false, error: "winner not found", status: 404 };
  if (loserIdx === -1) return { ok: false, error: "loser not found", status: 404 };
  const winner = store.contacts[winnerIdx];
  const loser = store.contacts[loserIdx];
  if (winner.deletedAt) return { ok: false, error: `already merged into ${winner.mergedInto ?? "deleted-winner"}`, status: 409 };
  if (loser.mergedInto === winnerId) return { ok: true, winner, mergedActivityCount: 0, mergedContactCount: 0, mergedOpportunityCount: 0, winnerChanges: [], loserChanges: [], canonicalReason };
  if (loser.mergedInto && loser.mergedInto !== winnerId) return { ok: false, error: `already merged into ${loser.mergedInto}`, status: 409 };

  let mergedActivityCount = 0;
  let mergedOpportunityCount = 0;
  store.activities = store.activities.map((activity) => {
    if (activity.contactId !== loserId) return activity;
    mergedActivityCount += 1;
    return { ...activity, contactId: winnerId, accountId: activity.accountId || winner.accountId || loser.accountId, updatedAt: timestamp };
  });
  store.opportunities = store.opportunities.map((opp) => {
    if (opp.contactId !== loserId) return opp;
    mergedOpportunityCount += 1;
    return { ...opp, contactId: winnerId, accountId: opp.accountId || winner.accountId || loser.accountId || opp.accountId, updatedAt: timestamp };
  });

  const emails = dedupeStrings(extractCleanEmails([...(winner.emails ?? []), ...(winner.additionalEmails ?? []), ...(loser.emails ?? []), ...(loser.additionalEmails ?? [])]));
  const primaryEmails = winner.emails?.length ? dedupeStrings(extractCleanEmails(winner.emails)) : emails.slice(0, 1);
  const additionalEmails = emails.filter((email) => !primaryEmails.some((primary) => primary.toLowerCase() === email.toLowerCase()));
  const updated: Contact = {
    ...winner,
    title: winner.title || loser.title,
    company: winner.company || loser.company,
    accountId: winner.accountId || loser.accountId,
    emails: primaryEmails.length > 0 ? primaryEmails : winner.emails,
    additionalEmails: additionalEmails.length > 0 ? additionalEmails : undefined,
    phone: winner.phone || loser.phone,
    tags: dedupeStrings([...(winner.tags ?? []), ...(loser.tags ?? [])]),
    owner: winner.owner || loser.owner,
    interests: mergeArrays(winner.interests, loser.interests, (value) => value.toLowerCase()),
    notes: loser.notes && loser.notes !== winner.notes ? appendNote(winner.notes, `Merged note from ${loser.name}: ${loser.notes}`) : winner.notes,
    rates: winner.rates || loser.rates,
    priority: winner.priority || loser.priority,
    relationshipOwner: winner.relationshipOwner || loser.relationshipOwner,
    supportingAgent: winner.supportingAgent || loser.supportingAgent,
    primarySourceAccount: winner.primarySourceAccount || loser.primarySourceAccount,
    linkedSourceAccounts: dedupeStrings([...(winner.linkedSourceAccounts ?? []), ...(loser.linkedSourceAccounts ?? [])]),
    interactions: mergeArrays(winner.interactions, loser.interactions, (value) => `${value.date}:${value.summary}:${value.channel ?? ""}`) ?? [],
    fieldProvenance: { ...(loser.fieldProvenance ?? {}), ...(winner.fieldProvenance ?? {}) },
    location: winner.location || loser.location,
    contactType: winner.contactType || loser.contactType,
    lastEmailAt: [winner.lastEmailAt, loser.lastEmailAt].filter(Boolean).sort().at(-1),
    linkedinUrl: winner.linkedinUrl || loser.linkedinUrl,
    lastTouchAt: [winner.lastTouchAt, loser.lastTouchAt].filter(Boolean).sort().at(-1),
    convertedFromLeadId: winner.convertedFromLeadId || loser.convertedFromLeadId,
    sourceRefs: mergeArrays(winner.sourceRefs, loser.sourceRefs, (value) => `${value.system}:${value.externalId ?? value.url ?? value.label ?? ""}`),
  };
  const archivedLoser: Contact = { ...loser, deletedAt: timestamp, mergedInto: winnerId };
  store.contacts[winnerIdx] = updated;
  store.contacts[loserIdx] = archivedLoser;

  const winnerChanges: AuditFieldChange[] = [];
  const loserChanges: AuditFieldChange[] = [];
  for (const field of ["title", "company", "accountId", "emails", "additionalEmails", "phone", "tags", "owner", "interests", "notes", "rates", "priority", "relationshipOwner", "supportingAgent", "primarySourceAccount", "linkedSourceAccounts", "interactions", "location", "contactType", "lastEmailAt", "linkedinUrl", "lastTouchAt", "sourceRefs"] as (keyof Contact)[]) changeIfDifferent(field, winner, updated, winnerChanges);
  for (const field of ["deletedAt", "mergedInto"] as (keyof Contact)[]) changeIfDifferent(field, loser, archivedLoser, loserChanges);
  return { ok: true, winner: updated, mergedActivityCount, mergedContactCount: 0, mergedOpportunityCount, winnerChanges, loserChanges, canonicalReason };
}

export function runCrmHygiene(store: CRMStore, trigger: HygieneRunSummary["trigger"]): HygieneRunSummary {
  const summary: HygieneRunSummary = {
    id: `crm-hygiene-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ranAt: now(),
    trigger,
    contactsScanned: store.contacts.filter((contact) => !contact.deletedAt).length,
    accountsScanned: store.accounts.filter((account) => !account.deletedAt).length,
    contactsMerged: 0,
    accountsMerged: 0,
    malformedEmailsCleaned: 0,
    skippedForReview: 0,
    errors: [],
    mergedRecords: [],
  };

  for (const contact of store.contacts) {
    if (contact.deletedAt) continue;
    const result = cleanMalformedContactEmails(contact);
    if (result.changed) summary.malformedEmailsCleaned += 1;
  }

  for (const pair of findDuplicatePairs(store)) {
    if (pair.confidence < AUTO_MERGE_THRESHOLD) {
      summary.skippedForReview += 1;
      continue;
    }
    const canonical = chooseCanonical(store, pair.kind, pair.idA, pair.idB);
    if (!canonical) {
      summary.errors.push(`Could not choose canonical ${pair.kind} for ${pair.idA}/${pair.idB}`);
      continue;
    }
    const result = mergeRecords(store, pair.kind, canonical.winnerId, canonical.loserId, `${canonical.reason}; confidence ${Math.round(pair.confidence * 100)}%`);
    if (!result.ok) {
      summary.errors.push(result.error);
      continue;
    }
    summary.mergedRecords.push({
      kind: pair.kind,
      winnerId: canonical.winnerId,
      loserId: canonical.loserId,
      confidence: pair.confidence,
      canonicalReason: result.canonicalReason,
      winnerChanges: result.winnerChanges,
      loserChanges: result.loserChanges,
    });
    if (pair.kind === "contact") summary.contactsMerged += 1;
    else summary.accountsMerged += 1;
  }

  store.hygieneRuns = [summary, ...(store.hygieneRuns ?? [])].slice(0, 30);
  return summary;
}
