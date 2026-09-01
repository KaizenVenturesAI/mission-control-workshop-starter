import { NextResponse } from "next/server";
import { getAccounts, createAccount, updateAccount, deleteAccount, withStoreMutation } from "@/lib/crm/store";
import {
  createSupabaseAccount,
  deleteSupabaseAccount,
  getSupabaseAccounts,
  updateSupabaseAccount,
  withSupabaseStoreMutation,
} from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { actorFromRequest, diffFields, safeAppendAuditEntry } from "@/lib/audit/store";
import { normalizeAccountLifecycleStage, normalizeAccountType, type Account } from "@/data/accounts";
import { runCrmHygiene } from "@/lib/crm/hygiene";

export const dynamic = "force-dynamic";

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
      context: { route: "/api/crm/accounts", method: "POST/PUT", relatedEntityId: merge.winnerId, summary: `Auto-merged at ${Math.round(merge.confidence * 100)}%; ${merge.canonicalReason}` },
    });
    safeAppendAuditEntry({
      actor,
      entityType: merge.kind,
      entityId: merge.winnerId,
      action: "patch",
      changes: merge.winnerChanges,
      context: { route: "/api/crm/accounts", method: "POST/PUT", relatedEntityId: merge.loserId, summary: `Auto-absorbed duplicate at ${Math.round(merge.confidence * 100)}%; ${merge.canonicalReason}` },
    });
  }
}

export async function GET(request: Request) {
  const includeMerged = new URL(request.url).searchParams.get("includeMerged") === "true";
  const accounts = shouldUseSupabaseBackend()
    ? await getSupabaseAccounts({ includeMerged })
    : getAccounts({ includeMerged });
  return NextResponse.json(accounts, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, aliases, recordType, type, subType, category, operatingMarket, address, website, notes, industry, linkedinUrl, linkedinDescription, employeeRange, associatedMembers, linkedinIndustry, linkedinHeadquarters, linkedinCompanyType, enrichmentSource, enrichmentConfidence, enrichedAt, revenueTier, relationshipStage, geo, domain, owner, interests, tier, lifecycleStage, convertedFromLeadId, referralPartnerAccountId, sourceRefs, logoAssetId, assets } = body;
    if (!name || !type) {
      return NextResponse.json(
        { error: "name and type are required" },
        { status: 400 }
      );
    }
    const aliasInput = Array.isArray(aliases)
      ? aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim() !== "")
      : undefined;
    const actor = actorFromRequest(request);
    const createPayload = {
      name,
      aliases: aliasInput && aliasInput.length > 0 ? aliasInput : undefined,
      recordType: recordType === "person_account" ? "person_account" : "company",
      type: normalizeAccountType(type),
      subType: subType || undefined,
      category: category || undefined,
      operatingMarket: operatingMarket || undefined,
      address: address || undefined,
      website: website || undefined,
      notes: notes || undefined,
      industry: industry || undefined,
      linkedinUrl: linkedinUrl || undefined,
      linkedinDescription: linkedinDescription || undefined,
      employeeRange: employeeRange || undefined,
      associatedMembers: typeof associatedMembers === "number" ? associatedMembers : undefined,
      linkedinIndustry: linkedinIndustry || undefined,
      linkedinHeadquarters: linkedinHeadquarters || undefined,
      linkedinCompanyType: linkedinCompanyType || undefined,
      enrichmentSource: enrichmentSource || undefined,
      enrichmentConfidence: enrichmentConfidence || undefined,
      enrichedAt: enrichedAt || undefined,
      revenueTier: revenueTier || undefined,
      relationshipStage: relationshipStage || undefined,
      geo: geo || undefined,
      domain: domain || undefined,
      owner: owner || undefined,
      interests: Array.isArray(interests) ? interests : undefined,
      tier: tier || undefined,
      lifecycleStage: normalizeAccountLifecycleStage(lifecycleStage),
      convertedFromLeadId: convertedFromLeadId || undefined,
      referralPartnerAccountId: referralPartnerAccountId || undefined,
      sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : undefined,
      logoAssetId: logoAssetId || undefined,
      assets: Array.isArray(assets) ? assets : undefined,
    } satisfies Parameters<typeof createSupabaseAccount>[0];
    const account = shouldUseSupabaseBackend()
      ? await createSupabaseAccount(createPayload)
      : createAccount(createPayload);
    safeAppendAuditEntry({
      actor,
      entityType: "account",
      entityId: account.id,
      action: "create",
      changes: [],
      context: { route: "/api/crm/accounts", method: "POST" },
    });
    await runRealtimeHygieneAudit(actor);
    return NextResponse.json(account, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// Allowed fields that PUT may patch on an account. Anything not listed is
// dropped before reaching the store.
const ACCOUNT_PATCH_FIELDS = [
  "name",
  "aliases",
  "recordType",
  "type",
  "subType",
  "category",
  "operatingMarket",
  "address",
  "website",
  "notes",
  "industry",
  "linkedinUrl",
  "linkedinDescription",
  "employeeRange",
  "associatedMembers",
  "linkedinIndustry",
  "linkedinHeadquarters",
  "linkedinCompanyType",
  "enrichmentSource",
  "enrichmentConfidence",
  "enrichedAt",
  "revenueTier",
  "relationshipStage",
  "geo",
  "domain",
  "owner",
  "interests",
  "tier",
  "lifecycleStage",
  "convertedFromLeadId",
  "referralPartnerAccountId",
  "sourceRefs",
  "logoAssetId",
  "assets",
] as const;

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id } = body ?? {};

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Only forward fields that were actually present in the request body.
    // Never destructure-then-forward, which turns missing keys into `undefined`
    // and silently wipes existing values during a partial update.
    // (P0 fix: 2026-05-02 — InlineEditEnum-driven Revenue Tier change wiped
    // name/type/etc. for affected accounts.)
    type AccountPatch = Parameters<typeof updateAccount>[1];
    const patch: AccountPatch = {};
    for (const field of ACCOUNT_PATCH_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        (patch as Record<string, unknown>)[field] = body[field];
      }
    }

    // Normalize aliases: drop non-string entries; collapse empty array to undefined.
    if ("aliases" in patch) {
      const raw = (patch as Record<string, unknown>).aliases;
      if (Array.isArray(raw)) {
        const cleaned = raw.filter((alias): alias is string => typeof alias === "string" && alias.trim() !== "");
        patch.aliases = cleaned.length > 0 ? cleaned : undefined;
      } else if (raw === null) {
        patch.aliases = undefined;
      } else {
        delete (patch as Record<string, unknown>).aliases;
      }
    }

    // Reject patches that would clear identity fields.
    if ("name" in patch && (typeof patch.name !== "string" || patch.name.trim() === "")) {
      return NextResponse.json(
        { error: "name cannot be cleared" },
        { status: 400 }
      );
    }
    if ("type" in patch && !patch.type) {
      return NextResponse.json(
        { error: "type cannot be cleared" },
        { status: 400 }
      );
    }
    if ("type" in patch) {
      patch.type = normalizeAccountType(patch.type);
    }
    if ("lifecycleStage" in patch) {
      patch.lifecycleStage = normalizeAccountLifecycleStage(patch.lifecycleStage);
    }
    if ("referralPartnerAccountId" in patch && !patch.referralPartnerAccountId) {
      patch.referralPartnerAccountId = undefined;
    }

    const actor = actorFromRequest(request);
    const before = (shouldUseSupabaseBackend()
      ? await getSupabaseAccounts({ includeMerged: true })
      : getAccounts({ includeMerged: true })).find((a) => a.id === id);
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseAccount(id, patch)
      : updateAccount(id, patch);

    if (!updated) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    if (before) {
      const changes = diffFields<Account>(before, updated, ACCOUNT_PATCH_FIELDS);
      if (changes.length > 0) {
        safeAppendAuditEntry({
          actor,
          entityType: "account",
          entityId: id,
          action: "patch",
          changes,
          context: { route: "/api/crm/accounts", method: "PUT" },
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
      ? await deleteSupabaseAccount(id)
      : deleteAccount(id);
    if (!deleted) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "account",
      entityId: id,
      action: "delete",
      changes: [],
      context: { route: "/api/crm/accounts", method: "DELETE" },
    });
    return NextResponse.json({ success: true, id });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
