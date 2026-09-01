import { NextResponse } from "next/server";
import { getContacts, getAccounts, createContact, updateContact, deleteContact, withStoreMutation } from "@/lib/crm/store";
import {
  createSupabaseContact,
  deleteSupabaseContact,
  getSupabaseAccounts,
  getSupabaseContacts,
  updateSupabaseContact,
  withSupabaseStoreMutation,
} from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { actorFromRequest, diffFields, safeAppendAuditEntry } from "@/lib/audit/store";
import type { Contact } from "@/data/contacts";
import { runCrmHygiene } from "@/lib/crm/hygiene";

export const dynamic = "force-dynamic";

// Whitelist of fields a client may patch via PUT. Mirrors updateContact()'s
// type signature in store.ts. Excludes identity/system fields:
// id, createdAt, updatedAt, provenance, interactions, lastEmailAt, source,
// firstName, lastName (canonical identity is the composed `name`).
const CONTACT_PATCH_FIELDS = [
  "name",
  "title",
  "company",
  "emails",
  "phone",
  "tags",
  "stage",
  "priority",
  "followUpState",
  "accountId",
  "notes",
  "location",
  "owner",
  "interests",
  "convertedFromLeadId",
  "supportingAgent",
  "linkedinUrl",
  "lastTouchAt",
  "sourceRefs",
] as const;

async function runRealtimeHygieneAudit(actor: string): Promise<void> {
  const summary = shouldUseSupabaseBackend()
    ? await withSupabaseStoreMutation((store) => runCrmHygiene(store, "realtime"))
    : await withStoreMutation((store) => runCrmHygiene(store, "realtime"));
  for (const merge of summary.mergedRecords) {
    safeAppendAuditEntry({
      actor,
      entityType: merge.kind,
      entityId: merge.loserId,
      action: "merge",
      changes: merge.loserChanges,
      context: { route: "/api/crm/contacts", method: "POST/PUT", relatedEntityId: merge.winnerId, summary: `Auto-merged at ${Math.round(merge.confidence * 100)}%; ${merge.canonicalReason}` },
    });
    safeAppendAuditEntry({
      actor,
      entityType: merge.kind,
      entityId: merge.winnerId,
      action: "patch",
      changes: merge.winnerChanges,
      context: { route: "/api/crm/contacts", method: "POST/PUT", relatedEntityId: merge.loserId, summary: `Auto-absorbed duplicate at ${Math.round(merge.confidence * 100)}%; ${merge.canonicalReason}` },
    });
  }
}

export async function GET(request: Request) {
  const includeMerged = new URL(request.url).searchParams.get("includeMerged") === "true";
  const contacts = shouldUseSupabaseBackend()
    ? await getSupabaseContacts({ includeMerged })
    : getContacts({ includeMerged });
  return NextResponse.json(contacts, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, accountId, tags, title, owner, location, notes, sourceRefs } = body;
    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "firstName and lastName are required" },
        { status: 400 }
      );
    }
    // L2: validate accountId references a real account before creating the contact.
    if (accountId) {
      const accounts = shouldUseSupabaseBackend() ? await getSupabaseAccounts() : getAccounts();
      if (!accounts.some((a) => a.id === accountId)) {
        return NextResponse.json({ error: "Account not found" }, { status: 400 });
      }
    }
    let contact = shouldUseSupabaseBackend() ? await createSupabaseContact({
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      accountId: accountId || undefined,
      tags: tags ?? [],
      location: location || undefined,
      sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : undefined,
    }) : createContact({
      firstName,
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      accountId: accountId || undefined,
      tags: tags ?? [],
      location: location || undefined,
      sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : undefined,
    });
    const postCreatePatch: Parameters<typeof updateContact>[1] = {};
    if (title) postCreatePatch.title = title;
    if (owner) postCreatePatch.owner = owner;
    if (notes) postCreatePatch.notes = notes;
    if (Object.keys(postCreatePatch).length > 0) {
      contact = (shouldUseSupabaseBackend()
        ? await updateSupabaseContact(contact.id, postCreatePatch)
        : updateContact(contact.id, postCreatePatch)) ?? contact;
    }
    const actor = actorFromRequest(request);
    safeAppendAuditEntry({
      actor,
      entityType: "contact",
      entityId: contact.id,
      action: "create",
      changes: [],
      context: { route: "/api/crm/contacts", method: "POST" },
    });
    await runRealtimeHygieneAudit(actor);
    return NextResponse.json(contact, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id } = body ?? {};
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    type ContactPatch = Parameters<typeof updateContact>[1];
    const patch: ContactPatch = {};
    for (const field of CONTACT_PATCH_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        (patch as Record<string, unknown>)[field] = body[field];
      }
    }

    // Reject identity-clearing patches at the route boundary. updateContact()
    // also has a defense-in-depth guard that drops these silently, but here we
    // return 400 so callers know their request was rejected.
    if (
      Object.prototype.hasOwnProperty.call(patch, "name") &&
      (typeof patch.name !== "string" || patch.name.trim() === "")
    ) {
      return NextResponse.json({ error: "name cannot be cleared" }, { status: 400 });
    }
    if (
      Object.prototype.hasOwnProperty.call(patch, "emails") &&
      (!Array.isArray(patch.emails) || patch.emails.length === 0)
    ) {
      return NextResponse.json({ error: "emails cannot be cleared" }, { status: 400 });
    }

    const actor = actorFromRequest(request);
    const before = (shouldUseSupabaseBackend()
      ? await getSupabaseContacts({ includeMerged: true })
      : getContacts({ includeMerged: true })).find((c) => c.id === id);
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseContact(id, patch)
      : updateContact(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    if (before) {
      const changes = diffFields<Contact>(before, updated, CONTACT_PATCH_FIELDS);
      if (changes.length > 0) {
        safeAppendAuditEntry({
          actor,
          entityType: "contact",
          entityId: id,
          action: "patch",
          changes,
          context: { route: "/api/crm/contacts", method: "PUT" },
        });
      }
    }
    await runRealtimeHygieneAudit(actor);
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
      ? await deleteSupabaseContact(id)
      : deleteContact(id);
    if (!deleted) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "contact",
      entityId: id,
      action: "delete",
      changes: [],
      context: { route: "/api/crm/contacts", method: "DELETE" },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
