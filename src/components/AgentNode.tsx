"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Agent } from "@/types/agent";
import { StatusDot } from "./StatusBadge";

type AgentNodeData = {
  agent: Agent;
  isSelected: boolean;
};

function AgentNodeComponent({ data }: NodeProps) {
  const { agent, isSelected } = data as unknown as AgentNodeData;

  const borderColor = isSelected
    ? "var(--color-client-pink)"
    : agent.status === "blocked"
      ? "var(--color-status-blocked)"
      : agent.status === "degraded"
        ? "var(--color-status-degraded)"
        : "var(--color-client-border)";

  const isChief = agent.parentId === null;
  const providerLabel = agent.provider.slice(0, 4).toUpperCase();

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "var(--color-client-border)",
          border: "none",
          width: 6,
          height: 6,
          top: -3,
        }}
      />
      <div
        className="rounded-[22px] transition-all duration-200 cursor-pointer group"
        style={{
          background: isChief
            ? "linear-gradient(180deg, rgba(25,25,36,0.98) 0%, rgba(17,17,27,0.98) 100%)"
            : isSelected
              ? "linear-gradient(180deg, rgba(28,28,42,0.98) 0%, rgba(18,18,28,0.98) 100%)"
              : "linear-gradient(180deg, rgba(20,20,30,0.95) 0%, rgba(15,15,23,0.95) 100%)",
          border: `1px solid ${borderColor}55`,
          boxShadow: isSelected
            ? "0 0 0 1px rgba(232,67,147,0.22), 0 24px 60px rgba(232,67,147,0.16), 0 20px 50px rgba(0,0,0,0.45)"
            : isChief
              ? "0 28px 80px rgba(74,158,255,0.12), 0 24px 60px rgba(0,0,0,0.42)"
              : "0 18px 40px rgba(0,0,0,0.34)",
          padding: isChief ? "18px 20px" : "14px 16px",
          minWidth: isChief ? 290 : 240,
          maxWidth: isChief ? 320 : 255,
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusDot status={agent.status} />
              <span
                className="font-semibold truncate"
                style={{
                  fontSize: isChief ? "16px" : "14px",
                  color: "var(--color-client-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                {agent.name}
              </span>
            </div>
            <div
              className="truncate"
              style={{
                fontSize: "11px",
                color: "var(--color-client-text-secondary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                paddingLeft: 16,
              }}
            >
              {agent.role}
            </div>
          </div>
          <span className="agent-status-chip">{agent.status}</span>
        </div>

        <div
          className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1.5"
          style={{
            fontSize: "10px",
            color: "var(--color-client-text-dim)",
          }}
        >
          <span
            className="agent-micro-label"
            style={{
              alignSelf: "center",
            }}
          >
            Model
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="agent-model-chip">
              {agent.model.replace("claude-", "").replace("-4-6", " 4.6").replace("-4-5", " 4.5")}
            </span>
            <span className="truncate">{providerLabel}</span>
          </div>

          {agent.fallbacks && agent.fallbacks.length > 0 && (
            <>
              <span className="agent-micro-label">Fallbacks</span>
              <span className="truncate" style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.65rem", fontFamily: "var(--font-mono, monospace)" }}>
                {agent.fallbacks.map((fb, i) => `${i+1}. ${fb}`).join(" → ")}
              </span>
            </>
          )}

          <span className="agent-micro-label">Meta</span>
          <span className="truncate" style={{ color: "var(--color-client-text-secondary)" }}>
            {agent.meta}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "var(--color-client-border)",
          border: "none",
          width: 6,
          height: 6,
          bottom: -3,
        }}
      />
    </>
  );
}

export const AgentNode = memo(AgentNodeComponent);
