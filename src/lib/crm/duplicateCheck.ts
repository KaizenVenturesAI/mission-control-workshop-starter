import { getContacts, getAccounts } from "@/lib/crm/store";
import { normalizeEmail, normalizeAccountName } from "@/lib/crm/leadIngestion";

export interface DuplicateCheckResult {
  hasDuplicates: boolean;
  matchingContacts: { id: string; name: string; email: string; matchField: string }[];
  matchingAccounts: { id: string; name: string; matchField: string }[];
}

export function checkForDuplicates(input: {
  email?: string;
  phone?: string;
  contactName?: string;
  companyName?: string;
}): DuplicateCheckResult {
  const contacts = getContacts();
  const accounts = getAccounts();
  const matchingContacts: DuplicateCheckResult["matchingContacts"] = [];
  const matchingAccounts: DuplicateCheckResult["matchingAccounts"] = [];

  // Check email match
  const normEmail = normalizeEmail(input.email);
  if (normEmail) {
    contacts.forEach((c) => {
      if (c.emails.some((e) => normalizeEmail(e) === normEmail)) {
        matchingContacts.push({ id: c.id, name: c.name, email: c.emails[0] || "", matchField: "email" });
      }
    });
  }

  // Check phone match
  if (input.phone) {
    const normPhone = input.phone.replace(/\D/g, "");
    contacts.forEach((c) => {
      if (c.phone && c.phone.replace(/\D/g, "") === normPhone && !matchingContacts.some((m) => m.id === c.id)) {
        matchingContacts.push({ id: c.id, name: c.name, email: c.emails[0] || "", matchField: "phone" });
      }
    });
  }

  // Check account name match
  const normName = normalizeAccountName(input.companyName);
  if (normName) {
    accounts.forEach((a) => {
      if (normalizeAccountName(a.name) === normName) {
        matchingAccounts.push({ id: a.id, name: a.name, matchField: "name" });
      }
    });
  }

  return {
    hasDuplicates: matchingContacts.length > 0 || matchingAccounts.length > 0,
    matchingContacts,
    matchingAccounts,
  };
}
