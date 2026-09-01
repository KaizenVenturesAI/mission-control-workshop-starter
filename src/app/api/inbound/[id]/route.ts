import { NextResponse } from "next/server";
import { resolveLeadCrmLinkage, shouldRunLeadCrmLinkage } from "@/lib/crm/inboundLeadLinkage";
import { deleteInboundLead, getInboundLead, updateInboundLead } from "@/modules/revenue/inboundLeadsStore";
import { appendEvent } from "@/modules/revenue/inboundLeadEventsStore";
import {
  appendSupabaseLeadEvent,
  deleteSupabaseInboundLead,
  getSupabaseInboundLead,
  updateSupabaseInboundLead,
} from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(id) : getInboundLead(id);

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json(lead, { headers: { "Cache-Control": "no-cache" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const currentLead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(id) : getInboundLead(id);

    if (!currentLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const body = (await request.json()) as Partial<InboundLeadRecord>;
    const lead = shouldUseSupabaseBackend() ? await updateSupabaseInboundLead(id, body) : updateInboundLead(id, body);

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Write activity events for tracked field changes
    const now = new Date().toISOString();
    if (body.status !== undefined && body.status !== currentLead.status) {
      const event = {
        leadId: id,
        type: "status_change",
        actor: "system",
        timestamp: now,
        metadata: { from: currentLead.status, to: lead.status },
      };
      if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(event);
      else appendEvent(event);
      if (lead.status === "confirmed" || lead.status === "paid") {
        const conversionEvent = {
          leadId: id,
          type: "conversion",
          actor: "system",
          timestamp: now,
          metadata: {
            source: lead.source ?? null,
            type: lead.type,
            expectedValue: lead.expectedValue ?? null,
            previousStatus: currentLead.status,
          },
        };
        if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(conversionEvent);
        else appendEvent(conversionEvent);
      }
    }
    if (body.assignedTo !== undefined && body.assignedTo !== currentLead.assignedTo) {
      const event = {
        leadId: id,
        type: "assignment_change",
        actor: "system",
        timestamp: now,
        metadata: { from: currentLead.assignedTo ?? null, to: lead.assignedTo ?? null },
      };
      if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(event);
      else appendEvent(event);
    }
    if (body.notes !== undefined && body.notes !== currentLead.notes) {
      const event = {
        leadId: id,
        type: "note_save",
        actor: "system",
        timestamp: now,
        metadata: {},
      };
      if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(event);
      else appendEvent(event);
    }

    const shouldLink = !shouldUseSupabaseBackend() && shouldRunLeadCrmLinkage(currentLead.status, lead.status);
    if (!shouldLink) {
      return NextResponse.json(lead);
    }

    const linkage = resolveLeadCrmLinkage(lead, "apply-existing");
    return NextResponse.json(linkage.lead);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deleted = shouldUseSupabaseBackend() ? await deleteSupabaseInboundLead(id) : deleteInboundLead(id);

  if (!deleted) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
