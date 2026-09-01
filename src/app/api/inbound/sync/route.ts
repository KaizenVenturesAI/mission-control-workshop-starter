import { NextResponse } from "next/server";
import { listInboundLeads } from "@/modules/revenue/inboundLeadsStore";
import { appendEvent } from "@/modules/revenue/inboundLeadEventsStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    if (shouldUseSupabaseBackend()) {
      return NextResponse.json({
        success: false,
        error: "Sheet sync is disabled until source sync state is migrated to Supabase. Website leads continue through /api/public/website-leads.",
      }, { status: 501 });
    }
    const { syncAllSheets } = await import("@/modules/revenue/inboundLeadsSync");
    const { notifyDiscordNewLeads } = await import("@/lib/inbound/discordNotify");
    const { processInstallProgramDraftsForNewLeads } = await import("@/lib/inbound/academyEmailDraft");
    // Snapshot lead IDs before sync so we can detect new arrivals
    const preExistingIds = new Set(listInboundLeads().map((lead) => lead.id));

    const result = syncAllSheets();

    // Identify net-new leads created in this sync run
    const allLeadsAfterSync = listInboundLeads();
    const newLeads = allLeadsAfterSync.filter((lead) => !preExistingIds.has(lead.id));

    // --- Write sync_created events for new leads ---
    const syncTimestamp = new Date().toISOString();
    for (const lead of newLeads) {
      try {
        appendEvent({
          leadId: lead.id,
          type: "sync_created",
          actor: "sync",
          timestamp: syncTimestamp,
          metadata: { source: lead.source, type: lead.type },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[sync] Failed to write sync_created event for lead ${lead.id}: ${message}`);
      }
    }

    // --- Discord alert (non-blocking) ---
    if (newLeads.length > 0) {
      void notifyDiscordNewLeads(newLeads).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[sync] Discord notify failed (non-fatal): ${message}`);
      });
    }

    // --- Install Ops email draft scaffold (non-blocking) ---
    const academyDraftResult = { drafted: 0, skipped: 0 };
    if (newLeads.length > 0) {
      try {
        const counts = processInstallProgramDraftsForNewLeads(newLeads);
        academyDraftResult.drafted = counts.drafted;
        academyDraftResult.skipped = counts.skipped;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[sync] Install Ops draft generation failed (non-fatal): ${message}`);
      }
    }

    const response = {
      ...result,
      automation: {
        newLeadsDetected: newLeads.length,
        discordAlertQueued: newLeads.length > 0,
        academyEmailDrafts: academyDraftResult,
      },
    };

    return NextResponse.json(response, {
      status: result.success ? 200 : 503,
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
