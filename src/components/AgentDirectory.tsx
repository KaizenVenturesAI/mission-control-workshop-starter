"use client";

import { useCallback, useMemo, useState } from "react";
import { agents } from "@/data/agents";
import { agentPermissions } from "@/data/permissions";
import { Agent } from "@/types/agent";
import { InspectableValue, AsteriskNote } from "@/components/ProvenanceSystem";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

/* ─── Classification ─── */
const REVENUE_AGENTS = ["Sales Operations Agent", "Business Development Agent", "Marketing Agent"];
const OPERATIONS_AGENTS = ["Executive Assistant Agent", "Deployment Agent", "Engineering Agent"];
const ORCHESTRATOR = "Example Client Mission Agent";

function getClassification(name: string): { label: string; color: string; bg: string } {
  if (name === ORCHESTRATOR) return { label: "Orchestrator", color: "#c084fc", bg: "rgba(192,132,252,0.10)" };
  if (REVENUE_AGENTS.includes(name)) return { label: "Revenue Agent", color: "#f472b6", bg: "rgba(244,114,182,0.10)" };
  return { label: "Operations Agent", color: "#60a5fa", bg: "rgba(96,165,250,0.10)" };
}

/* ─── Cost data ─── */
const DAILY_COST: Record<string, number> = {
  "missionAgent-chief-of-staff": 7.20,
  "engineering-agent": 4.80,
  "marketing-agent": 2.40,
  "business-development-agent": 1.90,
  "sales-operations-agent": 1.20,
  "deployment-agent": 1.20,
  "executive-assistant-agent": 0.60,
};

/* ─── Access summary from permissions ─── */
function getAccessSummary(agentId: string): { toolCount: number; label: string } {
  const ap = agentPermissions.find((a) => a.agentId === agentId);
  if (!ap) return { toolCount: 0, label: "No Data" };
  const activePerms = ap.permissions.filter((p) => p.level !== "none");
  const toolCount = activePerms.length;
  const hasElevated = activePerms.some((p) => p.level === "elevated");
  const hasWrite = activePerms.some((p) => p.level === "write");
  const label = hasElevated ? "Elevated Access" : hasWrite ? "Write-Capable" : "Minimal";
  return { toolCount, label };
}

/* ─── Summary stats ─── */
const totalAgents = agents.length;
const activeAgents = agents.filter((a) => a.status !== "parked").length;
const parkedAgents = agents.filter((a) => a.status === "parked").length;
const revenueCount = agents.filter((a) => REVENUE_AGENTS.includes(a.name)).length;
const opsCount = agents.filter((a) => OPERATIONS_AGENTS.includes(a.name)).length;

export function AgentDirectory() {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="fade-in-up" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const, letterSpacing: "0.14em" }}>
          Directory
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.03em", marginBottom: 4, lineHeight: 1.2 }}>
            Agent Directory
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
            Operating index of the Example Client AI workforce
          </p>
        </div>
        {/* View Toggle */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 8,
                border: v === view ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.06)",
                background: v === view ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.03)",
                color: v === view ? "#f1f5f9" : "rgba(255,255,255,0.45)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {v === "grid" ? "Grid" : "List"}
            </button>
          ))}
        </div>
      </div>

      {/* Workforce Summary Strip */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 16px",
        marginBottom: 24,
        borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
          {totalAgents} agents
        </span>
        <Dot />
        <span style={{ fontSize: 12, color: "rgba(74,222,128,0.85)" }}>{activeAgents} active</span>
        <Dot />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{parkedAgents} parked</span>
        <Dot />
        <span style={{ fontSize: 12, color: "rgba(244,114,182,0.8)" }}>{revenueCount} revenue agents</span>
        <Dot />
        <span style={{ fontSize: 12, color: "rgba(96,165,250,0.8)" }}>{opsCount} operations agents</span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.2)", textTransform: "uppercase" as const, letterSpacing: "0.12em" }}>SEEDED</span>
      </div>

      {/* Grid / List */}
      {view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {agents.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} index={i} />
          ))}
        </div>
      ) : (
        <AgentListView />
      )}

      <AsteriskNote />
    </div>
  );
}

/* ─── Dot separator ─── */
function Dot() {
  return <span style={{ fontSize: 10, color: "rgba(255,255,255,0.15)" }}>·</span>;
}

/* ─── Grid Card ─── */
function AgentCard({ agent, index }: { agent: Agent; index: number }) {
  const cls = getClassification(agent.name);
  const cost = DAILY_COST[agent.id] ?? 0;
  const access = getAccessSummary(agent.id);
  const isParked = agent.status === "parked";

  return (
    <div
      className={`fade-in-up stagger-${Math.min(index + 1, 6)}`}
      style={{
        padding: 20,
        borderRadius: 14,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        transition: "border-color 0.2s ease",
        display: "flex",
        flexDirection: "column" as const,
        gap: 14,
        opacity: isParked ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
          background: isParked ? "rgba(255,255,255,0.2)" : "#4ade80",
          boxShadow: isParked ? "none" : "0 0 6px rgba(74,222,128,0.4)",
        }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.01em" }}>
          {agent.name}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 6,
          color: cls.color, background: cls.bg, whiteSpace: "nowrap" as const,
        }}>
          {cls.label}
        </span>
      </div>

      {/* Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <DetailCell label="Role" value={agent.role} />
        <DetailCell label="Owner" value={agent.owner} />
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 }}>Model</div>
          <InspectableValue value={agent.model} sourceClass="CONFIG" source="Agent registry configuration" method="Model assignment from agent config" inline>
            <span style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "var(--font-mono, 'SF Mono', monospace)" }}>{agent.model}</span>
          </InspectableValue>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 }}>Status</div>
          <InspectableValue value={isParked ? "Parked" : "Active"} sourceClass="CONFIG" source="Agent registry configuration" method="Agent status from agents data" inline>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 500, padding: "2px 10px", borderRadius: 6,
              background: isParked ? "rgba(255,255,255,0.15)" : "rgba(74,222,128,0.15)",
              color: isParked ? "rgba(255,255,255,0.4)" : "#4ade80",
            }}>{isParked ? "Parked" : "Active"}</span>
          </InspectableValue>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 }}>Daily Cost</div>
          <InspectableValue value={`$${cost.toFixed(2)}/day`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Estimated from session count and model pricing" limitations="Per-agent token metering not instrumented" inline>
            <span style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "var(--font-mono, 'SF Mono', monospace)" }}>${cost.toFixed(2)}/day</span>
          </InspectableValue>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 }}>Sessions Today</div>
          <InspectableValue value={`${agent.activityCount24h} sessions`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Estimated session count from agent activity data" limitations="Not connected to live session tracking" inline>
            <span style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "var(--font-mono, 'SF Mono', monospace)" }}>{agent.activityCount24h} sessions</span>
          </InspectableValue>
        </div>
      </div>

      {/* Access Summary */}
      <div style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 3 }}>
          Access Summary
        </div>
        <InspectableValue value={`${access.toolCount} tools · ${access.label}`} sourceClass="CONFIG" source="Permissions data" method="Computed from agent permission entries" inline>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
            {access.toolCount} tools · {access.label}
          </span>
        </InspectableValue>
      </div>

      {/* Last Action */}
      <div style={{
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.015)",
        border: "1px solid rgba(255,255,255,0.03)",
      }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 3 }}>
          Last Action
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {agent.lastAction}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>
          {agent.lastActionTime}
        </div>
      </div>

      {/* Quick Links */}
      <div style={{ display: "flex", gap: 12, paddingTop: 4 }}>
        {[
          { label: "Permissions", href: "/permissions" },
          { label: "Usage", href: "/usage" },
          { label: "Activity", href: "/activity" },
          { label: "Rulebook", href: "/rulebook" },
        ].map((link) => (
          <a
            key={link.label}
            href={link.href}
            style={{
              fontSize: 11, color: "rgba(96,165,250,0.7)", textDecoration: "none",
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(96,165,250,1)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(96,165,250,0.7)"; }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/* ─── Detail Cell ─── */
function DetailCell({ label, value, mono, pill, pillColor, pillText }: {
  label: string;
  value: string;
  mono?: boolean;
  pill?: boolean;
  pillColor?: string;
  pillText?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 2 }}>
        {label}
      </div>
      {pill ? (
        <span style={{
          display: "inline-block",
          fontSize: 11,
          fontWeight: 500,
          padding: "2px 10px",
          borderRadius: 6,
          background: pillColor,
          color: pillText,
        }}>
          {value}
        </span>
      ) : (
        <div style={{
          fontSize: 12, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
          fontFamily: mono ? "var(--font-mono, 'SF Mono', monospace)" : "inherit",
        }}>
          {value}
        </div>
      )}
    </div>
  );
}

/* ─── List View ─── */
function AgentListView() {
  const cellStyle: React.CSSProperties = {
    fontSize: 12, color: "rgba(255,255,255,0.7)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  };

  const stdColumns: StandardTableColumn<Agent>[] = useMemo(() => [
    { key: "name", label: "Name", getValue: (a) => a.name, render: (a) => { const isParked = a.status === "parked"; return <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600, color: "#f1f5f9" }}><span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: isParked ? "rgba(255,255,255,0.2)" : "#4ade80" }} />{a.name}</span>; } },
    { key: "role", label: "Role", render: (a) => <span style={cellStyle}>{a.role}</span> },
    { key: "model", label: "Model", render: (a) => <span style={{ ...cellStyle, fontFamily: "var(--font-mono, 'SF Mono', monospace)", fontSize: 11 }}>{a.model}</span> },
    { key: "status", label: "Status", getValue: (a) => a.status === "parked" ? "Parked" : "Active", render: (a) => { const isParked = a.status === "parked"; return <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 5, background: isParked ? "rgba(255,255,255,0.08)" : "rgba(74,222,128,0.12)", color: isParked ? "rgba(255,255,255,0.4)" : "#4ade80" }}>{isParked ? "Parked" : "Active"}</span>; } },
    { key: "classification", label: "Classification", getValue: (a) => getClassification(a.name).label, render: (a) => { const cls = getClassification(a.name); return <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 5, color: cls.color, background: cls.bg }}>{cls.label}</span>; } },
    { key: "dailyCost", label: "Daily Cost", getValue: (a) => `$${(DAILY_COST[a.id] ?? 0).toFixed(2)}`, render: (a) => { const cost = DAILY_COST[a.id] ?? 0; return <span style={{ fontFamily: "var(--font-mono, 'SF Mono', monospace)" }}><InspectableValue value={`$${cost.toFixed(2)}`} sourceClass="ESTIMATED" source="Activity-proportional estimate" method="Estimated from session count and model pricing" limitations="Per-agent token metering not instrumented" inline><span>${cost.toFixed(2)}</span></InspectableValue></span>; } },
    { key: "tools", label: "Tools", getValue: (a) => `${getAccessSummary(a.id).toolCount} tools`, render: (a) => <span style={cellStyle}>{getAccessSummary(a.id).toolCount} tools</span> },
    { key: "lastAction", label: "Last Action", truncate: true, maxWidth: 220, render: (a) => <span style={{ ...cellStyle, color: "rgba(255,255,255,0.4)" }}>{a.lastAction}</span> },
  ], [cellStyle]);

  return (
    <div>
      <StandardTable<Agent>
        tableKey="agent-directory"
        columns={stdColumns}
        data={agents}
        getRowKey={(a) => a.id}
        defaultSortKey="name"
        getRowStyle={(a) => ({ opacity: a.status === "parked" ? 0.55 : 1 })}
        emptyMessage="No agents found"
      />
    </div>
  );
}
