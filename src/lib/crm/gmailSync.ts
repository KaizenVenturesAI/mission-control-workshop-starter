// ── Gmail Sync Engine ──
// Syncs sent emails from Example Client inboxes via gws CLI → CRM activities

import { spawnSync } from "child_process";
import type { CRMActivity } from "@/data/crm-activities";
import {
  matchOrCreateContact,
  matchOrCreateAccount,
  isFreeEmailDomain,
  domainToCompanyName,
} from "./contactMatcher";
import { extractEmailDomain, resolveContact } from "./resolve";
import {
  updateContact,
  readStore as canonicalReadStore,
  writeStore as canonicalWriteStore,
  type CRMStore as CanonicalStore,
} from "./store";
import { getGmailSyncState, setGmailSyncState } from "./gmailSyncState";
import { appendUnmatchedEmail } from "./unmatchedEmails";
import { appendSyncLog } from "./gmailSyncLog";
import { CRM_SYNC_INBOXES, getBusinessInbox } from "@/lib/googleWorkspace/businessInboxes";

const GWS_BIN = "/opt/homebrew/bin/gws";
const INBOXES = CRM_SYNC_INBOXES;

// Local CRMStore alias kept for the existing function signatures and the
// contactMatcher helpers (which type opportunities loosely as `unknown[]`).
// All persistence is routed through store.ts so gmail sync inherits the
// atomic write + backup + serialization mutex from the canonical layer.
type CRMStore = Omit<CanonicalStore, "opportunities"> & { opportunities: unknown[] };

function readStore(): CRMStore {
  return canonicalReadStore() as unknown as CRMStore;
}

function writeStore(store: CRMStore): void {
  canonicalWriteStore(store as unknown as CanonicalStore);
}

function gwsSpawnOptions(inboxLabel: string, timeout: number) {
  const configDir = getBusinessInbox(inboxLabel)?.googleConfigDir;
  return {
    encoding: "utf-8" as const,
    timeout,
    env: {
      ...process.env,
      ...(configDir ? { GOOGLE_WORKSPACE_CLI_CONFIG_DIR: configDir } : {}),
    },
  };
}

export interface GmailSyncResult {
  inbox: string;
  synced: number;
  created: number;
  skipped: number;
  error?: string;
}

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  payload?: {
    headers?: GmailMessageHeader[];
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: GmailMessagePart[];
  };
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseGwsJson(raw: string): unknown | null {
  // gws may emit debug text before JSON — find first { or [
  const startBrace = raw.indexOf("{");
  const startBracket = raw.indexOf("[");
  let startIndex = -1;

  if (startBrace === -1 && startBracket === -1) return null;
  if (startBrace === -1) startIndex = startBracket;
  else if (startBracket === -1) startIndex = startBrace;
  else startIndex = Math.min(startBrace, startBracket);

  try {
    return JSON.parse(raw.slice(startIndex));
  } catch {
    return null;
  }
}

function getHeader(headers: GmailMessageHeader[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function extractBodyText(message: GmailMessage): string {
  const payload = message.payload;
  if (!payload) return "";

  // Direct body on payload
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Search parts recursively — prefer text/plain
  function findPart(parts: GmailMessagePart[] | undefined, mimeType: string): string | null {
    if (!parts) return null;
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const found = findPart(part.parts, mimeType);
        if (found) return found;
      }
    }
    return null;
  }

  const plain = findPart(payload.parts, "text/plain");
  if (plain) return plain;

  // Fallback: strip HTML tags
  const html = findPart(payload.parts, "text/html");
  if (html) return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return "";
}

function parseRecipients(toHeader: string): string[] {
  // Parse "Name <email>, Name <email>" or "email, email" format
  return toHeader
    .split(",")
    .map((entry) => {
      const match = entry.match(/<([^>]+)>/);
      return (match ? match[1] : entry).trim().toLowerCase();
    })
    .filter(Boolean);
}

function parseSenderEmail(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}

/** Compute the after-date string for incremental sync.
 *  - If lastSyncAt exists: use that date (format: YYYY/MM/DD)
 *  - First run: default to 30 days ago so we don't pull all history
 */
function computeAfterDate(lastSyncAt?: string): string {
  if (lastSyncAt) {
    return new Date(lastSyncAt).toISOString().slice(0, 10).replace(/-/g, "/");
  }
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10).replace(/-/g, "/");
}

/**
 * Sync a single Gmail inbox.
 *
 * @param userId      The Gmail userId to pass to gws (normally the actual inbox address)
 * @param inboxLabel  Label used for sync-state bookkeeping and result reporting
 * @param sharedStore Optional pre-loaded CRMStore shared across all inboxes in a single run.
 *                    When provided, this function will NOT call readStore/writeStore — the
 *                    caller is responsible for the final write.  Mutates the object in place.
 */
export async function syncGmailInbox(
  userId: string,
  inboxLabel: string,
  sharedStore?: CRMStore,
): Promise<GmailSyncResult> {
  const result: GmailSyncResult = { inbox: inboxLabel, synced: 0, created: 0, skipped: 0 };

  try {
    const syncState = getGmailSyncState();
    const inboxState = syncState[inboxLabel] || {};

    // FIX 1 — Incremental sync: build query with after: date filter
    const afterDate = computeAfterDate(inboxState.lastSyncAt);
    const query = `in:sent -to:example.invalid after:${afterDate}`;

    // List sent messages
    const listResult = spawnSync(
      GWS_BIN,
      [
        "gmail", "users", "messages", "list",
        "--params", JSON.stringify({
          userId,
          maxResults: 100,
          q: query,
        }),
      ],
      gwsSpawnOptions(inboxLabel, 60000),
    );

    if (listResult.error) {
      result.error = `spawn error: ${listResult.error.message}`;
      return result;
    }

    // Handle missing auth or insufficient mailbox scopes gracefully.
    if (listResult.status !== 0) {
      const errOutput = ((listResult.stderr || "") + (listResult.stdout || "")).toLowerCase();
      if (errOutput.includes("403") || errOutput.includes("forbidden") || errOutput.includes("insufficient permission")) {
        result.error = `Google Workspace access unavailable for ${inboxLabel} (403) — reauthorize the isclientted profile with Gmail access`;
      } else {
        result.error = `gws list failed (exit ${listResult.status ?? "?"}): ${listResult.stderr || "no output"}`;
      }
      return result;
    }

    const listOutput = (listResult.stdout || "") + (listResult.stderr || "");
    const listData = parseGwsJson(listOutput) as { messages?: { id: string }[] } | null;

    if (!listData?.messages || listData.messages.length === 0) {
      // No new messages — still bump lastSyncAt so next run uses today's date
      syncState[inboxLabel] = {
        ...inboxState,
        lastSyncAt: new Date().toISOString(),
        status: "ok",
      };
      setGmailSyncState(syncState);
      appendSyncLog({
        runAt: new Date().toISOString(),
        inbox: inboxLabel,
        fetched: 0,
        synced: 0,
        skipped: 0,
        created: 0,
        errors: [],
      });
      return result;
    }

    // FIX 3 — Store isclienttion: use shared store if provided (read once across all inboxes)
    const store = sharedStore ?? readStore();

    // Build existing-ref lookup.
    // New format: "${messageId}:${recipientEmail}" (unique per message+recipient)
    // Old format: "${messageId}" (bare) — kept for backward compat with pre-fix records
    const existingRefs = new Set(
      store.activities
        .filter((a) => a.source === "Gmail Sync")
        .map((a) => a.externalRef)
        .filter((r): r is string => Boolean(r)),
    );

    // Bare message IDs (old format) — if a message is here we've already processed it
    // via the old code path; skip fetching it entirely to avoid re-creating activities.
    const oldFormatMessageIds = new Set(
      Array.from(existingRefs).filter((ref) => !ref.includes(":")),
    );

    let lastProcessedId = inboxState.lastMessageId;
    let errorCount = 0;
    const errorMessages: string[] = [];
    const totalMessages = listData.messages.length;

    for (const msg of listData.messages) {
      // Skip messages fully processed under the old bare-ID format
      if (oldFormatMessageIds.has(msg.id)) {
        result.skipped++;
        continue;
      }

      // Get full message — error boundary: if this fails, log and continue
      let getResult;
      try {
        getResult = spawnSync(
          GWS_BIN,
          [
            "gmail", "users", "messages", "get",
            "--params", JSON.stringify({
              userId,
              id: msg.id,
              format: "full",
            }),
          ],
          gwsSpawnOptions(inboxLabel, 30000),
        );
      } catch (spawnErr) {
        const errMsg = `spawn error for message ${msg.id}: ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`;
        console.error(`[gmailSync] ${errMsg}`);
        errorMessages.push(errMsg);
        errorCount++;
        continue;
      }

      if (getResult.error || getResult.status !== 0) {
        const errMsg = `message ${msg.id} get failed (exit ${getResult.status ?? "?"}): ${getResult.error?.message ?? getResult.stderr ?? "no output"}`;
        console.error(`[gmailSync] ${errMsg}`);
        errorMessages.push(errMsg);
        errorCount++;
        continue;
      }

      const getOutput = (getResult.stdout || "") + (getResult.stderr || "");
      const message = parseGwsJson(getOutput) as GmailMessage | null;

      if (!message?.payload?.headers) {
        result.skipped++;
        continue;
      }

      const headers = message.payload.headers;
      const fromHeader = getHeader(headers, "From") || inboxLabel;
      const toHeader = getHeader(headers, "To") || "";
      const subject = getHeader(headers, "Subject") || "(no subject)";
      const dateHeader = getHeader(headers, "Date") || new Date().toISOString();

      const fromEmail = parseSenderEmail(fromHeader);
      const toEmails = parseRecipients(toHeader);
      const bodyText = extractBodyText(message);

      // Process each recipient
      for (const recipientEmail of toEmails) {
        // FIX 2 — Unique externalRef per (message, recipient) pair — prevents duplicate
        //         activities when an email has multiple To: addresses.
        const compoundRef = `${msg.id}:${recipientEmail}`;

        if (existingRefs.has(compoundRef)) {
          result.skipped++;
          continue;
        }

        const domain = extractEmailDomain(recipientEmail);

        // Route free-email-domain recipients with no existing contact match to overflow queue
        if (domain && isFreeEmailDomain(domain)) {
          const existingContact = resolveContact({ email: recipientEmail }, store.contacts).match;
          if (!existingContact) {
            appendUnmatchedEmail({
              id: `unm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              messageId: msg.id,
              toEmail: recipientEmail,
              toName: toHeader.match(new RegExp(`([^<,]+)\\s*<${recipientEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}>`, "i"))?.[1]?.trim(),
              subject,
              sentAt: new Date(dateHeader).toISOString(),
              inbox: inboxLabel,
              status: "pending",
            });
            result.skipped++;
            continue;
          }
        }

        // Match or create contact
        const { contact, created: contactCreated } = matchOrCreateContact(
          store,
          recipientEmail,
        );
        if (contactCreated) result.created++;

        // Infer company from recipient domain
        if (domain && !isFreeEmailDomain(domain)) {
          const companyName = domainToCompanyName(domain);
          const { account } = matchOrCreateAccount(store, companyName);
          if (!contact.accountId) {
            // Route through canonical updateContact so identity guards + atomic
            // writes + backups apply. The local `store` reference here belongs
            // to gmailSync's shadow store; we re-fetch from the canonical store
            // is unnecessary because the only subsequent read in this loop is
            // contact.accountId (set below for parity with the canonical write).
            const updated = updateContact(contact.id, { accountId: account.id });
            if (updated) {
              contact.accountId = updated.accountId;
            } else {
              // Fallback to keep loop semantics if the canonical store doesn't
              // see this contact (would happen if gmailSync's shadow store has
              // a contact the canonical store doesn't — a separate, audited bug).
              contact.accountId = account.id;
            }
          }
        }

        // Create CRM activity — externalRef is now compound for per-recipient uniqueness
        const activityOccurredAt = new Date(dateHeader).toISOString();
        const activity: CRMActivity = {
          id: generateId("act"),
          contactId: contact.id,
          accountId: contact.accountId,
          type: "Email",
          occurredAt: activityOccurredAt,
          content: `Sent: ${subject}`,
          source: "Gmail Sync",
          provenance: "imported",
          externalRef: compoundRef,
          emailSubject: subject,
          emailFrom: fromEmail,
          emailTo: toEmails,
          emailBodyText: bodyText.slice(0, 5000),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        store.activities.push(activity);
        existingRefs.add(compoundRef);
        result.synced++;

        // Update contact.lastEmailAt if this email is more recent
        const contactIdx = store.contacts.findIndex((c) => c.id === contact.id);
        if (contactIdx !== -1) {
          const current = store.contacts[contactIdx].lastEmailAt;
          if (!current || activityOccurredAt > current) {
            store.contacts[contactIdx] = {
              ...store.contacts[contactIdx],
              lastEmailAt: activityOccurredAt,
            };
            // Keep local reference in sync
            contact.lastEmailAt = activityOccurredAt;
          }
        }
      }

      if (!lastProcessedId) lastProcessedId = msg.id;
    }

    // FIX 3 — Only persist if we're not using a shared store.
    //         When sharedStore is provided, syncAllInboxes writes once after all inboxes finish.
    if (!sharedStore) {
      writeStore(store);
    }

    // Determine run status: if >20% of messages errored, mark partial_error
    const errorRatio = totalMessages > 0 ? errorCount / totalMessages : 0;
    const runStatus: "ok" | "partial_error" = errorRatio > 0.2 ? "partial_error" : "ok";

    // Update sync state — always bump lastSyncAt so incremental filter advances each run
    syncState[inboxLabel] = {
      lastMessageId: lastProcessedId || inboxState.lastMessageId,
      lastSyncAt: new Date().toISOString(),
      retryCount: (inboxState.retryCount ?? 0) + (runStatus === "partial_error" ? 1 : 0),
      status: runStatus,
    };
    setGmailSyncState(syncState);

    // Append run summary to persistent sync log
    appendSyncLog({
      runAt: new Date().toISOString(),
      inbox: inboxLabel,
      fetched: totalMessages,
      synced: result.synced,
      skipped: result.skipped,
      created: result.created,
      errors: errorMessages,
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

/**
 * Sync all configured Example Client inboxes.
 *
 * FIX 3 — Cross-inbox store isclienttion:
 *   - Read the CRM store ONCE before any inbox syncs
 *   - Pass the same store reference into each syncGmailInbox call (mutations accumulate)
 *   - Write the store ONCE after all inboxes complete
 *   This ensures contacts/accounts created by inbox-1 are visible to inbox-2 dedup,
 *   eliminating duplicate contacts from concurrent/sequential multi-inbox syncs.
 *
 * Isclientted OAuth wiring:
 *   - Each inbox runs gws with its own GOOGLE_WORKSPACE_CLI_CONFIG_DIR
 *   - The Gmail userId stays the real email address for clear state/log labeling
 */
export async function syncAllInboxes(): Promise<GmailSyncResult[]> {
  const sharedStore = readStore(); // read ONCE
  const results: GmailSyncResult[] = [];
  for (const inbox of INBOXES) {
    const r = await syncGmailInbox(inbox, inbox, sharedStore); // real email as userId
    results.push(r);
  }
  writeStore(sharedStore); // write ONCE
  return results;
}

/**
 * Sync emails for a specific contact across all Example Client inboxes.
 * Uses a targeted Gmail search: `in:sent to:<email>` for each of the contact's email addresses.
 * Returns aggregate counts across all inboxes and all email addresses.
 */
export interface ContactSyncResult {
  synced: number;
  created: number;
  errors: string[];
}

export async function syncEmailsForContact(
  contactId: string,
): Promise<ContactSyncResult> {
  const store = readStore();
  const contact = store.contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const result: ContactSyncResult = { synced: 0, created: 0, errors: [] };

  const existingRefs = new Set(
    store.activities
      .filter((a) => a.source === "Gmail Sync")
      .map((a) => a.externalRef)
      .filter((r): r is string => Boolean(r)),
  );

  for (const inbox of INBOXES) {
    for (const recipientEmail of contact.emails) {
      const query = `in:sent to:${recipientEmail}`;

      const listResult = spawnSync(
        GWS_BIN,
        [
          "gmail", "users", "messages", "list",
          "--params", JSON.stringify({ userId: inbox, maxResults: 50, q: query }),
        ],
        gwsSpawnOptions(inbox, 60000),
      );

      if (listResult.error || listResult.status !== 0) {
        const errMsg = `${inbox} → ${recipientEmail}: list failed (exit ${listResult.status ?? "?"})` ;
        result.errors.push(errMsg);
        continue;
      }

      const listOutput = (listResult.stdout || "") + (listResult.stderr || "");
      const listData = parseGwsJson(listOutput) as { messages?: { id: string }[] } | null;

      if (!listData?.messages || listData.messages.length === 0) continue;

      for (const msg of listData.messages) {
        const compoundRef = `${msg.id}:${recipientEmail}`;
        if (existingRefs.has(compoundRef)) continue;

        // Error boundary: skip individual message failures
        let getResult;
        try {
          getResult = spawnSync(
            GWS_BIN,
            [
              "gmail", "users", "messages", "get",
              "--params", JSON.stringify({ userId: inbox, id: msg.id, format: "full" }),
            ],
            gwsSpawnOptions(inbox, 30000),
          );
        } catch (spawnErr) {
          result.errors.push(`spawn error for ${msg.id}: ${spawnErr instanceof Error ? spawnErr.message : String(spawnErr)}`);
          continue;
        }

        if (getResult.error || getResult.status !== 0) {
          result.errors.push(`message ${msg.id} get failed (exit ${getResult.status ?? "?"})`);
          continue;
        }

        const getOutput = (getResult.stdout || "") + (getResult.stderr || "");
        const message = parseGwsJson(getOutput) as GmailMessage | null;
        if (!message?.payload?.headers) continue;

        const headers = message.payload.headers;
        const fromHeader = getHeader(headers, "From") || inbox;
        const toHeader = getHeader(headers, "To") || "";
        const subject = getHeader(headers, "Subject") || "(no subject)";
        const dateHeader = getHeader(headers, "Date") || new Date().toISOString();
        const fromEmail = parseSenderEmail(fromHeader);
        const toEmails = parseRecipients(toHeader);
        const bodyText = extractBodyText(message);

        const activityOccurredAt = new Date(dateHeader).toISOString();
        const activity: CRMActivity = {
          id: generateId("act"),
          contactId: contact.id,
          accountId: contact.accountId,
          type: "Email",
          occurredAt: activityOccurredAt,
          content: `Sent: ${subject}`,
          source: "Gmail Sync",
          provenance: "imported",
          externalRef: compoundRef,
          emailSubject: subject,
          emailFrom: fromEmail,
          emailTo: toEmails,
          emailBodyText: bodyText.slice(0, 5000),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        store.activities.push(activity);
        existingRefs.add(compoundRef);
        result.synced++;

        // Update contact.lastEmailAt
        const contactIdx = store.contacts.findIndex((c) => c.id === contact.id);
        if (contactIdx !== -1) {
          const current = store.contacts[contactIdx].lastEmailAt;
          if (!current || activityOccurredAt > current) {
            store.contacts[contactIdx] = { ...store.contacts[contactIdx], lastEmailAt: activityOccurredAt };
          }
        }
      }
    }
  }

  writeStore(store);
  return result;
}
