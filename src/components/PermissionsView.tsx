"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { MCUser } from "@/data/settings-users";
import type { MCRole } from "@/data/settings-roles";
import { STATUS_COLORS } from "@/data/settings-roles";
import RacketIcon from "@/components/RacketIcon";
import { useResponsive } from "@/lib/useMediaQuery";
import { getSupabaseAuthHeaders } from "@/lib/supabase/client";
import { resolveUserAvatar } from "@/lib/userAvatar";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
// PermissionsView uses dynamic agent-based columns — not compatible with StandardTable (fixed schema)
// Keeping direct ColumnFilterDropdown + useColumnOrder usage intentionally
import { ColumnFilterDropdown } from "@/components/ColumnFilterDropdown";
import { useColumnOrder } from "@/lib/useColumnOrder";
import { useColumnFilters } from "@/lib/useColumnFilters";
import { InspectableValue, AsteriskNote } from "@/components/ProvenanceSystem";
import { TableManagement } from "@/components/TableManagement";
import {
  agentPermissions,
  TOOL_FAMILIES,
  SENSITIVE_TOOLS,
  GLOBAL_AUDIT_EVENTS,
  RECOMMENDED_PERMISSIONS,
  AGENT_EMAIL_MAP,
  AGENT_WORKSPACE_MAP,
  TOOL_SETUP_GUIDES,
  getAccessLevel,
  getPermissionEntries,
  type AccessLevel,
  type AgentPermissions,
  type PermissionEntry,
  type SubAccount,
  computeLifecycleMetrics,
  type AuditReasonTag,
  type LifecycleHealth,
  type ToolFamily,
} from "@/data/permissions";

/* ─── Color / label helpers ─── */
const LEVEL_COLORS: Record<AccessLevel, { bg: string; text: string; label: string }> = {
  none:     { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.25)", label: "—" },
  read:     { bg: "rgba(96,165,250,0.12)",  text: "rgb(96,165,250)",       label: "Read" },
  write:    { bg: "rgba(52,211,153,0.12)",  text: "rgb(52,211,153)",       label: "Write" },
  elevated: { bg: "rgba(232,67,147,0.12)",  text: "rgb(232,67,147)",       label: "Elevated" },
  unknown:  { bg: "rgba(251,191,36,0.12)",  text: "rgb(251,191,36)",       label: "?" },
};

const LEVEL_PILL_LABELS: Record<AccessLevel, string> = {
  none: "None",
  read: "Read",
  write: "Write",
  elevated: "Elevated",
  unknown: "Unknown",
};

const SOURCE_LABELS: Record<string, string> = {
  verified: "Verified",
  config: "Config",
  oauth: "OAuth",
  inferred: "Inferred",
  manual: "Manual",
  unknown: "Unknown",
};

const SOURCE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  verified: { bg: "rgba(52,211,153,0.12)", text: "rgb(52,211,153)" },
  oauth:    { bg: "rgba(96,165,250,0.12)", text: "rgb(96,165,250)" },
  config:   { bg: "rgba(96,165,250,0.08)", text: "rgba(96,165,250,0.6)" },
  inferred: { bg: "rgba(251,191,36,0.12)", text: "rgb(251,191,36)" },
  manual:   { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" },
  unknown:  { bg: "rgba(239,68,68,0.12)", text: "rgb(239,68,68)" },
};

const AUTH_COLORS: Record<string, string> = {
  healthy: "rgb(52,211,153)",
  expired: "rgb(251,191,36)",
  missing: "rgb(239,68,68)",
  "n/a": "rgba(255,255,255,0.2)",
};

const SEVERITY_META = {
  info: { color: "rgb(96,165,250)", label: "Routine" },
  elevated: { color: "rgb(251,191,36)", label: "Notable" },
  critical: { color: "rgb(232,67,147)", label: "Critical" },
} as const;

const LIFECYCLE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  "healthy":        { bg: "rgba(52,211,153,0.10)", text: "rgb(52,211,153)", label: "Healthy" },
  "expiring-soon":  { bg: "rgba(251,191,36,0.10)", text: "rgb(251,191,36)", label: "Expiring Soon" },
  "expired":        { bg: "rgba(239,68,68,0.10)",  text: "rgb(239,68,68)",  label: "Expired" },
  "stale-review":   { bg: "rgba(251,191,36,0.10)", text: "rgb(251,191,36)", label: "Stale Review" },
  "unknown":        { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.4)", label: "Unknown" },
};

const REASON_TAG_COLORS: Record<string, { bg: string; text: string }> = {
  sensitive: { bg: "rgba(232,67,147,0.10)", text: "rgb(232,67,147)" },
  auth:      { bg: "rgba(96,165,250,0.10)", text: "rgb(96,165,250)" },
  elevated:  { bg: "rgba(251,191,36,0.10)", text: "rgb(251,191,36)" },
  verified:  { bg: "rgba(52,211,153,0.10)", text: "rgb(52,211,153)" },
  "needs review": { bg: "rgba(239,68,68,0.10)", text: "rgb(239,68,68)" },
};

type FilterMode = "all" | "elevated" | "write" | "risks" | "needs-review";
const USER_MANAGEMENT_ROLE_IDS = ["role-admin", "role-viewer"];

/* ─── Access posture helper (algorithmic: count per level) ─── */
function getAccessPosture(agent: AgentPermissions): { label: string; color: string; bg: string } {
  const total = agent.permissions.length;
  const counts = { elevated: 0, write: 0, read: 0, none: 0, unknown: 0 };
  for (const p of agent.permissions) {
    counts[p.level] = (counts[p.level] || 0) + 1;
  }

  if (counts.elevated > 0)
    return { label: "Elevated Access", color: "rgb(232,67,147)", bg: "rgba(232,67,147,0.1)" };

  if (counts.write > 0)
    return { label: "Write-Capable", color: "rgb(52,211,153)", bg: "rgba(52,211,153,0.1)" };

  if (counts.read > 0 && counts.read >= total * 0.5)
    return { label: "Read-Heavy", color: "rgb(96,165,250)", bg: "rgba(96,165,250,0.1)" };

  if (counts.none >= total * 0.5)
    return { label: "Minimal", color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.04)" };

  return { label: "Minimal", color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.04)" };
}

/* ─── Needs Review check (comprehensive) ─── */
function agentNeedsReview(agent: AgentPermissions): boolean {
  const posture = getAccessPosture(agent);
  if (posture.label === "Elevated Access") return true;

  return agent.permissions.some(
    (p) =>
      p.level === "elevated" ||
      (p.level === "write" && (p.tool === "Gmail" || p.tool === "Shell")) ||
      p.source === "unknown" ||
      p.source === "inferred" ||
      p.authState === "expired" ||
      p.authState === "missing"
  );
}

/* ─── Review reason helper ─── */
function getReviewReasons(agent: AgentPermissions): string[] {
  const reasons: string[] = [];
  if (agent.permissions.some((p) => p.level === "elevated" && p.tool === "Shell"))
    reasons.push("Elevated shell access");
  else if (agent.permissions.some((p) => p.level === "elevated"))
    reasons.push("Elevated access");
  if (agent.permissions.some((p) => p.tool === "Gmail" && p.level === "write"))
    reasons.push("Write email access");
  if (agent.permissions.some((p) => p.level !== "none" && p.source === "unknown"))
    reasons.push("Unverified scope");
  if (agent.permissions.some((p) => p.level !== "none" && p.source === "inferred"))
    reasons.push("Inferred permissions");
  if (agent.permissions.some((p) => p.level !== "none" && p.source === "oauth" && (p.authState === "expired" || p.authState === "missing")))
    reasons.push("Unverified OAuth");
  if (agent.permissions.some((p) => p.authState === "expired"))
    reasons.push("Expired auth");
  if (agent.permissions.some((p) => p.authState === "missing"))
    reasons.push("Missing auth");
  return reasons;
}

/* ─── Sort types & helpers ─── */
type SortDirection = "asc" | "desc";
type SortColumn = "agent" | (typeof TOOL_FAMILIES)[number];
type SortState = { column: SortColumn; direction: SortDirection } | null;

const ACCESS_RANK: Record<AccessLevel, number> = {
  elevated: 4,
  write: 3,
  read: 2,
  unknown: 1,
  none: 0,
};

function nextSortState(current: SortState, column: SortColumn): SortState {
  if (!current || current.column !== column) return { column, direction: "asc" };
  if (current.direction === "asc") return { column, direction: "desc" };
  return null; // clear
}

export function PermissionsView() {
  const { isMobile, isTablet } = useResponsive();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get("tab") === "users" ? "users" : "agents";
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Deep-link: auto-expand agent from URL param
  useEffect(() => {
    const agentId = searchParams.get("agent");
    if (agentId) setExpandedAgent(agentId);
  }, [searchParams]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortState>(null);
  const [sensitiveOnly, setSensitiveOnly] = useState(true);
  const [auditExpanded, setAuditExpanded] = useState(false);

  // Live model data for agent column
  const [liveModels, setLiveModels] = useState<Record<string, {
    primary: string; primaryRaw: string; provider: string;
    fallbacks: string[]; fallbacksRaw: string[];
  }> | null>(null);

  useEffect(() => {
    fetch("/api/agents/models")
      .then((r) => r.json())
      .then((data) => { if (data.ok && data.models) setLiveModels(data.models); })
      .catch(() => {});
  }, []);

  // Live audit events from API
  const [liveAuditEvents, setLiveAuditEvents] = useState<Array<{
    id: string;
    timestamp: string;
    agentId: string;
    agentName: string;
    tool: string;
    action: string;
    detail: string;
    source: "auto" | "manual";
    severity?: "info" | "elevated" | "critical";
    actor?: string;
  }>>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const fetchAuditEvents = useCallback(async () => {
    try {
      setAuditLoading(true);
      const res = await fetch("/api/permissions/audit?limit=50");
      if (res.ok) {
        const data = await res.json();
        setLiveAuditEvents(data.events || []);
      }
    } catch {
      // silent fail — fall back to seeded data
    } finally {
      setAuditLoading(false);
    }
  }, []);

  // Load audit events when section is expanded
  useEffect(() => {
    if (auditExpanded) fetchAuditEvents();
  }, [auditExpanded, fetchAuditEvents]);

  const visibleTools = useMemo<readonly ToolFamily[]>(
    () => sensitiveOnly ? SENSITIVE_TOOLS : TOOL_FAMILIES,
    [sensitiveOnly]
  );

  // Matrix table: column order + filters
  const matrixDefaultCols = useMemo(() => [
    { key: "agent", label: "Agent" },
    ...visibleTools.map((t) => ({ key: t, label: t }))
  ], [visibleTools]);
  const { orderedColumns: matrixCols, dragHandlers: matrixDragHandlers, reorderColumns: reorderMatrixCols } = useColumnOrder("permissions-matrix", matrixDefaultCols);
  const { filters: matrixFilters, setFilter: setMatrixFilter, clearAll: clearMatrixFilters, activeFilterCount: matrixFilterCount, passesFilters: matrixPassesFilters } = useColumnFilters();

  const getMatrixCellValue = useCallback((agent: AgentPermissions, key: string) => {
    if (key === "agent") return agent.agentId;
    const level = getAccessLevel(agent.agentId, key as ToolFamily);
    // If level is "none" but the tool is recommended for this agent, display value is "Setup"
    if (level === "none" && (RECOMMENDED_PERMISSIONS[agent.agentId] || []).includes(key as ToolFamily)) {
      return "Setup";
    }
    return LEVEL_COLORS[level]?.label ?? level;
  }, []);

  const matrixColumnValues = useMemo(() => {
    const vals: Record<string, string[]> = {};
    for (const col of matrixDefaultCols) {
      const unique = new Set<string>();
      for (const a of agentPermissions) unique.add(getMatrixCellValue(a, col.key));
      vals[col.key] = [...unique];
    }
    return vals;
  }, [matrixDefaultCols, getMatrixCellValue]);

  /* ─── Workforce command strip calculations ─── */
  const workforceStats = useMemo(() => {
    const isParked = (a: AgentPermissions) =>
      a.permissions.some((p) => p.notes?.includes("PARKED"));
    const operating = agentPermissions.filter((a) => !isParked(a)).length;
    const total = agentPermissions.length;
    return { operating, total };
  }, []);

  /* ─── Highest risk agent ─── */
  const highestRisk = useMemo(() => {
    let best: { agent: AgentPermissions; score: number; reasons: string[] } | null = null;

    for (const agent of agentPermissions) {
      let score = 0;
      const reasons: string[] = [];
      for (const p of agent.permissions) {
        if (p.level === "elevated") { score += 3; }
        if (p.level === "write") { score += 2; }
        if (p.source === "inferred" || p.source === "unknown") { score += 1; }
      }
      if (agent.permissions.some((p) => p.level === "elevated" && p.tool === "Shell"))
        reasons.push("elevated shell");
      if (agent.permissions.some((p) => p.level === "write" && p.tool === "Gmail"))
        reasons.push("write email");
      if (agent.permissions.some((p) => p.level === "write" && p.tool === "Klaviyo"))
        reasons.push("write klaviyo");
      if (agent.permissions.some((p) => (p.source === "inferred" || p.source === "unknown") && p.level !== "none"))
        reasons.push("unverified scopes");

      if (!best || score > best.score) {
        best = { agent, score, reasons };
      }
    }
    return best!;
  }, []);

  /* ─── Filtered agents ─── */
  const filteredAgents = useMemo(() => {
    let result: AgentPermissions[];
    if (filter === "all") result = [...agentPermissions];
    else if (filter === "elevated")
      result = agentPermissions.filter((a) =>
        a.permissions.some((p) => p.level === "elevated")
      );
    else if (filter === "write")
      result = agentPermissions.filter((a) =>
        a.permissions.some((p) => p.level === "write")
      );
    else if (filter === "needs-review")
      result = agentPermissions.filter(agentNeedsReview);
    else
      result = agentPermissions.filter((a) =>
        a.permissions.some(
          (p) =>
            p.level === "elevated" ||
            (p.tool === "Gmail" && p.level === "write") ||
            (p.level !== "none" && (p.source === "inferred" || p.source === "unknown")) ||
            p.authState === "expired" ||
            p.authState === "missing"
        )
      );

    if (sort) {
      const dir = sort.direction === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => {
        if (sort.column === "agent") {
          return dir * a.agentName.localeCompare(b.agentName);
        }
        const lvlA = ACCESS_RANK[getAccessLevel(a.agentId, sort.column)];
        const lvlB = ACCESS_RANK[getAccessLevel(b.agentId, sort.column)];
        return dir * (lvlA - lvlB);
      });
    }

    return result;
  }, [filter, sort]);

  const matrixFilteredAgents = useMemo(() => {
    if (matrixFilterCount === 0) return filteredAgents;
    return filteredAgents.filter((agent) => matrixPassesFilters((colKey) => getMatrixCellValue(agent, colKey)));
  }, [filteredAgents, matrixFilterCount, matrixPassesFilters, getMatrixCellValue]);

  const needsReviewCount = useMemo(
    () => agentPermissions.filter(agentNeedsReview).length,
    []
  );

  return (
    <div style={{ padding: isMobile ? "20px 14px" : "32px 36px", maxWidth: activeTab === "users" ? "none" : 1400, width: "100%" }}>
      {/* ─── Header ─── */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--color-client-text)",
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Permissions &amp; Access
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-client-text-dim)",
          }}
        >
          Central view of agent access across all tools and systems
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { key: "users", label: "Users" },
          { key: "agents", label: "Agent Matrix" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => router.push(tab.key === "users" ? "/permissions?tab=users" : "/permissions")}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: activeTab === tab.key ? "1px solid rgba(232,67,147,0.35)" : "1px solid rgba(255,255,255,0.08)",
              background: activeTab === tab.key ? "rgba(232,67,147,0.12)" : "rgba(255,255,255,0.03)",
              color: activeTab === tab.key ? "rgb(232,67,147)" : "var(--color-client-text-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" ? (
        <PermissionsUsersPanel />
      ) : (
        <>

      {/* ─── Workforce Command Strip ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          flexWrap: isMobile ? "wrap" : undefined,
          marginBottom: 16,
          borderRadius: 12,
          background: "linear-gradient(135deg, rgba(18,18,28,0.95) 0%, rgba(22,22,34,0.9) 100%)",
          border: "1px solid rgba(255,255,255,0.04)",
          padding: "24px 0",
          overflow: "hidden",
        }}
      >
        {/* Agents Operating */}
        <div style={{ flex: isMobile ? "1 1 calc(50% - 1px)" : 1, padding: isMobile ? "0 16px 16px" : "0 28px", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InspectableValue value={`${workforceStats.operating} of ${workforceStats.total}`} sourceClass="CONFIG" source="Static agent configuration data" method="Count of configured agents">
              <span style={{ fontSize: 19, fontWeight: 700, color: "rgba(255,255,255,0.95)", fontVariantNumeric: "tabular-nums" }}>
                {workforceStats.operating} of {workforceStats.total}
              </span>
            </InspectableValue>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgb(52,211,153)", flexShrink: 0 }} />
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            Agents Operating
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, lineHeight: 1.3 }}>
            All configured agents currently operating
          </div>
        </div>

        {/* Requiring Attention */}
        <div
          style={{ flex: isMobile ? "1 1 calc(50% - 1px)" : 1, padding: isMobile ? "0 16px 16px" : "0 28px", borderRight: "1px solid rgba(255,255,255,0.04)", cursor: needsReviewCount > 0 ? "pointer" : "default", borderRadius: 4, transition: "background 0.15s" }}
          onClick={() => { if (needsReviewCount > 0) setFilter("needs-review"); }}
          onMouseEnter={(e) => { if (needsReviewCount > 0) (e.currentTarget as HTMLElement).style.background = "rgba(251,191,36,0.04)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InspectableValue value={needsReviewCount} sourceClass="CONFIG" source="Static agent configuration data" method="Computed from permission entries flagged for review">
              <span style={{ fontSize: 19, fontWeight: 700, color: needsReviewCount > 0 ? "rgb(251,191,36)" : "rgba(255,255,255,0.95)", fontVariantNumeric: "tabular-nums" }}>
                {needsReviewCount}
              </span>
            </InspectableValue>
            {needsReviewCount > 0 && (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "rgb(251,191,36)", flexShrink: 0 }} />
            )}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            Requiring Attention
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, lineHeight: 1.3 }}>
            Elevated or unverified access detected
          </div>
        </div>

        {/* Highest Risk */}
        <div
          style={{ flex: isMobile ? "1 1 calc(50% - 1px)" : 1.4, padding: isMobile ? "0 16px 16px" : "0 28px", borderRight: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", borderRadius: 4, transition: "background 0.15s" }}
          onClick={() => {
            setExpandedAgent(highestRisk.agent.agentId);
            setTimeout(() => {
              document.querySelector(`tr[data-agent-id="${highestRisk.agent.agentId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(232,67,147,0.04)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <InspectableValue value={highestRisk.agent.agentName} sourceClass="CONFIG" source="Static agent configuration data" method="Agent with broadest access surface (algorithmically ranked)">
            <div style={{ fontSize: 19, fontWeight: 700, color: "rgb(232,67,147)", lineHeight: 1.2 }}>
              {highestRisk.agent.agentName}
            </div>
          </InspectableValue>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            Highest Risk
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, lineHeight: 1.3 }}>
            Broadest access surface across tools
          </div>
        </div>

        {/* Last Audit */}
        <div style={{ flex: isMobile ? "1 1 calc(50% - 1px)" : 0.8, padding: isMobile ? "0 16px" : "0 28px" }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: "rgb(251,191,36)", fontVariantNumeric: "tabular-nums" }}>
            Never
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            Last Audit
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4, lineHeight: 1.3 }}>
            No manual review on record
          </div>
        </div>
      </div>

      {/* ─── Highest Risk Spotlight ─── */}
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(135deg, rgba(232,67,147,0.04) 0%, rgba(12,12,18,0.8) 40%)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderLeft: "3px solid rgba(232,67,147,0.6)",
          padding: isMobile ? "20px 18px" : "24px 28px",
          marginBottom: 20,
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          gap: isMobile ? 16 : 24,
          boxShadow: "0 4px 24px rgba(232,67,147,0.15), 0 1px 4px rgba(232,67,147,0.08)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: "rgba(255,255,255,0.95)", marginBottom: 8, letterSpacing: "-0.01em" }}>
            {highestRisk.agent.agentName}
          </div>
          <div style={{ fontSize: 12, color: "rgba(232,67,147,0.85)", marginBottom: 10, lineHeight: 1.4 }}>
            {(() => {
              const reasons: string[] = [];
              if (highestRisk.agent.permissions.some((p) => p.level === "elevated" && p.tool === "Shell"))
                reasons.push("Elevated shell access");
              if (highestRisk.agent.permissions.some((p) => p.level === "write" && p.tool === "Gmail")) {
                const gmailScope = highestRisk.agent.permissions.find((p) => p.tool === "Gmail" && p.level === "write")?.scope;
                reasons.push(`Write email from ${gmailScope || "unknown"}`);
              }
              return (
                <>
                  <span style={{ marginRight: 5 }}>⚠</span>
                  {reasons.join(" + ")}
                </>
              );
            })()}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>Trust</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgb(251,191,36)" }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgb(251,191,36)" }}>Mixed</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>Posture</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: getAccessPosture(highestRisk.agent).color }}>
                {getAccessPosture(highestRisk.agent).label === "Elevated Access" ? "Sensitive" : getAccessPosture(highestRisk.agent).label}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            setExpandedAgent(highestRisk.agent.agentId);
            setTimeout(() => {
              document.querySelector(`tr[data-agent-id="${highestRisk.agent.agentId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 50);
          }}
          style={{
            padding: "9px 22px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            background: "rgba(232,67,147,0.2)",
            color: "rgb(232,67,147)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(232,67,147,0.3)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(232,67,147,0.2)"; }}
        >
          Review Now
        </button>
      </div>

      {/* ─── Credential Lifecycle Metrics Strip (secondary to command strip) ─── */}
      {(() => {
        const lm = computeLifecycleMetrics();
        const metrics = [
          { label: "Never Reviewed", value: lm.neverReviewed, color: "rgb(251,191,36)", priority: true },
          { label: "Expired", value: lm.expired, color: "rgb(239,68,68)", priority: true },
          { label: "Expiring Soon", value: lm.expiringSoon, color: "rgb(251,191,36)", priority: false },
          { label: "Refreshed Recently", value: lm.refreshedRecently, color: "rgb(52,211,153)", priority: false },
          { label: "Unknown Lifecycle", value: lm.unknownLifecycle, color: "rgba(255,255,255,0.4)", priority: false },
        ];
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 0, marginBottom: 16, borderRadius: 10,
            background: "rgba(12,12,18,0.5)",
            border: "1px solid rgba(255,255,255,0.03)", padding: "12px 0", overflow: "hidden",
            flexWrap: isMobile ? "wrap" : undefined,
          }}>
            <div style={{ padding: isMobile ? "0 16px 8px" : "0 16px", fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", minWidth: isMobile ? "100%" : 100, borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.04)", borderBottom: isMobile ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              Credential<br/>Lifecycle
            </div>
            {metrics.map((m, i) => (
              <div key={m.label} style={{
                flex: isMobile ? "1 1 calc(50% - 1px)" : 1, padding: isMobile ? "8px 16px" : "0 16px",
                borderRight: i < metrics.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
              }}>
                <InspectableValue value={m.value} sourceClass="SEEDED" source="Seeded credential lifecycle data" method="Computed from seeded permission metadata">
                  <div style={{ fontSize: m.priority ? 18 : 15, fontWeight: m.priority ? 700 : 600, color: m.value > 0 ? m.color : "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>
                    {m.value}
                  </div>
                </InspectableValue>
                <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: m.priority && m.value > 0 ? `${m.color}90` : "rgba(255,255,255,0.25)", marginTop: 2 }}>
                  {m.label}
                </div>
              </div>
            ))}
            <div style={{ padding: "0 12px" }}>
              <span style={{ fontSize: 8, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.15)", fontWeight: 500 }}>SEEDED</span>
            </div>
          </div>
        );
      })()}

      {/* ─── Audit Trail (collapsible, live + seeded) ─── */}
      <AuditTrailPanel
        expanded={auditExpanded}
        onToggle={() => setAuditExpanded((v) => !v)}
        liveEvents={liveAuditEvents}
        loading={auditLoading}
        onRefresh={fetchAuditEvents}
      />

      {/* ─── Quick Filters (moved above matrix) ─── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {(
          [
            ["all", "Show all", undefined],
            ["elevated", "Show only elevated", undefined],
            ["write", "Show only write", undefined],
            ["risks", "Show risks", undefined],
            ["needs-review", `Needs Review (${needsReviewCount})`, "amber"],
          ] as [FilterMode, string, string | undefined][]
        ).map(([key, label, variant]) => {
          const isAmber = variant === "amber";
          const isActive = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                border: isActive
                  ? isAmber
                    ? "1px solid rgba(251,191,36,0.4)"
                    : "1px solid rgba(96,165,250,0.4)"
                  : isAmber
                  ? "1px solid rgba(251,191,36,0.25)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: isActive
                  ? isAmber
                    ? "rgba(251,191,36,0.15)"
                    : "rgba(96,165,250,0.1)"
                  : isAmber
                  ? "rgba(251,191,36,0.06)"
                  : "rgba(255,255,255,0.03)",
                color: isActive
                  ? isAmber
                    ? "rgb(251,191,36)"
                    : "rgb(96,165,250)"
                  : isAmber
                  ? "rgb(251,191,36)"
                  : "var(--color-client-text-secondary)",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
        {/* Sensitive Only pill */}
        <button
          onClick={() => setSensitiveOnly((v) => !v)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            border: sensitiveOnly ? "1px solid rgba(96,165,250,0.4)" : "1px solid rgba(255,255,255,0.08)",
            background: sensitiveOnly ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.03)",
            color: sensitiveOnly ? "rgb(96,165,250)" : "var(--color-client-text-secondary)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Sensitive Only
        </button>
      </div>
      {sensitiveOnly && (
        <div style={{ fontSize: 11, color: "rgba(96,165,250,0.6)", marginBottom: 14, marginTop: -10 }}>
          Showing {SENSITIVE_TOOLS.length} sensitive systems · Toggle to see all {TOOL_FAMILIES.length}
        </div>
      )}

      {/* ─── Access Matrix ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>ACCESS MATRIX</SectionLabel>
        {!isMobile && (
          <TableManagement
            columns={matrixCols}
            onReorder={reorderMatrixCols}
            onReset={() => reorderMatrixCols(matrixDefaultCols)}
          />
        )}
      </div>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
          {filteredAgents.map((agent) => (
            <MobileAgentCard
              key={agent.agentId}
              agent={agent}
              isExpanded={expandedAgent === agent.agentId}
              visibleTools={visibleTools}
              onToggle={() => { setExpandedAgent(expandedAgent === agent.agentId ? null : agent.agentId); }}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.04)",
            background: "rgba(12,12,18,0.6)",
            marginBottom: 32,
          }}
        >
          {matrixFilterCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 12px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: "#4ade80" }}>{matrixFilterCount} filter{matrixFilterCount > 1 ? "s" : ""} active</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>· {matrixFilteredAgents.length} of {filteredAgents.length} shown</span>
              <button onClick={clearMatrixFilters} style={{ marginLeft: "auto", background: "none", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Clear all</button>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isTablet ? 700 : 900 }}>
            <thead>
              <tr>
                {matrixCols.map((col, i) => (
                  <th key={col.key} style={{ padding: 0, textAlign: col.key === "agent" ? "left" : "center", ...(col.key === "agent" && i === 0 ? { position: "sticky" as const, left: 0, zIndex: 5, background: "rgba(12,12,18,0.98)", boxShadow: "2px 0 8px rgba(0,0,0,0.3)" } : col.key !== "agent" ? { minWidth: 80 } : {}) }}>
                    <ColumnFilterDropdown
                      colKey={col.key}
                      label={col.label}
                      allValues={matrixColumnValues[col.key] ?? []}
                      activeFilter={matrixFilters[col.key]}
                      sortKey={sort?.column ?? ""}
                      sortDir={sort?.direction ?? "asc"}
                      onSort={(k) => setSort(prev => prev?.column === k ? (prev.direction === "asc" ? { column: k as SortColumn, direction: "desc" } : null) : { column: k as SortColumn, direction: "asc" })}
                      onFilter={setMatrixFilter}
                      dragProps={matrixDragHandlers(i)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixFilteredAgents.map((agent) => (
                <AgentMatrixRow
                  key={agent.agentId}
                  agent={agent}
                  isExpanded={expandedAgent === agent.agentId}
                  showReviewReason={filter === "needs-review"}
                  visibleTools={visibleTools}
                  orderedToolKeys={matrixCols.map((c) => c.key)}
                  isTablet={isTablet}
                  onToggle={() => {
                    setExpandedAgent(
                      expandedAgent === agent.agentId ? null : agent.agentId
                    );
                  }}
                  modelData={liveModels?.[agent.agentId] || null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Agent Detail: right-side slide panel ─── */}
      {expandedAgent && (() => {
        const selectedAgent = agentPermissions.find((a) => a.agentId === expandedAgent);
        if (!selectedAgent) return null;
        return (
          <AgentDetailSlidePanel
            agent={selectedAgent}
            onClose={() => setExpandedAgent(null)}
            modelData={liveModels?.[expandedAgent] || null}
          />
        );
      })()}

      <AsteriskNote />
        </>
      )}
    </div>
  );
}

function formatUserDate(value?: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatUserRoleName(role: MCRole | undefined, roleId: string) {
  if (roleId === "role-viewer") return "View Only";
  return role?.name ?? roleId;
}

function UserRolePicker({
  roles,
  value,
  onChange,
  compact = false,
}: {
  roles: MCRole[];
  value: string;
  onChange: (roleId: string) => void;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: compact ? 6 : 10 }}>
      {roles.map((role) => {
        const selected = value === role.id;
        const label = formatUserRoleName(role, role.id);
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onChange(role.id)}
            aria-pressed={selected}
            style={{
              textAlign: "center",
              padding: compact ? "0 9px" : "11px 12px",
              borderRadius: 8,
              border: selected ? "1px solid rgba(218,218,219,0.58)" : "1px solid rgba(255,255,255,0.08)",
              background: selected ? "rgba(218,218,219,0.18)" : "rgba(255,255,255,0.035)",
              color: selected ? "rgb(255,115,115)" : "var(--color-client-text)",
              cursor: "pointer",
              display: "grid",
              alignItems: "center",
              justifyItems: "center",
              gap: compact ? 0 : 4,
              minHeight: compact ? 48 : undefined,
            }}
          >
            <span style={{ fontSize: compact ? 11 : 13, fontWeight: 750 }}>{label}</span>
            {!compact && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.35 }}>{role.description}</span>}
          </button>
        );
      })}
    </div>
  );
}

function PermissionsUsersPanel() {
  const [users, setUsers] = useState<MCUser[]>([]);
  const [roles, setRoles] = useState<MCRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("role-viewer");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const authHeaders = await getSupabaseAuthHeaders();
      const [usersRes, rolesRes] = await Promise.all([
        fetch("/api/settings/users", { headers: authHeaders }),
        fetch("/api/settings/roles", { headers: authHeaders }),
      ]);
      if (!usersRes.ok) throw new Error((await usersRes.json().catch(() => ({}))).error || "Unable to load users");
      if (!rolesRes.ok) throw new Error((await rolesRes.json().catch(() => ({}))).error || "Unable to load roles");
      setUsers(await usersRes.json());
      setRoles(await rolesRes.json());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Supabase users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const userManagementRoles = useMemo(
    () => roles.filter((role) => USER_MANAGEMENT_ROLE_IDS.includes(role.id)),
    [roles],
  );
  const roleName = useCallback((roleId: string) => formatUserRoleName(roles.find((role) => role.id === roleId), roleId), [roles]);
  const userColumns: StandardTableColumn<MCUser>[] = useMemo(() => [
    {
      key: "user",
      label: "User",
      minWidth: 260,
      thStyle: {
        position: "sticky",
        left: 0,
        zIndex: 6,
        background: "rgba(13,18,30,1)",
        boxShadow: "8px 0 18px rgba(0,0,0,0.28)",
      },
      tdStyle: {
        position: "sticky",
        left: 0,
        zIndex: 3,
        background: "rgba(10,14,22,0.98)",
        boxShadow: "8px 0 18px rgba(0,0,0,0.24)",
      },
      getValue: (user) => user.name || user.email,
      render: (user) => {
        const avatar = resolveUserAvatar(user);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(232,67,147,0.15)", display: "grid", placeItems: "center", color: "rgb(232,67,147)", fontWeight: 700, fontSize: 11, overflow: "hidden", flexShrink: 0 }}>
              {avatar.photoUrl ? <img src={avatar.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : avatar.initials}
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || "—"}</span>
              <button
                onClick={() => {
                  const name = window.prompt("Update display name", user.name);
                  if (name && name.trim() && name !== user.name) updateUser(user.id, { name: name.trim() });
                }}
                title="Rename user"
                aria-label={`Rename ${user.name || user.email}`}
                style={{ width: 22, height: 22, borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.58)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0, fontSize: 12, lineHeight: 1 }}
              >
                ✎
              </button>
            </span>
          </div>
        );
      },
    },
    {
      key: "email",
      label: "Email",
      minWidth: 230,
      getValue: (user) => user.email,
      render: (user) => <span style={{ color: "var(--color-client-text-muted)", overflowWrap: "anywhere" }}>{user.email}</span>,
    },
    {
      key: "user_id",
      label: "User ID",
      minWidth: 210,
      getValue: (user) => user.auth_user_id ?? user.id,
      render: (user) => (
        <span style={{ color: "rgba(255,255,255,0.36)", fontFamily: "var(--font-mono)", fontSize: 11, overflowWrap: "anywhere" }}>
          {user.auth_user_id ?? user.id}
        </span>
      ),
    },
    {
      key: "role",
      label: "Actions",
      minWidth: 190,
      getValue: (user) => roleName(user.role_id),
      getFilterValue: (user) => roleName(user.role_id),
      render: (user) => (
        <div style={{ display: "grid", gap: 8, maxWidth: 180 }}>
          <UserRolePicker roles={userManagementRoles} value={user.role_id} onChange={(roleId) => updateUser(user.id, { role_id: roleId })} compact />
          <button onClick={() => resetPassword(user.id)} style={{ ...permissionsButtonStyle, justifyContent: "center" }}>Reset Password</button>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      minWidth: 120,
      getValue: (user) => user.status,
      render: (user) => {
        const statusColors = STATUS_COLORS[user.status] || STATUS_COLORS.disabled;
        return (
          <button
            onClick={() => updateUser(user.id, { status: user.status === "active" ? "disabled" : "active" })}
            style={{ ...permissionsPillButtonStyle, background: statusColors.bg, color: statusColors.text }}
          >
            {user.status}
          </button>
        );
      },
    },
    {
      key: "last_login",
      label: "Profile Last Login",
      minWidth: 185,
      getValue: (user) => formatUserDate(user.last_login),
      getSortValue: (user) => user.last_login ?? "",
      render: (user) => formatUserDate(user.last_login),
    },
    {
      key: "auth_last_sign_in_at",
      label: "Auth Last Sign-In",
      minWidth: 185,
      getValue: (user) => formatUserDate(user.auth_last_sign_in_at),
      getSortValue: (user) => user.auth_last_sign_in_at ?? "",
      render: (user) => formatUserDate(user.auth_last_sign_in_at),
    },
    {
      key: "confirmed",
      label: "Confirmed",
      minWidth: 185,
      getValue: (user) => user.auth_email_confirmed_at ? formatUserDate(user.auth_email_confirmed_at) : "No",
      getSortValue: (user) => user.auth_email_confirmed_at ?? "",
      render: (user) => user.auth_email_confirmed_at ? formatUserDate(user.auth_email_confirmed_at) : "No",
    },
  ], [roleName, userManagementRoles]);

  async function updateUser(userId: string, patch: Partial<MCUser>) {
    setMessage("");
    setError("");
    try {
      const authHeaders = await getSupabaseAuthHeaders();
      const response = await fetch(`/api/settings/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Unable to update user");
      await loadUsers();
      setMessage("User updated in Supabase.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update user");
    }
  }

  async function resetPassword(userId: string) {
    setMessage("");
    setError("");
    try {
      const authHeaders = await getSupabaseAuthHeaders();
      const response = await fetch(`/api/settings/users/${userId}/reset-password`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to send password reset");
      setMessage(`Password reset sent to ${data.email}.`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to send password reset");
    }
  }

  async function inviteUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setInviteSubmitting(true);
    try {
      const authHeaders = await getSupabaseAuthHeaders();
      const response = await fetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          role_id: inviteRole,
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Unable to invite user");
      setInviteEmail("");
      setInviteName("");
      setInviteRole("role-viewer");
      setShowInvite(false);
      await loadUsers();
      setMessage("User invite created in Supabase.");
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unable to invite user");
    } finally {
      setInviteSubmitting(false);
    }
  }

  if (loading) {
    return <div style={{ color: "var(--color-client-text-muted)", padding: 32 }}>Loading Supabase users...</div>;
  }

  return (
    <div>
      <div style={{
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-client-text)" }}>User Management</div>
            <div style={{ fontSize: 12, color: "var(--color-client-text-dim)", marginTop: 3 }}>
              Invite users, assign access, and manage Mission Control accounts.
            </div>
          </div>
        </div>

        {message && <div style={{ padding: "10px 18px", color: "rgb(134,239,172)", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{message}</div>}
        {error && <div style={{ padding: "10px 18px", color: "rgb(248,113,113)", fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{error}</div>}
        {showInvite && (
          <form onSubmit={inviteUser} style={{ padding: 18, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.018)", display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Email</span>
                <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.invalid" style={permissionsInputStyle} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Name</span>
                <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Full name" style={permissionsInputStyle} />
              </label>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Role</span>
              <UserRolePicker roles={userManagementRoles} value={inviteRole} onChange={setInviteRole} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setShowInvite(false)} style={permissionsButtonStyle}>Cancel</button>
              <button type="submit" disabled={inviteSubmitting} style={{ ...permissionsButtonStyle, background: "rgba(218,218,219,0.18)", borderColor: "rgba(218,218,219,0.38)", color: "rgb(255,115,115)" }}>
                {inviteSubmitting ? "Sending..." : "Send Invite"}
              </button>
            </div>
          </form>
        )}

        <StandardTable<MCUser>
          tableKey="permissions-users"
          columns={userColumns}
          data={users}
          getRowKey={(user) => user.id}
          defaultSortKey="user"
          emptyMessage="No Mission Control users found"
          toolbar={(
            <>
              <button onClick={() => setShowInvite((value) => !value)} style={{ ...permissionsButtonStyle, background: "rgba(218,218,219,0.18)", borderColor: "rgba(218,218,219,0.38)", color: "rgb(255,115,115)" }}>
                Invite User
              </button>
              <button onClick={loadUsers} style={permissionsButtonStyle}>Refresh</button>
            </>
          )}
        />
      </div>
    </div>
  );
}

/* ─── Agent Detail Slide Panel ─── */
const SLIDE_PANEL_MIN_WIDTH = 400;
const SLIDE_PANEL_WIDTH_KEY = "permissions-detail-panel-width";

function getSlidePanelDefaultWidth(): number {
  if (typeof window === "undefined") return 700;
  return Math.round(window.innerWidth * 0.55);
}

function getSlidePanelMaxWidth(): number {
  if (typeof window === "undefined") return 1400;
  return Math.round(window.innerWidth * 0.80);
}

function shortModelLabel(name: string): string {
  if (!name) return "?";
  const n = name.toLowerCase();
  if (n.includes("opus-4-6") || n.includes("opus4")) return "opus4.6";
  if (n.includes("sonnet-4-6") || n.includes("sonnet4")) return "sonnet4.6";
  if (n.includes("haiku-4-5") || n.includes("haiku4")) return "haiku4.5";
  if (n.includes("gpt-5.4") || n.includes("gpt5.4")) return "gpt5.4";
  if (n.includes("gemini-3.1-pro")) return "gem3.1pro";
  if (n.includes("gemini-3.1-flash-lite") || n.includes("flash-lite")) return "gem3.1lite";
  if (n.includes("gemini-3-flash") || n.includes("3-flash")) return "gem3flash";
  if (n.includes("gemma4")) return "gemma4";
  if (n.includes("gemini-2.5-pro")) return "gem2.5pro";
  if (n.includes("gemini-2.5-flash")) return "gem2.5flash";
  return name.split("/").pop()?.slice(0, 12) || name.slice(0, 12);
}

function AgentDetailSlidePanel({
  agent,
  onClose,
  modelData,
}: {
  agent: AgentPermissions;
  onClose: () => void;
  modelData: { primary: string; primaryRaw: string; provider: string; fallbacks: string[]; fallbacksRaw: string[] } | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const stableOnClose = useRef(onClose);
  stableOnClose.current = onClose;

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 700;
    const maxWidth = getSlidePanelMaxWidth();
    const defaultWidth = getSlidePanelDefaultWidth();
    try {
      const stored = window.localStorage.getItem(SLIDE_PANEL_WIDTH_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (!isNaN(w) && w >= SLIDE_PANEL_MIN_WIDTH && w <= maxWidth) return w;
      }
    } catch { /* ignore */ }
    return defaultWidth;
  });

  // ESC key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") stableOnClose.current(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Click outside panel to close
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
      stableOnClose.current();
    }
    // Delay so the opening click doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleMouseDown);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  // Persist width
  useEffect(() => {
    try { window.localStorage.setItem(SLIDE_PANEL_WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
  }, [panelWidth]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const maxWidth = getSlidePanelMaxWidth();
      const delta = startX - ev.clientX;
      const newWidth = Math.min(maxWidth, Math.max(SLIDE_PANEL_MIN_WIDTH, startWidth + delta));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  return (
    <>
      {/* Slide panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          zIndex: 201,
          background: "linear-gradient(180deg, rgba(18,18,26,0.99) 0%, rgba(12,12,19,1) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRight: "none",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "permDetailSlideIn 0.22s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "-4px 0 32px rgba(0,0,0,0.4)",
        }}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 3, height: 40, borderRadius: 2, background: "rgba(255,255,255,0.10)" }} />
        </div>

        {/* Header */}
        <div
          style={{
            padding: "20px 20px 16px 20px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 8, letterSpacing: "-0.01em" }}>
                {agent.agentName}
              </div>
              {/* Model info: primary → fallback1 → fallback2 */}
              {modelData && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 5,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "rgba(96,165,250,0.1)",
                      color: "rgb(96,165,250)",
                      fontFamily: "var(--font-mono, monospace)",
                      letterSpacing: "0.01em",
                    }}
                  >
                    {shortModelLabel(modelData.primary)}
                  </span>
                  {modelData.fallbacks.map((fb, i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>→</span>
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: 500,
                          background: "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.35)",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {shortModelLabel(fb)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-client-text-secondary)",
                fontSize: 20,
                lineHeight: 1,
                cursor: "pointer",
                flexShrink: 0,
              }}
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 4px" }}>
          <AgentDetail agent={agent} />
        </div>
      </div>

      <style>{`
        @keyframes permDetailSlideIn {
          from { transform: translateX(100%); opacity: 0.5; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* ─── Matrix row ─── */
function AgentMatrixRow({
  agent,
  isExpanded,
  showReviewReason,
  visibleTools,
  orderedToolKeys,
  isTablet,
  onToggle,
  modelData,
}: {
  agent: AgentPermissions;
  isExpanded: boolean;
  showReviewReason?: boolean;
  visibleTools: readonly ToolFamily[];
  orderedToolKeys?: string[];
  isTablet?: boolean;
  onToggle: () => void;
  modelData?: { primary: string; fallbacks: string[] } | null;
}) {
  // Use ordered keys if provided (from column reorder), otherwise fall back to visibleTools
  const toolRenderOrder = orderedToolKeys
    ? orderedToolKeys.filter((k) => k !== "agent") as ToolFamily[]
    : visibleTools;
  const hasRisk = agent.permissions.some(
    (p) =>
      p.authState === "expired" ||
      p.authState === "missing" ||
      (p.level !== "none" && (p.source === "inferred" || p.source === "unknown"))
  );

  const posture = getAccessPosture(agent);

  // Abbreviate model names for compact display
  function shortModel(name: string): string {
    if (!name) return "?";
    const n = name.toLowerCase();
    if (n.includes("opus-4-6") || n.includes("opus4")) return "opus4.6";
    if (n.includes("sonnet-4-6") || n.includes("sonnet4")) return "sonnet4.6";
    if (n.includes("haiku-4-5") || n.includes("haiku4")) return "haiku4.5";
    if (n.includes("gpt-5.4") || n.includes("gpt5.4")) return "gpt5.4";
    if (n.includes("gemini-3.1-pro")) return "gem3.1pro";
    if (n.includes("gemini-3.1-flash-lite") || n.includes("flash-lite")) return "gem3.1lite";
    if (n.includes("gemini-3-flash") || n.includes("3-flash")) return "gem3flash";
    if (n.includes("gemma4")) return "gemma4";
    if (n.includes("gemini-2.5-pro")) return "gem2.5pro";
    if (n.includes("gemini-2.5-flash")) return "gem2.5flash";
    return name.split("/").pop()?.slice(0, 12) || name.slice(0, 12);
  }

  return (
    <tr
      data-agent-id={agent.agentId}
      onClick={onToggle}
      style={{
        cursor: "pointer",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: isExpanded ? "rgba(96,165,250,0.04)" : "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isExpanded)
          (e.currentTarget as HTMLElement).style.background =
            "rgba(255,255,255,0.035)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = isExpanded
          ? "rgba(96,165,250,0.04)"
          : "transparent";
      }}
    >
      {/* Render all columns in ordered sequence */}
      {(orderedToolKeys || ["agent", ...visibleTools]).map((colKey, colIdx) => {
        if (colKey === "agent") {
          const isFirstCol = colIdx === 0;
          return (
      <td
        key="agent"
        style={{
          padding: "12px 20px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-client-text)",
          whiteSpace: "nowrap",
          minWidth: isTablet ? 150 : 220,
          maxWidth: isTablet ? 150 : undefined,
          ...(isFirstCol ? {
            position: "sticky" as const,
            left: 0,
            zIndex: 5,
            background: isExpanded ? "rgba(12,12,18,0.98)" : "rgba(12,12,18,0.95)",
            boxShadow: "2px 0 8px rgba(0,0,0,0.3)",
          } : {
            background: isExpanded ? "rgba(12,12,18,0.98)" : "rgba(12,12,18,0.95)",
          }),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {agent.agentName}
            {/* Model info */}
            {modelData && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 600,
                    background: "rgba(96,165,250,0.1)",
                    color: "rgb(96,165,250)",
                    letterSpacing: "0.01em",
                    lineHeight: "16px",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {shortModel(modelData.primary)}
                </span>
                {modelData.fallbacks.length > 0 && (
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: 5,
                      fontSize: 9,
                      fontWeight: 500,
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.35)",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    → {shortModel(modelData.fallbacks[0])}
                  </span>
                )}
              </span>
            )}
            {hasRisk && (
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "rgb(251,191,36)",
                  flexShrink: 0,
                }}
              />
            )}
          </span>
          {showReviewReason && (() => {
            const reasons = getReviewReasons(agent);
            if (reasons.length === 0) return null;
            return (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {reasons.map((reason) => (
                  <span
                    key={reason}
                    style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 500,
                      background: "rgba(251,191,36,0.08)",
                      color: "rgba(251,191,36,0.7)",
                      border: "1px solid rgba(251,191,36,0.15)",
                      lineHeight: "16px",
                    }}
                  >
                    {reason}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </td>
          );
        }
        // Tool column
        const tool = colKey as ToolFamily;
        const level = getAccessLevel(agent.agentId, tool);
        const entries = getPermissionEntries(agent.agentId, tool);
        const subAccounts = entries.flatMap((e) => e.subAccounts || []);

        if (subAccounts.length > 0) {
          return (
            <SubAccountCell
              key={tool}
              level={level}
              subAccounts={subAccounts}
              tool={tool}
              agentName={agent.agentName}
            />
          );
        }

        const entry = entries[0];
        return (
          <CellDetailPopover
            key={tool}
            level={level}
            entry={entry}
            tool={tool}
            agentName={agent.agentName}
            agentId={agent.agentId}
          />
        );
      })}
    </tr>
  );
}

/* ─── Mobile agent card (replaces table row on mobile) ─── */
function MobileAgentCard({
  agent,
  isExpanded,
  visibleTools,
  onToggle,
}: {
  agent: AgentPermissions;
  isExpanded: boolean;
  visibleTools: readonly ToolFamily[];
  onToggle: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const posture = getAccessPosture(agent);

  // Split permissions into non-none and none
  const nonNonePerms = agent.permissions.filter(p => p.level !== "none" && visibleTools.includes(p.tool as ToolFamily));
  const nonePerms = agent.permissions.filter(p => p.level === "none" && visibleTools.includes(p.tool as ToolFamily));
  const displayPerms = showAll ? [...nonNonePerms, ...nonePerms] : nonNonePerms;

  return (
    <div
      onClick={onToggle}
      style={{
        borderRadius: 14,
        border: isExpanded ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(255,255,255,0.06)",
        background: isExpanded ? "rgba(96,165,250,0.04)" : "rgba(12,12,18,0.6)",
        padding: "16px 18px",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {/* Header: Name + Posture badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-client-text)" }}>
          {agent.agentName}
        </div>
        <span style={{
          padding: "3px 10px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: posture.bg,
          color: posture.color,
        }}>
          {posture.label}
        </span>
      </div>

      {/* 2-column grid of system: level pairs */}
      {displayPerms.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 12px",
          marginBottom: nonePerms.length > 0 ? 8 : 0,
        }}>
          {displayPerms.map((p) => {
            const c = LEVEL_COLORS[p.level];
            return (
              <div key={p.tool} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{p.tool}</span>
                <span style={{
                  padding: "2px 7px",
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  background: c.bg,
                  color: c.text,
                }}>
                  {c.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Show all systems toggle */}
      {nonePerms.length > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setShowAll(v => !v); }}
          style={{
            padding: "6px 0",
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(96,165,250,0.7)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 10 }}>{showAll ? "\u25BE" : "\u25B8"}</span>
          {showAll ? "Hide inactive systems" : `Show all systems (+${nonePerms.length})`}
        </button>
      )}

      {/* Expand indicator */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 6,
        paddingTop: 8,
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {isExpanded ? "\u25BE Viewing details" : "\u25B8 View full permissions"}
        </span>
      </div>
    </div>
  );
}

/* ─── Single-entry cell detail popover ─── */
function CellDetailPopover({
  level,
  entry,
  tool,
  agentName,
  agentId,
}: {
  level: AccessLevel;
  entry?: PermissionEntry;
  tool: string;
  agentName: string;
  agentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        cellRef.current && !cellRef.current.contains(e.target as Node) &&
        cardRef.current && !cardRef.current.contains(e.target as Node)
      ) { setOpen(false); }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const c = LEVEL_COLORS[level];
  const isNone = level === "none";
  const isRecommended = agentId ? (RECOMMENDED_PERMISSIONS[agentId] || []).includes(tool as ToolFamily) : false;
  const isClickable = !isNone || isRecommended;

  return (
    <td
      ref={cellRef}
      style={{ padding: "12px 4px", textAlign: "center", position: "relative" }}
      onClick={(e) => { e.stopPropagation(); if (isClickable) setOpen((v) => !v); }}
    >
      {isNone && isRecommended ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "3px 10px",
            minWidth: 28,
            height: 24,
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            background: "rgba(251,191,36,0.08)",
            color: "rgb(251,191,36)",
            border: "1px dashed rgba(251,191,36,0.3)",
            letterSpacing: "0.02em",
            cursor: "pointer",
            transition: "box-shadow 0.15s",
            boxShadow: open ? "0 0 0 1px rgb(251,191,36)" : "none",
          }}
        >
          Setup
        </span>
      ) : (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "3px 10px",
            minWidth: 28,
            height: 24,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: c.bg,
            color: c.text,
            letterSpacing: "0.02em",
            cursor: isClickable ? "pointer" : "default",
            transition: "box-shadow 0.15s",
            boxShadow: open ? `0 0 0 1px ${c.text}` : "none",
          }}
        >
          {c.label}
        </span>
      )}

      {open && (isNone && isRecommended ? (
        /* ─── Setup Guide for recommended-but-missing ─── */
        <div
          ref={cardRef}
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            minWidth: 320,
            background: "#1A1A2E",
            border: "1px solid rgba(251,191,36,0.2)",
            borderRadius: 10,
            padding: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
            animation: "subAccountFadeIn 0.15s ease-out",
            textAlign: "left",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgb(251,191,36)" }}>Recommended — Not Connected</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>
            {agentName} should have {tool} access based on their role but it&apos;s not configured yet.
          </div>
          {(() => {
            const guide = TOOL_SETUP_GUIDES[tool];
            if (!guide) return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>No setup guide available for {tool}.</div>;
            const email = agentId ? AGENT_EMAIL_MAP[agentId] : undefined;
            const workspace = agentId ? AGENT_WORKSPACE_MAP[agentId] : undefined;
            return (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>{guide.title}</div>
                <div style={{ fontSize: 10, color: "rgba(96,165,250,0.7)", marginBottom: 8 }}>Method: {guide.method}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  {guide.steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>
                      <span style={{ color: "rgba(96,165,250,0.6)", fontWeight: 600, minWidth: 14 }}>{i + 1}.</span>
                      <span>{step.replace(/\[agent-workspace\]/g, workspace || "[agent-workspace]").replace(/e\.g\.,.*?\)/g, email ? `${email})` : "$&")}</span>
                    </div>
                  ))}
                </div>
                {guide.configPath && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-mono, monospace)" }}>
                    Config: {guide.configPath.replace(/\[agent-workspace\]/g, workspace || "[agent-workspace]")}
                  </div>
                )}
                {guide.notes && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontStyle: "italic", marginTop: 4 }}>{guide.notes}</div>
                )}
              </>
            );
          })()}
        </div>
      ) : entry && (
        <div
          ref={cardRef}
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            minWidth: 300,
            background: "#1A1A2E",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
            animation: "subAccountFadeIn 0.15s ease-out",
            textAlign: "left",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>{tool}</div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{agentName}</span>
          </div>
          {/* Identity */}
          {entry.scope && (
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
              {entry.scope}
            </div>
          )}
          {/* Pills row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: c.bg, color: c.text }}>
              {LEVEL_PILL_LABELS[entry.level]}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: AUTH_COLORS[entry.authState || "n/a"] }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{entry.authState || "n/a"}</span>
            </span>
            {(() => {
              const sb = SOURCE_BADGE_COLORS[entry.source] || SOURCE_BADGE_COLORS.unknown;
              return (
                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600, background: sb.bg, color: sb.text }}>{SOURCE_LABELS[entry.source] || "Unknown"}</span>
              );
            })()}
          </div>
          {/* Detail */}
          {entry.detail && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, lineHeight: 1.4 }}>{entry.detail}</div>
          )}

          {/* Lifecycle section */}
          {(entry.connectedAt || entry.lastRefreshedAt || entry.expiresAt || entry.lastReviewedAt || entry.nextReviewAt || entry.lifecycleHealth) && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, marginTop: 4 }}>
              {entry.lifecycleHealth && (() => {
                const lc = LIFECYCLE_COLORS[entry.lifecycleHealth] || LIFECYCLE_COLORS.unknown;
                return (
                  <div style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600, background: lc.bg, color: lc.text, marginBottom: 6 }}>
                    {lc.label}
                  </div>
                );
              })()}
              {/* Unknown lifecycle explanation */}
              {entry.lifecycleHealth === "unknown" && (
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4, fontStyle: "italic" }}>
                  {entry.source === "config" ? "Config-only record — no OAuth lifecycle tracked" :
                   entry.source === "inferred" ? "Inferred access — no direct lifecycle metadata available" :
                   entry.source === "manual" ? "Manually configured — no review metadata tracked yet" :
                   "Insufficient lifecycle data"}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {entry.connectedAt && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Connected {formatDateShort(entry.connectedAt)}</div>}
                {entry.lastRefreshedAt && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Refreshed {entry.lastRefreshedAt}</div>}
                {entry.refreshCadence && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{entry.refreshCadence}</div>}
                {entry.expiresAt && <div style={{ fontSize: 10, color: entry.lifecycleHealth === "expired" || entry.lifecycleHealth === "expiring-soon" ? "rgb(251,191,36)" : "rgba(255,255,255,0.4)" }}>Expires {entry.expiresAt}</div>}
                {entry.lastReviewedAt && <div style={{ fontSize: 10, color: entry.lastReviewedAt === "Never" ? "rgb(251,191,36)" : "rgba(255,255,255,0.4)", fontWeight: entry.lastReviewedAt === "Never" ? 600 : 400 }}>Reviewed {entry.lastReviewedAt === "Never" ? "Never" : formatDateShort(entry.lastReviewedAt)}</div>}
                {entry.nextReviewAt && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Next review {formatDateShort(entry.nextReviewAt)}</div>}
              </div>
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic", lineHeight: 1.4, marginTop: 6 }}>{entry.notes}</div>
          )}
          {/* Verification marker */}
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: entry.source === "verified" ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)", color: entry.source === "verified" ? "rgb(52,211,153)" : "rgba(255,255,255,0.25)", fontWeight: 500 }}>
              {entry.source === "verified" ? "VERIFIED" : entry.source === "config" ? "FROM CONFIG" : "UNVERIFIED"}
            </span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>Apr 8, 2026</span>
          </div>
        </div>
      ))}
    </td>
  );
}

/* ─── Sub-account expandable cell ─── */
function SubAccountCell({
  level,
  subAccounts,
  tool,
  agentName,
}: {
  level: AccessLevel;
  subAccounts: SubAccount[];
  tool?: string;
  agentName?: string;
}) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        cellRef.current &&
        !cellRef.current.contains(e.target as Node) &&
        cardRef.current &&
        !cardRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, handleClose]);

  const c = LEVEL_COLORS[level];
  const count = subAccounts.length;

  return (
    <td
      ref={cellRef}
      style={{ padding: "12px 4px", textAlign: "center", position: "relative" }}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "3px 10px",
          minWidth: 28,
          height: 24,
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: c.bg,
          color: c.text,
          letterSpacing: "0.02em",
          cursor: "pointer",
          transition: "box-shadow 0.15s",
          boxShadow: open ? `0 0 0 1px ${c.text}` : "none",
        }}
      >
        {c.label}
        <span style={{ fontSize: 10, opacity: 0.8 }}>({count})</span>
        <RacketIcon expanded={open} size={10} color={c.text} />
      </span>

      {open && (
        <div
          ref={cardRef}
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            minWidth: 340,
            background: "#1A1A2E",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: 8,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
            animation: "subAccountFadeIn 0.15s ease-out",
            textAlign: "left",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {tool && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>{tool}</div>
              {agentName && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{agentName}</span>}
            </div>
          )}
          {subAccounts.map((sa, i) => {
            const saColor = LEVEL_COLORS[sa.level];
            const sbColor = SOURCE_BADGE_COLORS[sa.source] || SOURCE_BADGE_COLORS.unknown;
            return (
              <div
                key={sa.account}
                style={{
                  padding: "10px 12px",
                  borderBottom: i < count - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}
              >
                {/* Account email */}
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.95)", marginBottom: 6 }}>
                  {sa.account}
                </div>
                {/* Pills row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  {/* Access level pill */}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 5,
                      fontSize: 10,
                      fontWeight: 600,
                      background: saColor.bg,
                      color: saColor.text,
                    }}
                  >
                    {LEVEL_PILL_LABELS[sa.level]}
                  </span>
                  {/* Auth state dot */}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: AUTH_COLORS[sa.authState || "n/a"],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                      {sa.authState || "n/a"}
                    </span>
                  </span>
                  {/* Source badge */}
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontSize: 9,
                      fontWeight: 600,
                      background: sbColor.bg,
                      color: sbColor.text,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {SOURCE_LABELS[sa.source] || "Unknown"}
                  </span>
                </div>
                {/* Lifecycle */}
                {sa.lifecycleHealth && (() => {
                  const lc = LIFECYCLE_COLORS[sa.lifecycleHealth] || LIFECYCLE_COLORS.unknown;
                  return (
                    <div style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 600, background: lc.bg, color: lc.text, marginBottom: 4 }}>
                      {lc.label}
                    </div>
                  );
                })()}
                {/* Meta row */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: sa.notes ? 4 : 0 }}>
                  {sa.connectedAt && <span>Connected {formatDate(sa.connectedAt)}</span>}
                  {sa.lastRefreshedAt && <span>Refreshed {sa.lastRefreshedAt}</span>}
                  {sa.nextRefresh && <span>{formatRefreshLabel(sa.nextRefresh)}</span>}
                  {sa.lastReviewedAt && <span style={{ color: sa.lastReviewedAt === "Never" ? "rgb(251,191,36)" : undefined, fontWeight: sa.lastReviewedAt === "Never" ? 600 : 400 }}>Reviewed {sa.lastReviewedAt === "Never" ? "Never" : formatDateShort(sa.lastReviewedAt)}</span>}
                  {sa.nextReviewAt && <span>Next review {formatDateShort(sa.nextReviewAt)}</span>}
                </div>
                {/* Notes */}
                {sa.notes && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginTop: 2 }}>
                    {sa.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes subAccountFadeIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </td>
  );
}

/* ─── Audit Trail Panel ─── */
function AuditTrailPanel({
  expanded,
  onToggle,
  liveEvents,
  loading,
  onRefresh,
}: {
  expanded: boolean;
  onToggle: () => void;
  liveEvents: Array<{
    id: string;
    timestamp: string;
    agentId: string;
    agentName: string;
    tool: string;
    action: string;
    detail: string;
    source: "auto" | "manual";
    severity?: "info" | "elevated" | "critical";
    actor?: string;
  }>;
  loading: boolean;
  onRefresh: () => void;
}) {
  // Merge live events with seeded events, live first
  const allEvents = useMemo(() => {
    const live = liveEvents.map((e) => ({
      date: new Date(e.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      description: e.detail,
      severity: (e.severity || "info") as "info" | "elevated" | "critical",
      agentName: e.agentName,
      reasonTag: (e.action === "model_changed" ? "sensitive" : e.source === "auto" ? "verified" : "auth") as AuditReasonTag,
      source: e.source,
      isLive: true,
    }));
    const seeded = GLOBAL_AUDIT_EVENTS.map((e) => ({ ...e, source: "seeded" as const, isLive: false }));
    return [...live, ...seeded];
  }, [liveEvents]);

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(12,12,18,0.6)",
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
            Audit Trail
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {liveEvents.length > 0 ? `${liveEvents.length} live` : ""}{liveEvents.length > 0 && GLOBAL_AUDIT_EVENTS.length > 0 ? " + " : ""}{GLOBAL_AUDIT_EVENTS.length} seeded · Last verified Apr 8, 2026
          </span>
        </div>
        <RacketIcon expanded={expanded} size={16} color="rgba(255,255,255,0.3)" />
      </div>
      {expanded && (
        <div style={{ padding: "0 20px 16px" }}>
          {/* Source note */}
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 12, fontStyle: "italic" }}>
            Verified against openclaw.json, GWS auth, workspace .env files
            {loading && " · Loading live events..."}
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              style={{ marginLeft: 8, background: "none", border: "none", color: "rgba(96,165,250,0.5)", fontSize: 10, cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>
          {allEvents.map((evt, i) => {
            const severityMeta = SEVERITY_META[evt.severity];
            return (
              <div
                key={evt.isLive ? `live-${i}` : `seeded-${i}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: i < allEvents.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: severityMeta.color, flexShrink: 0, marginTop: 6 }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", minWidth: 48, flexShrink: 0 }}>{evt.date}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4, fontWeight: evt.severity === "info" ? 500 : 600 }}>
                    {evt.description}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, background: `${severityMeta.color}15`, color: severityMeta.color, fontWeight: 600 }}>
                      {severityMeta.label}
                    </span>
                    {(() => {
                      const rc = REASON_TAG_COLORS[evt.reasonTag] || REASON_TAG_COLORS.auth;
                      return (
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: rc.bg, color: rc.text, fontWeight: 500 }}>
                          {evt.reasonTag}
                        </span>
                      );
                    })()}
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{evt.agentName}</span>
                    {evt.isLive && (
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,0.08)", color: "rgb(52,211,153)", fontWeight: 500 }}>LIVE</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Format ISO date to operator-friendly readable */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateShort(val: string): string {
  if (!val || val === "Never") return val;
  // If already short like "2h ago", return as-is
  if (val.includes("ago") || val.includes("Just")) return val;
  // Try parsing ISO date
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatRefreshLabel(label: string): string {
  return label
    .replace(/^OAuth token refreshes hourly$/i, "Refreshes hourly")
    .replace(/^Standard OAuth refresh$/i, "Standard refresh");
}

/* ─── Agent detail panel ─── */
function AgentDetail({ agent }: { agent: AgentPermissions }) {
  const detailDefaultCols = [
    { key: "tool", label: "Tool" },
    { key: "level", label: "Level" },
    { key: "scope", label: "Scope" },
    { key: "source", label: "Source" },
    { key: "auth", label: "Auth" },
    { key: "notes", label: "Notes" },
  ];
  const { orderedColumns: detailCols, dragHandlers: detailDragHandlers } = useColumnOrder("permissions-detail", detailDefaultCols);
  const { filters: detailFilters, setFilter: setDetailFilter, clearAll: clearDetailFilters, activeFilterCount: detailFilterCount, passesFilters: detailPassesFilters } = useColumnFilters();
  const [detailSortKey, setDetailSortKey] = useState("");
  const [detailSortDir, setDetailSortDir] = useState<"asc" | "desc">("asc");
  const toggleDetailSort = (key: string) => {
    if (detailSortKey === key) setDetailSortDir(d => d === "asc" ? "desc" : "asc");
    else { setDetailSortKey(key); setDetailSortDir("asc"); }
  };

  const getDetailCellValue = useCallback((p: PermissionEntry, key: string) => {
    switch (key) {
      case "tool": return p.tool;
      case "level": return p.level;
      case "scope": return p.scope ?? "—";
      case "source": return p.source;
      case "auth": return p.authState ?? "unknown";
      case "notes": return p.notes ?? "—";
      default: return "";
    }
  }, []);
  const activePerms = agent.permissions.filter((p) => p.level !== "none");

  const detailColumnValues = useMemo(() => {
    const vals: Record<string, string[]> = {};
    for (const col of detailDefaultCols) {
      const unique = new Set<string>();
      for (const p of activePerms) unique.add(getDetailCellValue(p, col.key));
      vals[col.key] = [...unique];
    }
    return vals;
  }, [activePerms, getDetailCellValue]);

  const detailFilteredPerms = useMemo(() => {
    if (detailFilterCount === 0) return activePerms;
    return activePerms.filter((p) => detailPassesFilters((colKey) => getDetailCellValue(p, colKey)));
  }, [activePerms, detailFilterCount, detailPassesFilters, getDetailCellValue]);
  const riskFlags: string[] = [];

  if (agent.permissions.some((p) => p.level === "elevated"))
    riskFlags.push("Elevated access");
  if (agent.permissions.some((p) => p.tool === "Gmail" && p.level === "write"))
    riskFlags.push("Write email access");
  if (
    agent.permissions.some(
      (p) =>
        p.level !== "none" && (p.source === "inferred" || p.source === "unknown")
    )
  )
    riskFlags.push("Unverified scopes");
  if (
    agent.permissions.some(
      (p) => p.authState === "expired" || p.authState === "missing"
    )
  )
    riskFlags.push("Auth issues");

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(12,12,18,0.6)",
        padding: "24px 28px",
        marginBottom: 32,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--color-client-text)",
          marginBottom: 16,
        }}
      >
        {agent.agentName}
      </div>

      {/* Risk flags */}
      {riskFlags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {riskFlags.map((flag) => (
            <span
              key={flag}
              style={{
                padding: "3px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                background: "rgba(251,191,36,0.1)",
                color: "rgb(251,191,36)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Permissions table */}
      {detailFilterCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 12px", background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 8 }}>
          <span style={{ fontSize: 11, color: "#4ade80" }}>{detailFilterCount} filter{detailFilterCount > 1 ? "s" : ""} active</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>· {detailFilteredPerms.length} of {activePerms.length} shown</span>
          <button onClick={clearDetailFilters} style={{ marginLeft: "auto", background: "none", border: "none", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Clear all</button>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {detailCols.map((col, i) => (
              <th key={col.key} style={{ padding: 0, textAlign: "left" }}>
                <ColumnFilterDropdown
                  colKey={col.key}
                  label={col.label}
                  allValues={detailColumnValues[col.key] ?? []}
                  activeFilter={detailFilters[col.key]}
                  sortKey={detailSortKey}
                  sortDir={detailSortDir}
                  onSort={toggleDetailSort}
                  onFilter={setDetailFilter}
                  dragProps={detailDragHandlers(i)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {detailFilteredPerms.map((p, i) => (
            <DetailRow key={`${p.tool}-${i}`} entry={p} />
          ))}
          {detailFilteredPerms.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--color-client-text-dim)",
                  fontSize: 12,
                }}
              >
                No active permissions
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* ─── Access History (Live) ─── */}
      <AgentAccessHistory agentId={agent.agentId} />
    </div>
  );
}

/* ─── Live Access History for Agent Detail Panel ─── */
function AgentAccessHistory({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<Array<{
    id: string; timestamp: string; agentId: string; agentName: string;
    tool: string; action: string; detail: string; source: "auto" | "manual";
    severity?: "info" | "elevated" | "critical"; actor?: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/permissions/audit?agentId=${agentId}&limit=100`)
      .then((r) => r.json())
      .then((data) => { if (data.ok) setEvents(data.events || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  const filteredEvents = useMemo(() => {
    let evts = [...events];
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      evts = evts.filter((e) => new Date(e.timestamp).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // include full day
      evts = evts.filter((e) => new Date(e.timestamp).getTime() <= to);
    }
    evts.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return sortDir === "newest" ? diff : -diff;
    });
    return evts;
  }, [events, sortDir, dateFrom, dateTo]);

  const formatFullDate = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
            Access History
          </span>
          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "rgba(52,211,153,0.08)", color: "rgb(52,211,153)", fontWeight: 500 }}>
            LIVE
          </span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </span>
        </div>
        {/* Sort toggle */}
        <button
          onClick={() => setSortDir((d) => d === "newest" ? "oldest" : "newest")}
          style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 5, padding: "3px 8px", fontSize: 10, color: "rgba(255,255,255,0.5)",
            cursor: "pointer", fontWeight: 500,
          }}
        >
          {sortDir === "newest" ? "↓ Newest" : "↑ Oldest"}
        </button>
      </div>

      {/* Date range filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>From</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{
            padding: "3px 6px", fontSize: 10, borderRadius: 5,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0", outline: "none",
          }}
        />
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>To</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{
            padding: "3px 6px", fontSize: 10, borderRadius: 5,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0", outline: "none",
          }}
        />
        {(dateFrom || dateTo) && (
          <button
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ background: "none", border: "none", color: "rgba(96,165,250,0.6)", fontSize: 10, cursor: "pointer" }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "8px 0" }}>Loading history...</div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "8px 0" }}>
          No access changes recorded yet. Changes will appear here automatically.
        </div>
      ) : (
        filteredEvents.map((evt) => {
          const severityMeta = SEVERITY_META[evt.severity || "info"];
          return (
            <div
              key={evt.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: severityMeta.color, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", minWidth: 110, flexShrink: 0, fontFamily: "var(--font-mono, monospace)" }}>
                  {formatFullDate(evt.timestamp)}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.3, fontWeight: evt.severity === "info" ? 500 : 600, flex: 1 }}>
                  {evt.detail}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 13 }}>
                {/* Tool badge */}
                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "rgba(96,165,250,0.08)", color: "rgba(96,165,250,0.6)", fontWeight: 500 }}>
                  {evt.tool}
                </span>
                {/* Severity */}
                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${severityMeta.color}15`, color: severityMeta.color, fontWeight: 600 }}>
                  {severityMeta.label}
                </span>
                {/* Source */}
                <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: evt.source === "auto" ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)", color: evt.source === "auto" ? "rgb(52,211,153)" : "rgba(255,255,255,0.3)", fontWeight: 500 }}>
                  {evt.source === "auto" ? "Auto" : "Manual"}
                </span>
                {/* Actor / who made the change */}
                {evt.actor && (
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                    by {evt.actor}
                  </span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function DetailRow({ entry }: { entry: PermissionEntry }) {
  const c = LEVEL_COLORS[entry.level];
  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <td style={tdStyle}>{entry.tool}</td>
      <td style={tdStyle}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2px 10px",
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              background: c.bg,
              color: c.text,
            }}
          >
            {LEVEL_PILL_LABELS[entry.level]}
          </span>
          {(() => {
            const sb = SOURCE_BADGE_COLORS[entry.source] || SOURCE_BADGE_COLORS.unknown;
            return (
              <span
                style={{
                  padding: "1px 7px",
                  borderRadius: 4,
                  fontSize: 9,
                  fontWeight: 600,
                  background: sb.bg,
                  color: sb.text,
                  letterSpacing: "0.02em",
                  lineHeight: "16px",
                }}
              >
                {SOURCE_LABELS[entry.source] || "Unknown"}
              </span>
            );
          })()}
        </span>
      </td>
      <td style={{ ...tdStyle, color: "var(--color-client-text-secondary)" }}>
        {entry.scope || "—"}
      </td>
      <td style={tdStyle}>
        <span
          style={{
            fontSize: 11,
            color:
              entry.source === "verified"
                ? "rgb(52,211,153)"
                : entry.source === "inferred" || entry.source === "unknown"
                ? "rgb(251,191,36)"
                : "var(--color-client-text-secondary)",
          }}
        >
          {SOURCE_LABELS[entry.source] || entry.source}
        </span>
      </td>
      <td style={tdStyle}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: AUTH_COLORS[entry.authState || "n/a"],
              flexShrink: 0,
            }}
          />
          <span style={{ color: "var(--color-client-text-secondary)" }}>
            {entry.authState || "n/a"}
          </span>
        </span>
      </td>
      <td
        style={{
          ...tdStyle,
          color: "var(--color-client-text-dim)",
          maxWidth: 240,
          whiteSpace: "normal",
        }}
      >
        {entry.notes || "—"}
      </td>
    </tr>
  );
}

/* ─── Section label ─── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-client-text-dim)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

/* ─── Sortable header ─── */
function SortableHeader({
  label,
  column,
  sort,
  onSort,
  style,
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (s: SortState) => void;
  style?: React.CSSProperties;
}) {
  const isActive = sort?.column === column;
  const arrow = isActive
    ? sort.direction === "asc" ? " ▲" : " ▼"
    : " ▽";

  return (
    <th
      onClick={() => onSort(nextSortState(sort, column))}
      style={{
        ...thStickyStyle,
        ...style,
        cursor: "pointer",
        userSelect: "none",
        color: isActive ? "rgb(96,165,250)" : "var(--color-client-text-dim)",
      }}
    >
      {label}
      <span style={{ opacity: isActive ? 1 : 0.4, fontSize: 12, marginLeft: 4 }}>
        {arrow}
      </span>
    </th>
  );
}

/* ─── Shared styles ─── */
const thStickyStyle: React.CSSProperties = {
  padding: "12px 20px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-client-text-dim)",
  textAlign: "left",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  whiteSpace: "nowrap",
  position: "sticky",
  top: 0,
  background: "rgba(12,12,18,0.95)",
  backdropFilter: "blur(8px)",
  zIndex: 2,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 12,
  color: "var(--color-client-text)",
  whiteSpace: "nowrap",
};

const permissionsButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--color-client-text-muted)",
  fontSize: 12,
  cursor: "pointer",
};

const permissionsPillButtonStyle: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.06)",
  fontSize: 12,
  cursor: "pointer",
  textTransform: "capitalize",
};

const permissionsInputStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--color-client-text)",
  fontSize: 12,
};
