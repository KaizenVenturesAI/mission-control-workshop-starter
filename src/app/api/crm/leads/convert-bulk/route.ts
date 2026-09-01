import { NextResponse } from "next/server";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import { convertLeadInStore, type LeadConvertPath } from "@/lib/crm/conversion";
import { withStoreMutation } from "@/lib/crm/store";
import { getInboundLead, updateInboundLead } from "@/modules/revenue/inboundLeadsStore";
import { withSupabaseStoreMutation } from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { getSupabaseInboundLead, updateSupabaseInboundLead } from "@/modules/revenue/inboundLeadsSupabaseStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = actorFromRequest(request);
  let body: { leadIds?: string[]; path?: LeadConvertPath };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!Array.isArray(body.leadIds) || body.leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds is required" }, { status: 400 });
  }
  if (body.path !== "A" && body.path !== "B") {
    return NextResponse.json({ error: "bulk path must be A or B" }, { status: 400 });
  }

  const results = await Promise.all(body.leadIds.map(async (leadId) => {
    const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(leadId) : getInboundLead(leadId);
    if (!lead || lead.deletedAt) return { leadId, ok: false as const, error: "Lead not found" };
    try {
      const result = shouldUseSupabaseBackend()
        ? await withSupabaseStoreMutation((store) => convertLeadInStore(store, lead, body.path!))
        : await withStoreMutation((store) => convertLeadInStore(store, lead, body.path!));
      const leadUpdates = {
        crmContactId: result.contact.id,
        crmAccountId: result.account?.id,
        convertedToContactId: result.contact.id,
        convertedToAccountId: result.account?.id,
        convertedAt: new Date().toISOString(),
        convertedBy: actor,
        status: "qualified",
      } as const;
      if (shouldUseSupabaseBackend()) {
        await updateSupabaseInboundLead(leadId, leadUpdates);
      } else {
        updateInboundLead(leadId, leadUpdates);
      }
      safeAppendAuditEntry({
        actor,
        entityType: "lead",
        entityId: leadId,
        action: "update",
        changes: [{ field: "convertedToContactId", before: lead.convertedToContactId, after: result.contact.id }],
        context: { route: "/api/crm/leads/convert-bulk", method: "POST", summary: `Bulk converted via path ${body.path}` },
      });
      return { leadId, ok: true as const, contactId: result.contact.id, accountId: result.account?.id ?? null };
    } catch (error) {
      return { leadId, ok: false as const, error: error instanceof Error ? error.message : "CONVERT_FAILED" };
    }
  }));

  const success = results.filter((item) => item.ok).length;
  return NextResponse.json({ ok: true, success, failed: results.length - success, results }, { status: 200 });
}
