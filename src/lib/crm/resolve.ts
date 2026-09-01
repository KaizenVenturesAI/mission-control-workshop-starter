// ── CRM Entity Resolution ──
// Centralized name/email/domain → Account/Contact resolvers.
// Pure module: no I/O, no global state, no runtime deps.
//
// Behavior examples:
//   resolveAccount({ email: "alice@acme.com" }, accounts)  -> domain hit, conf 1.0
//   resolveAccount({ name: "ACME, Inc." }, accounts)        -> name hit on "Acme", conf 0.95
//   resolveAccount({ name: "Acme Corporation" }, accounts)  -> alias hit if "ACME Corp" listed, conf 0.9
//   resolveAccount({ name: "Hereos Brand" }, accounts)      -> fuzzy hit on "Heroes Brand", conf ~0.55
//   resolveContact({ email: "Alice@Acme.com" }, contacts)   -> case-insensitive email hit, conf 1.0
//   resolveContact({ name: "John Smith", company: "Acme" }, contacts, accounts)
//     -> if multiple John Smiths and one is on the Acme account, picks that one, conf 0.9

import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";

export interface ResolveAccountInput {
  name?: string;
  email?: string;
  domain?: string;
}

export interface ResolveContactInput {
  name?: string;
  email?: string;
  company?: string;
}

export type MatchedOn = "name" | "alias" | "domain" | "email" | "fuzzy";

export interface ResolveResult<T> {
  match: T | null;
  confidence: number;
  matchedOn: MatchedOn[];
}

const EMPTY_ACCOUNT: ResolveResult<Account> = { match: null, confidence: 0, matchedOn: [] };
const EMPTY_CONTACT: ResolveResult<Contact> = { match: null, confidence: 0, matchedOn: [] };

export function normalizeOrgName(s: string | null | undefined): string {
  if (!s) return "";
  let out = String(s).toLowerCase().trim();
  out = out.replace(/[.,]+$/g, "");
  out = out.replace(/\s+(llc|inc|incorporated|corp|corporation|ltd|limited)\.?$/i, "");
  out = out.replace(/[.,]+$/g, "");
  out = out.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = String(email).toLowerCase().trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1) || null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function levenshteinRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

export function resolveAccount(
  input: ResolveAccountInput,
  accounts: Account[],
): ResolveResult<Account> {
  if (!accounts || accounts.length === 0) return EMPTY_ACCOUNT;

  const explicitDomain = input?.domain ? String(input.domain).toLowerCase().trim() : "";
  const emailDomain = extractEmailDomain(input?.email);
  const targetDomain = explicitDomain || emailDomain || "";

  if (targetDomain) {
    const hit = accounts.find(
      (a) => !!a.domain && a.domain.toLowerCase().trim() === targetDomain,
    );
    if (hit) return { match: hit, confidence: 1.0, matchedOn: ["domain"] };
  }

  const targetName = normalizeOrgName(input?.name);
  if (!targetName) return EMPTY_ACCOUNT;

  const exact = accounts.find((a) => normalizeOrgName(a.name) === targetName);
  if (exact) return { match: exact, confidence: 0.95, matchedOn: ["name"] };

  const alias = accounts.find((a) =>
    (a.aliases ?? []).some((al) => normalizeOrgName(al) === targetName),
  );
  if (alias) return { match: alias, confidence: 0.9, matchedOn: ["alias"] };

  let bestRatio = 0;
  let bestAccount: Account | null = null;
  for (const a of accounts) {
    const candidates = [a.name, ...(a.aliases ?? [])];
    for (const c of candidates) {
      const norm = normalizeOrgName(c);
      if (!norm) continue;
      const r = levenshteinRatio(targetName, norm);
      if (r > bestRatio) {
        bestRatio = r;
        bestAccount = a;
      }
    }
  }
  if (bestAccount && bestRatio >= 0.85) {
    return { match: bestAccount, confidence: 0.6 * bestRatio, matchedOn: ["fuzzy"] };
  }

  return EMPTY_ACCOUNT;
}

export function resolveContact(
  input: ResolveContactInput,
  contacts: Contact[],
  accounts?: Account[],
): ResolveResult<Contact> {
  if (!contacts || contacts.length === 0) return EMPTY_CONTACT;

  const targetEmail = input?.email ? String(input.email).toLowerCase().trim() : "";
  if (targetEmail) {
    const hit = contacts.find((c) =>
      (c.emails ?? []).some((e) => (e || "").toLowerCase().trim() === targetEmail),
    );
    if (hit) return { match: hit, confidence: 1.0, matchedOn: ["email"] };
  }

  const targetName = (input?.name || "").toLowerCase().trim();
  if (!targetName) return EMPTY_CONTACT;

  const exactNameMatches = contacts.filter(
    (c) => (c.name || "").toLowerCase().trim() === targetName,
  );

  if (input?.company && accounts && accounts.length > 0 && exactNameMatches.length > 0) {
    const targetCompany = normalizeOrgName(input.company);
    if (targetCompany) {
      const accountNames = new Map<string, string[]>();
      for (const a of accounts) {
        const names = [normalizeOrgName(a.name)];
        for (const al of a.aliases ?? []) names.push(normalizeOrgName(al));
        accountNames.set(a.id, names.filter(Boolean));
      }
      const preferred = exactNameMatches.find(
        (c) => c.accountId && (accountNames.get(c.accountId) ?? []).includes(targetCompany),
      );
      if (preferred) return { match: preferred, confidence: 0.9, matchedOn: ["name"] };
    }
  }

  if (exactNameMatches.length === 1) {
    return { match: exactNameMatches[0], confidence: 0.7, matchedOn: ["name"] };
  }
  if (exactNameMatches.length > 1) {
    return { match: exactNameMatches[0], confidence: 0.7, matchedOn: ["name"] };
  }

  let bestRatio = 0;
  let bestContact: Contact | null = null;
  for (const c of contacts) {
    const cname = (c.name || "").toLowerCase().trim();
    if (!cname) continue;
    const r = levenshteinRatio(targetName, cname);
    if (r > bestRatio) {
      bestRatio = r;
      bestContact = c;
    }
  }
  if (bestContact && bestRatio >= 0.88) {
    return { match: bestContact, confidence: 0.5 * bestRatio, matchedOn: ["fuzzy"] };
  }

  return EMPTY_CONTACT;
}
