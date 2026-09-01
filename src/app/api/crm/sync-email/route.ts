import { NextResponse } from "next/server";
import { getSupabaseEmailActivities } from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    if (shouldUseSupabaseBackend()) {
      return NextResponse.json({
        success: false,
        error: "Email sync is disabled until the Gmail sync state is migrated to Supabase.",
      }, { status: 501 });
    }
    const { syncAllInboxes } = await import("@/lib/crm/gmailSync");
    const results = await syncAllInboxes();
    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
      results,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const state = shouldUseSupabaseBackend() ? {} : (await import("@/lib/crm/gmailSyncState")).getGmailSyncState();
    const emailActivities = shouldUseSupabaseBackend()
      ? await getSupabaseEmailActivities()
      : (await import("@/lib/crm/store")).getEmailActivities();
    return NextResponse.json({
      syncState: state,
      totalEmailActivities: emailActivities.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read status" },
      { status: 500 },
    );
  }
}
