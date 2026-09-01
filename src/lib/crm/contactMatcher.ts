// ── Reusable Contact & Account Matching ──

import type { Contact } from "@/data/contacts";
import type { Account } from "@/data/accounts";
import type { CRMActivity } from "@/data/crm-activities";
import { resolveContact, extractEmailDomain } from "./resolve";

interface CRMStore {
  contacts: Contact[];
  accounts: Account[];
  activities: CRMActivity[];
  opportunities: unknown[];
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "me.com", "mail.com", "protonmail.com",
  "proton.me", "live.com", "msn.com", "ymail.com", "zoho.com", "gmx.com",
  "fastmail.com",
]);

const STOPWORDS = new Set([
  "the", "and", "of", "in", "at", "for", "a", "an", "&",
  "la", "miami", "los", "angeles", "ft", "fort", "lauderdale", "new", "york",
]);

const MIN_TOKEN_LENGTH = 3;

export function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function fuzzyCompanyMatch(incoming: string, existing: string): boolean {
  const tokenize = (s: string): Set<string> => {
    const tokens = s.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(Boolean);
    return new Set(
      tokens.filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t)),
    );
  };

  const incomingTokens = tokenize(incoming);
  const existingTokens = tokenize(existing);

  if (incomingTokens.size === 0 || existingTokens.size === 0) return false;

  for (const token of incomingTokens) {
    if (existingTokens.has(token)) return true;
  }
  return false;
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export function getDomainFromEmail(email: string): string | null {
  return extractEmailDomain(email);
}

export function domainToCompanyName(domain: string): string {
  const name = domain.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function matchOrCreateContact(
  store: CRMStore,
  email: string,
  name?: string,
): { contact: Contact; created: boolean } {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find by email (case-insensitive)
  const existing = resolveContact({ email: normalizedEmail }, store.contacts).match;
  if (existing) return { contact: existing, created: false };

  // 2. Create contact from email
  let firstName = "Unknown";
  let lastName = "";

  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    firstName = parts[0];
    lastName = parts.slice(1).join(" ");
  } else {
    // Parse from email username
    const username = normalizedEmail.split("@")[0];
    if (username.includes(".")) {
      const parts = username.split(".");
      firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      lastName = parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
    } else {
      firstName = username.charAt(0).toUpperCase() + username.slice(1);
    }
  }

  const contact: Contact = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: lastName ? `${firstName} ${lastName}` : firstName,
    emails: [normalizedEmail],
    tags: [],
    source: "Gmail Sync",
    stage: "New",
    followUpState: "none",
    provenance: "imported",
    interactions: [],
  };
  store.contacts.push(contact);
  return { contact, created: true };
}

export function matchOrCreateAccount(
  store: CRMStore,
  companyName: string,
): { account: Account; created: boolean } {
  const normalized = normalizeCompanyName(companyName);

  // 1. Exact normalized match
  const exact = store.accounts.find(
    (a) => normalizeCompanyName(a.name) === normalized,
  );
  if (exact) return { account: exact, created: false };

  // 2. Fuzzy match fallback
  const fuzzy = store.accounts.find((a) =>
    fuzzyCompanyMatch(companyName, a.name),
  );
  if (fuzzy) return { account: fuzzy, created: false };

  // 3. Create new account
  const account: Account = {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: companyName,
    recordType: "company",
    type: "Prospect",
    operatingMarket: "Los Angeles",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provenance: "imported",
  };
  store.accounts.push(account);
  return { account, created: true };
}
