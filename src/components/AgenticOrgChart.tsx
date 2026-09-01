"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { agents } from "@/data/agents";
import { agentPermissions } from "@/data/permissions";
import { Agent } from "@/types/agent";
import { StatusBadge, StatusDot } from "./StatusBadge";
import { useResponsive } from "@/lib/useMediaQuery";
import RacketIcon from "./RacketIcon";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

/* ─── Classification ─── */
const REVENUE_AGENTS = ["Sales Operations Agent", "Business Development Agent", "Marketing Agent"];
const ORCHESTRATOR = "Example Client Mission Agent";

function getClassification(name: string): { label: string; color: string; bg: string } {
  if (name === ORCHESTRATOR) return { label: "Orchestrator", color: "#c084fc", bg: "rgba(192,132,252,0.10)" };
  if (REVENUE_AGENTS.includes(name)) return { label: "Revenue", color: "#f472b6", bg: "rgba(244,114,182,0.10)" };
  return { label: "Operations", color: "#60a5fa", bg: "rgba(96,165,250,0.10)" };
}

/* ─── Telemetry types ─── */
interface TelemetryData {
  orgStatus: { lastSeenMs: number; activeSessionCount: number; totalContextTokens: number };
  orgCost: { cost24h: number; cost7d: number; source: string; provenance: string };
  agents: Record<string, { discordBotId: string }>;
}

/* ─── Provenance badges ─── */
type ProvenanceLevel = "VERIFIED" | "LOCAL" | "INFERRED" | "CONFIG" | "UNKNOWN";

const PROVENANCE_STYLES: Record<ProvenanceLevel, { color: string; dot: string }> = {
  VERIFIED: { color: "rgba(74,222,128,0.7)", dot: "#4ade80" },
  LOCAL:    { color: "rgba(96,165,250,0.7)", dot: "#60a5fa" },
  INFERRED: { color: "rgba(240,160,48,0.7)", dot: "#f0a030" },
  CONFIG:   { color: "rgba(255,255,255,0.3)", dot: "rgba(255,255,255,0.25)" },
  UNKNOWN:  { color: "rgba(255,255,255,0.2)", dot: "rgba(255,255,255,0.15)" },
};

function ProvenanceBadge({ level }: { level: ProvenanceLevel }) {
  const style = PROVENANCE_STYLES[level];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      fontSize: 9, color: style.color, padding: "1px 5px", borderRadius: 3,
      background: "rgba(255,255,255,0.03)", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: style.dot, flexShrink: 0 }} />
      {level}
    </span>
  );
}

/* ─── Access summary ─── */
function getAccessSummary(agentId: string): { toolCount: number; label: string } {
  const ap = agentPermissions.find((a) => a.agentId === agentId);
  if (!ap) return { toolCount: 0, label: "No Data" };
  const activePerms = ap.permissions.filter((p) => p.level !== "none");
  const toolCount = activePerms.length;
  const hasElevated = activePerms.some((p) => p.level === "elevated");
  const hasWrite = activePerms.some((p) => p.level === "write");
  const label = hasElevated ? "Elevated" : hasWrite ? "Write" : "Minimal";
  return { toolCount, label };
}

/* ─── Status colors ─── */
const STATUS_COLORS: Record<string, string> = {
  healthy: "#4ade80",
  degraded: "#f0a030",
  blocked: "#ef4444",
  parked: "#55556a",
};

/* ─── Panel constants ─── */
const PANEL_WIDTH_KEY = "org-panel-width";
const PANEL_DEFAULT_WIDTH = 480;
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH_RATIO = 0.7;

/* ─── Relative time helper ─── */
function relativeTime(ms: number): string {
  if (ms <= 0) return "Unknown";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ═══════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════ */

export function AgenticOrgChart() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isMobile } = useResponsive();
  const viewParam = searchParams.get("view") as "org" | "list" | null;
  const [viewMode, setViewMode] = useState<"org" | "list">(viewParam === "list" ? "list" : "org");

  const handleViewChange = (mode: "org" | "list") => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", mode);
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [telemetryError, setTelemetryError] = useState(false);
  const [agentCrmLinks, setAgentCrmLinks] = useState<Record<string, string>>({});
  const [liveModels, setLiveModels] = useState<Record<string, {
    primary: string; primaryRaw: string; provider: string;
    fallbacks: string[]; fallbacksRaw: string[];
  }> | null>(null);
  const [modelRefreshKey, setModelRefreshKey] = useState(0);

  // Fetch live model data from openclaw.json
  useEffect(() => {
    fetch("/api/agents/models")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.models) setLiveModels(data.models);
      })
      .catch(() => {});
  }, [modelRefreshKey]);

  // Merge live model data into static agent data
  const agentsWithLiveModels = useMemo(() => {
    if (!liveModels) return agents;
    return agents.map((a) => {
      const live = liveModels[a.id];
      if (!live) return a;
      return { ...a, model: live.primary, provider: live.provider, fallbacks: live.fallbacks };
    });
  }, [liveModels]);

  // Fetch agent CRM contact IDs
  useEffect(() => {
    fetch('/api/crm/contacts').then((r) => r.json()).then((contacts: any[]) => {
      const links: Record<string, string> = {};
      for (const c of contacts) {
        if (c.tags?.includes('agent')) {
          const agent = agents.find((a) => a.name === c.name);
          if (agent) links[agent.id] = c.id;
        }
      }
      setAgentCrmLinks(links);
    }).catch(() => {});
  }, []);

  // Fetch telemetry on mount + every 60s
  useEffect(() => {
    let cancelled = false;
    async function fetchTelemetry() {
      try {
        const res = await fetch("/api/agents/telemetry");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: TelemetryData = await res.json();
        if (!cancelled) {
          setTelemetry(data);
          setTelemetryError(false);
        }
      } catch {
        if (!cancelled) setTelemetryError(true);
      }
    }
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Deep-linking: auto-select agent from URL
  useEffect(() => {
    const agentId = searchParams.get("agent");
    if (agentId) {
      const found = agentsWithLiveModels.find((a) => a.id === agentId);
      if (found) setSelectedAgent(found);
    }
  }, [searchParams]);

  // Esc to close panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedAgent(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const statusCounts = useMemo(() => ({
    healthy: agentsWithLiveModels.filter((a) => a.status === "healthy").length,
    degraded: agentsWithLiveModels.filter((a) => a.status === "degraded").length,
    blocked: agentsWithLiveModels.filter((a) => a.status === "blocked").length,
    parked: agentsWithLiveModels.filter((a) => a.status === "parked").length,
  }), [agentsWithLiveModels]);

  const filteredAgents = useMemo(() => {
    return agentsWithLiveModels.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (classFilter) {
        const cls = getClassification(a.name);
        if (cls.label !== classFilter) return false;
      }
      return true;
    });
  }, [statusFilter, classFilter, agentsWithLiveModels]);

  const root = filteredAgents.find((a) => a.parentId === null) ?? agentsWithLiveModels.find((a) => a.parentId === null)!;
  const children = filteredAgents.filter((a) => a.parentId !== null);

  return (
    <div className="fade-in-up" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Organization
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.03em", marginBottom: 4, lineHeight: 1.2 }}>
            Agentic Org Chart
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
            Unified view of the Example Client AI workforce
          </p>
        </div>
        {/* View Toggle */}
        <div style={{ display: "flex", gap: 4 }}>
          {([["org", "Org Chart"], ["list", "List"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleViewChange(key as "org" | "list")}
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                border: key === viewMode ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.06)",
                background: key === viewMode ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.03)",
                color: key === viewMode ? "#f1f5f9" : "rgba(255,255,255,0.45)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Summary Bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        marginBottom: 16,
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        flexWrap: "wrap",
      }}>
        {(["healthy", "degraded", "blocked", "parked"] as const).map((s) => {
          const count = statusCounts[s];
          if (count === 0 && s !== "healthy") return null;
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(isActive ? null : s)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
                border: isActive ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[s] }} />
              <span style={{ fontSize: 12, color: isActive ? "#f1f5f9" : "rgba(255,255,255,0.6)", fontWeight: 500 }}>
                {count} {s}
              </span>
            </button>
          );
        })}
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
        {(["Orchestrator", "Revenue", "Operations"] as const).map((cls) => {
          const clsInfo = cls === "Orchestrator"
            ? { color: "#c084fc", bg: "rgba(192,132,252,0.10)" }
            : cls === "Revenue"
              ? { color: "#f472b6", bg: "rgba(244,114,182,0.10)" }
              : { color: "#60a5fa", bg: "rgba(96,165,250,0.10)" };
          const isActive = classFilter === cls;
          return (
            <button
              key={cls}
              onClick={() => setClassFilter(isActive ? null : cls)}
              style={{
                fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                color: clsInfo.color,
                background: isActive ? clsInfo.bg : "transparent",
                border: isActive ? `1px solid ${clsInfo.color}33` : "1px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {cls}
            </button>
          );
        })}
        {(statusFilter || classFilter) && (
          <button
            onClick={() => { setStatusFilter(null); setClassFilter(null); }}
            style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}
          >
            Clear filters
          </button>
        )}

        {/* Org-wide telemetry in status bar */}
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)", margin: "0 4px" }} />
        {telemetryError ? (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
            Telemetry unavailable
          </span>
        ) : telemetry ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
            <span style={{ color: "rgba(255,255,255,0.5)" }}>
              Org last active: {relativeTime(telemetry.orgStatus.lastSeenMs)}
            </span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono, monospace)" }}>
              24h: ${telemetry.orgCost.cost24h.toFixed(2)} · 7d: ${telemetry.orgCost.cost7d.toFixed(2)}
            </span>
            <ProvenanceBadge level="LOCAL" />
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Loading telemetry...</span>
        )}
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        {/* Left: view area */}
        <div style={{
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          transition: "margin-right 0.2s ease",
          marginRight: selectedAgent && !isMobile ? 8 : 0,
        }}>
          {viewMode === "org" ? (
            <OrgChartView
              root={root}
              children={children}
              selectedAgent={selectedAgent}
              onSelect={setSelectedAgent}
              isMobile={isMobile}
              filteredAgents={filteredAgents}
            />
          ) : (
            <ListView
              agents={filteredAgents}
              selectedAgent={selectedAgent}
              onSelect={setSelectedAgent}
            />
          )}
        </div>

        {/* Right: detail panel */}
        {selectedAgent && (
          <DetailPanel
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            isMobile={isMobile}
            telemetry={telemetry}
            telemetryError={telemetryError}
            agentCrmLinks={agentCrmLinks}
            onModelUpdate={() => setModelRefreshKey((k) => k + 1)}
            liveModelData={liveModels?.[selectedAgent.id] || null}
          />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Org Chart View
   ═══════════════════════════════════════════════════ */

function OrgChartView({
  root,
  children,
  selectedAgent,
  onSelect,
  isMobile,
  filteredAgents,
}: {
  root: Agent;
  children: Agent[];
  selectedAgent: Agent | null;
  onSelect: (a: Agent) => void;
  isMobile: boolean;
  filteredAgents: Agent[];
}) {
  const showRoot = filteredAgents.some((a) => a.parentId === null);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        background: "linear-gradient(180deg, rgba(14,14,22,0.98) 0%, rgba(10,10,16,0.99) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: isMobile ? "20px 12px" : "24px",
        minHeight: 400,
        overflow: "hidden",
      }}
    >
      {/* Background gradient */}
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background:
            "radial-gradient(circle at 18% 18%, rgba(192,132,252,0.05), transparent 22%), " +
            "radial-gradient(circle at 78% 16%, rgba(96,165,250,0.06), transparent 24%), " +
            "radial-gradient(circle at 55% 72%, rgba(52,211,153,0.03), transparent 20%)",
        }}
      />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* Root agent */}
        {showRoot && (
          <>
            <OrgNode
              agent={root}
              selected={selectedAgent?.id === root.id}
              onClick={() => onSelect(root)}
              featured
              isMobile={isMobile}
            />

            {children.length > 0 && (
              <>
                {/* Vertical connector */}
                <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.10)" }} />

                {/* Horizontal connector — desktop only */}
                {!isMobile && children.length > 1 && (
                  <div style={{ width: "65%", height: 1, background: "rgba(255,255,255,0.06)", marginTop: -8, marginBottom: -4 }} />
                )}
              </>
            )}
          </>
        )}

        {/* Children grid */}
        {children.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : children.length <= 4 ? `repeat(${children.length}, 1fr)` : "repeat(4, 1fr)",
              gap: isMobile ? 10 : 12,
              width: "100%",
              maxWidth: 1100,
            }}
          >
            {children.map((agent) => (
              <OrgNode
                key={agent.id}
                agent={agent}
                selected={selectedAgent?.id === agent.id}
                onClick={() => onSelect(agent)}
                isMobile={isMobile}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Org Chart Node ─── */

function OrgNode({
  agent,
  selected,
  onClick,
  featured = false,
  isMobile = false,
}: {
  agent: Agent;
  selected: boolean;
  onClick: () => void;
  featured?: boolean;
  isMobile?: boolean;
}) {
  const cls = getClassification(agent.name);
  const isParked = agent.status === "parked";

  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        borderRadius: 16,
        background: featured
          ? "linear-gradient(180deg, rgba(25,25,36,0.98) 0%, rgba(17,17,27,0.98) 100%)"
          : "linear-gradient(180deg, rgba(20,20,30,0.95) 0%, rgba(15,15,23,0.95) 100%)",
        border: selected
          ? "1px solid rgba(218,218,219,0.4)"
          : "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${STATUS_COLORS[agent.status] ?? STATUS_COLORS.parked}80`,
        boxShadow: selected
          ? "0 0 0 1px rgba(218,218,219,0.22), 0 12px 32px rgba(0,0,0,0.4)"
          : "0 8px 24px rgba(0,0,0,0.25)",
        padding: isMobile ? "14px 12px" : featured ? "16px 20px" : "12px 14px",
        width: isMobile ? "100%" : featured ? 340 : "100%",
        maxWidth: featured && !isMobile ? 360 : undefined,
        cursor: "pointer",
        transition: "all 0.2s ease",
        opacity: isParked ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <StatusDot status={agent.status} />
        <span style={{
          fontSize: isMobile ? 14 : featured ? 15 : 13,
          fontWeight: 600,
          color: "#f1f5f9",
          letterSpacing: "-0.01em",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: isMobile ? "normal" : "nowrap",
        }}>
          {agent.name}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 500, padding: "2px 7px", borderRadius: 5,
          color: cls.color, background: cls.bg, whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {cls.label}
        </span>
      </div>

      {/* Role row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, paddingLeft: 16,
        fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 6,
      }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{agent.role}</span>
      </div>

      {/* Primary model */}
      <div style={{ paddingLeft: 16, marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Primary: </span>
        <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{agent.model}</span>
      </div>

      {/* Fallbacks */}
      {agent.fallbacks && agent.fallbacks.length > 0 && (
        <div style={{ paddingLeft: 16 }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Fallbacks: </span>
          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 9, color: "rgba(255,255,255,0.35)" }}>
            {agent.fallbacks.map((fb, i) => `${i + 1}. ${fb}`).join(" → ")}
          </span>
        </div>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   List View
   ═══════════════════════════════════════════════════ */

function ListView({
  agents: agentList,
  selectedAgent,
  onSelect,
}: {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelect: (a: Agent) => void;
}) {
  const columns: StandardTableColumn<Agent>[] = useMemo(() => [
    {
      key: "name",
      label: "Name",
      getValue: (a) => a.name,
      render: (a) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#f1f5f9", fontSize: 12 }}>
          <StatusDot status={a.status} />{a.name}
        </span>
      ),
    },
    {
      key: "role",
      label: "Role",
      getValue: (a) => a.role,
      render: (a) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{a.role}</span>,
    },
    {
      key: "classification",
      label: "Classification",
      getValue: (a) => getClassification(a.name).label,
      render: (a) => {
        const cls = getClassification(a.name);
        return <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 5, color: cls.color, background: cls.bg }}>{cls.label}</span>;
      },
    },
    {
      key: "status",
      label: "Status",
      getValue: (a) => a.status,
      render: (a) => {
        const isParked = a.status === "parked";
        return <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 5, background: isParked ? "rgba(255,255,255,0.08)" : "rgba(74,222,128,0.12)", color: isParked ? "rgba(255,255,255,0.4)" : STATUS_COLORS[a.status] }}>{a.status}</span>;
      },
    },
    {
      key: "model",
      label: "Model",
      getValue: (a) => a.model,
      render: (a) => <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{a.model}</span>,
    },
    {
      key: "fallbacks",
      label: "Fallbacks",
      getValue: (a) => a.fallbacks ? a.fallbacks.map((fb, i) => `${i+1}. ${fb}`).join(" → ") : "",
      render: (a) => <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{a.fallbacks?.map((fb, i) => `${i+1}. ${fb}`).join(" → ")}</span>,
    },
    {
      key: "provenance",
      label: "Provenance",
      getValue: () => "CONFIG",
      render: () => <ProvenanceBadge level="CONFIG" />,
    },
    {
      key: "access",
      label: "Access Level",
      getValue: (a) => { const access = getAccessSummary(a.id); return `${access.toolCount} tools · ${access.label}`; },
      render: (a) => {
        const access = getAccessSummary(a.id);
        return <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>{access.toolCount} tools · {access.label}</span>;
      },
    },
  ], []);

  return (
    <StandardTable
      tableKey="agentic-org-list"
      columns={columns}
      data={agentList}
      getRowKey={(a) => a.id}
      defaultSortKey="name"
      onRowClick={onSelect}
      selectedRowKey={selectedAgent?.id ?? null}
      emptyMessage="No agents found"
      getRowStyle={(a) => ({ opacity: a.status === "parked" ? 0.55 : 1 })}
    />
  );
}

/* ═══════════════════════════════════════════════════
   Detail Panel (right side, resizable)
   ═══════════════════════════════════════════════════ */

function DetailPanel({
  agent,
  onClose,
  isMobile,
  telemetry,
  telemetryError,
  agentCrmLinks,
  onModelUpdate,
  liveModelData,
}: {
  agent: Agent;
  onClose: () => void;
  isMobile: boolean;
  telemetry: TelemetryData | null;
  telemetryError: boolean;
  agentCrmLinks: Record<string, string>;
  onModelUpdate?: () => void;
  liveModelData: { primary: string; primaryRaw: string; provider: string; fallbacks: string[]; fallbacksRaw: string[] } | null;
}) {
  const cls = getClassification(agent.name);
  const access = getAccessSummary(agent.id);

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return PANEL_DEFAULT_WIDTH;
    try {
      const stored = window.localStorage.getItem(PANEL_WIDTH_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (!isNaN(w) && w >= PANEL_MIN_WIDTH) return w;
      }
    } catch { /* ignore */ }
    return PANEL_DEFAULT_WIDTH;
  });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const isResizing = useRef(false);

  // Full-screen Esc handler
  useEffect(() => {
    if (!isFullScreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullScreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullScreen]);

  // Persist width
  useEffect(() => {
    if (!isMobile) {
      try { window.localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
    }
  }, [panelWidth, isMobile]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const maxW = window.innerWidth * PANEL_MAX_WIDTH_RATIO;
      const delta = startX - ev.clientX;
      const newWidth = Math.min(maxW, Math.max(PANEL_MIN_WIDTH, startWidth + delta));
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
  }, [isMobile, panelWidth]);

  // Expanded sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    liveSignals: true,
    models: true,
    purpose: true,
    capabilities: true,
    permissions: false,
    channels: false,
    notes: false,
    blockers: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Model editing state
  const [editingModel, setEditingModel] = useState(false);
  const [editPrimary, setEditPrimary] = useState(agent.model);
  const [editFallbacks, setEditFallbacks] = useState<string[]>(agent.fallbacks || []);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveStatus, setModelSaveStatus] = useState<"" | "saved" | "error">("");

  const handleModelSave = async () => {
    setModelSaving(true);
    setModelSaveStatus("");
    try {
      const res = await fetch("/api/agents/model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          primary: editPrimary,
          fallbacks: editFallbacks,
        }),
      });
      if (res.ok) {
        setModelSaveStatus("saved");
        setEditingModel(false);
        onModelUpdate?.();
        setTimeout(() => setModelSaveStatus(""), 3000);
      } else {
        setModelSaveStatus("error");
      }
    } catch {
      setModelSaveStatus("error");
    } finally {
      setModelSaving(false);
    }
  };

  const handleAddFallback = () => {
    setEditFallbacks([...editFallbacks, ""]);
  };

  const handleRemoveFallback = (idx: number) => {
    setEditFallbacks(editFallbacks.filter((_, i) => i !== idx));
  };

  const handleFallbackChange = (idx: number, val: string) => {
    const updated = [...editFallbacks];
    updated[idx] = val;
    setEditFallbacks(updated);
  };

  // Mobile: full screen overlay
  if (isMobile) {
    return (
      <>
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }}
        />
        <div
          style={{
            position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
            zIndex: 210, background: "linear-gradient(180deg, rgba(18,18,26,0.99) 0%, rgba(12,12,19,1) 100%)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}
        >
          {renderPanelContent()}
        </div>
      </>
    );
  }

  // Desktop: side panel
  return (
    <div
      style={{
        width: isFullScreen ? "100%" : panelWidth,
        minWidth: isFullScreen ? "100%" : PANEL_MIN_WIDTH,
        flexShrink: 0,
        position: "relative",
        borderRadius: 16,
        background: "linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(12,12,19,0.99) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: isFullScreen ? "width 0.2s ease" : undefined,
      }}
    >
      {/* Resize handle */}
      {!isFullScreen && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: "absolute", top: 0, left: 0, bottom: 0, width: 6,
            cursor: "col-resize", zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 3, height: 40, borderRadius: 2, background: "rgba(255,255,255,0.10)", transition: "background 0.15s" }} />
        </div>
      )}
      {renderPanelContent()}
    </div>
  );

  function renderPanelContent() {
    return (
      <>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {!isMobile && (
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                title={isFullScreen ? "Exit full-screen" : "Full-screen"}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                  color: "rgba(255,255,255,0.5)", fontSize: 12, transition: "all 0.15s",
                }}
              >
                {isFullScreen ? "↙" : "↔"}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6, padding: "4px 8px", cursor: "pointer",
                color: "rgba(255,255,255,0.5)", fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>

          {/* Agent header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <StatusDot status={agent.status} />
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.02em", margin: 0 }}>
              {agent.name}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{agent.role}</span>
            <span style={{
              fontSize: 9, fontWeight: 500, padding: "2px 7px", borderRadius: 5,
              color: cls.color, background: cls.bg,
            }}>
              {cls.label}
            </span>
            <StatusBadge status={agent.status} size="sm" />
          </div>
          {/* CRM Link chip */}
          {agentCrmLinks[agent.id] && (
            <a href={`/contacts?select=${agentCrmLinks[agent.id]}`} onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)", color: "#4ade80", fontSize: 11, fontWeight: 500, textDecoration: "none", marginTop: 8, width: "fit-content" }}>CRM Link</a>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* ─── SECTION 1: Live Signals ─── */}
          <SectionHeader
            title="Live Signals"
            sectionKey="liveSignals"
            expanded={expandedSections.liveSignals}
            onToggle={toggleSection}
          />
          {expandedSections.liveSignals && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {/* Status */}
              <div style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Status
                  </span>
                  <ProvenanceBadge level="INFERRED" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatusDot status={agent.status} />
                  <span style={{ fontSize: 12, color: STATUS_COLORS[agent.status] ?? "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                    {agent.status}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                  Derived from config, not runtime
                </div>
              </div>

              {/* Last Visible Discord Action */}
              <div style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Last Visible Discord Action
                  </span>
                  <ProvenanceBadge level="UNKNOWN" />
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                  Connect Discord telemetry to enable
                </div>
              </div>

              {/* Org Cost Contribution */}
              <div style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Org Cost Contribution
                  </span>
                  <ProvenanceBadge level={telemetryError ? "UNKNOWN" : "LOCAL"} />
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                  {telemetryError
                    ? "Telemetry unavailable"
                    : "Per-agent cost not available — see org-wide cost in header"}
                </div>
              </div>

              {/* Activity Feed */}
              <div style={{
                padding: "10px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Activity Feed
                  </span>
                  <ProvenanceBadge level="UNKNOWN" />
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                  Activity feed requires runtime telemetry connection
                </div>
              </div>
            </div>
          )}

          {/* ─── SECTION: Models ─── */}
          <SectionHeader title="Models" sectionKey="models" expanded={expandedSections.models} onToggle={toggleSection}
            right={<ProvenanceBadge level="CONFIG" />}
          />
          {expandedSections.models && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {!editingModel ? (
                <>
                  {/* Primary */}
                  <div style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                      Primary
                    </div>
                    <div style={{ fontSize: 13, color: "#93c5fd", fontWeight: 500, fontFamily: "var(--font-mono, monospace)" }}>
                      {agent.model}
                    </div>
                  </div>
                  {/* Fallbacks */}
                  {agent.fallbacks && agent.fallbacks.length > 0 && (
                    <div style={{
                      padding: "10px 12px", borderRadius: 8,
                      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                        Fallbacks
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {agent.fallbacks.map((fb, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", minWidth: 14 }}>{i + 1}.</span>
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-mono, monospace)" }}>{fb}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Edit button */}
                  <button
                    onClick={() => {
                      setEditPrimary(liveModelData?.primaryRaw || agent.model);
                      setEditFallbacks([...(liveModelData?.fallbacksRaw || agent.fallbacks || [])]);
                      setEditingModel(true);
                    }}
                    style={{
                      alignSelf: "flex-start", padding: "4px 12px", borderRadius: 6,
                      background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)",
                      color: "rgba(96,165,250,0.7)", fontSize: 11, cursor: "pointer", fontWeight: 500,
                    }}
                  >
                    Edit Models
                  </button>
                  {modelSaveStatus === "saved" && (
                    <span style={{ fontSize: 11, color: "#4ade80" }}>✓ Saved to openclaw.json</span>
                  )}
                  {modelSaveStatus === "error" && (
                    <span style={{ fontSize: 11, color: "#f87171" }}>✗ Failed to save</span>
                  )}
                </>
              ) : (
                <>
                  {/* Editing mode */}
                  <div style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.15)",
                  }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
                      Primary Model
                    </div>
                    <input
                      value={editPrimary}
                      onChange={(e) => setEditPrimary(e.target.value)}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: 6,
                        background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#f1f5f9", fontSize: 12, fontFamily: "var(--font-mono, monospace)",
                        outline: "none",
                      }}
                      placeholder="e.g. anthropic/claude-opus-4-6"
                    />
                  </div>
                  <div style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.15)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        Fallbacks
                      </span>
                      <button
                        onClick={handleAddFallback}
                        style={{
                          padding: "2px 8px", borderRadius: 4,
                          background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)",
                          color: "#93c5fd", fontSize: 10, cursor: "pointer",
                        }}
                      >
                        + Add
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {editFallbacks.map((fb, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", minWidth: 14 }}>{i + 1}.</span>
                          <input
                            value={fb}
                            onChange={(e) => handleFallbackChange(i, e.target.value)}
                            style={{
                              flex: 1, padding: "4px 8px", borderRadius: 6,
                              background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                              color: "#f1f5f9", fontSize: 11, fontFamily: "var(--font-mono, monospace)",
                              outline: "none",
                            }}
                            placeholder="e.g. google/gemini-3.1-pro-preview"
                          />
                          <button
                            onClick={() => handleRemoveFallback(i)}
                            style={{
                              padding: "2px 6px", borderRadius: 4,
                              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
                              color: "#f87171", fontSize: 10, cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Save / Cancel */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleModelSave}
                      disabled={modelSaving}
                      style={{
                        padding: "6px 16px", borderRadius: 6,
                        background: modelSaving ? "rgba(96,165,250,0.05)" : "rgba(96,165,250,0.15)",
                        border: "1px solid rgba(96,165,250,0.25)",
                        color: modelSaving ? "rgba(96,165,250,0.4)" : "#93c5fd",
                        fontSize: 11, cursor: modelSaving ? "wait" : "pointer", fontWeight: 500,
                      }}
                    >
                      {modelSaving ? "Saving..." : "Save & Deploy"}
                    </button>
                    <button
                      onClick={() => setEditingModel(false)}
                      style={{
                        padding: "6px 16px", borderRadius: 6,
                        background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── SECTION 2: Configuration ─── */}

          {/* Purpose */}
          <SectionHeader title="Purpose" sectionKey="purpose" expanded={expandedSections.purpose} onToggle={toggleSection}
            right={<ProvenanceBadge level="CONFIG" />}
          />
          {expandedSections.purpose && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 20 }}>
              {agent.purpose}
            </p>
          )}

          {/* Capabilities */}
          <SectionHeader title="Capabilities" sectionKey="capabilities" expanded={expandedSections.capabilities} onToggle={toggleSection}
            right={<ProvenanceBadge level="CONFIG" />}
          />
          {expandedSections.capabilities && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
              {agent.capabilities.map((cap) => (
                <span key={cap} style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 6,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                }}>
                  {cap}
                </span>
              ))}
            </div>
          )}

          {/* Permissions Summary */}
          <SectionHeader title="Permissions Summary" sectionKey="permissions" expanded={expandedSections.permissions} onToggle={toggleSection}
            right={<ProvenanceBadge level="CONFIG" />}
          />
          {expandedSections.permissions && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{
                  fontSize: 11, padding: "3px 10px", borderRadius: 6,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.6)",
                }}>
                  {access.toolCount} tools · {access.label}
                </span>
              </div>
              <a
                href={`/permissions?agent=${agent.id}`}
                style={{ fontSize: 11, color: "rgba(96,165,250,0.7)", textDecoration: "none" }}
              >
                View full permissions →
              </a>
            </div>
          )}

          {/* Channels */}
          <SectionHeader title="Channels" sectionKey="channels" expanded={expandedSections.channels} onToggle={toggleSection}
            right={<ProvenanceBadge level="CONFIG" />}
          />
          {expandedSections.channels && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
              {agent.channels.map((ch) => (
                <div key={ch.name} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", borderRadius: 8,
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    {ch.type === "slack" ? "⌗" : ch.type === "email" ? "✉" : ch.type === "api" ? "⚡" : ch.type === "github" ? "⊙" : "·"}
                  </span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{ch.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" }}>{ch.type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          <SectionHeader title="Notes" sectionKey="notes" expanded={expandedSections.notes} onToggle={toggleSection}
            right={<ProvenanceBadge level="CONFIG" />}
          />
          {expandedSections.notes && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, fontStyle: "italic", marginBottom: 20 }}>
              {agent.notes}
            </p>
          )}

          {/* Blockers */}
          {agent.blockers && agent.blockers.length > 0 && (
            <>
              <SectionHeader title="Blockers" sectionKey="blockers" expanded={expandedSections.blockers} onToggle={toggleSection} />
              {expandedSections.blockers && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                  {agent.blockers.map((b) => (
                    <div key={b} style={{
                      padding: "8px 12px", borderRadius: 8,
                      background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                      fontSize: 12, color: "rgba(255,255,255,0.6)",
                    }}>
                      {b}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          flexShrink: 0, padding: "10px 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "rgba(255,255,255,0.01)",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>ID: {agent.id}</span>
          <span style={{
            fontSize: 9, color: "#60a5fa", background: "rgba(96,165,250,0.08)",
            padding: "2px 8px", borderRadius: 4, fontFamily: "var(--font-mono, monospace)",
            letterSpacing: "0.04em",
          }}>
            TRUSTED TELEMETRY
          </span>
        </div>
      </>
    );
  }
}

/* ─── Section Header with RacketIcon ─── */

function SectionHeader({
  title,
  sectionKey,
  expanded,
  onToggle,
  right,
}: {
  title: string;
  sectionKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onToggle(sectionKey)}
      style={{
        display: "flex", alignItems: "center", gap: 6, width: "100%",
        background: "none", border: "none", cursor: "pointer",
        padding: "6px 0", marginBottom: expanded ? 8 : 12,
      }}
    >
      <RacketIcon expanded={expanded} size={14} color="rgba(255,255,255,0.3)" />
      <span style={{
        fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase", letterSpacing: "0.1em",
      }}>
        {title}
      </span>
      {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
    </button>
  );
}
