"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  revenueEvents,
  getSummaryStats,
  aggregateByQuarter,
  aggregateByLocation,
  aggregateByEventType,
  fmtCurrency,
  fmtPct,
  eventTypeLabel,
  normalizeDate,
  dateToSortable,
} from "@/data/revenue";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import { InboundLeads } from "@/modules/revenue/InboundLeads";
import { useResponsive } from "@/lib/useMediaQuery";

// ─── Color palette ────────────────────────────────────────────────────────────
const CLIENT_RED = "#dadadb";
const BLUE = "#60A5FA";
const BLUE_LIGHT = "#93c5fd";
const GREEN = "#4ade80";
const RED = "#ef4444";
const AMBER = "#fbbf24";
const PURPLE = "#a78bfa";
const TEAL = "#2dd4bf";

const LOCATION_COLORS: Record<string, string> = {
  LA: BLUE,
  Miami: TEAL,
  "Fort Lauderdale": PURPLE,
};

const TYPE_COLORS: Record<string, string> = {
  "open-play": GREEN,
  corporate: BLUE,
  "off-sand": AMBER,
};

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14,
        padding: "16px 18px",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        flex: "1 1 140px",
      }}
    >
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.44)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent ?? "var(--color-client-text)", letterSpacing: "-0.02em", lineHeight: 1.2, wordBreak: "break-word" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Chart Section Wrapper ────────────────────────────────────────────────────
function ChartCard({ title, children, minHeight = 220 }: { title: string; children: React.ReactNode; minHeight?: number }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        padding: "20px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight,
        overflow: "hidden",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ─── Bar Chart (vertical) ─────────────────────────────────────────────────────
function BarChart({
  data,
  maxValue,
  color = BLUE,
  height = 160,
}: {
  data: { label: string; value: number }[];
  maxValue?: number;
  color?: string;
  height?: number;
}) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, minWidth: data.length * 50 }}>
      {data.map((d, i) => {
        const pct = max > 0 ? Math.max((d.value / max) * 100, 0) : 0;
        return (
          <div key={i} style={{ flex: 1, minWidth: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: `${pct}%`,
                  background: color,
                  borderRadius: "4px 4px 0 0",
                  minHeight: pct > 0 ? 20 : 0,
                  opacity: 0.85,
                  transition: "height 0.4s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, color: "#000", whiteSpace: "nowrap" }}>
                  {fmtCurrency(d.value, true)}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", textAlign: "center", whiteSpace: "nowrap", fontWeight: 500 }}>
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

// ─── Dual Bar Chart (revenue vs expenses) ─────────────────────────────────────
function DualBarChart({
  data,
  height = 160,
}: {
  data: { label: string; revenue: number; expenses: number }[];
  height?: number;
}) {
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.expenses]), 1);
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: GREEN }} /> Revenue
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: CLIENT_RED }} /> Expenses
        </div>
      </div>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, minWidth: data.length * 70 }}>
        {data.map((d, i) => {
          const revPct = (d.revenue / max) * 100;
          const expPct = (d.expenses / max) * 100;
          return (
            <div key={i} style={{ flex: 1, minWidth: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, width: "100%" }}>
                <div style={{ flex: 1, height: `${revPct}%`, background: GREEN, borderRadius: "3px 3px 0 0", opacity: 0.85, minHeight: revPct > 0 ? 20 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#000", whiteSpace: "nowrap" }}>{fmtCurrency(d.revenue, true)}</span>
                </div>
                <div style={{ flex: 1, height: `${expPct}%`, background: CLIENT_RED, borderRadius: "3px 3px 0 0", opacity: 0.85, minHeight: expPct > 0 ? 20 : 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 8, fontWeight: 800, color: "#000", whiteSpace: "nowrap" }}>{fmtCurrency(d.expenses, true)}</span>
                </div>
              </div>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", textAlign: "center", whiteSpace: "nowrap", fontWeight: 500 }}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────
function HorizontalBar({
  data,
}: {
  data: { label: string; value: number; color?: string }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.map((d, i) => {
        const pct = (Math.max(d.value, 0) / max) * 100;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{d.label}</span>
              <span style={{ fontSize: 12, color: d.color ?? BLUE, fontWeight: 600 }}>{fmtCurrency(d.value, true)}</span>
            </div>
            <div style={{ width: "100%", height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: d.color ?? BLUE,
                  borderRadius: 4,
                  opacity: 0.85,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 50;
  const innerR = 32;

  let cumAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const angle = total > 0 ? (d.value / total) * Math.PI * 2 : 0;
    const start = cumAngle;
    cumAngle += angle;
    return { ...d, start, end: cumAngle, pct: total > 0 ? (d.value / total) * 100 : 0 };
  });

  function arc(startAngle: number, endAngle: number, outerR: number, iR: number) {
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const ix1 = cx + iR * Math.cos(endAngle);
    const iy1 = cy + iR * Math.sin(endAngle);
    const ix2 = cx + iR * Math.cos(startAngle);
    const iy2 = cy + iR * Math.sin(startAngle);
    const large = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${iR} ${iR} 0 ${large} 0 ${ix2} ${iy2} Z`;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={arc(s.start, s.end, r, innerR)} fill={s.color} opacity={0.85} />
        ))}
        <circle cx={cx} cy={cy} r={innerR - 2} fill="rgba(10,10,16,0.95)" />
        <text x={cx} y={cy - 6} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={9}>
          Total
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="white" fontSize={12} fontWeight="bold">
          {fmtCurrency(total, true)}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              {eventTypeLabel(s.label)}
            </div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, marginLeft: "auto" }}>
              {s.pct.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Table column definitions ─────────────────────────────────────────────────
const DEFAULT_COLS = [
  { key: "date", label: "Date" },
  { key: "location", label: "Location" },
  { key: "eventType", label: "Revenue Type" },
  { key: "subType", label: "Sub Type" },
  { key: "quarter", label: "Quarter" },
  { key: "revenue", label: "Revenue" },
  { key: "expenses", label: "Expenses" },
  { key: "netProfit", label: "Net Profit" },
  { key: "margin", label: "Margin %" },
] as const;

type ColKey = (typeof DEFAULT_COLS)[number]["key"];

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function RevenueContent() {
  // Sync state
  const [syncMeta, setSyncMeta] = useState<{ lastSync: string | null; eventCount: number; source?: string }>({ lastSync: null, eventCount: 0 });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/revenue/sync")
      .then((response) => {
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        return response.json();
      })
      .then(setSyncMeta)
      .catch(() => {});
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/revenue/sync", { method: "POST" });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setSyncMeta({ lastSync: data.lastSync, eventCount: data.eventCount });
        setTimeout(() => window.location.reload(), 500);
      }
    } catch {} finally {
      setSyncing(false);
    }
  }, []);

  // Dashboard-level filters
  const [locationFilter, setLocationFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [quarterFilter, setQuarterFilter] = useState<string>("All");

  const allLocations = useMemo(() => ["All", ...new Set(revenueEvents.map((e) => e.location))], []);
  const allTypes = useMemo(() => ["All", ...new Set(revenueEvents.map((e) => e.eventType))], []);
  const allQuarters = useMemo(() => {
    const qs = [...new Set(revenueEvents.map((e) => e.quarter))].filter((q) => q !== "Mixed");
    qs.sort((a, b) => {
      const [qa, ya] = a.split(" "); const [qb, yb] = b.split(" ");
      return ya.localeCompare(yb) || qa.localeCompare(qb);
    });
    return ["All", ...qs];
  }, []);

  // Apply dashboard filters to all data
  const dashFiltered = useMemo(() => {
    return revenueEvents.filter((e) => {
      if (locationFilter !== "All" && e.location !== locationFilter) return false;
      if (typeFilter !== "All" && e.eventType !== typeFilter) return false;
      if (quarterFilter !== "All" && e.quarter !== quarterFilter) return false;
      return true;
    });
  }, [locationFilter, typeFilter, quarterFilter]);

  const stats = useMemo(() => getSummaryStats(dashFiltered), [dashFiltered]);
  const quarterData = useMemo(() => aggregateByQuarter(dashFiltered), [dashFiltered]);
  const locationData = useMemo(() => aggregateByLocation(dashFiltered), [dashFiltered]);
  const eventTypeData = useMemo(() => aggregateByEventType(dashFiltered), [dashFiltered]);

  // Time period for Rev vs Expenses chart
  const [timePeriod, setTimePeriod] = useState<string>("All");
  const timePeriods = ["All", "YTD", "QTD", "MTD", "2026", "2025", "2024", "2023"];

  const dualBarFiltered = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentMonth = now.getMonth() + 1;

    return quarterData.filter((q) => {
      if (q.quarter === "Mixed") return false;
      const match = q.quarter.match(/Q(\d) (\d{4})/);
      if (!match) return false;
      const qNum = parseInt(match[1]);
      const year = parseInt(match[2]);

      switch (timePeriod) {
        case "YTD": return year === currentYear;
        case "QTD": return year === currentYear && qNum === currentQ;
        case "MTD": return year === currentYear && qNum === currentQ; // quarter-level granularity
        case "2023": return year === 2023;
        case "2024": return year === 2024;
        case "2025": return year === 2025;
        case "2026": return year === 2026;
        default: return true;
      }
    });
  }, [quarterData, timePeriod]);

  // Table state
  const [sortKey, setSortKey] = useState<ColKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Revenue StandardTable columns
  type RevEvent = typeof revenueEvents[0];
  const revenueColumns: StandardTableColumn<RevEvent>[] = useMemo(() => [
    { key: "date", label: "Date", getValue: (e) => String(dateToSortable(e.date, e.quarter)).padStart(12, "0"), render: (e) => { const d = normalizeDate(e.date, e.quarter); return e.sheetUrl ? <a href={e.sheetUrl} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} style={{ color: BLUE, textDecoration: "none", fontWeight: 500, borderBottom: "1px dashed rgba(96,165,250,0.3)" }}>{d}</a> : <span>{d}</span>; } },
    { key: "location", label: "Location", getValue: (e) => e.location, render: (e) => { const c = LOCATION_COLORS[e.location] ?? BLUE; return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 5, background: `${c}18`, border: `1px solid ${c}30`, color: c, fontSize: 11, fontWeight: 600 }}>{e.location}</span>; } },
    { key: "eventType", label: "Type", getValue: (e) => eventTypeLabel(e.eventType), render: (e) => { const c = TYPE_COLORS[e.eventType] ?? AMBER; return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 5, background: `${c}15`, border: `1px solid ${c}28`, color: c, fontSize: 11, fontWeight: 600 }}>{eventTypeLabel(e.eventType)}</span>; } },
    { key: "subType", label: "Sub-Type", getValue: (e) => e.subType ?? "\u2014" },
    { key: "quarter", label: "Quarter", getValue: (e) => e.quarter },
    { key: "revenue", label: "Revenue", getValue: (e) => String(e.totalRevenue).padStart(12, "0"), render: (e) => <span style={{ color: BLUE_LIGHT, fontWeight: 500, fontSize: 12 }}>{fmtCurrency(e.totalRevenue)}</span> },
    { key: "expenses", label: "Expenses", getValue: (e) => String(e.totalExpenses).padStart(12, "0"), render: (e) => <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{fmtCurrency(e.totalExpenses)}</span> },
    { key: "netProfit", label: "Net Profit", getValue: (e) => String(e.totalRevenue - e.totalExpenses + 1000000).padStart(12, "0"), render: (e) => { const n = e.totalRevenue - e.totalExpenses; return <span style={{ color: n >= 0 ? GREEN : RED, fontWeight: 600, fontSize: 12 }}>{n >= 0 ? "+" : ""}{fmtCurrency(n)}</span>; } },
    { key: "margin", label: "Margin", getValue: (e) => { const m = e.totalRevenue > 0 ? ((e.totalRevenue - e.totalExpenses) / e.totalRevenue) * 100 : 0; return String(m + 1000).padStart(8, "0"); }, render: (e) => { const m = e.totalRevenue > 0 ? ((e.totalRevenue - e.totalExpenses) / e.totalRevenue) * 100 : 0; return <span style={{ color: m >= 0 ? GREEN : RED, fontWeight: 600, fontSize: 12 }}>{fmtPct(m)}</span>; } },
  ], []);

  const getCellValue = useCallback((event: RevEvent, key: ColKey): string => {
    const column = revenueColumns.find((item) => item.key === key);
    if (column?.getValue) return String(column.getValue(event) ?? "");
    return String((event as unknown as Record<string, unknown>)[key] ?? "");
  }, [revenueColumns]);

  // Keep sorted for backward compat with summary stats
  const sorted = useMemo(() => {
    return [...dashFiltered].sort((a, b) => {
      const numCols: ColKey[] = ["date", "revenue", "expenses", "netProfit", "margin"];
      if (numCols.includes(sortKey)) {
        const getSortNum = (e: typeof revenueEvents[0]): number => {
          const margin = e.totalRevenue > 0 ? ((e.totalRevenue - e.totalExpenses) / e.totalRevenue) * 100 : 0;
          switch (sortKey) {
            case "date": return dateToSortable(e.date, e.quarter);
            case "revenue": return e.totalRevenue;
            case "expenses": return e.totalExpenses;
            case "netProfit": return e.totalRevenue - e.totalExpenses;
            case "margin": return margin;
            default: return 0;
          }
        };
        const diff = getSortNum(a) - getSortNum(b);
        return sortDir === "asc" ? diff : -diff;
      }
      const av = getCellValue(a, sortKey);
      const bv = getCellValue(b, sortKey);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [dashFiltered, getCellValue, sortKey, sortDir]);

  // Quarterly trend data for charts
  const quarterBars = quarterData
    .filter((q) => q.quarter !== "Mixed")
    .map((q) => ({
      label: q.quarter.replace(" 20", " '"),
      value: q.revenue,
    }));

  const dualBars = dualBarFiltered.map((q) => ({
    label: q.quarter.replace(" 20", " '"),
    revenue: q.revenue,
    expenses: q.expenses,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1400 }}>
      {/* Page Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-client-text)", letterSpacing: "-0.02em", margin: 0 }}>
              Revenue Analytics
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
              {stats.totalEvents} records · {locationFilter === "All" ? "All locations" : locationFilter} · Source: Local revenue ledger
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500,
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 13 }}>📊</span> Revenue Source
            </div>
            <button onClick={handleSync} disabled={syncing} style={{
              display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7,
              background: syncing ? "rgba(96,165,250,0.1)" : "rgba(74,222,128,0.08)",
              border: syncing ? "1px solid rgba(96,165,250,0.2)" : "1px solid rgba(74,222,128,0.15)",
              color: syncing ? BLUE : GREEN, fontSize: 11, fontWeight: 600, cursor: syncing ? "wait" : "pointer",
            }}>
              <span style={{ fontSize: 12, display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>↻</span>
              {syncing ? "Refreshing..." : "Reload Local"}
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.12)", color: GREEN, fontWeight: 600 }}>LIVE</span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                {syncMeta.source === "local-json"
                  ? "Local JSON"
                  : syncMeta.lastSync
                    ? `Last sync: ${new Date(syncMeta.lastSync).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : "Local JSON"}
              </span>
            </div>
          </div>
        </div>

        {/* Dashboard Filters */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {allLocations.map((loc) => (
            <button key={loc} onClick={() => setLocationFilter(loc)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
              background: locationFilter === loc ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
              border: locationFilter === loc ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(255,255,255,0.08)",
              color: locationFilter === loc ? BLUE : "rgba(255,255,255,0.5)",
            }}>{loc === "All" ? "🌍 All Locations" : loc}</button>
          ))}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
          {allTypes.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
              background: typeFilter === t ? `${TYPE_COLORS[t] ?? BLUE}18` : "rgba(255,255,255,0.03)",
              border: typeFilter === t ? `1px solid ${TYPE_COLORS[t] ?? BLUE}40` : "1px solid rgba(255,255,255,0.08)",
              color: typeFilter === t ? (TYPE_COLORS[t] ?? BLUE) : "rgba(255,255,255,0.5)",
            }}>{t === "All" ? "📊 All Types" : eventTypeLabel(t)}</button>
          ))}
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
          <select value={quarterFilter} onChange={(e) => setQuarterFilter(e.target.value)} style={{
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: quarterFilter !== "All" ? BLUE : "rgba(255,255,255,0.5)", cursor: "pointer", outline: "none",
          }}>
            {allQuarters.map((q) => <option key={q} value={q} style={{ background: "#0c0c12" }}>{q === "All" ? "📅 All Quarters" : q}</option>)}
          </select>
          {(locationFilter !== "All" || typeFilter !== "All" || quarterFilter !== "All") && (
            <button onClick={() => { setLocationFilter("All"); setTypeFilter("All"); setQuarterFilter("All"); }} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
              background: "none", border: "1px solid rgba(255,255,255,0.08)", color: CLIENT_RED,
            }}>✕ Reset</button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <SummaryCard
          label="Total Revenue"
          value={fmtCurrency(stats.totalRevenue)}
          sub="All locations · all records"
          accent={GREEN}
        />
        <SummaryCard
          label="Total Expenses"
          value={fmtCurrency(stats.totalExpenses)}
          sub="Staffing, operations, overhead"
          accent={CLIENT_RED}
        />
        <SummaryCard
          label="Net Profit / Loss"
          value={fmtCurrency(stats.netProfit)}
          sub={stats.netProfit >= 0 ? "Profitable" : "Net loss"}
          accent={stats.netProfit >= 0 ? GREEN : RED}
        />
        <SummaryCard
          label="Total Records"
          value={String(stats.totalEvents)}
          sub="Across LA, Miami, Ft. Lauderdale"
        />
        <SummaryCard
          label="Avg Revenue / Record"
          value={fmtCurrency(stats.avgRevenuePerEvent)}
          sub="Per record average"
          accent={BLUE_LIGHT}
        />
        <SummaryCard
          label="Avg Margin"
          value={fmtPct(stats.avgMarginPct)}
          sub="Revenue margin"
          accent={stats.avgMarginPct >= 0 ? GREEN : RED}
        />
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <ChartCard title="Quarterly Revenue Trend" minHeight={240}>
          <BarChart
            data={quarterBars}
            color={GREEN}
            height={170}
          />
        </ChartCard>

        <ChartCard title="Revenue vs Expenses" minHeight={240}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {timePeriods.map((p) => (
              <button key={p} onClick={() => setTimePeriod(p)} style={{
                padding: "3px 10px", borderRadius: 5, fontSize: 9, fontWeight: 600, cursor: "pointer",
                background: timePeriod === p ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)",
                border: timePeriod === p ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(255,255,255,0.06)",
                color: timePeriod === p ? BLUE : "rgba(255,255,255,0.4)",
              }}>{p}</button>
            ))}
          </div>
          <DualBarChart data={dualBars} height={150} />
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <ChartCard title="Revenue by Location" minHeight={200}>
          <HorizontalBar
            data={locationData.map((l) => ({
              label: l.location,
              value: l.revenue,
              color: LOCATION_COLORS[l.location] ?? BLUE,
            }))}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 20 }}>
            {locationData.map((l) => (
              <div key={l.location} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                <span>{l.location}</span>
                <span>{l.eventCount} records · avg {fmtCurrency(l.avgRevenue, true)}/record · net {fmtCurrency(l.netProfit, true)}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Revenue by Type" minHeight={200}>
          <DonutChart
            data={eventTypeData.map((t) => ({
              label: t.eventType,
              value: t.revenue,
              color: TYPE_COLORS[t.eventType] ?? AMBER,
            }))}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
            {eventTypeData.map((t) => (
              <div key={t.eventType} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                <span>{eventTypeLabel(t.eventType)}</span>
                <span>{t.eventCount} records · net {fmtCurrency(t.netProfit, true)}</span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Revenue ledger table */}
      <div
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Table header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)" }}>
              Revenue Ledger
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {sorted.length} of {revenueEvents.length} records

            </div>
          </div>
        </div>

        {/* Revenue Table — StandardTable */}
        <StandardTable<RevEvent>
          tableKey="revenue-events"
          columns={revenueColumns}
          data={dashFiltered}
          getRowKey={(e) => `${e.date}-${e.location}-${e.eventType}-${e.totalRevenue}`}
          defaultSortKey="date"
          defaultSortDir="desc"
          emptyMessage="No records match the current filters"
        />

      </div>
    </div>
  );
}

export function RevenueDashboard() {
  const [activeTab, setActiveTab] = useState<"revenue" | "leads">("revenue");
  const { isMobile } = useResponsive();
  const tabs = [
    { key: "revenue" as const, label: "Revenue" },
    { key: "leads" as const, label: "Inbound Leads" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobile ? 8 : 18,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          paddingBottom: isMobile ? 2 : 0,
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "0 2px 12px",
                background: "transparent",
                border: "none",
                borderBottom: active ? "2px solid rgba(255,255,255,0.9)" : "2px solid transparent",
                color: active ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.45)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                minWidth: isMobile ? "max-content" : undefined,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "revenue" ? <RevenueContent /> : <InboundLeads />}
    </div>
  );
}
