import { NextResponse } from "next/server";
import { getSyncMeta, listInboundLeads } from "@/modules/revenue/inboundLeadsStore";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import {
  INBOUND_LEAD_SOURCES,
  PIPELINE_STATUSES,
  type InboundLeadRecord,
  type InboundLeadStatus,
  type InboundLeadType,
} from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

const STATUS_ORDER: InboundLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "scheduled",
  "confirmed",
  "paid",
  "active",
  "closed",
  "lost",
];

const STATUS_LABELS: Record<InboundLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  paid: "Paid",
  active: "Active",
  closed: "Closed",
  lost: "Lost",
};

const TYPE_LABELS: Record<InboundLeadType, string> = {
  corporate: "Mission Control Builds",
  partnership: "Referral Partnerships",
  "academy-la": "Half-Day Installs",
  "academy-miami": "Full-Day Installs",
};

const MARKET_LABEL: Record<string, string> = {
  la: "Los Angeles",
  miami: "Miami",
  other: "Other",
};

// Legacy fallback for leads without a first-class market field
const DERIVED_MARKETS: Record<InboundLeadType, string | null> = {
  corporate: null,
  partnership: null,
  "academy-la": "Los Angeles",
  "academy-miami": "Miami",
};

function getResponseTimeMs(lead: InboundLeadRecord): number | null {
  if (typeof lead.responseTimeMs === "number" && lead.responseTimeMs >= 0) return lead.responseTimeMs;
  if (!lead.contactedAt) return null;

  const diff = new Date(lead.contactedAt).getTime() - new Date(lead.receivedAt).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function getLeadMarket(lead: InboundLeadRecord): { market: string | null; source: "explicit" | "derived" | "none" } {
  // First-class market field takes priority
  if (lead.market) {
    return { market: MARKET_LABEL[lead.market] ?? lead.market, source: "explicit" };
  }
  // Legacy fallback: derive from metadata location
  const metadataLocation = typeof lead.metadata?.location === "string" ? lead.metadata.location.trim() : "";
  if (metadataLocation) return { market: metadataLocation, source: "explicit" };
  const derived = DERIVED_MARKETS[lead.type];
  if (derived) return { market: derived, source: "derived" };
  return { market: null, source: "none" };
}

function getTrendRange(leads: InboundLeadRecord[], windowDays: number): string[] {
  if (leads.length === 0) return [];

  const lastLeadTimestamp = leads.reduce((max, lead) => {
    const timestamp = new Date(lead.receivedAt).getTime();
    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
  }, 0);

  const end = new Date(Math.max(Date.now(), lastLeadTimestamp));
  end.setHours(0, 0, 0, 0);

  const days: string[] = [];
  for (let index = windowDays - 1; index >= 0; index -= 1) {
    const date = new Date(end);
    date.setDate(end.getDate() - index);
    days.push(date.toISOString().slice(0, 10));
  }

  return days;
}

function percentile(values: number[], target: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * target)));
  return sorted[index] ?? null;
}

export async function GET() {
  const leads = shouldUseSupabaseBackend() ? await listSupabaseInboundLeads() : listInboundLeads();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const newToday = leads.filter((lead) => lead.receivedAt.slice(0, 10) === today).length;
  const newThisWeek = leads.filter((lead) => lead.receivedAt >= weekAgo).length;

  // Tiered stale-lead SLA buckets (Sprint 7)
  const SLA_1H_MS = 1 * 60 * 60 * 1000;
  const SLA_4H_MS = 4 * 60 * 60 * 1000;
  const SLA_24H_MS = 24 * 60 * 60 * 1000;
  const newLeads = leads.filter((lead) => lead.status === "new");
  const staleLeads = {
    watch: newLeads.filter((lead) => {
      const ageMs = now.getTime() - new Date(lead.receivedAt).getTime();
      return Number.isFinite(ageMs) && ageMs >= SLA_1H_MS && ageMs < SLA_4H_MS;
    }).length,
    warning: newLeads.filter((lead) => {
      const ageMs = now.getTime() - new Date(lead.receivedAt).getTime();
      return Number.isFinite(ageMs) && ageMs >= SLA_4H_MS && ageMs < SLA_24H_MS;
    }).length,
    critical: newLeads.filter((lead) => {
      const ageMs = now.getTime() - new Date(lead.receivedAt).getTime();
      return Number.isFinite(ageMs) && ageMs >= SLA_24H_MS;
    }).length,
  };
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const responseTimes = leads
    .map((lead) => getResponseTimeMs(lead))
    .filter((value): value is number => typeof value === "number" && value >= 0);

  for (const lead of leads) {
    byType[lead.type] = (byType[lead.type] ?? 0) + 1;
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
  }

  const avgResponseTimeMs =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
      : null;

  const trendDates = getTrendRange(leads, 14);
  const volumeTrend = trendDates.map((date) => {
    const bucket = {
      date,
      total: 0,
      corporate: 0,
      partnership: 0,
      academyLa: 0,
      academyMiami: 0,
    };

    for (const lead of leads) {
      const leadDate = lead.date ?? lead.receivedAt.slice(0, 10);
      if (leadDate !== date) continue;
      bucket.total += 1;
      if (lead.type === "corporate") bucket.corporate += 1;
      if (lead.type === "partnership") bucket.partnership += 1;
      if (lead.type === "academy-la") bucket.academyLa += 1;
      if (lead.type === "academy-miami") bucket.academyMiami += 1;
    }

    return bucket;
  });

  const typeBreakdown = (Object.keys(TYPE_LABELS) as InboundLeadType[])
    .map((type) => ({
      type,
      label: TYPE_LABELS[type],
      count: byType[type] ?? 0,
      share: leads.length > 0 ? (byType[type] ?? 0) / leads.length : 0,
    }))
    .filter((item) => item.count > 0);

  const marketCounts = new Map<string, { count: number; explicit: number; derived: number }>();
  let marketUnclassifiedCount = 0;

  for (const lead of leads) {
    const market = getLeadMarket(lead);
    if (!market.market) {
      marketUnclassifiedCount += 1;
      continue;
    }

    const current = marketCounts.get(market.market) ?? { count: 0, explicit: 0, derived: 0 };
    current.count += 1;
    if (market.source === "explicit") current.explicit += 1;
    if (market.source === "derived") current.derived += 1;
    marketCounts.set(market.market, current);
  }

  const marketClassifiedCount = Array.from(marketCounts.values()).reduce((sum, item) => sum + item.count, 0);
  const marketBreakdown = {
    available: marketClassifiedCount > 0,
    classifiedCount: marketClassifiedCount,
    unclassifiedCount: marketUnclassifiedCount,
    items: Array.from(marketCounts.entries())
      .map(([market, counts]) => ({
        market,
        count: counts.count,
        share: marketClassifiedCount > 0 ? counts.count / marketClassifiedCount : 0,
        explicitCount: counts.explicit,
        derivedCount: counts.derived,
      }))
      .sort((a, b) => b.count - a.count || a.market.localeCompare(b.market)),
  };

  const funnel = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: byStatus[status] ?? 0,
  }));

  const responseBuckets = [
    { key: "under1h", label: "Under 1h", min: 0, max: 60 * 60 * 1000 },
    { key: "oneToFour", label: "1-4h", min: 60 * 60 * 1000, max: 4 * 60 * 60 * 1000 },
    { key: "fourToTwentyFour", label: "4-24h", min: 4 * 60 * 60 * 1000, max: 24 * 60 * 60 * 1000 },
    { key: "over24h", label: "24h+", min: 24 * 60 * 60 * 1000, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: responseTimes.filter((value) => value >= bucket.min && value < bucket.max).length,
  }));

  // --- Source breakdown (Example Client-34) ---
  const sourceCounts = new Map<string, number>();
  let sourceUndefinedCount = 0;
  for (const lead of leads) {
    if (lead.source) {
      sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
    } else {
      sourceUndefinedCount += 1;
    }
  }
  const sourceBreakdown = {
    items: INBOUND_LEAD_SOURCES.map((src) => ({
      source: src,
      count: sourceCounts.get(src) ?? 0,
      share: leads.length > 0 ? (sourceCounts.get(src) ?? 0) / leads.length : 0,
    })).filter((item) => item.count > 0),
    undefinedCount: sourceUndefinedCount,
  };

  // --- Source attribution (Example Client-43) ---
  const CONVERSION_STATUSES: InboundLeadStatus[] = ["confirmed", "paid", "active"];
  const sourceAttribution: Record<string, { leads: number; converted: number; rate: number }> = {};
  for (const src of INBOUND_LEAD_SOURCES) {
    const srcLeads = leads.filter((lead) => lead.source === src);
    const converted = srcLeads.filter((lead) => CONVERSION_STATUSES.includes(lead.status)).length;
    sourceAttribution[src] = {
      leads: srcLeads.length,
      converted,
      rate: srcLeads.length > 0 ? Math.round((converted / srcLeads.length) * 100) : 0,
    };
  }

  // --- Pipeline value (Example Client-35) + breakdown (Example Client-41) ---
  const PIPELINE_BREAKDOWN_STATUSES: InboundLeadStatus[] = ["qualified", "scheduled", "confirmed", "paid", "active"];
  const pipelineLeads = leads.filter(
    (lead) => PIPELINE_STATUSES.includes(lead.status) && typeof lead.expectedValue === "number",
  );
  const pipelineValue = pipelineLeads.reduce((sum, lead) => sum + (lead.expectedValue ?? 0), 0);

  const pipelineBreakdown = PIPELINE_BREAKDOWN_STATUSES.map((status) => {
    const bucket = pipelineLeads.filter((lead) => lead.status === status);
    return {
      status,
      label: STATUS_LABELS[status],
      count: bucket.length,
      value: bucket.reduce((sum, lead) => sum + (lead.expectedValue ?? 0), 0),
    };
  });
  const pipelineLeadCount = pipelineLeads.length;

  return NextResponse.json(
    {
      newToday,
      newThisWeek,
      byType,
      byStatus,
      avgResponseTimeMs,
      lastSync: shouldUseSupabaseBackend() ? {} : getSyncMeta(),
      analytics: {
        totalLeads: leads.length,
        trackedResponseCount: responseTimes.length,
        untrackedResponseCount: Math.max(leads.length - responseTimes.length, 0),
        trendWindowDays: trendDates.length,
      },
      volumeTrend,
      typeBreakdown,
      marketBreakdown,
      sourceBreakdown,
      pipelineValue,
      pipelineBreakdown,
      pipelineLeadCount,
      funnel,
      responseTime: {
        available: responseTimes.length > 0,
        trackedCount: responseTimes.length,
        untrackedCount: Math.max(leads.length - responseTimes.length, 0),
        avgResponseTimeMs,
        medianResponseTimeMs: percentile(responseTimes, 0.5),
        p90ResponseTimeMs: percentile(responseTimes, 0.9),
        buckets: responseBuckets,
      },
      staleLeads,
      sourceAttribution,
    },
    { headers: { "Cache-Control": "no-cache" } },
  );
}
