import { NextResponse } from "next/server";
import { readStore, withStoreMutation } from "@/lib/crm/store";
import { readSupabaseCrmStore, withSupabaseStoreMutation } from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import { dismissDuplicatePair, findDuplicatePairs, type DuplicateKind } from "@/lib/crm/hygiene";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { MatchedOn } from "@/lib/crm/resolve";

export const dynamic = "force-dynamic";

interface AccountSummary {
  id: string;
  name: string;
  aliases?: string[];
  domain?: string;
}

interface ContactSummary {
  id: string;
  name: string;
  emails: string[];
  accountId?: string;
}

interface PairCounts {
  activitiesA: number;
  activitiesB: number;
  contactsA: number;
  contactsB: number;
  opportunitiesA: number;
  opportunitiesB: number;
}

interface AccountDuplicatePair {
  a: AccountSummary;
  b: AccountSummary;
  confidence: number;
  matchedOn: MatchedOn[];
  counts: PairCounts;
}

interface ContactDuplicatePair {
  a: ContactSummary;
  b: ContactSummary;
  confidence: number;
  matchedOn: MatchedOn[];
  counts: Omit<PairCounts, "contactsA" | "contactsB">;
}

interface DuplicatesResult {
  accounts: AccountDuplicatePair[];
  contacts: ContactDuplicatePair[];
}

function summarizeAccount(account: Account): AccountSummary {
  return { id: account.id, name: account.name, aliases: account.aliases, domain: account.domain };
}

function summarizeContact(contact: Contact): ContactSummary {
  return {
    id: contact.id,
    name: contact.name,
    emails: [...(contact.emails ?? []), ...(contact.additionalEmails ?? [])],
    accountId: contact.accountId,
  };
}

function countBy<T extends { accountId?: string; contactId?: string }>(items: T[], field: "accountId" | "contactId"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = item[field];
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function buildResult(): Promise<DuplicatesResult> {
  const store = shouldUseSupabaseBackend() ? await readSupabaseCrmStore() : readStore();
  const accounts = store.accounts.filter((account) => !account.deletedAt);
  const contacts = store.contacts.filter((contact) => !contact.deletedAt);
  const accountIndex = new Map(accounts.map((account) => [account.id, account] as const));
  const contactIndex = new Map(contacts.map((contact) => [contact.id, contact] as const));
  const activitiesByAccount = countBy(store.activities, "accountId");
  const activitiesByContact = countBy(store.activities, "contactId");
  const oppsByAccount = countBy(store.opportunities.filter((opp) => !opp.deletedAt), "accountId");
  const oppsByContact = countBy(store.opportunities.filter((opp) => !opp.deletedAt), "contactId");

  const contactsByAccount = new Map<string, number>();
  for (const contact of contacts) {
    if (!contact.accountId) continue;
    contactsByAccount.set(contact.accountId, (contactsByAccount.get(contact.accountId) ?? 0) + 1);
  }

  const result: DuplicatesResult = { accounts: [], contacts: [] };
  for (const pair of findDuplicatePairs(store)) {
    if (pair.kind === "account") {
      const a = accountIndex.get(pair.idA);
      const b = accountIndex.get(pair.idB);
      if (!a || !b) continue;
      result.accounts.push({
        a: summarizeAccount(a),
        b: summarizeAccount(b),
        confidence: Number(pair.confidence.toFixed(3)),
        matchedOn: pair.matchedOn,
        counts: {
          activitiesA: activitiesByAccount.get(a.id) ?? 0,
          activitiesB: activitiesByAccount.get(b.id) ?? 0,
          contactsA: contactsByAccount.get(a.id) ?? 0,
          contactsB: contactsByAccount.get(b.id) ?? 0,
          opportunitiesA: oppsByAccount.get(a.id) ?? 0,
          opportunitiesB: oppsByAccount.get(b.id) ?? 0,
        },
      });
    } else {
      const a = contactIndex.get(pair.idA);
      const b = contactIndex.get(pair.idB);
      if (!a || !b) continue;
      result.contacts.push({
        a: summarizeContact(a),
        b: summarizeContact(b),
        confidence: Number(pair.confidence.toFixed(3)),
        matchedOn: pair.matchedOn,
        counts: {
          activitiesA: activitiesByContact.get(a.id) ?? 0,
          activitiesB: activitiesByContact.get(b.id) ?? 0,
          opportunitiesA: oppsByContact.get(a.id) ?? 0,
          opportunitiesB: oppsByContact.get(b.id) ?? 0,
        },
      });
    }
  }

  result.accounts.sort((a, b) => b.confidence - a.confidence);
  result.contacts.sort((a, b) => b.confidence - a.confidence);
  return result;
}

export async function GET() {
  return NextResponse.json(await buildResult(), {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; kind?: DuplicateKind; idA?: string; idB?: string };
    if (body.action !== "dismiss" || (body.kind !== "account" && body.kind !== "contact") || !body.idA || !body.idB) {
      return NextResponse.json({ error: "action=dismiss, kind, idA, and idB are required" }, { status: 400 });
    }
    const actor = actorFromRequest(request);
    const dismissed = shouldUseSupabaseBackend()
      ? await withSupabaseStoreMutation((store) => dismissDuplicatePair(store, body.kind!, body.idA!, body.idB!, actor))
      : await withStoreMutation((store) => dismissDuplicatePair(store, body.kind!, body.idA!, body.idB!, actor));
    safeAppendAuditEntry({
      actor,
      entityType: body.kind,
      entityId: body.idA,
      action: "patch",
      changes: [],
      context: {
        route: "/api/crm/duplicates",
        method: "POST",
        relatedEntityId: body.idB,
        summary: "Permanently dismissed duplicate pair",
      },
    });
    return NextResponse.json({ ok: true, dismissed });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
