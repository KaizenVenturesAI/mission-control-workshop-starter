"use client";

import { agents } from "@/data/agents";

export function Header() {
  const statusCounts = {
    healthy: agents.filter((a) => a.status === "healthy").length,
    degraded: agents.filter((a) => a.status === "degraded").length,
    blocked: agents.filter((a) => a.status === "blocked").length,
    parked: agents.filter((a) => a.status === "parked").length,
  };

  const authAlerts = agents.filter((a) => a.authState === "missing" || a.authState === "expiring").length;
  const activeAgents = agents.filter((a) => a.health === "live" || a.health === "warning").length;
  const urgentIssues = agents.filter((a) => a.status === "blocked" || a.health === "offline").length;

  return (
    <header
      className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8 md:py-5 flex-shrink-0"
      style={{
        borderBottom: "1px solid var(--color-client-border-subtle)",
        background:
          "linear-gradient(180deg, rgba(10,10,15,0.92) 0%, rgba(10,10,15,0.78) 100%)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="relative w-10 h-10 rounded-2xl flex items-center justify-center font-bold flex-shrink-0"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), transparent 38%), linear-gradient(135deg, rgba(232,67,147,0.95), rgba(74,158,255,0.82) 58%, rgba(0,210,160,0.82))",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.06), 0 12px 40px rgba(74,158,255,0.18), 0 12px 40px rgba(232,67,147,0.18)",
            fontSize: "15px",
            color: "#fff",
          }}
        >
          O
        </div>
        <div>
          <h1
            className="font-semibold tracking-tight"
            style={{ fontSize: "17px", color: "var(--color-client-text)" }}
          >
            Mission Control
          </h1>
          <p
            style={{
              fontSize: "11px",
              color: "var(--color-client-text-secondary)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Example Client Agent Org Chart · V2 Increment
          </p>
        </div>
      </div>

      <div className="hidden xl:flex items-center gap-3 min-w-0">
        <div className="px-3 py-2 rounded-2xl shell-chip">
          <div className="shell-chip-label">Mode</div>
          <div className="shell-chip-value">Mixed mock/live UI layer</div>
        </div>
        <div className="px-3 py-2 rounded-2xl shell-chip">
          <div className="shell-chip-label">Focus</div>
          <div className="shell-chip-value">Status · Drawer · Activity</div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap justify-end">
        <StatusPill color="var(--color-status-healthy)" count={statusCounts.healthy} label="Healthy" />
        <StatusPill color="var(--color-status-degraded)" count={statusCounts.degraded} label="Degraded" />
        <StatusPill color="var(--color-status-blocked)" count={statusCounts.blocked} label="Blocked" />
        <StatusPill color="var(--color-status-parked)" count={statusCounts.parked} label="Parked" />
        <ExecChip label="Active" value={activeAgents} tone="var(--color-client-blue)" />
        <ExecChip label="Auth alerts" value={authAlerts} tone="var(--color-status-degraded)" />
        <ExecChip label="Urgent" value={urgentIssues} tone="var(--color-status-blocked)" />
        <span
          className="hidden sm:inline"
          style={{
            fontSize: "12px",
            color: "var(--color-client-text-dim)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {agents.length} agents tracked
        </span>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background: "var(--color-client-green)",
            boxShadow: "0 0 8px var(--color-client-green)",
          }}
        />
      </div>
    </header>
  );
}

function StatusPill({ color, count, label }: { color: string; count: number; label: string }) {
  if (count === 0) return null;
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span style={{ fontSize: "12px", color: "var(--color-client-text)", fontFamily: "var(--font-mono)" }}>{count}</span>
      <span className="hidden sm:inline" style={{ fontSize: "11px", color: "var(--color-client-text-dim)" }}>{label}</span>
    </div>
  );
}

function ExecChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="exec-chip">
      <div className="exec-chip-label">{label}</div>
      <div className="exec-chip-value" style={{ color: tone }}>{value}</div>
    </div>
  );
}
