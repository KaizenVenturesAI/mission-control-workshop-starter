"use client";

import { AgentStatus } from "@/types/agent";

const statusConfig: Record<
  AgentStatus,
  { color: string; bg: string; label: string; pulse: boolean }
> = {
  healthy: {
    color: "var(--color-client-green)",
    bg: "var(--color-client-green-dim)",
    label: "Healthy",
    pulse: true,
  },
  degraded: {
    color: "var(--color-status-degraded)",
    bg: "rgba(240, 160, 48, 0.12)",
    label: "Degraded",
    pulse: true,
  },
  blocked: {
    color: "var(--color-status-blocked)",
    bg: "var(--color-client-pink-dim)",
    label: "Blocked",
    pulse: false,
  },
  parked: {
    color: "var(--color-status-parked)",
    bg: "rgba(85, 85, 106, 0.15)",
    label: "Parked",
    pulse: false,
  },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: AgentStatus;
  size?: "sm" | "md";
}) {
  const config = statusConfig[status];
  const dotSize = size === "sm" ? 6 : 8;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{
        background: config.bg,
        fontSize: size === "sm" ? "11px" : "12px",
        letterSpacing: "0.04em",
      }}
    >
      <span
        className="relative flex-shrink-0"
        style={{ width: dotSize, height: dotSize }}
      >
        {config.pulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: config.color,
              opacity: 0.4,
              animationDuration: "2s",
            }}
          />
        )}
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: config.color }}
        />
      </span>
      <span
        className="font-medium uppercase tracking-wider"
        style={{ color: config.color }}
      >
        {config.label}
      </span>
    </span>
  );
}

export function StatusDot({ status }: { status: AgentStatus }) {
  const config = statusConfig[status];
  return (
    <span className="relative flex-shrink-0" style={{ width: 8, height: 8 }}>
      {config.pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            background: config.color,
            opacity: 0.4,
            animationDuration: "2s",
          }}
        />
      )}
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: config.color }}
      />
    </span>
  );
}
