import { NextResponse } from "next/server";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import { promoteAccountInStore } from "@/lib/crm/conversion";
import { readStore, withStoreMutation } from "@/lib/crm/store";
import { readSupabaseCrmStore, withSupabaseStoreMutation } from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const actor = actorFromRequest(request);
  let body: { opportunityName?: string; stage?: string; value?: number; ownerId?: string; contactIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.opportunityName || typeof body.value !== "number") {
    return NextResponse.json({ error: "opportunityName and numeric value are required" }, { status: 400 });
  }
  if (Array.isArray(body.contactIds) && body.contactIds.length > 0) {
    const store = shouldUseSupabaseBackend() ? await readSupabaseCrmStore() : readStore();
    const invalidContactIds = body.contactIds.filter((contactId) => {
      const contact = store.contacts.find((item) => item.id === contactId && !item.deletedAt);
      return !contact || contact.accountId !== id;
    });
    if (invalidContactIds.length > 0) {
      return NextResponse.json({ error: "contacts must belong to account", invalidContactIds }, { status: 400 });
    }
  }

  try {
    const promote = (store: Parameters<Parameters<typeof withStoreMutation>[0]>[0]) =>
      promoteAccountInStore(store, id, {
        opportunityName: body.opportunityName!,
        stage: body.stage as never,
        value: body.value!,
        ownerId: body.ownerId,
        contactIds: body.contactIds,
      });
    const opportunity = shouldUseSupabaseBackend()
      ? await withSupabaseStoreMutation(promote)
      : await withStoreMutation(promote);
    safeAppendAuditEntry({
      actor,
      entityType: "opportunity",
      entityId: opportunity.id,
      action: "create",
      changes: [{ field: "promotedFromAccountId", before: null, after: id }],
      context: { route: `/api/crm/accounts/${id}/promote`, method: "POST", relatedEntityId: id, summary: "Promoted account to opportunity" },
    });
    return NextResponse.json({ ok: true, opportunity }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROMOTE_FAILED";
    const status = code === "ACCOUNT_NOT_FOUND" ? 404 : code === "CONTACT_REQUIRED" || code === "CONTACT_NOT_FOUND" ? 400 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
