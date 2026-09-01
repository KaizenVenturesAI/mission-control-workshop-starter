"use client";

import { Agent, ActivitySeverity } from "@/types/agent";
import { StatusBadge } from "./StatusBadge";

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2 gap-3">
        <h3
          className="uppercase tracking-wider font-medium"
          style={{
            fontSize: "10px",
            color: "var(--color-client-text-dim)",
            letterSpacing: "0.1em",
          }}
        >
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function ChannelIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    slack: "⌗",
    email: "✉",
    api: "⚡",
    webhook: "↗",
    calendar: "◫",
    github: "⊙",
  };
  return (
    <span
      className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded"
      style={{
        background: "var(--color-client-surface)",
        fontSize: "11px",
        color: "var(--color-client-text-secondary)",
      }}
    >
      {icons[type] || "·"}
    </span>
  );
}

function severityColor(severity: ActivitySeverity) {
  if (severity === "critical") return "var(--color-status-blocked)";
  if (severity === "warning") return "var(--color-status-degraded)";
  return "var(--color-client-blue)";
}

function healthTone(health: Agent["health"]) {
  if (health === "live") return { bg: "var(--color-client-green-dim)", text: "var(--color-client-green)", label: "Live" };
  if (health === "warning") return { bg: "rgba(240,160,48,0.12)", text: "var(--color-status-degraded)", label: "Warning" };
  if (health === "offline") return { bg: "var(--color-client-pink-dim)", text: "var(--color-status-blocked)", label: "Offline" };
  return { bg: "rgba(85,85,106,0.2)", text: "var(--color-status-parked)", label: "Stale" };
}

function authTone(authState: Agent["authState"]) {
  if (authState === "connected") return { bg: "var(--color-client-green-dim)", text: "var(--color-client-green)", label: "Connected" };
  if (authState === "expiring") return { bg: "rgba(240,160,48,0.12)", text: "var(--color-status-degraded)", label: "Expiring" };
  if (authState === "missing") return { bg: "var(--color-client-pink-dim)", text: "var(--color-status-blocked)", label: "Missing" };
  return { bg: "rgba(74,158,255,0.12)", text: "var(--color-client-blue)", label: "Mock" };
}

export function DetailDrawer({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const health = healthTone(agent.health);
  const auth = authTone(agent.authState);

  return (
    <>
      <div
        className="fixed inset-0 z-40 backdrop-enter lg:hidden"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      <div
        className="fixed top-0 right-0 bottom-0 z-50 drawer-enter flex flex-col lg:absolute lg:top-4 lg:right-4 lg:bottom-4"
        style={{
          width: "min(460px, 94vw)",
          background:
            "linear-gradient(180deg, rgba(18,18,26,0.97) 0%, rgba(12,12,19,0.99) 100%)",
          borderLeft: "1px solid var(--color-client-border-subtle)",
          boxShadow: "-10px 0 50px rgba(0,0,0,0.4)",
          borderRadius: "24px 0 0 24px",
        }}
      >
        <div
          className="flex items-start justify-between p-5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--color-client-border-subtle)" }}
        >
          <div className="flex-1 min-w-0 mr-3">
            <div
              className="mb-2"
              style={{
                fontSize: "10px",
                color: "var(--color-client-text-dim)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Agent Detail
            </div>
            <h2
              className="font-semibold mb-1"
              style={{ fontSize: "22px", color: "var(--color-client-text)", letterSpacing: "-0.02em" }}
            >
              {agent.name}
            </h2>
            <p
              className="mb-3"
              style={{
                fontSize: "13px",
                color: "var(--color-client-text-secondary)",
              }}
            >
              {agent.role}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={agent.status} size="md" />
              <StatusChip label={health.label} bg={health.bg} text={health.text} />
              <StatusChip label={`Auth · ${auth.label}`} bg={auth.bg} text={auth.text} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{
              color: "var(--color-client-text-dim)",
              background: "transparent",
            }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <Section
            title="Live Status"
            right={
              <span style={{ fontSize: "11px", color: "var(--color-client-text-dim)", fontFamily: "var(--font-mono)" }}>
                last seen {agent.lastSeen}
              </span>
            }
          >
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MiniMetric label="Health" value={health.label} tone={health.text} />
              <MiniMetric label="Auth" value={auth.label} tone={auth.text} />
              <MiniMetric label="24h" value={`${agent.activityCount24h}`} tone="var(--color-client-blue)" />
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-client-text-secondary)",
                lineHeight: "1.5",
              }}
            >
              {agent.statusReason}
            </p>
          </Section>

          <Section title="Mission & Ownership">
            <div className="space-y-3">
              <p style={{ fontSize: "13px", color: "var(--color-client-text)", lineHeight: "1.6" }}>{agent.purpose}</p>
              <div className="grid grid-cols-2 gap-2">
                <InfoTile label="Owner" value={agent.owner} />
                <InfoTile label="Primary Channel" value={agent.channels[0]?.name ?? "—"} />
              </div>
            </div>
          </Section>

          <Section title="Runtime">
            <div className="grid grid-cols-2 gap-2">
              <InfoTile label="Model" value={agent.model} mono />
              <InfoTile label="Provider" value={agent.provider} />
            </div>
          </Section>

          <Section title="Current Blockers">
            {agent.blockers && agent.blockers.length > 0 ? (
              <div className="flex flex-col gap-2">
                {agent.blockers.map((blocker) => (
                  <div
                    key={blocker}
                    className="px-3 py-2 rounded-lg"
                    style={{
                      background: "rgba(232,67,147,0.08)",
                      border: "1px solid rgba(232,67,147,0.18)",
                      color: "var(--color-client-text-secondary)",
                      fontSize: "12px",
                    }}
                  >
                    {blocker}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "var(--color-client-text-dim)" }}>No active blockers.</p>
            )}
          </Section>

          <Section title="Channels & Bindings">
            <div className="flex flex-col gap-1.5">
              {agent.channels.map((ch) => (
                <div
                  key={ch.name}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                  style={{
                    background: "var(--color-client-surface-raised)",
                    border: "1px solid var(--color-client-border-subtle)",
                  }}
                >
                  <ChannelIcon type={ch.type} />
                  <span style={{ fontSize: "12px", color: "var(--color-client-text)" }}>{ch.name}</span>
                  <span className="ml-auto uppercase" style={{ fontSize: "9px", color: "var(--color-client-text-dim)", letterSpacing: "0.08em" }}>
                    {ch.type}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Capabilities">
            <div className="flex flex-wrap gap-1.5">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="px-2 py-1 rounded-md"
                  style={{
                    background: "var(--color-client-surface-raised)",
                    border: "1px solid var(--color-client-border-subtle)",
                    fontSize: "11px",
                    color: "var(--color-client-text-secondary)",
                  }}
                >
                  {cap}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Recent Actions" right={<span style={{ fontSize: "11px", color: "var(--color-client-text-dim)" }}>{agent.activityCount24h} in last 24h</span>}>
            <div className="flex flex-col gap-2">
              {agent.activities.map((item) => (
                <div
                  key={item.id}
                  className="px-3 py-2.5 rounded-lg"
                  style={{
                    background: "var(--color-client-surface-raised)",
                    border: "1px solid var(--color-client-border-subtle)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: severityColor(item.severity) }}
                      />
                      <span style={{ fontSize: "12px", color: "var(--color-client-text)", lineHeight: "1.5" }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--color-client-text-dim)", whiteSpace: "nowrap" }}>{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Notes">
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-client-text-secondary)",
                lineHeight: "1.6",
                fontStyle: "italic",
              }}
            >
              {agent.notes}
            </p>
          </Section>
        </div>

        <div
          className="flex-shrink-0 px-5 py-3 flex items-center justify-between"
          style={{
            borderTop: "1px solid var(--color-client-border-subtle)",
            background: "var(--color-client-surface)",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--color-client-text-dim)" }}>ID: {agent.id}</span>
          <span
            className="px-2.5 py-1 rounded"
            style={{
              fontSize: "10px",
              color: "var(--color-client-blue)",
              background: "var(--color-client-blue-dim)",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.04em",
            }}
          >
            MIXED MOCK / LIVE UI
          </span>
        </div>
      </div>
    </>
  );
}

function StatusChip({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-1"
      style={{
        fontSize: "11px",
        background: bg,
        color: text,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div
      className="px-3 py-2 rounded-xl"
      style={{
        background: "var(--color-client-surface-raised)",
        border: "1px solid var(--color-client-border-subtle)",
      }}
    >
      <div style={{ fontSize: "9px", color: "var(--color-client-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "12px", color: tone, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function InfoTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="px-3 py-2 rounded-xl"
      style={{
        background: "var(--color-client-surface-raised)",
        border: "1px solid var(--color-client-border-subtle)",
      }}
    >
      <div style={{ fontSize: "9px", color: "var(--color-client-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: "12px", color: "var(--color-client-text)", fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)" }}>{value}</div>
    </div>
  );
}
