import { NextResponse } from "next/server";
import { withStoreMutation } from "@/lib/crm/store";
import { withSupabaseStoreMutation } from "@/lib/crm/supabaseStore";
import { mergeRecords, type DuplicateKind, type MergeResult } from "@/lib/crm/hygiene";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { CRMStore } from "@/lib/crm/store";

export const dynamic = "force-dynamic";

interface MergeBody {
  kind: DuplicateKind;
  winnerId: string;
  loserId: string;
}

type MutationResult =
  | { ok: true; payload: MergeResult }
  | { ok: false; error: string; status: number };

function emitMergeAudit(request: Request, kind: DuplicateKind, winnerId: string, loserId: string, result: MergeResult): void {
  const actor = actorFromRequest(request);
  safeAppendAuditEntry({
    actor,
    entityType: kind,
    entityId: loserId,
    action: "merge",
    changes: result.loserChanges,
    context: {
      route: "/api/crm/merge",
      method: "POST",
      relatedEntityId: winnerId,
      summary: `Merged into ${winnerId}; ${result.canonicalReason}`,
    },
  });
  safeAppendAuditEntry({
    actor,
    entityType: kind,
    entityId: winnerId,
    action: "patch",
    changes: result.winnerChanges,
    context: {
      route: "/api/crm/merge",
      method: "POST",
      relatedEntityId: loserId,
      summary: `Absorbed merge from ${loserId}; ${result.canonicalReason}`,
    },
  });
}

export async function POST(request: Request) {
  let body: MergeBody;
  try {
    body = (await request.json()) as MergeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { kind, winnerId, loserId } = body ?? ({} as MergeBody);
  if (kind !== "account" && kind !== "contact") {
    return NextResponse.json({ error: "kind must be 'account' or 'contact'" }, { status: 400 });
  }
  if (!winnerId || !loserId) {
    return NextResponse.json({ error: "winnerId and loserId are required" }, { status: 400 });
  }

  const mutate = (store: CRMStore): MutationResult => {
    const merged = mergeRecords(store, kind, winnerId, loserId, "manual selection");
    if (!merged.ok) return merged;
    return { ok: true as const, payload: merged };
  };
  const result = shouldUseSupabaseBackend()
    ? await withSupabaseStoreMutation<MutationResult>(mutate)
    : await withStoreMutation<MutationResult>(mutate);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  emitMergeAudit(request, kind, winnerId, loserId, result.payload);

  return NextResponse.json({
    ok: true,
    winner: result.payload.winner,
    mergedActivityCount: result.payload.mergedActivityCount,
    mergedContactCount: result.payload.mergedContactCount,
    mergedOpportunityCount: result.payload.mergedOpportunityCount,
    canonicalReason: result.payload.canonicalReason,
  });
}
