import type { AccountRecordType } from "@/data/accounts";

export const PERSON_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "hotmail.com",
  "aol.com",
  "me.com",
  "live.com",
  "protonmail.com",
  "pm.me",
  "fastmail.com",
]);

export function getEmailDomain(email?: string | null): string | null {
  const match = String(email ?? "").trim().toLowerCase().match(/@([^@\s]+)$/);
  return match ? match[1] : null;
}

export function expectedRecordTypeFromEmail(email?: string | null): AccountRecordType {
  const domain = getEmailDomain(email);
  if (!domain) return "person_account";
  return PERSON_EMAIL_DOMAINS.has(domain) ? "person_account" : "company";
}
