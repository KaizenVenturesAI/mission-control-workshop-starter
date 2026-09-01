"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import RacketIcon from "@/components/RacketIcon";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import { useResponsive } from "@/lib/useMediaQuery";

import { agents } from "@/data/agents";
import { agentPermissions } from "@/data/permissions";
import { InspectableValue, AsteriskNote } from "@/components/ProvenanceSystem";
import type { ProviderData } from "@/lib/getCostData";

/* ─── Channel Detail Data ─── */
interface ChannelMember { name: string; username: string; id: string; role: "Admin" | "Standard" | "Integration" }
interface ChannelEntry { name: string; id: string; members?: ChannelMember[] }

/* Neutral starter directory. Replace with real workspace IDs after setup. */
const M_FOUNDER: ChannelMember = { name: "Founder", username: "@founder", id: "placeholder-founder", role: "Admin" };
const M_OPERATOR: ChannelMember = { name: "Operator Agent", username: "@operator-agent", id: "placeholder-operator-agent", role: "Standard" };
const M_ENGINEERING: ChannelMember = { name: "Engineering Agent", username: "@engineering-agent", id: "placeholder-engineering-agent", role: "Integration" };
const M_CRM: ChannelMember = { name: "CRM Hygiene Agent", username: "@crm-agent", id: "placeholder-crm-agent", role: "Integration" };

const ALL_SERVER_MEMBERS: ChannelMember[] = [M_FOUNDER, M_OPERATOR, M_ENGINEERING, M_CRM];
const RESTRICTED_BASE: ChannelMember[] = [M_FOUNDER, M_OPERATOR];

const channelDetails: Record<string, ChannelEntry[]> = {
  Slack: [
    { name: "#general", id: "placeholder-general", members: ALL_SERVER_MEMBERS },
    { name: "#engineering", id: "placeholder-engineering", members: [...RESTRICTED_BASE, M_ENGINEERING] },
    { name: "#crm", id: "placeholder-crm", members: [...RESTRICTED_BASE, M_CRM] },
    { name: "#strategy", id: "placeholder-strategy", members: RESTRICTED_BASE },
  ],
  Messaging: [
    { name: "Founder direct", id: "placeholder-founder-direct", members: [M_FOUNDER] },
    { name: "Alerts group", id: "placeholder-alerts", members: [M_FOUNDER, M_OPERATOR] },
  ],
  "Admin Console": [
    { name: "Mission Control Admin", id: "placeholder-admin", members: [M_FOUNDER, M_ENGINEERING] },
    { name: "Agent Manager", id: "placeholder-agent-manager", members: [M_OPERATOR, M_ENGINEERING] },
  ],
  "Local CLI": [
    { name: "Terminal", id: "placeholder-terminal", members: [M_ENGINEERING] },
    { name: "Codex", id: "placeholder-codex", members: [M_ENGINEERING] },
  ],
  "Email (Gmail)": [
    { name: "Founder inbox", id: "placeholder-founder-inbox", members: [M_FOUNDER] },
    { name: "Team inboxes not configured", id: "placeholder-team-inboxes-pending", members: [M_ENGINEERING] },
  ],
  "Scheduled/Cron": [
    { name: "Heartbeat", id: "placeholder-cron-heartbeat", members: [M_OPERATOR] },
    { name: "Meeting Check", id: "placeholder-cron-meetings", members: [M_OPERATOR] },
  ],
};

/* ─── Provenance Tags ─── */
type Provenance = "LOCAL" | "CONFIG" | "ESTIMATED" | "UNKNOWN" | "VERIFIED" | "INFERRED";

const PROV_STYLES: Record<Provenance, { bg: string; color: string; border: string }> = {
  VERIFIED: { bg: "rgba(52,211,153,0.15)", color: "rgb(52,211,153)", border: "rgba(52,211,153,0.25)" },
  LOCAL: { bg: "rgba(52,211,153,0.10)", color: "rgba(52,211,153,0.7)", border: "rgba(52,211,153,0.18)" },
  CONFIG: { bg: "rgba(96,165,250,0.10)", color: "rgba(96,165,250,0.7)", border: "rgba(96,165,250,0.18)" },
  ESTIMATED: { bg: "rgba(251,191,36,0.10)", color: "rgba(251,191,36,0.55)", border: "rgba(251,191,36,0.15)" },
  UNKNOWN: { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", border: "rgba(255,255,255,0.08)" },
  INFERRED: { bg: "rgba(167,139,250,0.10)", color: "rgba(167,139,250,0.7)", border: "rgba(167,139,250,0.18)" },
};

function ProvTag({ type }: { type: Provenance }) {
  const s = PROV_STYLES[type];
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        flexShrink: 0,
        lineHeight: "16px",
      }}
    >
      {type}
    </span>
  );
}

/* ─── Parse Cost Data (from any source) ─── */
type CostDataArray = ProviderData[];

const TODAY = "2026-03-28";
const YESTERDAY = "2026-03-27";

function dailyCost(provider: CostDataArray[0], date: string): number {
  return provider.daily.find((d) => d.date === date)?.totalCost ?? 0;
}

function parseCostData(rawData: CostDataArray) {
  const codexProvider = rawData.find((p) => p.provider === "codex")!;
  const claudeProvider = rawData.find((p) => p.provider === "claude")!;

  const spendToday = dailyCost(claudeProvider, TODAY) + dailyCost(codexProvider, TODAY);
  const spendYesterday = dailyCost(claudeProvider, YESTERDAY) + dailyCost(codexProvider, YESTERDAY);
  const spend30Day = claudeProvider.last30DaysCostUSD + codexProvider.last30DaysCostUSD;
  const totalTokens = claudeProvider.last30DaysTokens + codexProvider.last30DaysTokens;

  interface ModelAgg { cost: number; tokens: number }
  const modelMap = new Map<string, ModelAgg>();
  for (const provider of rawData) {
    for (const day of provider.daily) {
      for (const mb of day.modelBreakdowns) {
        const prev = modelMap.get(mb.modelName) ?? { cost: 0, tokens: 0 };
        modelMap.set(mb.modelName, { cost: prev.cost + mb.cost, tokens: prev.tokens + mb.totalTokens });
      }
    }
  }

  const totalModelCost = Array.from(modelMap.values()).reduce((a, b) => a + b.cost, 0);
  const MODEL_MIX = Array.from(modelMap.entries())
    .map(([model, agg]) => ({
      model,
      cost: agg.cost,
      tokens: agg.tokens,
      pct: totalModelCost > 0 ? Math.round((agg.cost / totalModelCost) * 100) : 0,
    }))
    .sort((a, b) => b.cost - a.cost);

  const topModel = MODEL_MIX[0];
  const claudeCost = claudeProvider.last30DaysCostUSD;
  const codexCost = codexProvider.last30DaysCostUSD;
  const claudePct = spend30Day > 0 ? Math.round((claudeCost / spend30Day) * 100) : 0;
  const codexPct = 100 - claudePct;
  const updatedAt = claudeProvider.updatedAt;

  const WEEKLY_TREND = [
    { day: "Mon", amount: 16.20 },
    { day: "Tue", amount: 19.80 },
    { day: "Wed", amount: 17.40 },
    { day: "Thu", amount: 21.60 },
    { day: "Fri", amount: spendToday },
    { day: "Sat", amount: 0 },
    { day: "Sun", amount: 0 },
  ];

  const maxWeeklyAmount = Math.max(...WEEKLY_TREND.map((d) => d.amount), DAILY_TARGET);

  return { codexProvider, claudeProvider, spendToday, spendYesterday, spend30Day, totalTokens, MODEL_MIX, topModel, claudeCost, codexCost, claudePct, codexPct, updatedAt, WEEKLY_TREND, maxWeeklyAmount };
}

const MODEL_COLORS: Record<string, string> = {
  "claude-opus-4-6": "#dadadb",
  "claude-haiku-4-5": "#60A5FA",
  "gpt-5.4": "#34D399",
};

// Data trust counts
const VERIFIED_COUNT = 2;
const LOCAL_COUNT = 8;
const CONFIG_COUNT = 0;
const ESTIMATED_COUNT = 5;
const UNKNOWN_COUNT = 1;

/* ─── Agent Cost Data (estimated) ─── */
type AgentRole = "Orchestrator" | "Builder" | "Content" | "Revenue" | "Support" | "Advisory";

interface AgentCost {
  name: string;
  dailyCost: number;
  model: string;
  sessions: number;
  role: AgentRole;
  status?: "parked";
}

const AGENT_COSTS: AgentCost[] = [
  { name: "Example Client Mission Agent", dailyCost: 7.20, model: "Opus", sessions: 14, role: "Orchestrator" },
  { name: "Engineering Agent", dailyCost: 4.80, model: "Codex + Claude", sessions: 8, role: "Builder" },
  { name: "Marketing Agent", dailyCost: 2.40, model: "Sonnet", sessions: 6, role: "Content" },
  { name: "Sales Follow-Up Agent", dailyCost: 1.90, model: "Sonnet", sessions: 5, role: "Revenue" },
  { name: "Delivery / Install Agent", dailyCost: 1.20, model: "Sonnet", sessions: 4, role: "Revenue" },
  { name: "Executive Assistant Agent", dailyCost: 0.60, model: "Sonnet", sessions: 3, role: "Support" },
  { name: "Strategy Review Agent", dailyCost: 0.20, model: "Sonnet", sessions: 1, role: "Advisory" },
  { name: "Operations Agent", dailyCost: 0.20, model: "Sonnet", sessions: 1, role: "Support" },
];

interface SubscriptionRow {
  provider: string;
  plan: string;
  cost: string;
  notes: string;
  verified?: boolean;
  provSource?: string;
}

const SUBSCRIPTION_ROWS: SubscriptionRow[] = [
  { provider: "LLM Provider", plan: "Not configured", cost: "$0/mo", notes: "Replace with the new business subscription after setup." },
  { provider: "App Hosting", plan: "Not configured", cost: "$0/mo", notes: "Add the selected hosting platform after deployment." },
  { provider: "Agent Runtime", plan: "Local starter", cost: "$0/mo", notes: "Backend-neutral template runtime." },
];

const ATTRIBUTION_ROWS = [
  { name: "Example Client Mission Agent", classification: "Orchestrator", model: "claude-opus-4-6", actions: 14, tokens: "8.2M", cost: 9.8, contribution: "High Leverage", lastActive: "Just now", classDot: "#A78BFA", contColor: "#34D399", contBg: "rgba(52,211,153,0.10)" },
  { name: "Engineering Agent", classification: "Operations", model: "codex gpt-5.4 + claude", actions: 8, tokens: "3.5M", cost: 4.8, contribution: "Core Operations", lastActive: "2h ago", classDot: "#60A5FA", contColor: "#60A5FA", contBg: "rgba(96,165,250,0.10)" },
  { name: "Marketing Agent", classification: "Revenue", model: "claude-sonnet-4-6", actions: 6, tokens: "2.1M", cost: 1.4, contribution: "Revenue Driver", lastActive: "1h ago", classDot: "#dadadb", contColor: "#dadadb", contBg: "rgba(218,218,219,0.10)" },
  { name: "Sales Follow-Up Agent", classification: "Revenue", model: "claude-sonnet-4-6", actions: 5, tokens: "1.8M", cost: 1.2, contribution: "Revenue Driver", lastActive: "3h ago", classDot: "#dadadb", contColor: "#dadadb", contBg: "rgba(218,218,219,0.10)" },
  { name: "Delivery / Install Agent", classification: "Revenue", model: "claude-sonnet-4-6", actions: 4, tokens: "1.2M", cost: 0.8, contribution: "Revenue Driver", lastActive: "4h ago", classDot: "#dadadb", contColor: "#dadadb", contBg: "rgba(218,218,219,0.10)" },
  { name: "Executive Assistant", classification: "Support", model: "claude-sonnet-4-6", actions: 3, tokens: "0.8M", cost: 0.35, contribution: "Internal Support", lastActive: "2h ago", classDot: "rgba(255,255,255,0.25)", contColor: "rgba(255,255,255,0.4)", contBg: "rgba(255,255,255,0.04)" },
  { name: "Strategy Review Agent", classification: "Operations", model: "claude-sonnet-4-6", actions: 1, tokens: "0.3M", cost: 0.12, contribution: "Low Activity", lastActive: "6h ago", classDot: "#60A5FA", contColor: "#F59E0B", contBg: "rgba(245,158,11,0.10)" },
  { name: "Operations Agent", classification: "Operations", model: "claude-sonnet-4-6", actions: 1, tokens: "0.2M", cost: 0.1, contribution: "Low Activity", lastActive: "5h ago", classDot: "#60A5FA", contColor: "#F59E0B", contBg: "rgba(245,158,11,0.10)" },
] as const;

const CHANNEL_ANALYTICS_ROWS = [
  { binding: "Slack", actions: 0, agentCount: 0, types: ["Operations"], cost: 0, lastActive: "Not configured", desc: "Team coordination surface after setup", typeColors: ["#60A5FA"] },
  { binding: "Messaging", actions: 0, agentCount: 0, types: ["Operations"], cost: 0, lastActive: "Not configured", desc: "Founder alerts after setup", typeColors: ["#60A5FA"] },
  { binding: "Admin Console", actions: 0, agentCount: 0, types: ["Governance"], cost: 0, lastActive: "Not configured", desc: "System orchestration and agent management", typeColors: ["#F59E0B"] },
  { binding: "Local CLI", actions: 0, agentCount: 0, types: ["Operations"], cost: 0, lastActive: "Local only", desc: "Engineering builds and code execution", typeColors: ["#60A5FA"] },
  { binding: "Email (Gmail)", actions: 0, agentCount: 0, types: ["Revenue"], cost: 0, lastActive: "Not configured", desc: "Outbound and CRM email sync after setup", typeColors: ["#dadadb"] },
  { binding: "Scheduled/Cron", actions: 0, agentCount: 0, types: ["Operations"], cost: 0, lastActive: "Not configured", desc: "Automated heartbeats and monitoring", typeColors: ["#60A5FA"] },
] as const;

const DAILY_TARGET = 25;
const ACTIVE_AGENTS = agents.length;

const ROLE_COLORS: Record<string, string> = {
  Revenue: "#dadadb",
  Orchestrator: "#dadadb",
  Builder: "#60A5FA",
  Content: "#60A5FA",
  Support: "#60A5FA",
  Advisory: "rgba(255,255,255,0.35)",
};

const maxDailySpend = Math.max(...AGENT_COSTS.map((a) => a.dailyCost));

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

/* ─── Component ─── */
export function UsageSpend() {
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [expandedChannelMembers, setExpandedChannelMembers] = useState<string | null>(null);
  const [isChannelFullScreen, setIsChannelFullScreen] = useState(false);

  useEffect(() => {
    if (!isChannelFullScreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsChannelFullScreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isChannelFullScreen]);
  const [memberSortAsc, setMemberSortAsc] = useState(true);
  const [costData, setCostData] = useState<CostDataArray | null>(null);
  const [freshness, setFreshness] = useState<"loading" | "fresh" | "stale" | "failed">("loading");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  // Channel analytics live state
  interface LiveChannelData { id: string; name: string; members: ChannelMember[]; memberCount: number; fetchedAt: string }
  const [liveDiscordChannels, setLiveDiscordChannels] = useState<LiveChannelData[] | null>(null);
  const [channelFreshness, setChannelFreshness] = useState<"loading" | "fresh" | "stale" | "failed">("loading");

  const { isMobile, isTablet } = useResponsive();

  useEffect(() => {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((result) => {
        if (result.data?.length) {
          setCostData(result.data);
          setFreshness(result.freshness === "stale" ? "stale" : "fresh");
          setFetchedAt(result.fetchedAt ?? null);
          setIsFallback(result.isFallback ?? false);
        } else {
          setFreshness(result.freshness === "failed" ? "failed" : "stale");
        }
      })
      .catch(() => {
        setFreshness("failed");
      });

    fetch("/api/channels")
      .then((r) => r.json())
      .then((result) => {
        if (result.data?.length) {
          setLiveDiscordChannels(result.data);
          setChannelFreshness(result.freshness === "stale" ? "stale" : "fresh");
        } else {
          setChannelFreshness("failed");
        }
      })
      .catch(() => {
        setChannelFreshness("failed");
      });
  }, []);

  const parsed = costData ? parseCostData(costData) : null;

  const provenanceMethod = freshness === "fresh" ? "Runtime fetch from codexbar" : "Fallback to /tmp/mc-codexbar-cache.json";

  const spendToday = parsed?.spendToday ?? 0;
  const spendYesterday = parsed?.spendYesterday ?? 0;
  const spend30Day = parsed?.spend30Day ?? 0;
  const totalTokens = parsed?.totalTokens ?? 0;
  const MODEL_MIX = parsed?.MODEL_MIX ?? [];
  const topModel = parsed?.topModel ?? { model: "—", pct: 0, cost: 0, tokens: 0 };
  const claudeCost = parsed?.claudeCost ?? 0;
  const codexCost = parsed?.codexCost ?? 0;
  const claudePct = parsed?.claudePct ?? 0;
  const codexPct = parsed?.codexPct ?? 0;
  const updatedAt = parsed?.updatedAt ?? new Date().toISOString();
  const WEEKLY_TREND = parsed?.WEEKLY_TREND ?? [];
  const maxWeeklyAmount = parsed?.maxWeeklyAmount ?? DAILY_TARGET;


  // ── StandardTable column definitions for each sub-table ──
  const subscriptionColumns: StandardTableColumn<SubscriptionRow>[] = useMemo(() => [
    { key: "provider", label: "Provider", getValue: (r) => r.provider, render: (r) => <span style={{ fontWeight: 600 }}>{r.provider}</span> },
    { key: "plan", label: "Plan", getValue: (r) => r.plan },
    {
      key: "cost", label: "Monthly Cost", getValue: (r) => r.cost,
      render: (r) => r.verified && r.provSource
        ? <InspectableValue value={r.cost} sourceClass="VERIFIED" source={r.provSource} method="Confirmed subscription cost"><span style={{ fontFamily: "var(--font-mono)" }}>{r.cost}</span></InspectableValue>
        : <span style={{ fontFamily: "var(--font-mono)" }}>{r.cost}</span>,
    },
    {
      key: "notes", label: "Notes", getValue: (r) => r.notes,
      render: (r) => <span style={{ color: "var(--color-client-text-secondary)", display: "inline-flex", alignItems: "center", gap: 6 }}>{r.notes}{r.verified && <ProvTag type="VERIFIED" />}</span>,
    },
  ], []);

  const agentCostColumns: StandardTableColumn<AgentCost>[] = useMemo(() => [
    {
      key: "agent", label: "Agent", getValue: (r) => r.name,
      render: (r) => {
        const isRevenue = r.role === "Revenue";
        const isParked = r.status === "parked";
        const maxDC = Math.max(...AGENT_COSTS.map((a) => a.dailyCost));
        const barWidth = maxDC > 0 ? (r.dailyCost / maxDC) * 100 : 0;
        const roleColor = ROLE_COLORS[r.role] || "rgba(255,255,255,0.25)";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" as const }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: isRevenue ? "#dadadb" : "#60A5FA", flexShrink: 0, opacity: isParked ? 0.3 : 1 }} />
            <span style={{ opacity: isParked ? 0.4 : 1, fontWeight: 600 }}>{r.name}</span>
            {barWidth > 0 && <div style={{ position: "absolute", bottom: 0, left: 16, right: 0, height: 2, borderRadius: 1, background: `linear-gradient(90deg, ${roleColor}30, transparent)`, width: `${barWidth}%` }} />}
          </div>
        );
      },
    },
    {
      key: "dailyCost", label: "Daily Cost", getValue: (r) => r.dailyCost.toFixed(2),
      render: (r) => (
        <InspectableValue value={`$${r.dailyCost.toFixed(2)}`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Estimated from agent session count and model pricing" limitations="Per-agent token metering not instrumented">
          <span style={{ fontFamily: "var(--font-mono)", color: r.dailyCost > 0 ? "var(--color-client-text)" : "var(--color-client-text-dim)" }}>${r.dailyCost.toFixed(2)}</span>
        </InspectableValue>
      ),
    },
    {
      key: "model", label: "Model", getValue: (r) => r.model,
      render: (r) => {
        const isParked = r.status === "parked";
        return <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontFamily: "var(--font-mono)", background: isParked ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)", color: isParked ? "var(--color-client-text-dim)" : "var(--color-client-text-secondary)" }}>{r.model}</span>;
      },
    },
    {
      key: "sessions", label: "Sessions", getValue: (r) => String(r.sessions),
      render: (r) => <span style={{ fontFamily: "var(--font-mono)", color: r.sessions > 0 ? "var(--color-client-text-secondary)" : "var(--color-client-text-dim)" }}>{r.sessions > 0 ? r.sessions : "—"}</span>,
    },
    {
      key: "costPerAction", label: "Cost/Action", getValue: (r) => { const c = r.sessions > 0 ? r.dailyCost / r.sessions : 0; return c > 0 ? c.toFixed(2) : "—"; },
      render: (r) => { const c = r.sessions > 0 ? r.dailyCost / r.sessions : 0; return <span style={{ fontFamily: "var(--font-mono)", color: c > 0 ? "var(--color-client-text-secondary)" : "var(--color-client-text-dim)" }}>{c > 0 ? `$${c.toFixed(2)}` : "—"}</span>; },
    },
    {
      key: "role", label: "Role", getValue: (r) => r.status === "parked" ? "PARKED" : r.role,
      render: (r) => {
        const isParked = r.status === "parked";
        const roleColor = ROLE_COLORS[r.role] || "rgba(255,255,255,0.25)";
        return isParked
          ? <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text-dim)" }}>PARKED</span>
          : <span style={{ fontSize: 11, color: roleColor }}>{r.role}</span>;
      },
    },
  ], []);

  const attributionColumns: StandardTableColumn<(typeof ATTRIBUTION_ROWS)[number]>[] = useMemo(() => [
    {
      key: "name", label: "Agent", getValue: (r) => r.name,
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.classDot, flexShrink: 0 }} />
          {r.name}
        </div>
      ),
    },
    { key: "classification", label: "Classification", getValue: (r) => r.classification, render: (r) => <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>{r.classification}</span> },
    { key: "model", label: "Model", getValue: (r) => r.model, render: (r) => <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontFamily: "var(--font-mono)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text-secondary)" }}>{r.model}</span> },
    { key: "activity", label: "Activity", getValue: (r) => r.actions > 0 ? `${r.actions} actions` : "0 actions", render: (r) => <span style={{ fontFamily: "var(--font-mono)", color: r.actions > 0 ? "var(--color-client-text-secondary)" : "var(--color-client-text-dim)" }}>{r.actions > 0 ? `${r.actions} actions` : "0 actions"}</span> },
    { key: "tokens", label: "Tokens", getValue: (r) => r.tokens, render: (r) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-client-text-secondary)" }}>{r.tokens}</span> },
    {
      key: "cost", label: "Variable Cost", getValue: (r) => r.cost.toFixed(2),
      render: (r) => {
        const maxAttrCost = 9.80;
        const barW = maxAttrCost > 0 ? (r.cost / maxAttrCost) * 100 : 0;
        return (
          <div style={{ position: "relative" as const }}>
            <InspectableValue value={`$${r.cost.toFixed(2)}`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Inferred from session ownership and workflow mapping" limitations="Per-agent token metering not instrumented">
              <span style={{ fontFamily: "var(--font-mono)", color: r.cost > 0 ? "var(--color-client-text)" : "var(--color-client-text-dim)" }}>${r.cost.toFixed(2)}</span>
            </InspectableValue>
            {barW > 0 && <div style={{ position: "absolute", bottom: 2, left: 0, height: 2, borderRadius: 1, width: `${barW}%`, maxWidth: "100%", background: `linear-gradient(90deg, ${r.contColor}40, transparent)` }} />}
          </div>
        );
      },
    },
    { key: "contribution", label: "Contribution", getValue: (r) => r.contribution, render: (r) => <span style={{ padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", background: r.contBg, color: r.contColor, border: `1px solid ${r.contColor}20` }}>{r.contribution}</span> },
    { key: "lastActive", label: "Last Active", getValue: (r) => r.lastActive, render: (r) => <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{r.lastActive}</span> },
  ], []);

  const channelColumns: StandardTableColumn<(typeof CHANNEL_ANALYTICS_ROWS)[number]>[] = useMemo(() => [
    {
      key: "channel", label: "Channel", getValue: (r) => r.binding,
      render: (r) => {
        const details: ChannelEntry[] | undefined = (r.binding === "Slack" && liveDiscordChannels)
          ? liveDiscordChannels.map((ch) => ({ name: ch.name, id: ch.id, members: ch.members }))
          : channelDetails[r.binding];
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
            <RacketIcon expanded={expandedChannel === r.binding} size={14} color="var(--color-client-text-dim)" />
            <InspectableValue value={r.binding} sourceClass={r.binding === "Slack" && liveDiscordChannels ? "LOCAL" : "CONFIG"} source={r.binding === "Slack" ? (liveDiscordChannels ? "Live from /api/channels adapter" : "Workspace channel placeholder") : "System configuration"} method={r.binding === "Slack" ? (liveDiscordChannels ? "Runtime fetch" : "Configured placeholder") : "Configured binding"} limitations={r.binding === "Slack" ? "Channel structure requires a configured workspace adapter" : undefined}>
              <span>{r.binding}</span>
            </InspectableValue>
            {details && <span style={{ fontSize: 9, color: "var(--color-client-text-dim)", fontWeight: 400 }}>({details.length})</span>}
          </span>
        );
      },
    },
    { key: "activity", label: "Activity", getValue: (r) => `${r.actions} actions`, render: (r) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-client-text-secondary)" }}>{r.actions} actions</span> },
    { key: "agents", label: "Agents", getValue: (r) => `${r.agentCount} agents`, render: (r) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-client-text-secondary)" }}>{r.agentCount} agents</span> },
    {
      key: "type", label: "Type", getValue: (r) => r.types.join(", "),
      render: (r) => (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {r.types.map((t, i) => (
            <span key={t} style={{ padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", background: `${r.typeColors[i]}15`, color: r.typeColors[i], border: `1px solid ${r.typeColors[i]}20` }}>{t}</span>
          ))}
        </div>
      ),
    },
    {
      key: "cost", label: "Cost Share", getValue: (r) => r.cost.toFixed(2),
      render: (r) => (
        <InspectableValue value={`$${r.cost.toFixed(2)}`} sourceClass="INFERRED" source="Channel activity pattern inference" method="Estimated from agent activity proportions per channel" limitations="Simplified from Discord ACL allow/deny flags">
          <span style={{ fontFamily: "var(--font-mono)" }}>${r.cost.toFixed(2)}</span>
        </InspectableValue>
      ),
    },
    { key: "lastActive", label: "Last Active", getValue: (r) => r.lastActive, render: (r) => <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{r.lastActive}</span> },
    { key: "description", label: "Description", getValue: (r) => r.desc, render: (r) => <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", whiteSpace: "normal" as const, display: "block", maxWidth: 220 }}>{r.desc}</span> },
  ], [liveDiscordChannels, expandedChannel]);

  return (
    <div className="fade-in-up" style={{ maxWidth: 1400, padding: isMobile ? "16px 12px" : isTablet ? "24px 20px" : "32px 36px" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Financial Cockpit
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.03em", margin: 0 }}>
          Usage &amp; Spend
        </h1>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontFamily: "var(--font-mono)" }}>V3 — truth-hardened</span>
      </div>
      {/* ── Freshness Indicator ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, marginTop: 0 }}>
        <p style={{ fontSize: 14, color: "var(--color-client-text-secondary)", margin: 0 }}>
          {freshness === "loading" && "Fetching live cost data..."}
          {freshness === "fresh" && <>Real cost data from live codexbar · Last refreshed {fetchedAt ? fmtTimestamp(fetchedAt) : fmtTimestamp(updatedAt)}</>}
          {freshness === "stale" && <>Real cost data from codexbar cache · Last updated {fmtTimestamp(updatedAt)}</>}
          {freshness === "failed" && "Cost data unavailable — waiting for codexbar"}
        </p>
        {freshness === "loading" && (
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#A78BFA", animation: "pulse 1.5s infinite" }} />
        )}
        {freshness === "fresh" && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#34D399", background: "rgba(52,211,153,0.1)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(52,211,153,0.2)" }}>Live</span>
        )}
        {freshness === "stale" && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#FBBf24", background: "rgba(251,191,36,0.1)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(251,191,36,0.2)" }}>Stale</span>
        )}
        {freshness === "failed" && (
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#F87171", background: "rgba(248,113,113,0.1)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)" }}>Failed</span>
        )}
      </div>

      {/* ── Data Trust Summary Banner ── */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          gap: isMobile ? 6 : 20,
          padding: isMobile ? "10px 14px" : "10px 18px",
          borderRadius: 10,
          background: "rgba(12,12,18,0.45)",
          border: "1px solid rgba(255,255,255,0.04)",
          marginBottom: 20,
        }}
      >
        {[
          { count: VERIFIED_COUNT, type: "VERIFIED" as Provenance, color: "rgb(52,211,153)" },
          { count: LOCAL_COUNT, type: "LOCAL" as Provenance, color: "rgba(52,211,153,0.7)" },
          { count: ESTIMATED_COUNT, type: "ESTIMATED" as Provenance, color: "rgba(251,191,36,0.55)" },
          { count: UNKNOWN_COUNT, type: "UNKNOWN" as Provenance, color: "rgba(255,255,255,0.3)" },
        ].map((item) => (
          <div key={item.type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>
              <span style={{ fontWeight: 600, color: item.color, fontFamily: "var(--font-mono)" }}>{item.count}</span> {item.type.toLowerCase()}
            </span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginLeft: "auto" }}>
          {VERIFIED_COUNT + LOCAL_COUNT + ESTIMATED_COUNT + UNKNOWN_COUNT} total metrics tracked
        </span>
      </div>

      {/* ── Summary Strip ── */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 1,
          borderRadius: 14,
          overflow: "hidden",
          marginBottom: 28,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <StripCell label="Spend Today" value={`$${spendToday.toFixed(2)}`} accent="#34D399" prov="LOCAL" sourceClass="LOCAL" source="codexbar" method={`Sum of todays daily cost entries across Claude and Codex providers from codexbar cost --json`} fetchedAt={fetchedAt ?? undefined} freshness={freshness === "loading" ? undefined : freshness} isFallback={isFallback} />
        <StripCell label="30-Day Spend" value={`$${spend30Day.toFixed(2)}`} accent="#A78BFA" prov="LOCAL" sourceClass="LOCAL" source="codexbar" method={`Sum of last30DaysCostUSD: Claude ($${claudeCost.toFixed(2)}) + Codex ($${codexCost.toFixed(2)}) from codexbar`} fetchedAt={fetchedAt ?? undefined} freshness={freshness === "loading" ? undefined : freshness} isFallback={isFallback} />
        <StripCell label="Top Model" value={`${topModel.model} (${topModel.pct}%)`} accent="#dadadb" prov="LOCAL" sourceClass="LOCAL" source="codexbar model breakdown" method="Aggregated from daily model breakdowns across all providers from codexbar" fetchedAt={fetchedAt ?? undefined} freshness={freshness === "loading" ? undefined : freshness} isFallback={isFallback} />
        <StripCell label="Provider Split" value={`Claude ${claudePct}% · Codex ${codexPct}%`} accent="#60A5FA" prov="LOCAL" sourceClass="LOCAL" source="codexbar" method={`Claude ($${claudeCost.toFixed(2)}) vs Codex ($${codexCost.toFixed(2)}) from codexbar cost --json`} fetchedAt={fetchedAt ?? undefined} freshness={freshness === "loading" ? undefined : freshness} isFallback={isFallback} />
        <StripCell label="Last Updated" value={fetchedAt ? fmtTimestamp(fetchedAt) : fmtTimestamp(updatedAt)} accent="var(--color-client-text-secondary)" prov="LOCAL" sourceClass="LOCAL" source="codexbar" method={provenanceMethod} fetchedAt={fetchedAt ?? undefined} freshness={freshness === "loading" ? undefined : freshness} isFallback={isFallback} />
      </div>

      {/* ── Per-Provider Breakdown ── */}
      <div
        style={{
          display: "flex",
          gap: 1,
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 28,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ flex: 1, padding: isMobile ? "12px 14px" : "14px 18px", background: "rgba(12,12,18,0.7)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Per-Provider Breakdown (30 Day)
            </span>
            <ProvTag type="LOCAL" />
          </div>
          <div style={{ display: "flex", gap: isMobile ? 16 : 32, flexWrap: isMobile ? "wrap" as const : "nowrap" as const }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#dadadb", opacity: 0.8 }} />
                <span style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>Claude</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#dadadb" }}>
                ${claudeCost.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-client-text-dim)", marginTop: 2 }}>{claudePct}% of total</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#34D399", opacity: 0.8 }} />
                <span style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>Codex</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#34D399" }}>
                ${codexCost.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-client-text-dim)", marginTop: 2 }}>{codexPct}% of total</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "#A78BFA", opacity: 0.8 }} />
                <span style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>Combined</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "#A78BFA" }}>
                ${spend30Day.toFixed(2)}
              </div>
              <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--color-client-text-dim)", marginTop: 2 }}>Claude + Codex</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 10 }}>
            Sum of Claude (${claudeCost.toFixed(2)}) + Codex (${codexCost.toFixed(2)}) across all providers from codexbar cost --json
          </div>
        </div>
      </div>

      {/* ── Usage Risk Strip ── */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "flex-start" : "center",
          gap: isMobile ? 8 : 20,
          padding: isMobile ? "12px 14px" : "10px 18px",
          borderRadius: 10,
          background: "rgba(12,12,18,0.45)",
          border: "1px solid rgba(255,255,255,0.04)",
          marginBottom: 28,
        }}
      >
        {[
          { label: "Claude capacity", value: "Healthy" },
          { label: "OpenAI capacity", value: "Healthy" },
          { label: "Spend posture", value: spendToday < DAILY_TARGET ? "Under target" : "Over target" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>
              {item.label}: <span style={{ color: "#34D399", fontWeight: 600 }}>{item.value}</span>
            </span>
          </div>
        ))}
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>No provider risk today</span>
        <div style={{ marginLeft: "auto" }}><ProvTag type="ESTIMATED" /></div>
      </div>

      {/* ── Real Spend Breakdown ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Measured Cost Breakdown
        </span>
        <ProvTag type="LOCAL" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 28,
        }}
      >
        {/* 4-column summary */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 1, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          {[
            { label: "Today", value: `$${spendToday.toFixed(2)}`, color: "#34D399" },
            { label: "Yesterday", value: `$${spendYesterday.toFixed(2)}`, color: "#60A5FA" },
            { label: "30-Day Total", value: `$${spend30Day.toFixed(2)}`, color: "#A78BFA" },
            { label: "Total Tokens", value: fmtTokens(totalTokens), color: "var(--color-client-text)" },
          ].map((col) => (
            <div key={col.label} style={{ padding: isMobile ? "10px 12px" : "14px 18px", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontSize: 9, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                {col.label}
              </div>
              <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: col.color }}>
                {col.value}
              </div>
            </div>
          ))}
        </div>
        {/* Provider line */}
        <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
          Claude: <span style={{ fontFamily: "var(--font-mono)", color: "#dadadb", fontWeight: 600 }}>${claudeCost.toFixed(2)}</span> ({claudePct}%) ·{" "}
          Codex: <span style={{ fontFamily: "var(--font-mono)", color: "#34D399", fontWeight: 600 }}>${codexCost.toFixed(2)}</span> ({codexPct}%) ·{" "}
          Source: <span style={{ color: "var(--color-client-text-dim)" }}>codexbar cost --json (Claude + Codex providers)</span>
        </div>
      </div>

      {/* ── Model Distribution (REAL) ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Model Distribution
        </span>
        <ProvTag type="LOCAL" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 28,
        }}
      >
        {/* Horizontal stacked bar */}
        <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
          {MODEL_MIX.map((m) => (
            <div
              key={m.model}
              style={{
                width: `${m.pct}%`,
                background: MODEL_COLORS[m.model] ?? "rgba(255,255,255,0.2)",
                opacity: 0.7,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: m.pct > 0 ? Math.max(40, 0) : 0,
                overflow: "visible",
                position: "relative",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                {m.pct}%
              </span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {MODEL_MIX.map((m) => (
            <div key={m.model} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: MODEL_COLORS[m.model] ?? "rgba(255,255,255,0.2)", opacity: 0.7, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--color-client-text)", fontWeight: 500 }}>{m.model}</span>
              <InspectableValue value={`${m.pct}% · $${m.cost.toFixed(2)} · ${fmtTokens(m.tokens)}`} sourceClass="LOCAL" source="codexbar model breakdown" method="Aggregated from daily model breakdowns across all providers" inline>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-client-text)" }}>{m.pct}%</span>
                  <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}> · ${m.cost.toFixed(2)} · {fmtTokens(m.tokens)}</span>
                </span>
              </InspectableValue>
            </div>
          ))}
        </div>
      </div>

      {/* ── Provider Limits & Capacity ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Provider Limits &amp; Capacity
        </span>
        <ProvTag type="ESTIMATED" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 28,
        }}
      >
        {/* Estimated data warning */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.15)",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 14, lineHeight: "18px", flexShrink: 0 }}>&#9888;</span>
          <div style={{ fontSize: 11, color: "rgba(251,191,36,0.7)", lineHeight: 1.5 }}>
            <strong>Estimated values.</strong> Capacity limits shown below are approximations based on plan tier assumptions and may not reflect actual provider limits. Contact your provider for exact quotas.
          </div>
        </div>
        {/* Anthropic */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 12 }}>Anthropic / Claude</div>
          {[
            { label: "Daily tokens", used: 680, total: 1000, unit: "K" },
            { label: "Weekly tokens", used: 3.2, total: 5, unit: "M" },
            { label: "Monthly tokens", used: 12.8, total: 25, unit: "M" },
          ].map((bar) => {
            const pct = Math.round((bar.used / bar.total) * 100);
            const barColor = pct > 80 ? "#EF4444" : pct > 60 ? "#F59E0B" : "#34D399";
            return (
              <div key={bar.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", width: 110, flexShrink: 0 }}>{bar.label}</span>
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontFamily: "var(--font-mono)", width: 90, flexShrink: 0 }}>
                  {bar.used}{bar.unit} of {bar.total}{bar.unit}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: barColor, transition: "width 0.3s ease" }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: barColor, width: 32, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
              </div>
            );
          })}
        </div>
        {/* OpenAI */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 12 }}>OpenAI / Codex</div>
          {[
            { label: "Daily sessions", used: 18, total: 50, unit: "", fmt: (v: number) => String(v) },
            { label: "Monthly spend cap", used: 85, total: 200, unit: "$", fmt: (v: number) => `$${v}` },
          ].map((bar) => {
            const pct = Math.round((bar.used / bar.total) * 100);
            const barColor = pct > 80 ? "#EF4444" : pct > 60 ? "#F59E0B" : "#34D399";
            return (
              <div key={bar.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", width: 110, flexShrink: 0 }}>{bar.label}</span>
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontFamily: "var(--font-mono)", width: 90, flexShrink: 0 }}>
                  {bar.fmt(bar.used)} of {bar.fmt(bar.total)}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: barColor, transition: "width 0.3s ease" }} />
                </div>
                <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: barColor, width: 32, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(251,191,36,0.55)" }} />
          <InspectableValue value="All providers within healthy operating range (estimated)" sourceClass="ESTIMATED" source="Planning estimate" method="Approximated from plan tier assumptions — not queried from provider API" limitations="These are estimates, not real limits. Contact your provider for exact quotas.">
            <span style={{ fontSize: 11, color: "rgba(251,191,36,0.55)" }}>All providers within estimated healthy range</span>
          </InspectableValue>
          <div style={{ marginLeft: "auto" }}><ProvTag type="ESTIMATED" /></div>
        </div>
      </div>

      {/* ── Fixed Monthly Subscriptions ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          AI Infrastructure — Fixed Monthly Costs
        </span>
        <ProvTag type="VERIFIED" />
      </div>
      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(12,12,18,0.6)", marginBottom: 28, overflow: "hidden" }}>
        <StandardTable
          tableKey="usage-subscriptions"
          columns={subscriptionColumns}
          data={SUBSCRIPTION_ROWS}
          getRowKey={(r) => r.provider}
          defaultSortKey="provider"
          emptyMessage="No subscriptions"
          showTableManagement
        />
        {/* Total row */}
        <div style={{ display: "flex", gap: 0, borderTop: "2px solid rgba(255,255,255,0.08)", padding: "10px 16px" }}>
          <span style={{ fontWeight: 700, color: "var(--color-client-text)", flex: 1 }}>Total Fixed</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#34D399", flex: 1 }}>$220/mo</span>
          <span style={{ color: "var(--color-client-text-secondary)", flex: 2, fontSize: 13 }}>Before variable usage</span>
        </div>
      </div>

      {/* ── Total AI Workforce Cost ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Total AI Workforce Cost
        </span>
        <ProvTag type="LOCAL" />
        <ProvTag type="CONFIG" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 28,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 1, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
          {[
            { label: "Fixed Subscriptions", value: "$220/mo", color: "#60A5FA", prov: "VERIFIED" as Provenance },
            { label: "Variable Usage (30d measured)", value: `$${spend30Day.toFixed(2)}`, color: "#34D399", prov: "LOCAL" as Provenance },
            { label: "Total Monthly Cost", value: `$${(220 + spend30Day).toFixed(2)}`, color: "#dadadb", prov: "LOCAL" as Provenance },
          ].map((col) => (
            <div key={col.label} style={{ padding: isMobile ? "10px 14px" : "14px 18px", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {col.label}
                </span>
                <ProvTag type={col.prov} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: col.color }}>
                {col.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
          Per-agent average: <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-client-text)" }}>${((220 + spend30Day) / ACTIVE_AGENTS).toFixed(2)}/mo</span> ·{" "}
          <span style={{ color: "var(--color-client-text)" }}>{ACTIVE_AGENTS} agents operating</span>
        </div>
        {/* Cost Structure bar */}
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-client-text-dim)", marginTop: 16, marginBottom: 8 }}>
          Cost Structure
        </div>
        {(() => {
          const fixedPct = Math.round((220 / (220 + spend30Day)) * 100);
          const varPct = 100 - fixedPct;
          return (
            <>
              <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
                <div style={{ width: `${fixedPct}%`, background: "#60A5FA", opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: "#fff" }}>{fixedPct}%</span>
                </div>
                <div style={{ width: `${varPct}%`, background: "#34D399", opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: "#fff" }}>{varPct}%</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#60A5FA", opacity: 0.7 }} />
                  <InspectableValue value={`Fixed ${fixedPct}%`} sourceClass="LOCAL" source="codexbar + subscription config" method="Fixed subscription cost as percentage of total monthly" inline>
                    <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>Fixed {fixedPct}%</span>
                  </InspectableValue>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "#34D399", opacity: 0.7 }} />
                  <InspectableValue value={`Variable ${varPct}%`} sourceClass="LOCAL" source="codexbar measurement" method="Variable usage cost as percentage of total monthly" inline>
                    <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>Variable {varPct}%</span>
                  </InspectableValue>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Agent Cost Breakdown Table ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Agent Cost Breakdown
        </span>
        <ProvTag type="ESTIMATED" />
      </div>
      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(12,12,18,0.6)", marginBottom: 28, overflow: "hidden" }}>
        <StandardTable
          tableKey="usage-agent"
          columns={agentCostColumns}
          data={AGENT_COSTS}
          getRowKey={(r) => r.name}
          defaultSortKey="dailyCost"
          defaultSortDir="desc"
          emptyMessage="No agent cost data"
          showTableManagement
        />
        {/* Total row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", borderTop: "2px solid rgba(255,255,255,0.08)", padding: "10px 16px", gap: 16 }}>
          <span style={{ fontWeight: 700, color: "var(--color-client-text)" }}>Total</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "#34D399" }}>
            <InspectableValue value={`$${AGENT_COSTS.reduce((a, b) => a + b.dailyCost, 0).toFixed(2)}`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Sum of estimated per-agent daily costs" limitations="Per-agent token metering not instrumented">
              <span>${AGENT_COSTS.reduce((a, b) => a + b.dailyCost, 0).toFixed(2)}</span>
            </InspectableValue>
          </span>
          <span />
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--color-client-text)" }}>
            <InspectableValue value={String(AGENT_COSTS.reduce((a, b) => a + b.sessions, 0))} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Sum of estimated per-agent session counts">
              <span>{AGENT_COSTS.reduce((a, b) => a + b.sessions, 0)}</span>
            </InspectableValue>
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "#A78BFA" }}>
            <InspectableValue value={`$${(AGENT_COSTS.reduce((a, b) => a + b.dailyCost, 0) / Math.max(AGENT_COSTS.reduce((a, b) => a + b.sessions, 0), 1)).toFixed(2)}`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Total daily cost divided by total sessions">
              <span>${(AGENT_COSTS.reduce((a, b) => a + b.dailyCost, 0) / Math.max(AGENT_COSTS.reduce((a, b) => a + b.sessions, 0), 1)).toFixed(2)}</span>
            </InspectableValue>
          </span>
          <span />
        </div>
      </div>

      {/* ── Section V5-1: Agent Attribution ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Agent Attribution
        </span>
        <ProvTag type="INFERRED" />
      </div>
      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(12,12,18,0.6)", marginBottom: 10, overflow: "hidden" }}>
        <StandardTable
          tableKey="usage-attribution"
          columns={attributionColumns}
          data={[...ATTRIBUTION_ROWS]}
          getRowKey={(r) => r.name}
          defaultSortKey="cost"
          defaultSortDir="desc"
          emptyMessage="No attribution data"
          showTableManagement
          getRowStyle={() => ({ opacity: 1 })}
        />
      </div>
      <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginBottom: 28, paddingLeft: 4, lineHeight: 1.5 }}>
        Agent attribution is inferred from session ownership and workflow mapping, not direct per-request instrumentation.
      </div>

      {/* ── Section V5-2: Channel Analytics ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Channel Analytics
        </span>
        <ProvTag type={channelFreshness === "fresh" ? "LOCAL" : "CONFIG"} />
        {channelFreshness === "loading" && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "#A78BFA", background: "rgba(167,139,250,0.1)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(167,139,250,0.2)" }}>Loading</span>
        )}
        {channelFreshness === "fresh" && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "#34D399", background: "rgba(52,211,153,0.1)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(52,211,153,0.2)" }}>Live</span>
        )}
        {channelFreshness === "stale" && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "#FBBF24", background: "rgba(251,191,36,0.1)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(251,191,36,0.2)" }}>Stale</span>
        )}
        {channelFreshness === "failed" && (
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)" }}>Failed</span>
        )}
      </div>
      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(12,12,18,0.6)", marginBottom: expandedChannel ? 0 : 28, overflow: "hidden" }}>
        <StandardTable
          tableKey="usage-channel"
          columns={channelColumns}
          data={[...CHANNEL_ANALYTICS_ROWS]}
          getRowKey={(r) => r.binding}
          defaultSortKey="cost"
          defaultSortDir="desc"
          emptyMessage="No channel data"
          showTableManagement
          onRowClick={(row) => { setExpandedChannel(expandedChannel === row.binding ? null : row.binding); setExpandedChannelMembers(null); setIsChannelFullScreen(false); }}
          selectedRowKey={expandedChannel}
        />
      </div>
      {/* ── Channel Detail (expanded) ── */}
      {expandedChannel && (() => {
        const row = CHANNEL_ANALYTICS_ROWS.find((r) => r.binding === expandedChannel);
        const details: ChannelEntry[] | undefined = (expandedChannel === "Discord" && liveDiscordChannels)
          ? liveDiscordChannels.map((ch) => ({ name: ch.name, id: ch.id, members: ch.members }))
          : channelDetails[expandedChannel];
        if (!row || !details) return null;
        return (
          <div style={{ background: "rgba(0,0,0,0.3)", borderTop: "1px solid rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "0 0 14px 14px", padding: "8px 16px 8px 32px", marginBottom: 28, animation: "channelExpand 0.2s ease-out" }}>
            <style>{`@keyframes channelExpand { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }`}</style>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
              <button onClick={(e) => { e.stopPropagation(); setIsChannelFullScreen(true); }} title="Full-screen" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-client-text-secondary)", fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
                <span style={{ fontSize: 14 }}>↔</span>
              </button>
            </div>
            {details.map((ch) => {
              const chKey = `${expandedChannel}::${ch.id}`;
              const isMembersOpen = expandedChannelMembers === chKey;
              const chMembers = ch.members ?? [];
              const ROLE_PILL: Record<string, { bg: string; color: string; border: string }> = {
                Admin: { bg: "rgba(218,218,219,0.12)", color: "#dadadb", border: "rgba(218,218,219,0.2)" },
                Standard: { bg: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)", border: "rgba(255,255,255,0.08)" },
                Integration: { bg: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "rgba(96,165,250,0.2)" },
              };
              const ROLE_ORDER: Record<string, number> = { Admin: 0, Standard: 1, Integration: 2 };
              const sortedMembers = [...chMembers].sort((a, b) => {
                const rDiff = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
                if (rDiff !== 0) return rDiff;
                return memberSortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
              });
              return (
                <div key={ch.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.025)" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", flexShrink: 0, boxShadow: "0 0 4px rgba(52,211,153,0.4)" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>{ch.name}</span>
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.3)" }}>{ch.id}</span>
                    <span onClick={(e) => { e.stopPropagation(); setExpandedChannelMembers(isMembersOpen ? null : chKey); }} style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.4)", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}>
                      Members ({chMembers.length}) <RacketIcon expanded={isMembersOpen} size={10} color="rgba(255,255,255,0.4)" />
                    </span>
                  </div>
                  {isMembersOpen && (
                    <div style={{ padding: "6px 0 6px 20px", background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.025)", animation: "channelExpand 0.2s ease-out", maxHeight: chMembers.length > 8 ? 280 : "none", overflowY: chMembers.length > 8 ? "auto" : "visible" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span onClick={(e) => { e.stopPropagation(); setMemberSortAsc(!memberSortAsc); }} style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none" }}>Sort: {memberSortAsc ? "A-Z" : "Z-A"}</span>
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.18)", fontStyle: "italic" }}>Members derived from permission_overwrites (Discord API) mapped through locally maintained member directory.</span>
                      </div>
                      {sortedMembers.length === 0 && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", padding: "4px 0" }}>No members</div>}
                      {sortedMembers.map((m) => {
                        const pill = ROLE_PILL[m.role] ?? ROLE_PILL.Standard;
                        const isIntegration = m.role === "Integration";
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: isIntegration ? "rgba(255,255,255,0.2)" : "#34D399", flexShrink: 0, boxShadow: isIntegration ? "none" : "0 0 4px rgba(52,211,153,0.4)" }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--color-client-text)" }}>{m.name}</span>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{m.username}</span>
                            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.15)" }}>{m.id}</span>
                            <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", background: pill.bg, color: pill.color, border: `1px solid ${pill.border}` }}>{m.role}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Section V5-3: Contribution Matrix ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Contribution Matrix
        </span>
        <ProvTag type="ESTIMATED" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 10,
        }}
      >
        {/* 2x2 Grid */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 16 }}>
          {/* Top-left: High Contribution / Low Cost — best value */}
          <div style={{ padding: "16px 18px", borderRadius: 10, background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <InspectableValue value="High Contribution · Low Cost" sourceClass="ESTIMATED" source="Business classification" method="Directional assessment based on role classification and cost" limitations="Not measured ROI" inline>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#34D399" }}>High Contribution · Low Cost</span>
              </InspectableValue>
              <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(52,211,153,0.15)", color: "#34D399", fontWeight: 600 }}>BEST VALUE</span>
            </div>
            {["Marketing Agent", "Sales Follow-Up Agent", "Delivery / Install Agent"].map((name) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#dadadb", flexShrink: 0 }} />
                <InspectableValue value={name} sourceClass="ESTIMATED" source="Business classification" method="Agent placed by role classification" inline>
                  <span style={{ fontSize: 11, color: "var(--color-client-text)" }}>{name}</span>
                </InspectableValue>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 6 }}>Revenue drivers at low cost</div>
          </div>

          {/* Top-right: High Contribution / High Cost */}
          <div style={{ padding: "16px 18px", borderRadius: 10, background: "rgba(52,211,153,0.03)", border: "1px solid rgba(52,211,153,0.12)" }}>
            <InspectableValue value="High Contribution · High Cost" sourceClass="ESTIMATED" source="Business classification" method="Directional assessment based on role classification and cost" limitations="Not measured ROI" inline>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#34D399", marginBottom: 10 }}>High Contribution · High Cost</div>
            </InspectableValue>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#A78BFA", flexShrink: 0 }} />
              <InspectableValue value="Example Client Mission Agent" sourceClass="ESTIMATED" source="Business classification" method="Agent placed by role classification" inline>
                <span style={{ fontSize: 11, color: "var(--color-client-text)" }}>Example Client Mission Agent</span>
              </InspectableValue>
            </div>
            <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 6 }}>Orchestrator, highest leverage</div>
          </div>

          {/* Bottom-left: Low Contribution / Low Cost — fine */}
          <div style={{ padding: "16px 18px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <InspectableValue value="Low Contribution · Low Cost" sourceClass="ESTIMATED" source="Business classification" method="Directional assessment based on role classification and cost" limitations="Not measured ROI" inline>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-client-text-dim)", marginBottom: 10 }}>Low Contribution · Low Cost</div>
            </InspectableValue>
            {["Executive Assistant", "Strategy Review Agent", "Operations Agent"].map((name) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                <InspectableValue value={name} sourceClass="ESTIMATED" source="Business classification" method="Agent placed by role classification" inline>
                  <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>{name}</span>
                </InspectableValue>
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 6 }}>Support agents, appropriately light</div>
          </div>

          {/* Bottom-right: Low Contribution / High Cost — watch */}
          <div style={{ padding: "16px 18px", borderRadius: 10, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <InspectableValue value="Low Contribution · High Cost" sourceClass="ESTIMATED" source="Business classification" method="Directional assessment based on role classification and cost" limitations="Not measured ROI" inline>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#F59E0B" }}>Low Contribution · High Cost</span>
              </InspectableValue>
              <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "rgba(245,158,11,0.12)", color: "#F59E0B", fontWeight: 600 }}>WATCH</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#60A5FA", flexShrink: 0 }} />
              <InspectableValue value="Engineering Agent" sourceClass="ESTIMATED" source="Business classification" method="Agent placed by role classification" inline>
                <span style={{ fontSize: 11, color: "var(--color-client-text)" }}>Engineering Agent</span>
              </InspectableValue>
            </div>
            <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 6 }}>High cost during build sprints, episodic</div>
          </div>
        </div>

      </div>
      <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginBottom: 28, paddingLeft: 4, lineHeight: 1.5 }}>
        Contribution assessment is directional based on business classification, not measured ROI. Use as a strategic operating lens.
      </div>

      {/* ── Section V5-4: Attribution Method ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Attribution Method
        </span>
        <ProvTag type="INFERRED" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.45)",
          border: "1px solid rgba(255,255,255,0.04)",
          marginBottom: 28,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 12 }}>How agent attribution works:</div>
        {[
          { metric: "Token/cost data", method: "measured locally via codexbar", tag: "LOCAL" as Provenance },
          { metric: "Agent assignment", method: "inferred from session ownership and workflow routing", tag: "INFERRED" as Provenance },
          { metric: "Binding assignment", method: "inferred from channel/source metadata", tag: "INFERRED" as Provenance },
          { metric: "Contribution scoring", method: "estimated from business classification and activity patterns", tag: "ESTIMATED" as Provenance },
        ].map((row) => (
          <div key={row.metric} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: PROV_STYLES[row.tag].color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--color-client-text)", fontWeight: 500, minWidth: 140 }}>{row.metric}</span>
            <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", flex: 1 }}>{row.method}</span>
            <ProvTag type={row.tag} />
          </div>
        ))}

        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-client-text)", marginTop: 20, marginBottom: 12 }}>Not yet instrumented:</div>
        {[
          "Direct per-request agent-level token metering",
          "Direct binding-level cost metering",
          "Contribution measurement (currently classification-based, not outcome-measured)",
          "Cross-agent workflow cost sharing",
        ].map((item) => (
          <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.15)", flexShrink: 0, marginTop: 4 }} />
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{item}</span>
          </div>
        ))}
      </div>

      {/* ── Weekly Trend ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Weekly Trend
        </span>
        <ProvTag type="ESTIMATED" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, position: "relative" }}>
          {/* $25 target line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `${(DAILY_TARGET / (maxWeeklyAmount * 1.15)) * 100}%`,
              borderBottom: "1px dashed rgba(239,68,68,0.35)",
              zIndex: 1,
            }}
          >
            <span
              style={{
                position: "absolute",
                right: 0,
                top: -14,
                fontSize: 9,
                color: "rgba(239,68,68,0.5)",
                fontFamily: "var(--font-mono)",
              }}
            >
              $25 target
            </span>
          </div>
          {WEEKLY_TREND.map((d) => {
            const barHeight = d.amount > 0 ? (d.amount / (maxWeeklyAmount * 1.15)) * 100 : 0;
            const isFriday = d.day === "Fri";
            const isOver = d.amount > DAILY_TARGET;
            const isFuture = d.amount === 0 && !isFriday;
            return (
              <div
                key={d.day}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  height: "100%",
                  justifyContent: "flex-end",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: isFriday ? "#34D399" : isFuture ? "var(--color-client-text-dim)" : "var(--color-client-text-secondary)",
                    fontWeight: isFriday ? 600 : 400,
                  }}
                >
                  {isFuture ? "—" : (
                    <InspectableValue value={`$${d.amount.toFixed(0)}`} sourceClass={isFriday ? "LOCAL" : "SEEDED"} source={isFriday ? "codexbar" : "Demo data"} method={isFriday ? "Todays measured spend" : "Seeded weekly trend data"} limitations={isFriday ? undefined : "Not connected to real daily aggregation"}>
                      <span>${d.amount.toFixed(0)}</span>
                    </InspectableValue>
                  )}
                </span>
                <div
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: `${barHeight}%`,
                    minHeight: isFuture ? 4 : undefined,
                    borderRadius: 6,
                    background: isFuture
                      ? "rgba(255,255,255,0.04)"
                      : isFriday
                        ? "linear-gradient(180deg, #34D399, rgba(52,211,153,0.3))"
                        : isOver
                          ? "linear-gradient(180deg, rgba(239,68,68,0.5), rgba(239,68,68,0.15))"
                          : "linear-gradient(180deg, rgba(96,165,250,0.4), rgba(96,165,250,0.1))",
                    border: isFuture
                      ? "1px solid rgba(255,255,255,0.04)"
                      : isFriday
                        ? "1px solid rgba(52,211,153,0.3)"
                        : "1px solid rgba(255,255,255,0.04)",
                    transition: "height 0.3s ease",
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: isFriday ? "#34D399" : isFuture ? "var(--color-client-text-dim)" : "var(--color-client-text-dim)",
                    fontWeight: isFriday ? 600 : 400,
                  }}
                >
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Not Yet Verified Panel ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
          Not Yet Verified
        </span>
        <ProvTag type="UNKNOWN" />
      </div>
      <div
        style={{
          padding: "20px 24px",
          borderRadius: 14,
          background: "rgba(12,12,18,0.35)",
          border: "1px solid rgba(255,255,255,0.04)",
          marginBottom: 28,
        }}
      >
        {[
          { item: "Agent-level cost attribution", reason: "Not instrumented — cannot break real costs per agent yet" },
          { item: "Anthropic rate limits", reason: "Max plan limits not exposed via API — using estimated caps" },
          { item: "OpenAI session/API limits", reason: "Plus plan limits not directly queryable" },
          { item: "Fixed monthly plan pricing", reason: "Configured estimate — may differ from actual billing" },
        ].map((entry) => (
          <div key={entry.item} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.15)", flexShrink: 0, marginTop: 5 }} />
            <div>
              <div style={{ fontSize: 12, color: "var(--color-client-text)", fontWeight: 500 }}>{entry.item}</div>
              <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginTop: 2 }}>{entry.reason}</div>
            </div>
          </div>
        ))}
      </div>

      <AsteriskNote />

      {/* Full-screen channel detail overlay */}
      {isChannelFullScreen && expandedChannel && (() => {
        const rowData = ([
          { binding: "Discord", actions: 28, agentCount: 7, desc: "Primary command and coordination surface" },
          { binding: "Telegram", actions: 4, agentCount: 2, desc: "Alex direct messaging and mobile alerts" },
          { binding: "OpenClaw Admin", actions: 8, agentCount: 3, desc: "System orchestration and agent management" },
          { binding: "Local CLI", actions: 6, agentCount: 2, desc: "Engineering builds and code execution" },
          { binding: "Email (Gmail)", actions: 5, agentCount: 3, desc: "Partnership outreach and corporate events" },
          { binding: "Scheduled/Cron", actions: 2, agentCount: 2, desc: "Automated heartbeats and monitoring" },
        ] as const).find((r) => r.binding === expandedChannel);
        const details: ChannelEntry[] | undefined = (expandedChannel === "Discord" && liveDiscordChannels)
          ? liveDiscordChannels.map((ch) => ({ name: ch.name, id: ch.id, members: ch.members }))
          : channelDetails[expandedChannel];
        return (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              background: "var(--color-client-bg, #0a0a0f)",
              overflow: "auto",
            }}
          >
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 32px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 4 }}>{expandedChannel}</div>
                  {rowData && <div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>{rowData.desc} · {rowData.actions} actions · {rowData.agentCount} agents</div>}
                </div>
                <button
                  onClick={() => setIsChannelFullScreen(false)}
                  title="Exit full-screen"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#60A5FA",
                    fontSize: 14,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 15 }}>↙</span>
                </button>
              </div>
              {details && details.map((ch) => {
                const chKey = `${expandedChannel}::${ch.id}`;
                const isMembersOpen = expandedChannelMembers === chKey;
                const chMembers = ch.members ?? [];
                return (
                  <div key={ch.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399", flexShrink: 0, boxShadow: "0 0 4px rgba(52,211,153,0.4)" }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)" }}>{ch.name}</span>
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.3)" }}>{ch.id}</span>
                      <span
                        onClick={() => setExpandedChannelMembers(isMembersOpen ? null : chKey)}
                        style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 }}
                      >
                        Members ({chMembers.length}) <RacketIcon expanded={isMembersOpen} size={10} color="rgba(255,255,255,0.4)" />
                      </span>
                    </div>
                    {isMembersOpen && (
                      <div style={{ padding: "8px 0 4px 20px" }}>
                        {chMembers.map((m) => (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.role === "Integration" ? "rgba(255,255,255,0.2)" : "#34D399", flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>{m.name}</span>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{m.username}</span>
                            <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", background: m.role === "Admin" ? "rgba(218,218,219,0.12)" : m.role === "Integration" ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)", color: m.role === "Admin" ? "#dadadb" : m.role === "Integration" ? "#60A5FA" : "rgba(255,255,255,0.35)" }}>{m.role}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Footer ── */}
      <div style={{ textAlign: "center", padding: "12px 0", marginTop: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(52,211,153,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Real data from codexbar local measurement · Config & estimates labeled per metric
        </span>
      </div>
    </div>
  );
}

/* ─── Strip Cell (for top summary) ─── */
function StripCell({ label, value, accent, prov, sourceClass, source, method, fetchedAt, freshness, isFallback }: { label: string; value: string; accent: string; prov: Provenance; sourceClass?: import("@/components/ProvenanceSystem").SourceClass; source?: string; method?: string; fetchedAt?: string; freshness?: "fresh" | "stale" | "refreshing" | "failed"; isFallback?: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "12px 14px",
        background: "rgba(12,12,18,0.7)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <ProvTag type={prov} />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: accent,
          fontFamily: value.startsWith("$") ? "var(--font-mono)" : "inherit",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {sourceClass && source && method ? (
          <InspectableValue value={value} sourceClass={sourceClass} source={source} method={method} fetchedAt={fetchedAt} freshness={freshness} isFallback={isFallback}>
            <span style={{ color: accent }}>{value}</span>
          </InspectableValue>
        ) : value}
      </div>
    </div>
  );
}

/* ─── Table Styles ─── */
const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-client-text-dim)",
  textAlign: "left",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  whiteSpace: "nowrap",
  background: "rgba(12,12,18,0.95)",
  backdropFilter: "blur(8px)",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: 12,
  color: "var(--color-client-text)",
  whiteSpace: "nowrap",
};
