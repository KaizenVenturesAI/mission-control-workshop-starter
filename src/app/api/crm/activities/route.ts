import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAccounts, getActivities, getContacts, createActivity, updateActivity, deleteActivity } from "@/lib/crm/store";
import {
  createSupabaseActivity,
  deleteSupabaseActivity,
  getSupabaseAccounts,
  getSupabaseActivities,
  getSupabaseContacts,
  updateSupabaseActivity,
} from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { actorFromRequest, diffFields, safeAppendAuditEntry } from "@/lib/audit/store";
import type { CRMActivity } from "@/data/crm-activities";

export const dynamic = "force-dynamic";

// Whitelist of fields a client may patch via PUT. Mirrors updateActivity()
// in store.ts which only accepts content + type.
const ACTIVITY_PATCH_FIELDS = ["content", "type"] as const;

// ── POST idempotency (two layers) ──
// LAYER 1 — Idempotency-Key header:
//   When the client sends an `Idempotency-Key` header we hash
//   (key + payload-shape) and cache the response for 10 min in a
//   process-local LRU (~256 entries). A repeat request with the same key +
//   payload returns the original response verbatim (same activity id), so
//   network retries don't duplicate.
// LAYER 2 — Content soft-dedupe (no header):
//   Without an Idempotency-Key we hash (type, contactId, accountId, content
//   prefix) and remember it for 5s. A second identical POST inside that
//   window returns HTTP 409, catching UI double-clicks where the client did
//   not generate a key.
// Both caches are in-memory only; the disk store remains the source of
// truth for any longer-lived dedupe.
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_MAX_ENTRIES = 256;
const SOFT_DEDUPE_WINDOW_MS = 5 * 1000;

type CachedResponse = { body: unknown; status: number; ts: number };
const keyedCache: Map<string, CachedResponse | Promise<CachedResponse>> = new Map();
const recentContentHashes: Map<string, number> = new Map();

function hashKey(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function pruneKeyedCache(now: number): void {
  for (const [k, v] of keyedCache) {
    if (!(v instanceof Promise) && now - v.ts > IDEMPOTENCY_TTL_MS) {
      keyedCache.delete(k);
    }
  }
  // Map iterates in insertion order, so deleting from the front evicts oldest.
  while (keyedCache.size > IDEMPOTENCY_MAX_ENTRIES) {
    const oldest = keyedCache.keys().next().value;
    if (oldest === undefined) break;
    keyedCache.delete(oldest);
  }
}

function pruneSoftCache(now: number): void {
  for (const [h, t] of recentContentHashes) {
    if (now - t > SOFT_DEDUPE_WINDOW_MS) recentContentHashes.delete(h);
  }
}

export async function GET(request: NextRequest) {
  const contactId = request.nextUrl.searchParams.get("contactId") ?? undefined;
  const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
  const type = request.nextUrl.searchParams.get("type") ?? undefined;
  let activities = shouldUseSupabaseBackend()
    ? await getSupabaseActivities(contactId, accountId)
    : getActivities(contactId, accountId);
  if (type) {
    activities = activities.filter((a) => a.type === type);
  }
  return NextResponse.json(activities, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: NextRequest) {
  let body: Partial<CRMActivity> & { contactId?: string; accountId?: string; type?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { contactId, accountId, type, content } = body ?? {};
  if ((!contactId && !accountId) || !type || !content) {
    return NextResponse.json(
      { error: "contactId or accountId, type, and content are required" },
      { status: 400 }
    );
  }

  const contacts = shouldUseSupabaseBackend() ? await getSupabaseContacts() : getContacts();
  const contact = contactId ? contacts.find((c) => c.id === contactId) : undefined;
  if (contactId && !contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 400 });
  }
  const resolvedAccountId = accountId ?? contact?.accountId;
  if (resolvedAccountId) {
    const accounts = shouldUseSupabaseBackend() ? await getSupabaseAccounts() : getAccounts();
    if (!accounts.some((a) => a.id === resolvedAccountId)) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }
  }

  const now = Date.now();
  pruneKeyedCache(now);

  // LAYER 1 — Idempotency-Key
  const idemKey = request.headers.get("Idempotency-Key");
  if (idemKey) {
    const accountKey = resolvedAccountId ?? "null";
    const contactKey = contactId ?? "null";
    const cacheKey = hashKey(`${idemKey}|${type}|${contactKey}|${accountKey}|${body.externalRef ?? ""}|${content}`);
    const cached = keyedCache.get(cacheKey);
    if (cached) {
      try {
        const resolved = cached instanceof Promise ? await cached : cached;
        return NextResponse.json(resolved.body, { status: resolved.status });
      } catch {
        // Prior request errored; fall through and let this one retry.
      }
    }
    let resolveFn!: (v: CachedResponse) => void;
    let rejectFn!: (e: unknown) => void;
    const pending = new Promise<CachedResponse>((res, rej) => {
      resolveFn = res;
      rejectFn = rej;
    });
    keyedCache.set(cacheKey, pending);
    try {
      const activityPayload = {
        contactId,
        accountId: resolvedAccountId,
        type: type as Parameters<typeof createActivity>[0]["type"],
        content,
        occurredAt: body.occurredAt,
        source: body.source,
        provenance: body.provenance,
        externalRef: body.externalRef,
        meetingTitle: body.meetingTitle,
        participants: body.participants,
        durationMinutes: body.durationMinutes,
        summary: body.summary,
        recordingLink: body.recordingLink,
        sourceSheet: body.sourceSheet,
        sourceUrl: body.sourceUrl,
        importBatchId: body.importBatchId,
        sourceRecordTitle: body.sourceRecordTitle,
        matchType: body.matchType,
      };
      const activity = shouldUseSupabaseBackend()
        ? await createSupabaseActivity(activityPayload)
        : createActivity(activityPayload);
      const result: CachedResponse = { body: activity, status: 201, ts: now };
      keyedCache.set(cacheKey, result);
      resolveFn(result);
      safeAppendAuditEntry({
        actor: actorFromRequest(request),
        entityType: "activity",
        entityId: activity.id,
        action: "create",
        changes: [],
        context: { route: "/api/crm/activities", method: "POST" },
      });
      return NextResponse.json(result.body, { status: result.status });
    } catch (err) {
      keyedCache.delete(cacheKey);
      rejectFn(err);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }

  // LAYER 2 — Content soft-dedupe (no header)
  pruneSoftCache(now);
  const accountKey = resolvedAccountId ?? "null";
  const contactKey = contactId ?? "null";
  const contentPrefix = content.slice(0, 200);
  const softHash = hashKey(`${type}|${contactKey}|${accountKey}|${body.externalRef ?? ""}|${contentPrefix}`);
  if (recentContentHashes.has(softHash)) {
    return NextResponse.json(
      { error: "Duplicate request — same activity submitted within 5s" },
      { status: 409 }
    );
  }
  recentContentHashes.set(softHash, now);

  try {
    const activityPayload = {
      contactId,
      accountId: resolvedAccountId,
      type: type as Parameters<typeof createActivity>[0]["type"],
      content,
      occurredAt: body.occurredAt,
      source: body.source,
      provenance: body.provenance,
      externalRef: body.externalRef,
      meetingTitle: body.meetingTitle,
      participants: body.participants,
      durationMinutes: body.durationMinutes,
      summary: body.summary,
      recordingLink: body.recordingLink,
      sourceSheet: body.sourceSheet,
      sourceUrl: body.sourceUrl,
      importBatchId: body.importBatchId,
      sourceRecordTitle: body.sourceRecordTitle,
      matchType: body.matchType,
    };
    const activity = shouldUseSupabaseBackend()
      ? await createSupabaseActivity(activityPayload)
      : createActivity(activityPayload);
    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "activity",
      entityId: activity.id,
      action: "create",
      changes: [],
      context: { route: "/api/crm/activities", method: "POST" },
    });
    return NextResponse.json(activity, { status: 201 });
  } catch {
    recentContentHashes.delete(softHash);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id } = body ?? {};
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    type ActivityPatch = Parameters<typeof updateActivity>[1];
    const patch: ActivityPatch = {};
    for (const field of ACTIVITY_PATCH_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        (patch as Record<string, unknown>)[field] = body[field];
      }
    }

    // Reject empty content — activities with empty content render as ghost
    // entries in the timeline.
    if (
      Object.prototype.hasOwnProperty.call(patch, "content") &&
      (typeof patch.content !== "string" || patch.content.trim() === "")
    ) {
      return NextResponse.json({ error: "content cannot be empty" }, { status: 400 });
    }

    const before = (shouldUseSupabaseBackend() ? await getSupabaseActivities() : getActivities()).find((a) => a.id === id);
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseActivity(id, patch)
      : updateActivity(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    if (before) {
      const changes = diffFields<CRMActivity>(before, updated, ACTIVITY_PATCH_FIELDS);
      if (changes.length > 0) {
        safeAppendAuditEntry({
          actor: actorFromRequest(request),
          entityType: "activity",
          entityId: id,
          action: "patch",
          changes,
          context: { route: "/api/crm/activities", method: "PUT" },
        });
      }
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    const deleted = shouldUseSupabaseBackend()
      ? await deleteSupabaseActivity(id)
      : deleteActivity(id);
    if (!deleted) {
      return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    }
    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "activity",
      entityId: id,
      action: "delete",
      changes: [],
      context: { route: "/api/crm/activities", method: "DELETE" },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
