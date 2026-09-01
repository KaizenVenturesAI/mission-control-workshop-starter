import { NextResponse } from "next/server";
import {
  computeLinkedUpdates,
  computeOpportunityLinkedUpdates,
  isValidLeadTransition,
  isValidOpportunityTransition,
} from "@/lib/crm/lifecycle";
import { ingestInboundLead } from "@/lib/crm/leadIngestion";
import { createAccount, deleteOpportunity, getAccounts, getOpportunities, updateContact, updateOpportunity } from "@/lib/crm/store";
import { getInboundLead, updateInboundLead } from "@/modules/revenue/inboundLeadsStore";
import { appendEvent } from "@/modules/revenue/inboundLeadEventsStore";
import {
  getSupabaseAccounts,
  getSupabaseOpportunities,
  updateSupabaseContact,
  updateSupabaseOpportunity,
} from "@/lib/crm/supabaseStore";
import { appendSupabaseLeadEvent, getSupabaseInboundLead, updateSupabaseInboundLead } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { isInboundLeadStatus, type InboundLeadStatus } from "@/modules/revenue/inboundLeadsTypes";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/data/opportunities";

export const dynamic = "force-dynamic";

function isOpportunityStage(value: string): value is OpportunityStage {
  return (OPPORTUNITY_STAGES as string[]).includes(value);
}

interface LifecycleRequest {
  action: "transition-lead" | "transition-opportunity" | "promote-lead";
  leadId?: string;
  opportunityId?: string;
  targetStatus?: string;
  targetStage?: string;
  createOpportunity?: boolean;
  accountId?: string;
  newAccountName?: string;
  opportunityName?: string;
  opportunityValue?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LifecycleRequest;
    const { action } = body;

    if (action === "transition-lead") {
      return handleTransitionLead(body);
    }

    if (action === "transition-opportunity") {
      return handleTransitionOpportunity(body);
    }

    if (action === "promote-lead") {
      return handlePromoteLead(body);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function handleTransitionLead(body: LifecycleRequest) {
  const { leadId, targetStatus } = body;

  if (!leadId || !targetStatus) {
    return NextResponse.json({ error: "leadId and targetStatus are required" }, { status: 400 });
  }

  if (!isInboundLeadStatus(targetStatus)) {
    return NextResponse.json({ error: `Invalid status: ${targetStatus}` }, { status: 400 });
  }

  const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(leadId) : getInboundLead(leadId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!isValidLeadTransition(lead.status, targetStatus)) {
    return NextResponse.json(
      { error: `Invalid transition: ${lead.status} → ${targetStatus}` },
      { status: 422 },
    );
  }

  // Infer contactedAt when moving past 'new'
  const inferredContactedAt =
    !lead.contactedAt && targetStatus !== "new" ? new Date().toISOString() : lead.contactedAt;

  const leadUpdates = {
    status: targetStatus,
    contactedAt: inferredContactedAt ?? null,
  };
  const updatedLead = shouldUseSupabaseBackend()
    ? await updateSupabaseInboundLead(leadId, leadUpdates)
    : updateInboundLead(leadId, leadUpdates);

  if (!updatedLead) {
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }

  // Write status_change event
  const now = new Date().toISOString();
  const statusEvent = {
    leadId,
    type: "status_change",
    actor: "system",
    timestamp: now,
    metadata: { from: lead.status, to: targetStatus },
  };
  if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(statusEvent);
  else appendEvent(statusEvent);

  if (targetStatus === "confirmed" || targetStatus === "paid") {
    const conversionEvent = {
      leadId,
      type: "conversion",
      actor: "system",
      timestamp: now,
      metadata: {
        source: lead.source ?? null,
        type: lead.type,
        expectedValue: lead.expectedValue ?? null,
        previousStatus: lead.status,
      },
    };
    if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(conversionEvent);
    else appendEvent(conversionEvent);
  }

  // Compute linked updates
  const { contactStage, opportunityStage } = computeLinkedUpdates(targetStatus);
  const updates: Record<string, unknown> = { lead: updatedLead };

  // Update linked contact
  if (updatedLead.crmContactId) {
    const updatedContact = shouldUseSupabaseBackend()
      ? await updateSupabaseContact(updatedLead.crmContactId, { stage: contactStage })
      : updateContact(updatedLead.crmContactId, { stage: contactStage });
    if (updatedContact) {
      updates.contact = updatedContact;
    }
  }

  // Update linked opportunity
  if (updatedLead.crmOpportunityId && opportunityStage) {
    const updatedOpp = shouldUseSupabaseBackend()
      ? await updateSupabaseOpportunity(updatedLead.crmOpportunityId, { stage: opportunityStage })
      : updateOpportunity(updatedLead.crmOpportunityId, { stage: opportunityStage });
    if (updatedOpp) {
      updates.opportunity = updatedOpp;
    }
  }

  return NextResponse.json({ success: true, updates });
}

async function handleTransitionOpportunity(body: LifecycleRequest) {
  const { opportunityId, targetStage } = body;

  if (!opportunityId || !targetStage) {
    return NextResponse.json(
      { error: "opportunityId and targetStage are required" },
      { status: 400 },
    );
  }

  if (!isOpportunityStage(targetStage)) {
    return NextResponse.json({ error: `Invalid stage: ${targetStage}` }, { status: 400 });
  }

  const allOpps = shouldUseSupabaseBackend() ? await getSupabaseOpportunities() : getOpportunities();
  const currentOpp = allOpps.find((opp) => opp.id === opportunityId);

  if (!currentOpp) {
    return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  }

  if (!isValidOpportunityTransition(currentOpp.stage, targetStage)) {
    return NextResponse.json(
      { error: `Invalid transition: ${currentOpp.stage} → ${targetStage}` },
      { status: 422 },
    );
  }

  const updatedOpp = shouldUseSupabaseBackend()
    ? await updateSupabaseOpportunity(opportunityId, { stage: targetStage })
    : updateOpportunity(opportunityId, { stage: targetStage });
  if (!updatedOpp) {
    return NextResponse.json({ error: "Failed to update opportunity" }, { status: 500 });
  }

  const updates: Record<string, unknown> = { opportunity: updatedOpp };

  // Bidirectional cascade: opportunity stage → contact stage
  const { contactStage } = computeOpportunityLinkedUpdates(targetStage);
  if (contactStage && updatedOpp.contactId) {
    const updatedContact = shouldUseSupabaseBackend()
      ? await updateSupabaseContact(updatedOpp.contactId, { stage: contactStage })
      : updateContact(updatedOpp.contactId, { stage: contactStage });
    if (updatedContact) {
      updates.contact = { id: updatedContact.id, stage: updatedContact.stage };
    }
  }

  return NextResponse.json({ success: true, updates });
}

async function handlePromoteLead(body: LifecycleRequest) {
  const { leadId, createOpportunity = false, accountId, newAccountName, opportunityName, opportunityValue } = body;

  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(leadId) : getInboundLead(leadId);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  if (shouldUseSupabaseBackend()) {
    return NextResponse.json({
      error: "Legacy lifecycle promote is disabled in Supabase mode. Use /api/crm/leads/[id]/convert for reviewed lead conversion.",
    }, { status: 501 });
  }

  // Map lead type to opportunity type
  const opportunityType =
    lead.type === "corporate"
      ? "Mission Control Build"
      : lead.type === "partnership"
        ? "Referral Partnership"
        : lead.type === "academy-miami"
          ? "Full-Day Install"
          : "Half-Day Install";
  const opportunityLocation =
    lead.type === "academy-la"
      ? "Los Angeles"
      : typeof lead.metadata?.location === "string" && /fort\s+lauderdale|ft\.?\s+lauderdale/i.test(lead.metadata.location)
        ? "Fort Lauderdale"
        : "Miami";

  const nameParts = (lead.contactName || lead.name || "").split(" ");
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "Lead";

  // Resolve account name: existing account by ID, new account name override, or lead's company name
  let resolvedAccountName = lead.companyName;
  if (accountId) {
    const existingAccount = (shouldUseSupabaseBackend() ? await getSupabaseAccounts() : getAccounts()).find((a) => a.id === accountId);
    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    resolvedAccountName = existingAccount.name;
  } else if (newAccountName) {
    resolvedAccountName = newAccountName;
  }

  const result = ingestInboundLead({
    opportunityType,
    contact: {
      firstName,
      lastName,
      email: lead.email,
      phone: lead.phone,
    },
    account: resolvedAccountName ? { name: resolvedAccountName } : undefined,
    opportunity: {
      name: opportunityName?.trim() || undefined,
      location: opportunityLocation,
      value: Number.isFinite(opportunityValue) ? opportunityValue : lead.expectedValue ?? 0,
      source: lead.source === "website" ? "Website Form" : lead.source === "referral" ? "Referral" : lead.source === "event" ? "In Person" : "Manual",
    },
  });

  // If createOpportunity is false and an opportunity was auto-created, remove it
  if (!createOpportunity && result.created.opportunity && result.opportunity?.id) {
    deleteOpportunity(result.opportunity.id);
  }

  // Update the lead record with CRM IDs
  const statusUpdate: Partial<{ status: InboundLeadStatus; crmContactId: string; crmAccountId: string; crmOpportunityId: string }> = {
    crmContactId: result.contact.id,
    crmAccountId: result.account.id,
  };

  // Only store opportunity ID if we're keeping it
  if (createOpportunity) {
    statusUpdate.crmOpportunityId = result.opportunity.id;
  }

  // Auto-advance to 'qualified' if still early stage
  if (lead.status === "new" || lead.status === "contacted") {
    statusUpdate.status = "qualified";
  }

  if (shouldUseSupabaseBackend()) await updateSupabaseInboundLead(leadId, statusUpdate);
  else updateInboundLead(leadId, statusUpdate);

  const now = new Date().toISOString();
  const event = {
    leadId,
    type: "crm_linked",
    actor: "system",
    timestamp: now,
    metadata: {
      contactId: result.contact.id,
      accountId: result.account.id,
      opportunityId: createOpportunity ? result.opportunity.id : null,
      createdContact: result.created.contact,
      createdAccount: result.created.account,
      createdOpportunity: createOpportunity && result.created.opportunity,
    },
  };
  if (shouldUseSupabaseBackend()) await appendSupabaseLeadEvent(event);
  else appendEvent(event);

  // Build response — omit opportunity data if not requested
  const response = createOpportunity
    ? result
    : { ...result, opportunity: null, created: { ...result.created, opportunity: false } };

  return NextResponse.json(response, { status: createOpportunity && result.created.opportunity ? 201 : 200 });
}
