import { NextResponse } from "next/server";
import { getStore } from "@/modules/revenue/inboundLeadsStore";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

export async function GET() {
  const leads = shouldUseSupabaseBackend() ? await listSupabaseInboundLeads() : getStore().leads;

  const isConverted = (l: InboundLeadRecord) => !!l.crmContactId;

  // --- bySource ---
  const sourceMap = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    const key = lead.source ?? "other";
    const arr = sourceMap.get(key);
    if (arr) arr.push(lead);
    else sourceMap.set(key, [lead]);
  }
  const bySource = [...sourceMap.entries()].map(([source, group]) => {
    const converted = group.filter(isConverted).length;
    const values = group.filter((l) => l.expectedValue != null).map((l) => l.expectedValue!);
    const totalValue = values.reduce((s, v) => s + v, 0);
    return {
      source,
      count: group.length,
      converted,
      conversionRate: group.length ? +(converted / group.length).toFixed(4) : 0,
      avgValue: values.length ? Math.round(totalValue / values.length) : 0,
      totalValue,
    };
  });

  // --- byType ---
  const typeMap = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    const arr = typeMap.get(lead.type);
    if (arr) arr.push(lead);
    else typeMap.set(lead.type, [lead]);
  }
  const byType = [...typeMap.entries()].map(([type, group]) => {
    const converted = group.filter(isConverted).length;
    const values = group.filter((l) => l.expectedValue != null).map((l) => l.expectedValue!);
    const totalValue = values.reduce((s, v) => s + v, 0);
    return {
      type,
      count: group.length,
      converted,
      conversionRate: group.length ? +(converted / group.length).toFixed(4) : 0,
      avgValue: values.length ? Math.round(totalValue / values.length) : 0,
      totalValue,
    };
  });

  // --- byMarket ---
  const marketMap = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    const key = lead.market ?? "other";
    const arr = marketMap.get(key);
    if (arr) arr.push(lead);
    else marketMap.set(key, [lead]);
  }
  const byMarket = [...marketMap.entries()].map(([market, group]) => {
    const converted = group.filter(isConverted).length;
    const values = group.filter((l) => l.expectedValue != null).map((l) => l.expectedValue!);
    const totalValue = values.reduce((s, v) => s + v, 0);
    return {
      market,
      count: group.length,
      converted,
      conversionRate: group.length ? +(converted / group.length).toFixed(4) : 0,
      avgValue: values.length ? Math.round(totalValue / values.length) : 0,
      totalValue,
    };
  });

  // --- byMonth ---
  const monthMap = new Map<string, { count: number; converted: number }>();
  for (const lead of leads) {
    const month = lead.receivedAt.slice(0, 7); // "YYYY-MM"
    const entry = monthMap.get(month);
    const conv = isConverted(lead) ? 1 : 0;
    if (entry) {
      entry.count++;
      entry.converted += conv;
    } else {
      monthMap.set(month, { count: 1, converted: conv });
    }
  }
  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  // --- totals ---
  const totalLeads = leads.length;
  const totalConverted = leads.filter(isConverted).length;
  const allValues = leads.filter((l) => l.expectedValue != null).map((l) => l.expectedValue!);
  const totalPipelineValue = allValues.reduce((s, v) => s + v, 0);
  const responseTimes = leads
    .filter((l) => l.responseTimeMs != null)
    .map((l) => l.responseTimeMs!);
  const avgTimeToContactMs = responseTimes.length
    ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
    : 0;

  return NextResponse.json(
    {
      bySource,
      byType,
      byMarket,
      byMonth,
      totals: {
        totalLeads,
        totalConverted,
        overallConversionRate: totalLeads ? +(totalConverted / totalLeads).toFixed(4) : 0,
        totalPipelineValue,
        avgTimeToContactMs,
      },
    },
    { headers: { "Cache-Control": "no-cache" } },
  );
}
