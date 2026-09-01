import { NextResponse } from "next/server";
import { getSupabaseEmailActivities } from "@/lib/crm/supabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const INBOXES = process.env.CRM_SYNC_INBOXES?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];

export async function GET() {
  try {
    const state = shouldUseSupabaseBackend() ? {} : (await import("@/lib/crm/gmailSyncState")).getGmailSyncState();
    const emailActivities = shouldUseSupabaseBackend()
      ? await getSupabaseEmailActivities()
      : (await import("@/lib/crm/store")).getEmailActivities();
    const getRecentRunsForInbox = shouldUseSupabaseBackend()
      ? (() => [])
      : (await import("@/lib/crm/gmailSyncLog")).getRecentRunsForInbox;

    const inboxes: Record<string, {
      lastSyncAt: string | null;
      lastMessageId: string | null;
      status?: string;
      retryCount?: number;
      recentRuns: ReturnType<typeof getRecentRunsForInbox>;
    }> = {};

    let lastRunAt: string | null = null;

    for (const inbox of INBOXES) {
      const s = state[inbox];
      inboxes[inbox] = {
        lastSyncAt: s?.lastSyncAt ?? null,
        lastMessageId: s?.lastMessageId ?? null,
        status: s?.status,
        retryCount: s?.retryCount,
        recentRuns: getRecentRunsForInbox(inbox, 3),
      };
      if (s?.lastSyncAt) {
        if (!lastRunAt || s.lastSyncAt > lastRunAt) {
          lastRunAt = s.lastSyncAt;
        }
      }
    }

    return NextResponse.json({
      inboxes,
      totalEmailActivities: emailActivities.length,
      lastRunAt,
    }, { headers: { "Cache-Control": "no-cache" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read status" },
      { status: 500 },
    );
  }
}
