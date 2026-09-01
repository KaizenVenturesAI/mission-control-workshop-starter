import { NextResponse } from "next/server";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import { convertLeadInStore, type LeadConvertPath } from "@/lib/crm/conversion";
import { withStoreMutation } from "@/lib/crm/store";
import { getInboundLead, updateInboundLead } from "@/modules/revenue/inboundLeadsStore";
import { withSupabaseStoreMutation } from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { getSupabaseInboundLead, updateSupabaseInboundLead } from "@/modules/revenue/inboundLeadsSupabaseStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const actor = actorFromRequest(request);
  let body: { path?: LeadConvertPath; existingAccountId?: string; contactOverrides?: Record<string, unknown>; accountOverrides?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const path = body.path;
  if (path !== "A" && path !== "B" && path !== "C") {
    return NextResponse.json({ error: "path must be A, B, or C" }, { status: 400 });
  }

  const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(id) : getInboundLead(id);
  if (!lead || lead.deletedAt) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  try {
    const convert = (store: Parameters<Parameters<typeof withStoreMutation>[0]>[0]) =>
      convertLeadInStore(store, lead, path, {
        existingAccountId: body.existingAccountId,
        contactOverrides: body.contactOverrides as never,
        accountOverrides: body.accountOverrides as never,
      });
    const result = shouldUseSupabaseBackend()
      ? await withSupabaseStoreMutation(convert)
      : await withStoreMutation(convert);
    const convertedAt = new Date().toISOString();
    const leadUpdates = {
      crmContactId: result.contact.id,
      crmAccountId: result.account?.id,
      convertedToContactId: result.contact.id,
      convertedToAccountId: result.account?.id,
      convertedAt,
      convertedBy: actor,
      status: "qualified",
    } as const;
    const updatedLead = shouldUseSupabaseBackend()
      ? await updateSupabaseInboundLead(id, leadUpdates)
      : updateInboundLead(id, leadUpdates);
    safeAppendAuditEntry({
      actor,
      entityType: "lead",
      entityId: id,
      action: "update",
      changes: [
        { field: "convertedToContactId", before: lead.convertedToContactId, after: result.contact.id },
        { field: "convertedToAccountId", before: lead.convertedToAccountId, after: result.account?.id },
      ],
      context: { route: `/api/crm/leads/${id}/convert`, method: "POST", summary: `Converted via path ${path}` },
    });
    safeAppendAuditEntry({
      actor,
      entityType: "contact",
      entityId: result.contact.id,
      action: "create",
      changes: [],
      context: { route: `/api/crm/leads/${id}/convert`, method: "POST", relatedEntityId: id, summary: "Created from lead conversion" },
    });
    if (result.account) {
      safeAppendAuditEntry({
        actor,
        entityType: "account",
        entityId: result.account.id,
        action: result.accountCreated ? "create" : "patch",
        changes: [],
        context: { route: `/api/crm/leads/${id}/convert`, method: "POST", relatedEntityId: id, summary: result.accountCreated ? "Created from lead conversion" : "Linked during lead conversion" },
      });
    }
    return NextResponse.json({ ok: true, lead: updatedLead, contact: result.contact, account: result.account ?? null }, { status: 200 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CONVERT_FAILED";
    const status = code === "ACCOUNT_NOT_FOUND" || code === "EXISTING_ACCOUNT_REQUIRED" ? 400 : code === "LEAD_ALREADY_CONVERTED" ? 409 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
