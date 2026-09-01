/**
 * POST /api/inbound/alerts/escalate
 *
 * Runs the SLA escalation check and returns a Discord-formatted alert.
 * Designed to be called by a cron job.
 */

import { NextResponse } from "next/server";
import { checkSLAEscalations } from "@/lib/inbound/slaEscalation";

export const dynamic = "force-dynamic";

export async function POST() {
  const alert = await checkSLAEscalations();

  if (!alert) {
    return NextResponse.json({ escalation: false, message: null });
  }

  return NextResponse.json({ escalation: true, message: alert });
}
