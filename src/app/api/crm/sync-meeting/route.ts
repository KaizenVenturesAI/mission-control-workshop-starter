import { NextResponse } from "next/server";
import {
  getContacts,
  getAccounts,
  getActivities,
  createContact,
  createAccount,
  updateContact,
  addMeetingActivity,
} from "@/lib/crm/store";
import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import { resolveAccount, resolveContact } from "@/lib/crm/resolve";
import {
  createSupabaseAccount,
  createSupabaseContact,
  getSupabaseAccounts,
  getSupabaseActivities,
  getSupabaseContacts,
  updateSupabaseContact,
  withSupabaseStoreMutation,
} from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

interface SyncMeetingPayload {
  meetingTitle: string;
  transcriptId: string;
  transcriptLink: string;
  occurredAt: string;
  duration: number;
  participants: { name: string; email: string }[];
  briefingContent: string;
  company?: string;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com",
  "aol.com", "icloud.com", "me.com", "mail.com", "protonmail.com",
  "proton.me", "live.com", "msn.com", "ymail.com", "zoho.com", "gmx.com",
  "fastmail.com",
]);

function getDomain(email: string): string | null {
  const parts = email.toLowerCase().trim().split("@");
  return parts.length === 2 ? parts[1] : null;
}

// Known domain → company name map
const KNOWN_COMPANIES: Record<string, string> = {
  "gotinder.com": "Tinder",
  "heroesbranditalia.com": "Heroes Brand Italia",
  "cocojune.co": "Cocojune",
  "vixbrasil.com": "VIX Brasil",
};

function domainToCompanyName(domain: string): string {
  if (KNOWN_COMPANIES[domain]) return KNOWN_COMPANIES[domain];
  const name = domain.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return { firstName: "Unknown", lastName: "Lead" };
  // If it looks like an email-username (e.g. "first.last"), un-dot it.
  let cleaned = trimmed;
  if (cleaned.includes(".") && !cleaned.includes(" ")) {
    cleaned = cleaned
      .split(".")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }
  const parts = cleaned.split(/\s+/);
  const firstName = parts[0] || "Unknown";
  const lastName = parts.slice(1).join(" ") || "";
  return { firstName, lastName };
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(request: Request) {
  let body: SyncMeetingPayload;
  try {
    body = (await request.json()) as SyncMeetingPayload;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // This route intentionally syncs Fireflies transcripts into the CRM store only.
  // Example Client Meetings briefings are persisted separately via /api/meetings so the UI
  // can evolve independently for now.
  const { meetingTitle, transcriptId, transcriptLink, occurredAt, duration, participants, briefingContent, company } = body ?? {};

  if (!meetingTitle || !transcriptId || !briefingContent) {
    return NextResponse.json(
      { error: "meetingTitle, transcriptId, and briefingContent are required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(participants)) {
    return NextResponse.json(
      { error: "participants must be an array" },
      { status: 400 },
    );
  }

  try {
    const results: { contactId: string; contactName: string; accountId?: string; accountName?: string; activityId?: string; action: string }[] = [];

    for (const participant of participants) {
      const email = (participant?.email || "").toLowerCase().trim();
      if (!email) continue;

      const domain = getDomain(email);
      const isHighConfidence = domain ? !FREE_EMAIL_DOMAINS.has(domain) : false;

      // Match contact by email (re-read on each iteration so newly-created
      // records from prior iterations are visible).
      const contacts = shouldUseSupabaseBackend() ? await getSupabaseContacts() : getContacts();
      let contact: Contact | undefined = resolveContact({ email }, contacts).match ?? undefined;

      let contactAction = "matched";
      if (!contact) {
        const { firstName, lastName } = splitName(participant?.name || "");
        const contactInput = {
          firstName,
          lastName,
          email,
          source: "Fireflies",
        };
        contact = shouldUseSupabaseBackend() ? await createSupabaseContact(contactInput) : createContact(contactInput);
        contactAction = "created";
      }

      // Match or create account.
      let account: Account | undefined;
      const effectiveCompany = company || (isHighConfidence && domain ? domainToCompanyName(domain) : undefined);

      if (effectiveCompany) {
        const accounts = shouldUseSupabaseBackend() ? await getSupabaseAccounts() : getAccounts();
        account = resolveAccount({ name: effectiveCompany, domain: domain ?? undefined }, accounts).match ?? undefined;

        if (!account) {
          const accountInput = {
            name: effectiveCompany,
            type: "Prospect",
            operatingMarket: "Los Angeles",
          } as const;
          account = shouldUseSupabaseBackend() ? await createSupabaseAccount(accountInput) : createAccount(accountInput);
        }

        if (!contact.accountId) {
          const updated = shouldUseSupabaseBackend()
            ? await updateSupabaseContact(contact.id, { accountId: account.id })
            : updateContact(contact.id, { accountId: account.id });
          if (updated) contact = updated;
        }
      }

      // Dedupe activity by transcriptId + contactId.
      const contactActivities = shouldUseSupabaseBackend() ? await getSupabaseActivities(contact.id) : getActivities(contact.id);
      const alreadyExists = contactActivities.some(
        (a) => a.externalRef === transcriptId && a.contactId === contact!.id,
      );

      let activityId: string | undefined;
      if (!alreadyExists) {
        const meetingActivity = {
          id: generateId("act"),
          contactId: contact.id,
          accountId: contact.accountId,
          type: "Meeting" as const,
          occurredAt,
          content: briefingContent,
          source: "Fireflies" as const,
          provenance: "imported" as const,
          externalRef: transcriptId,
          meetingTitle,
          participants: participants.map((p) => p?.name).filter((n): n is string => Boolean(n)),
          durationMinutes: duration,
          summary: briefingContent.slice(0, 500),
          recordingLink: transcriptLink,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const activity = shouldUseSupabaseBackend()
          ? await withSupabaseStoreMutation((store) => {
              store.activities.push(meetingActivity);
              return meetingActivity;
            })
          : addMeetingActivity({
              contactId: contact.id,
              accountId: contact.accountId,
              occurredAt,
              meetingTitle,
              briefingContent,
              externalRef: transcriptId,
              participants: meetingActivity.participants,
              durationMinutes: duration,
              recordingLink: transcriptLink,
            });
        activityId = activity.id;
      }

      results.push({
        contactId: contact.id,
        contactName: contact.name,
        accountId: account?.id,
        accountName: account?.name,
        activityId,
        action: alreadyExists ? `${contactAction} (activity deduped)` : contactAction,
      });
    }

    return NextResponse.json({
      success: true,
      meetingTitle,
      transcriptId,
      syncedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    // Real server / store error — do NOT swallow as 400.
    // eslint-disable-next-line no-console
    console.error("[sync-meeting] write failure:", error);
    return NextResponse.json(
      { error: "Server error while syncing meeting" },
      { status: 500 },
    );
  }
}
