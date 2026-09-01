import { NextResponse } from "next/server";
import { updateContact, updateOpportunity } from "@/lib/crm/store";
import { updateSupabaseContact, updateSupabaseOpportunity } from "@/lib/crm/supabaseStore";
import { getDefaultAssignee } from "@/lib/inbound/leadAssignment";
import { appendEvent } from "@/modules/revenue/inboundLeadEventsStore";
import { getInboundLead, listInboundLeads, updateInboundLead } from "@/modules/revenue/inboundLeadsStore";
import { appendSupabaseLeadEvent, getSupabaseInboundLead, listSupabaseInboundLeads, updateSupabaseInboundLead } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadRecord, InboundLeadStatus } from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

const ACTIVE_LEAD_STATUSES = new Set<InboundLeadStatus>(["new", "contacted", "qualified", "scheduled"]);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asPositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function dateDaysFromNow(days: number): string {
  return isoDaysFromNow(days).slice(0, 10);
}

function ageDays(lead: InboundLeadRecord): number {
  const ms = new Date(lead.receivedAt).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.floor((Date.now() - ms) / 86_400_000);
}

async function appendLeadEvent(leadId: string, type: string, metadata: Record<string, unknown>): Promise<void> {
  const event = {
    leadId,
    type,
    actor: "crm-action-queue",
    timestamp: new Date().toISOString(),
    metadata,
  };
  if (shouldUseSupabaseBackend()) {
    await appendSupabaseLeadEvent(event);
  } else {
    appendEvent(event);
  }
}

async function updateLeadStatus(lead: InboundLeadRecord, status: InboundLeadStatus, extra: Partial<InboundLeadRecord> = {}) {
  const updates = {
    ...extra,
    status,
    contactedAt: status === "contacted" ? new Date().toISOString() : extra.contactedAt,
  };
  const updated = shouldUseSupabaseBackend()
    ? await updateSupabaseInboundLead(lead.id, updates)
    : updateInboundLead(lead.id, updates);
  if (!updated) return null;
  if (updated.status !== lead.status) {
    await appendLeadEvent(lead.id, "status_change", { from: lead.status, to: updated.status });
  }
  return updated;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = asString(body.action);

    if (action === "snooze") {
      const itemId = asString(body.itemId);
      if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });
      const days = asPositiveInteger(body.days, 7, 90);
      if (shouldUseSupabaseBackend()) {
        return NextResponse.json({ success: false, error: "Action queue snooze state is not yet persisted in Supabase" }, { status: 501 });
      }
      const { snoozeQueueItem } = await import("@/lib/crm/actionQueueState");
      return NextResponse.json({ success: true, item: snoozeQueueItem(itemId, isoDaysFromNow(days)) });
    }

    if (action === "ignore") {
      const itemId = asString(body.itemId);
      if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });
      if (shouldUseSupabaseBackend()) {
        return NextResponse.json({ success: false, error: "Action queue ignore state is not yet persisted in Supabase" }, { status: 501 });
      }
      const { ignoreQueueItem } = await import("@/lib/crm/actionQueueState");
      return NextResponse.json({ success: true, item: ignoreQueueItem(itemId, asString(body.reason)) });
    }

    if (action === "assign-default-lead") {
      const leadId = asString(body.leadId);
      if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
      const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(leadId) : getInboundLead(leadId);
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const assignee = getDefaultAssignee(lead);
      const updated = shouldUseSupabaseBackend()
        ? await updateSupabaseInboundLead(leadId, { assignedTo: assignee })
        : updateInboundLead(leadId, { assignedTo: assignee });
      if (!updated) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      if (lead.assignedTo !== assignee) {
        await appendLeadEvent(leadId, "assignment_change", { from: lead.assignedTo ?? null, to: assignee });
      }
      return NextResponse.json({ success: true, lead: updated });
    }

    if (action === "mark-lead-contacted") {
      const leadId = asString(body.leadId);
      if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
      const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(leadId) : getInboundLead(leadId);
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      return NextResponse.json({ success: true, lead: await updateLeadStatus(lead, "contacted") });
    }

    if (action === "close-lead-lost") {
      const leadId = asString(body.leadId);
      if (!leadId) return NextResponse.json({ error: "leadId is required" }, { status: 400 });
      const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(leadId) : getInboundLead(leadId);
      if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      const reason = asString(body.reason) ?? "Closed from CRM action queue";
      const notes = [lead.notes, `Lost: ${reason}`].filter(Boolean).join("\n");
      return NextResponse.json({ success: true, lead: await updateLeadStatus(lead, "lost", { substatus: reason, notes }) });
    }

    if (action === "snooze-opportunity") {
      const opportunityId = asString(body.opportunityId);
      if (!opportunityId) return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });
      const days = asPositiveInteger(body.days, 7, 90);
      const updated = shouldUseSupabaseBackend()
        ? await updateSupabaseOpportunity(opportunityId, { nextStepDueDate: dateDaysFromNow(days) })
        : updateOpportunity(opportunityId, { nextStepDueDate: dateDaysFromNow(days) });
      if (!updated) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
      return NextResponse.json({ success: true, opportunity: updated });
    }

    if (action === "clear-contact-followup") {
      const contactId = asString(body.contactId);
      if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
      const updated = shouldUseSupabaseBackend()
        ? await updateSupabaseContact(contactId, { followUpState: "none" })
        : updateContact(contactId, { followUpState: "none" });
      if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      return NextResponse.json({ success: true, contact: updated });
    }

    if (action === "bulk-close-stale-leads") {
      const olderThanDays = asPositiveInteger(body.olderThanDays, 180, 730);
      const now = new Date().toISOString();
      const leads = shouldUseSupabaseBackend() ? await listSupabaseInboundLeads() : listInboundLeads();
      const candidates = leads.filter((lead) => (
        ACTIVE_LEAD_STATUSES.has(lead.status) &&
        !lead.convertedToContactId &&
        !lead.crmContactId &&
        ageDays(lead) >= olderThanDays
      ));
      const closed = await Promise.all(candidates.map(async (lead) => {
        const updates = {
          status: "lost",
          substatus: `Inactive ${olderThanDays}+ days`,
          notes: [lead.notes, `Auto-closed from CRM action queue on ${now.slice(0, 10)} after ${ageDays(lead)} days inactive.`]
            .filter(Boolean)
            .join("\n"),
        } as const;
        const updated = shouldUseSupabaseBackend()
          ? await updateSupabaseInboundLead(lead.id, updates)
          : updateInboundLead(lead.id, updates);
        await appendLeadEvent(lead.id, "status_change", { from: lead.status, to: "lost", reason: `Inactive ${olderThanDays}+ days` });
        return updated;
      }));
      return NextResponse.json({ success: true, closed: closed.length, olderThanDays });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid action request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
