/**
 * SLA Escalation — checks inbound leads for SLA viclienttions
 * and formats a Discord-ready alert summary.
 */

import { listInboundLeads } from "@/modules/revenue/inboundLeadsStore";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

type SLATier = "warning" | "critical";

const SLA_THRESHOLDS_MS = {
  critical: 24 * 60 * 60 * 1000, // 24h
  warning: 4 * 60 * 60 * 1000, // 4h
} as const;

interface StaleEntry {
  name: string;
  type: string;
  ageHours: number;
}

function classifyLead(
  lead: InboundLeadRecord,
  nowMs: number,
): { tier: SLATier; ageHours: number } | null {
  if (lead.status !== "new") return null;
  const ageMs = nowMs - new Date(lead.receivedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  if (ageMs >= SLA_THRESHOLDS_MS.critical)
    return { tier: "critical", ageHours: Math.floor(ageMs / 3_600_000) };
  if (ageMs >= SLA_THRESHOLDS_MS.warning)
    return { tier: "warning", ageHours: Math.floor(ageMs / 3_600_000) };
  return null;
}

function formatSection(
  emoji: string,
  label: string,
  entries: StaleEntry[],
): string {
  const lines = [
    `${emoji} **${label}: ${entries.length} lead${entries.length === 1 ? "" : "s"}**`,
  ];
  for (const e of entries) {
    lines.push(`  • ${e.name} — ${e.type} — ${e.ageHours}h old`);
  }
  return lines.join("\n");
}

/**
 * Checks all inbound leads for SLA viclienttions (warning 4h+, critical 24h+).
 * Returns a Discord-formatted alert string, or null if nothing is stale.
 */
export async function checkSLAEscalations(): Promise<string | null> {
  const leads = listInboundLeads();
  const nowMs = Date.now();

  const critical: StaleEntry[] = [];
  const warning: StaleEntry[] = [];

  for (const lead of leads) {
    const result = classifyLead(lead, nowMs);
    if (!result) continue;
    const entry: StaleEntry = {
      name: lead.name,
      type: lead.type,
      ageHours: result.ageHours,
    };
    if (result.tier === "critical") critical.push(entry);
    else warning.push(entry);
  }

  if (critical.length === 0 && warning.length === 0) return null;

  const sections: string[] = [];
  if (critical.length > 0)
    sections.push(formatSection("🔴", "CRITICAL (>24h)", critical));
  if (warning.length > 0)
    sections.push(formatSection("🟠", "WARNING (>4h)", warning));

  return sections.join("\n\n");
}
