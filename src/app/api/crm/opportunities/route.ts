import { NextRequest, NextResponse } from "next/server";
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunities,
  updateOpportunity,
} from "@/lib/crm/store";
import {
  createSupabaseOpportunity,
  deleteSupabaseOpportunity,
  getSupabaseOpportunities,
  updateSupabaseOpportunity,
} from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { actorFromRequest, diffFields, safeAppendAuditEntry } from "@/lib/audit/store";
import { normalizeOpportunityStage, type Opportunity } from "@/data/opportunities";

export const dynamic = "force-dynamic";

// Whitelist of fields a client may patch via PUT. Mirrors updateOpportunity()
// in store.ts. Excludes id, createdAt, updatedAt, provenance.
const OPPORTUNITY_PATCH_FIELDS = [
  "accountId",
  "contactId",
  "name",
  "opportunityType",
  "location",
  "stage",
  "openDate",
  "closeDate",
  "forecastConfidence",
  "valueType",
  "value",
  "pricingUnit",
  "quantity",
  "unitPrice",
  "computedValue",
  "source",
  "owner",
  "nextStep",
  "nextStepDueDate",
  "notes",
  "lossReason",
  "promotedFromAccountId",
  "referralPartnerAccountId",
  "referralPartnerContactId",
  "payoutAllocations",
  "deletedAt",
] as const;

function normalizeDateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePayoutAllocations(value: unknown): Opportunity["payoutAllocations"] {
  if (!Array.isArray(value)) return undefined;
  const allocations = value
    .filter((item): item is { owner?: unknown; percent?: unknown } => item != null && typeof item === "object")
    .map((item) => ({
      owner: item.owner,
      percent: Number(item.percent),
    }))
    .filter((item): item is { owner: Opportunity["owner"]; percent: number } =>
      typeof item.owner === "string" &&
      Number.isFinite(item.percent) &&
      item.percent >= 0 &&
      item.percent <= 100
    );
  return allocations.length > 0 ? allocations : undefined;
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
  const contactId = request.nextUrl.searchParams.get("contactId") ?? undefined;
  const opportunities = shouldUseSupabaseBackend()
    ? await getSupabaseOpportunities(accountId, contactId)
    : getOpportunities(accountId, contactId);
  return NextResponse.json(opportunities, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      accountId,
      contactId,
      name,
      opportunityType,
      location,
      stage,
      openDate,
      closeDate,
      forecastConfidence,
      valueType,
      value,
      pricingUnit,
      quantity,
      unitPrice,
      computedValue,
      source,
      owner,
      nextStep,
      nextStepDueDate,
      notes,
      lossReason,
      promotedFromAccountId,
      referralPartnerAccountId,
      referralPartnerContactId,
      payoutAllocations,
    } = body;

    if (
      !accountId ||
      !contactId ||
      !opportunityType ||
      !location ||
      !openDate ||
      !forecastConfidence ||
      !valueType ||
      !source ||
      !owner ||
      !nextStep ||
      !nextStepDueDate ||
      typeof value !== "number"
    ) {
      return NextResponse.json(
        { error: "accountId, contactId, opportunityType, location, openDate, forecastConfidence, valueType, source, owner, nextStep, nextStepDueDate, and numeric value are required" },
        { status: 400 }
      );
    }

    const opportunityPayload = {
      accountId,
      contactId,
      name: name || undefined,
      opportunityType,
      location,
      stage: normalizeOpportunityStage(stage),
      openDate,
      closeDate: closeDate || undefined,
      forecastConfidence,
      valueType,
      value,
      pricingUnit,
      quantity,
      unitPrice,
      computedValue,
      source,
      owner,
      nextStep,
      nextStepDueDate,
      notes: notes || undefined,
      lossReason: lossReason || undefined,
      promotedFromAccountId: promotedFromAccountId || undefined,
      referralPartnerAccountId: referralPartnerAccountId || undefined,
      referralPartnerContactId: referralPartnerContactId || undefined,
      payoutAllocations: normalizePayoutAllocations(payoutAllocations),
    };
    const opportunity = shouldUseSupabaseBackend()
      ? await createSupabaseOpportunity(opportunityPayload)
      : createOpportunity(opportunityPayload);

    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "opportunity",
      entityId: opportunity.id,
      action: "create",
      changes: [],
      context: { route: "/api/crm/opportunities", method: "POST" },
    });
    return NextResponse.json(opportunity, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
      return NextResponse.json({ error: "Contact not found" }, { status: 400 });
    }
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

    type OpportunityPatch = Parameters<typeof updateOpportunity>[1];
    const patch: OpportunityPatch = {};
    for (const field of OPPORTUNITY_PATCH_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        (patch as Record<string, unknown>)[field] = body[field];
      }
    }

    if (Object.prototype.hasOwnProperty.call(patch, "contactId") && !patch.contactId) {
      return NextResponse.json({ error: "contactId cannot be empty" }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "accountId") && !patch.accountId) {
      return NextResponse.json({ error: "accountId cannot be empty" }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "nextStep") && !patch.nextStep) {
      return NextResponse.json({ error: "nextStep cannot be empty" }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "nextStepDueDate")) {
      const nextStepDueDate = normalizeDateOnly(patch.nextStepDueDate);
      if (!nextStepDueDate) {
        return NextResponse.json({ error: "nextStepDueDate must be a valid date" }, { status: 400 });
      }
      patch.nextStepDueDate = nextStepDueDate;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "openDate")) {
      const openDate = normalizeDateOnly(patch.openDate);
      if (!openDate) {
        return NextResponse.json({ error: "openDate must be a valid date" }, { status: 400 });
      }
      patch.openDate = openDate;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "nextStepDueDate") && !patch.nextStepDueDate) {
      return NextResponse.json({ error: "nextStepDueDate cannot be empty" }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "stage")) {
      patch.stage = normalizeOpportunityStage(patch.stage);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "payoutAllocations")) {
      patch.payoutAllocations = normalizePayoutAllocations(patch.payoutAllocations);
    }

    // Optional fields treat empty strings/null as an explicit unset.
    if (Object.prototype.hasOwnProperty.call(patch, "closeDate")) {
      patch.closeDate = normalizeDateOnly(patch.closeDate) ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "lossReason") && !patch.lossReason) {
      patch.lossReason = undefined;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "notes") && !patch.notes) {
      patch.notes = undefined;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "referralPartnerAccountId") && !patch.referralPartnerAccountId) {
      patch.referralPartnerAccountId = undefined;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "referralPartnerContactId") && !patch.referralPartnerContactId) {
      patch.referralPartnerContactId = undefined;
    }

    const before = (shouldUseSupabaseBackend() ? await getSupabaseOpportunities() : getOpportunities()).find((o) => o.id === id);
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseOpportunity(id, patch)
      : updateOpportunity(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }
    if (before) {
      const changes = diffFields<Opportunity>(before, updated, OPPORTUNITY_PATCH_FIELDS);
      if (changes.length > 0) {
        safeAppendAuditEntry({
          actor: actorFromRequest(request),
          entityType: "opportunity",
          entityId: id,
          action: "patch",
          changes,
          context: { route: "/api/crm/opportunities", method: "PUT" },
        });
      }
    }
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "CONTACT_NOT_FOUND") {
      return NextResponse.json({ error: "Contact not found" }, { status: 400 });
    }
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
      ? await deleteSupabaseOpportunity(id)
      : deleteOpportunity(id);
    if (!deleted) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }
    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "opportunity",
      entityId: id,
      action: "delete",
      changes: [],
      context: { route: "/api/crm/opportunities", method: "DELETE" },
    });
    return NextResponse.json({ success: true, id });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
