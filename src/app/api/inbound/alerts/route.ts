/**
 * GET /api/inbound/alerts
 *
 * Returns stale lead alerts for leads that have been in `new` status
 * beyond the SLA thresholds:
 *   - watch    → 1h+  (yellow)
 *   - warning  → 4h+  (orange)
 *   - critical → 24h+ (red)
 *
 * Sprint 7 — speed-to-lead alerting layer.
 */

import { NextResponse } from "next/server";
import { listInboundLeads } from "@/modules/revenue/inboundLeadsStore";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

export type SLATier = "watch" | "warning" | "critical";

export interface StaleLeadAlert {
  id: string;
  name: string;
  email: string | undefined;
  type: string;
  status: string;
  receivedAt: string;
  ageMs: number;
  ageHours: number;
  tier: SLATier;
}

const SLA_THRESHOLDS_MS = {
  critical: 24 * 60 * 60 * 1000,  // 24h
  warning: 4 * 60 * 60 * 1000,    // 4h
  watch: 1 * 60 * 60 * 1000,      // 1h
} as const;

function getSLATier(lead: InboundLeadRecord, nowMs: number): SLATier | null {
  if (lead.status !== "new") return null;
  const ageMs = nowMs - new Date(lead.receivedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  if (ageMs >= SLA_THRESHOLDS_MS.critical) return "critical";
  if (ageMs >= SLA_THRESHOLDS_MS.warning) return "warning";
  if (ageMs >= SLA_THRESHOLDS_MS.watch) return "watch";
  return null;
}

export async function GET() {
  const leads = shouldUseSupabaseBackend() ? await listSupabaseInboundLeads() : listInboundLeads();
  const nowMs = Date.now();

  const alerts: StaleLeadAlert[] = [];

  for (const lead of leads) {
    const tier = getSLATier(lead, nowMs);
    if (!tier) continue;

    const ageMs = nowMs - new Date(lead.receivedAt).getTime();
    alerts.push({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      type: lead.type,
      status: lead.status,
      receivedAt: lead.receivedAt,
      ageMs,
      ageHours: Math.floor(ageMs / (60 * 60 * 1000)),
      tier,
    });
  }

  // Sort: critical first, then oldest within each tier
  alerts.sort((a, b) => {
    const tierOrder: Record<SLATier, number> = { critical: 0, warning: 1, watch: 2 };
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return b.ageMs - a.ageMs;
  });

  const summary = {
    total: alerts.length,
    critical: alerts.filter((a) => a.tier === "critical").length,
    warning: alerts.filter((a) => a.tier === "warning").length,
    watch: alerts.filter((a) => a.tier === "watch").length,
  };

  return NextResponse.json(
    {
      summary,
      alerts,
      thresholds: {
        watch: "1h",
        warning: "4h",
        critical: "24h",
      },
    },
    { headers: { "Cache-Control": "no-cache" } },
  );
}
