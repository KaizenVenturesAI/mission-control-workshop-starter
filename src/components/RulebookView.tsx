"use client";

import { useState, useMemo } from "react";
import RacketIcon from "@/components/RacketIcon";
import { agentRules, getRulebookStats, type AgentRule } from "@/data/rulebook";
import { AsteriskNote } from "@/components/ProvenanceSystem";

/* ─── Status colors ─── */
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "rgba(52,211,153,0.1)", text: "rgb(52,211,153)" },
  parked: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.3)" },
};

const BADGE_COLORS = {
  verified: { bg: "rgba(52,211,153,0.12)", text: "rgb(52,211,153)" },
  manual: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" },
};

const APPROVAL_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  yes: { bg: "rgba(245,158,11,0.10)", text: "rgb(245,158,11)", border: "rgba(245,158,11,0.25)" },
  no: { bg: "rgba(52,211,153,0.10)", text: "rgb(52,211,153)", border: "rgba(52,211,153,0.25)" },
  conditional: { bg: "rgba(96,165,250,0.10)", text: "rgb(96,165,250)", border: "rgba(96,165,250,0.25)" },
};

const SCOPE_COLORS = {
  canDo: { border: "rgb(52,211,153)", dot: "rgb(52,211,153)", bg: "rgba(52,211,153,0.04)" },
  cannotDo: { border: "rgb(232,67,147)", dot: "rgb(232,67,147)", bg: "rgba(232,67,147,0.04)" },
  needsApproval: { border: "rgb(245,158,11)", dot: "rgb(245,158,11)", bg: "rgba(245,158,11,0.04)" },
};

export function RulebookView() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const stats = useMemo(() => getRulebookStats(), []);

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agentRules;
    const q = searchQuery.toLowerCase();
    return agentRules.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q) ||
        a.operatingRules.some((r) => r.toLowerCase().includes(q)) ||
        a.canDo.some((r) => r.toLowerCase().includes(q)) ||
        a.cannotDo.some((r) => r.toLowerCase().includes(q)) ||
        a.needsApprovalFor.some((r) => r.toLowerCase().includes(q)) ||
        a.escalationPath.some((r) => r.toLowerCase().includes(q)) ||
        a.owner.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1400 }}>
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
          Agent Rulebook
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-client-text-dim)" }}>
          Operating rules, approval chains, escalation paths, and scope boundaries
        </p>
      </div>

      {/* ─── Summary Strip ─── */}
      <SectionLabel>SUMMARY</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 28,
        }}
      >
        <StatCard label="Agents with Rules" count={stats.totalAgents} color="rgb(96,165,250)" />
        <StatCard label="Approval Chains Active" count={stats.approvalChainsActive} color="rgb(52,211,153)" />
        <StatCard label="Escalation Paths Defined" count={stats.escalationPathsDefined} color="rgb(232,67,147)" />
      </div>

      {/* ─── Search ─── */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search rules, agents, scope..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 420,
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(12,12,18,0.6)",
            color: "var(--color-client-text)",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      {/* ─── Agent Cards ─── */}
      <SectionLabel>AGENT RULES</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredAgents.map((agent) => (
          <AgentRuleCard
            key={agent.id}
            agent={agent}
            isExpanded={expandedAgent === agent.id}
            onToggle={() =>
              setExpandedAgent(expandedAgent === agent.id ? null : agent.id)
            }
          />
        ))}
        {filteredAgents.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--color-client-text-dim)",
              fontSize: 13,
            }}
          >
            No agents match your search
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.08)" }}>
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
          Rulebook content is maintained as static configuration. Rules, scope boundaries, and escalation paths are governance definitions, not data claims.
        </span>
      </div>
      <AsteriskNote />
    </div>
  );
}

/* ─── Agent Rule Card ─── */
function AgentRuleCard({
  agent,
  isExpanded,
  onToggle,
}: {
  agent: AgentRule;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusColor = STATUS_COLORS[agent.status];
  const badge = BADGE_COLORS[agent.verificationSource];
  const approvalColor = APPROVAL_COLORS[agent.approvalRequired];
  const ruleCount =
    agent.operatingRules.length +
    agent.canDo.length +
    agent.cannotDo.length +
    agent.needsApprovalFor.length;

  const escalatesTo =
    agent.escalationPath.length > 0
      ? agent.escalationPath[agent.escalationPath.length - 1]
      : "None";

  return (
    <div
      style={{
        borderRadius: 14,
        border: isExpanded
          ? "1px solid rgba(96,165,250,0.2)"
          : "1px solid rgba(255,255,255,0.06)",
        background: isExpanded
          ? "rgba(96,165,250,0.03)"
          : "rgba(12,12,18,0.6)",
        transition: "all 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Collapsed header */}
      <div
        onClick={onToggle}
        style={{
          padding: "16px 22px",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!isExpanded)
            (e.currentTarget.parentElement as HTMLElement).style.background =
              "rgba(255,255,255,0.025)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget.parentElement as HTMLElement).style.background =
            isExpanded ? "rgba(96,165,250,0.03)" : "rgba(12,12,18,0.6)";
        }}
      >
        {/* Top row: name, role, status badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--color-client-text)",
              }}
            >
              {agent.name}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--color-client-text-secondary)",
              }}
            >
              {agent.role}
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 500,
                background: statusColor.bg,
                color: statusColor.text,
              }}
            >
              {agent.status}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-client-text-dim)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ruleCount} rules
            </span>
            <RacketIcon expanded={isExpanded} size={16} color="var(--color-client-text-dim)" />
          </div>
        </div>

        {/* Governance quick-scan strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Approval required */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontWeight: 500 }}>
              Approval:
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 600,
                background: approvalColor.bg,
                color: approvalColor.text,
                border: `1px solid ${approvalColor.border}`,
              }}
            >
              {agent.approvalRequired === "yes"
                ? "Yes"
                : agent.approvalRequired === "no"
                ? "No"
                : "Conditional"}
            </span>
          </div>

          {/* Escalates to */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontWeight: 500 }}>
              Escalates to:
            </span>
            <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", fontWeight: 500 }}>
              {escalatesTo}
            </span>
          </div>

          {/* Highest-risk boundary */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontWeight: 500, flexShrink: 0 }}>
              Risk boundary:
            </span>
            <span
              style={{
                fontSize: 11,
                color: "rgb(232,67,147)",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {agent.highestRiskBoundary}
            </span>
          </div>

          {/* Trust source */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontWeight: 500 }}>
              Trust:
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 5,
                fontSize: 10,
                fontWeight: 500,
                background: badge.bg,
                color: badge.text,
              }}
            >
              {agent.verificationSource === "verified" ? "Verified" : "Manual"}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: "0 22px 22px" }}>
          {/* ─── Governance Mini-Strip ─── */}
          <div
            style={{
              borderRadius: 10,
              border: "1px solid rgba(96,165,250,0.12)",
              background: "rgba(96,165,250,0.04)",
              padding: "14px 18px",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "rgb(96,165,250)",
                marginBottom: 10,
              }}
            >
              Governance Relationships
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "8px 24px",
              }}
            >
              <GovField label="Reports to" value={agent.governance.reportsTo} />
              <GovField label="Routes through" value={agent.governance.routesThrough} />
              <GovField label="Escalates to" value={agent.governance.escalatesTo} />
              <GovField label="Requires approval from" value={agent.governance.requiresApprovalFrom} />
              <GovField
                label="Touches systems"
                value={agent.governance.touchesSystems.length > 0 ? agent.governance.touchesSystems.join(", ") : "None"}
              />
              <GovField label="Access posture" value={agent.governance.accessPosture} highlight />
            </div>
          </div>

          {/* Owner & Escalation */}
          <div
            style={{
              display: "flex",
              gap: 24,
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div>
              <MiniLabel>Owner</MiniLabel>
              <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>
                {agent.owner}
              </span>
            </div>
            <div>
              <MiniLabel>Escalation</MiniLabel>
              <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>
                {agent.escalationPath.length > 0
                  ? agent.escalationPath.join(" → ")
                  : "None"}
              </span>
            </div>
          </div>

          {/* Approval Chain */}
          {agent.approvalChain.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <MiniLabel>Approval Chain</MiniLabel>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                  marginTop: 6,
                }}
              >
                {agent.approvalChain.map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        background: "rgba(96,165,250,0.08)",
                        border: "1px solid rgba(96,165,250,0.15)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "rgb(96,165,250)",
                          lineHeight: 1.2,
                        }}
                      >
                        {step.actor}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--color-client-text-secondary)",
                          lineHeight: 1.3,
                        }}
                      >
                        {step.action}
                      </div>
                    </div>
                    {i < agent.approvalChain.length - 1 && (
                      <span
                        style={{
                          fontSize: 14,
                          color: "rgba(96,165,250,0.5)",
                          fontWeight: 600,
                        }}
                      >
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operating Rules */}
          {agent.operatingRules.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <MiniLabel>Operating Rules</MiniLabel>
              <ul
                style={{
                  margin: "6px 0 0",
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {agent.operatingRules.map((rule, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: 12,
                      color: "var(--color-client-text-secondary)",
                      lineHeight: 1.5,
                    }}
                  >
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ─── Scope Boundary Blocks ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agent.canDo.length > 0 && (
              <ScopeBlock
                title="Can Do"
                items={agent.canDo}
                borderColor={SCOPE_COLORS.canDo.border}
                dotColor={SCOPE_COLORS.canDo.dot}
                bgColor={SCOPE_COLORS.canDo.bg}
              />
            )}
            {agent.cannotDo.length > 0 && (
              <ScopeBlock
                title="Cannot Do"
                items={agent.cannotDo}
                borderColor={SCOPE_COLORS.cannotDo.border}
                dotColor={SCOPE_COLORS.cannotDo.dot}
                bgColor={SCOPE_COLORS.cannotDo.bg}
              />
            )}
            {agent.needsApprovalFor.length > 0 && (
              <ScopeBlock
                title="Needs Approval For"
                items={agent.needsApprovalFor}
                borderColor={SCOPE_COLORS.needsApproval.border}
                dotColor={SCOPE_COLORS.needsApproval.dot}
                bgColor={SCOPE_COLORS.needsApproval.bg}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Scope Block ─── */
function ScopeBlock({
  title,
  items,
  borderColor,
  dotColor,
  bgColor,
}: {
  title: string;
  items: string[];
  borderColor: string;
  dotColor: string;
  bgColor: string;
}) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: "0 10px 10px 0",
        background: bgColor,
        padding: "12px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: borderColor,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--color-client-text-secondary)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dotColor,
                flexShrink: 0,
              }}
            />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Governance Field ─── */
function GovField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--color-client-text-dim)",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: highlight ? 600 : 500,
          color: highlight ? "rgb(96,165,250)" : "var(--color-client-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ─── Stat card ─── */
function StatCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(12,12,18,0.6)",
        padding: "18px 22px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span
        style={{
          fontSize: 26,
          fontWeight: 700,
          color,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--color-client-text-secondary)",
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
    </div>
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

/* ─── Mini label ─── */
function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--color-client-text-dim)",
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}
