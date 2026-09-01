import { NextResponse } from "next/server";
import { readStore, withStoreMutation } from "@/lib/crm/store";
import { readSupabaseCrmStore, withSupabaseStoreMutation } from "@/lib/crm/supabaseStore";
import { runCrmHygiene, type HygieneRunSummary } from "@/lib/crm/hygiene";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function emitHygieneAudit(summary: HygieneRunSummary, actor: string, route: string): void {
  for (const merge of summary.mergedRecords) {
    safeAppendAuditEntry({
      actor,
      entityType: merge.kind,
      entityId: merge.loserId,
      action: "merge",
      changes: merge.loserChanges,
      context: {
        route,
        method: "POST",
        relatedEntityId: merge.winnerId,
        summary: `Auto-merged at ${Math.round(merge.confidence * 100)}%; ${merge.canonicalReason}`,
      },
    });
    safeAppendAuditEntry({
      actor,
      entityType: merge.kind,
      entityId: merge.winnerId,
      action: "patch",
      changes: merge.winnerChanges,
      context: {
        route,
        method: "POST",
        relatedEntityId: merge.loserId,
        summary: `Auto-absorbed duplicate at ${Math.round(merge.confidence * 100)}%; ${merge.canonicalReason}`,
      },
    });
  }
}

export async function GET() {
  const store = shouldUseSupabaseBackend() ? await readSupabaseCrmStore() : readStore();
  return NextResponse.json({
    latest: store.hygieneRuns?.[0] ?? null,
    runs: store.hygieneRuns ?? [],
  }, { headers: { "Cache-Control": "no-cache" } });
}

export async function POST(request: Request) {
  const actor = actorFromRequest(request);
  let trigger: HygieneRunSummary["trigger"] = "manual";
  try {
    const body = await request.json().catch(() => ({})) as { trigger?: HygieneRunSummary["trigger"] };
    if (body.trigger === "realtime" || body.trigger === "weekly" || body.trigger === "manual") trigger = body.trigger;
  } catch {
    trigger = "manual";
  }

  const summary = shouldUseSupabaseBackend()
    ? await withSupabaseStoreMutation((store) => runCrmHygiene(store, trigger))
    : await withStoreMutation((store) => runCrmHygiene(store, trigger));
  emitHygieneAudit(summary, actor, "/api/crm/hygiene");
  return NextResponse.json({ ok: true, summary });
}
