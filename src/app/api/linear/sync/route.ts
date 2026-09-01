/**
 * POST /api/linear/sync
 *
 * Triggers a one-way sync from Linear → Mission Control action-items store.
 * Safe to call from a heartbeat or cron job.
 *
 * Example Client-66 — Sprint 3: Linear Sync Engine
 */

import { NextResponse } from "next/server";
import { syncLinearIssues } from "@/lib/linear/linearSync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await syncLinearIssues();
    return NextResponse.json({
      success: summary.errors.length === 0,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      total: summary.total,
      errors: summary.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/linear/sync] Unexpected error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
