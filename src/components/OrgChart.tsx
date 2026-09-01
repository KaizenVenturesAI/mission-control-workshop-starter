"use client";

import { useMemo, useState } from "react";
import { agents } from "@/data/agents";
import { Agent } from "@/types/agent";
import { DetailDrawer } from "./DetailDrawer";
import { StatusDot } from "./StatusBadge";
import { AsteriskNote } from "@/components/ProvenanceSystem";
import { useMediaQuery } from "@/lib/useMediaQuery";

const statusAccentColors: Record<string, string> = {
  healthy: "rgba(52,211,153,0.5)",
  degraded: "rgba(240,160,48,0.5)",
  blocked: "rgba(239,68,68,0.5)",
  parked: "rgba(85,85,106,0.4)",
};

export function OrgChart() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const root = agents.find((a) => a.parentId === null) ?? agents[0];
  const children = agents.filter((a) => a.parentId !== null);

  const statusCounts = useMemo(
    () => ({
      healthy: agents.filter((a) => a.status === "healthy").length,
      degraded: agents.filter((a) => a.status === "degraded").length,
      blocked: agents.filter((a) => a.status === "blocked").length,
      parked: agents.filter((a) => a.status === "parked").length,
    }),
    []
  );

  return (
    <div className="w-full h-full relative">
      <div
        className="h-full relative overflow-hidden rounded-2xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(14,14,22,0.98) 0%, rgba(10,10,16,0.99) 100%)",
          border: "1px solid var(--color-client-border)",
        }}
      >
        {/* Background gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, rgba(232,67,147,0.06), transparent 22%), " +
              "radial-gradient(circle at 78% 16%, rgba(96,165,250,0.08), transparent 24%), " +
              "radial-gradient(circle at 55% 72%, rgba(52,211,153,0.04), transparent 20%)",
          }}
        />

        {/* Status chips top-left */}
        <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          <MetricChip label="Healthy" value={statusCounts.healthy} accent="green" />
          <MetricChip label="Parked" value={statusCounts.parked} accent="muted" />
        </div>

        {/* Org chart content */}
        <div className="absolute inset-0 pt-16 pb-4 px-6 overflow-auto">
          <div className="h-full flex flex-col items-center gap-8">
            {/* Root */}
            <AgentCard
              agent={root}
              selected={selectedAgent?.id === root.id}
              onClick={() => setSelectedAgent(root)}
              featured
              isMobile={isMobile}
            />

            {/* Vertical connector line */}
            <div
              style={{
                width: 1,
                height: 24,
                background: "rgba(255,255,255,0.1)",
                marginTop: -16,
                marginBottom: -16,
              }}
            />

            {/* Horizontal connector — desktop only */}
            {!isMobile && (
              <div
                style={{
                  width: "60%",
                  height: 1,
                  background: "rgba(255,255,255,0.06)",
                  marginTop: -16,
                  marginBottom: -8,
                }}
              />
            )}

            {/* Children grid */}
            <div
              className={
                isMobile
                  ? "grid grid-cols-1 gap-3 w-full"
                  : "grid grid-cols-2 lg:grid-cols-4 gap-4 w-full max-w-[1100px]"
              }
            >
              {children.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  isMobile={isMobile}
                />
              ))}
            </div>
          </div>
        </div>

        {selectedAgent && (
          <DetailDrawer agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </div>
      <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.08)" }}>
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
          This module contains placeholder/seeded content. Agent hierarchy is based on configured registry data.
        </span>
      </div>
      <AsteriskNote />
    </div>
  );
}

function AgentCard({
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
  const borderColor = selected
    ? "var(--color-client-pink)"
    : agent.status === "blocked"
      ? "var(--color-status-blocked)"
      : agent.status === "degraded"
        ? "var(--color-status-degraded)"
        : "var(--color-client-border)";

  const accentColor = statusAccentColors[agent.status] ?? statusAccentColors.parked;
  const primaryChannel = agent.channels?.[0];

  // Last action or purpose as one-line description
  const description = agent.lastAction || agent.purpose || "";

  return (
    <button
      onClick={onClick}
      className="text-left rounded-[18px] transition-all duration-200"
      style={{
        background: featured
          ? "linear-gradient(180deg, rgba(25,25,36,0.98) 0%, rgba(17,17,27,0.98) 100%)"
          : "linear-gradient(180deg, rgba(20,20,30,0.95) 0%, rgba(15,15,23,0.95) 100%)",
        border: `1px solid ${borderColor}55`,
        borderLeft: `3px solid ${accentColor}`,
        boxShadow: selected
          ? "0 0 0 1px rgba(232,67,147,0.22), 0 16px 40px rgba(0,0,0,0.4)"
          : "0 12px 32px rgba(0,0,0,0.3)",
        padding: isMobile
          ? featured ? "18px 16px" : "16px 14px"
          : featured ? "18px 20px" : "14px 16px",
        width: isMobile ? "100%" : featured ? 320 : "100%",
        maxWidth: isMobile ? undefined : featured ? 340 : undefined,
        minHeight: isMobile ? 80 : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0" style={isMobile ? { overflow: "visible" } : undefined}>
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={agent.status} />
            <span
              className={isMobile ? "font-semibold" : "font-semibold truncate"}
              style={{
                fontSize: isMobile ? 14 : featured ? 15 : 13,
                color: "var(--color-client-text)",
                letterSpacing: "-0.01em",
                ...(isMobile ? { whiteSpace: "normal", wordBreak: "break-word" } : {}),
              }}
            >
              {agent.name}
            </span>
          </div>
          <div
            className={isMobile ? "" : "truncate"}
            style={{
              fontSize: isMobile ? 11 : 10,
              color: "var(--color-client-text-secondary)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              paddingLeft: 16,
              ...(isMobile ? { whiteSpace: "normal", wordBreak: "break-word" } : {}),
            }}
          >
            {agent.role}
          </div>
        </div>
        <span className="agent-status-chip" style={{ flexShrink: 0 }}>{agent.status}</span>
      </div>

      <div
        className={isMobile ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-2"}
        style={{
          fontSize: isMobile ? 11 : 10,
          color: "var(--color-client-text-dim)",
          paddingLeft: 16,
        }}
      >
        <span className="agent-model-chip" style={{ flexShrink: 0 }}>{agent.model}</span>
        <span className={isMobile ? "" : "truncate"}>{agent.owner}</span>
        {primaryChannel && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 8,
              background: "rgba(96,165,250,0.08)",
              border: "1px solid rgba(96,165,250,0.12)",
              color: "rgba(96,165,250,0.7)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {primaryChannel.name}
          </span>
        )}
      </div>

      {description && (
        <div
          style={{
            fontSize: 10,
            color: "var(--color-client-text-dim)",
            paddingLeft: 16,
            marginTop: 6,
            opacity: 0.7,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: isMobile ? "normal" : "nowrap",
          }}
        >
          {description}
        </div>
      )}
    </button>
  );
}

function MetricChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "green" | "amber" | "pink" | "muted";
}) {
  const colors = {
    green: "rgba(52,211,153,0.12)",
    amber: "rgba(240,160,48,0.12)",
    pink: "rgba(232,67,147,0.12)",
    muted: "rgba(85,85,106,0.18)",
  };

  return (
    <div
      className="flex items-center gap-2 rounded-full"
      style={{
        padding: "8px 12px",
        background: "rgba(8,8,12,0.6)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(16px)",
        boxShadow: `inset 0 0 0 1px ${colors[accent]}`,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontFamily: "var(--font-mono)",
          color: "var(--color-client-text)",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--color-client-text-dim)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
