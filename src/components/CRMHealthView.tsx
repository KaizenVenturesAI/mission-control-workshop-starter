"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";

type HealthTone = "ok" | "watch" | "risk";
type QueuePriority = "critical" | "high" | "medium" | "low";

interface HealthMetric {
  key: string;
  label: string;
  value: number;
  tone: HealthTone;
  detail: string;
}

interface QueueItem {
  id: string;
  kind: "lead" | "opportunity" | "contact" | "account" | "email";
  entityId?: string;
  title: string;
  detail: string;
  owner?: string;
  defaultAssignee?: string;
  dueAt?: string;
  priority: QueuePriority;
  href: string;
}

interface CRMHealthPayload {
  generatedAt: string;
  backend: {
    status: "ok";
    backend: "local-json" | "supabase";
    readModel: "json" | "postgres";
    readPath?: "store-abstraction";
    sourceMode?: "local-json" | "supabase";
    urlConfigured: boolean;
    secretConfigured: boolean;
  };
  counts: {
    contacts: number;
    accounts: number;
    activities: number;
    opportunities: number;
    openOpportunities: number;
    leads: number;
    activeLeads: number;
    unmatchedEmails: number;
    queue: number;
  };
  health: HealthMetric[];
  queue: QueueItem[];
}

const toneStyles: Record<HealthTone, { bg: string; border: string; text: string }> = {
  ok: { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.26)", text: "#34D399" },
  watch: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.26)", text: "#FBBF24" },
  risk: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.28)", text: "#F87171" },
};

const priorityStyles: Record<QueuePriority, { bg: string; border: string; text: string }> = {
  critical: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.30)", text: "#F87171" },
  high: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.30)", text: "#FBBF24" },
  medium: { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.30)", text: "#60A5FA" },
  low: { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.22)", text: "#94A3B8" },
};

const shellStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const panelStyle: React.CSSProperties = {
  background: "var(--color-client-bg-card)",
  border: "1px solid var(--color-client-border)",
  borderRadius: 8,
};

function formatDate(value?: string) {
  if (!value) return "No date";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function MetricPill({ tone }: { tone: HealthTone }) {
  const s = toneStyles[tone];
  return (
    <span style={{ padding: "3px 7px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontSize: 11, fontWeight: 700 }}>
      {tone.toUpperCase()}
    </span>
  );
}

function PriorityPill({ priority }: { priority: QueuePriority }) {
  const s = priorityStyles[priority];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", alignSelf: "center", justifySelf: "end", height: 24, padding: "0 8px", borderRadius: 999, background: s.bg, border: `1px solid ${s.border}`, color: s.text, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {priority.toUpperCase()}
    </span>
  );
}

function SummaryNumber({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ ...panelStyle, padding: 14 }}>
      <div style={{ fontSize: 22, fontWeight: 750, color: "var(--color-client-text)", lineHeight: 1 }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-client-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ ...panelStyle, padding: 18, color: "var(--color-client-text-muted)", fontSize: 13 }}>
      Loading CRM health...
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "neutral",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
}) {
  const styles = {
    neutral: { border: "rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text-muted)" },
    primary: { border: "rgba(96,165,250,0.30)", background: "rgba(96,165,250,0.12)", color: "#93C5FD" },
    danger: { border: "rgba(248,113,113,0.28)", background: "rgba(248,113,113,0.10)", color: "#FCA5A5" },
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "6px 8px",
        borderRadius: 7,
        border: `1px solid ${styles.border}`,
        background: styles.background,
        color: styles.color,
        fontSize: 11,
        fontWeight: 650,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function payloadFromConsole(consoleData: CRMConsolePayload): CRMHealthPayload {
  return {
    generatedAt: consoleData.generatedAt,
    backend: consoleData.backend,
    counts: consoleData.counts,
    health: consoleData.healthSummary,
    queue: consoleData.queue,
  };
}

export function CRMHealthView({
  mode = "health",
  consoleData,
  consoleLoading = false,
}: {
  mode?: "health" | "queue";
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<CRMHealthPayload | null>(() => consoleData ? payloadFromConsole(consoleData) : null);
  const [loading, setLoading] = useState(!consoleData);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/health", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`);
      setData(payload as CRMHealthPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load CRM health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (consoleData) {
      setData(payloadFromConsole(consoleData));
      setLoading(false);
      return;
    }
    if (consoleLoading) return;
    void refresh();
  }, [consoleData, consoleLoading, refresh]);

  const runQueueAction = useCallback(async (actionKey: string, payload: Record<string, unknown>, successMessage: string) => {
    setBusyAction(actionKey);
    setNotice(null);
    try {
      const res = await fetch("/api/crm/action-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const response = await res.json();
      if (!res.ok) throw new Error(response?.error ?? `HTTP ${res.status}`);
      setNotice(successMessage);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  }, [refresh]);

  const sortedMetrics = useMemo(() => {
    if (!data) return [];
    const rank: Record<HealthTone, number> = { risk: 0, watch: 1, ok: 2 };
    return [...data.health].sort((a, b) => rank[a.tone] - rank[b.tone] || b.value - a.value);
  }, [data]);

  if (loading && !data) return <LoadingState />;

  if (error) {
    return (
      <div style={{ ...panelStyle, padding: 16, borderColor: "rgba(248,113,113,0.32)", color: "#F87171", fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!data) return null;

  if (mode === "queue") {
    return (
      <div style={shellStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-client-text)" }}>Action Queue</h2>
            <p style={{ margin: "4px 0 0", color: "var(--color-client-text-muted)", fontSize: 12 }}>
              Prioritized leads, opportunities, contacts, accounts, and email matching work.
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text)", fontSize: 12, cursor: "pointer" }}>
            Refresh
          </button>
        </div>

        {notice ? (
          <div style={{ ...panelStyle, padding: 12, color: notice.includes("failed") || notice.includes("required") ? "#FCA5A5" : "var(--color-client-text-muted)", fontSize: 12 }}>
            {notice}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <SummaryNumber label="Open items" value={data.counts.queue} />
          <SummaryNumber label="Active leads" value={data.counts.activeLeads} />
          <SummaryNumber label="Open opportunities" value={data.counts.openOpportunities} />
          <SummaryNumber label="Unmatched emails" value={data.counts.unmatchedEmails} />
        </div>

        <div style={{ ...panelStyle, padding: 14, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 750, color: "var(--color-client-text)" }}>Stale lead cleanup</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "var(--color-client-text-muted)" }}>Close unconverted active leads older than 180 days as lost.</div>
          </div>
          <ActionButton
            tone="danger"
            disabled={busyAction === "bulk-close-stale-leads"}
            onClick={() => void runQueueAction("bulk-close-stale-leads", { action: "bulk-close-stale-leads", olderThanDays: 180 }, "Closed stale leads older than 180 days.")}
          >
            Close stale leads
          </ActionButton>
        </div>

        <div style={{ ...panelStyle, overflow: "hidden" }}>
          {data.queue.length === 0 ? (
            <div style={{ padding: 18, color: "var(--color-client-text-muted)", fontSize: 13 }}>No priority CRM action items right now.</div>
          ) : (
            data.queue.map((item, index) => (
              <div
                key={item.id}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 12,
                  padding: "13px 14px",
                  border: "none",
                  borderTop: index === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  background: "transparent",
                  color: "inherit",
                  textAlign: "left",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => router.push(item.href)}
                      style={{ padding: 0, border: "none", background: "transparent", color: "var(--color-client-text)", fontSize: 13, fontWeight: 700, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
                    >
                      {item.title}
                    </button>
                    <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", textTransform: "uppercase" }}>{item.kind}</span>
                  </span>
                  <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--color-client-text-muted)", lineHeight: 1.4 }}>{item.detail}</span>
                  <span style={{ display: "block", marginTop: 5, fontSize: 11, color: "var(--color-client-text-dim)" }}>
                    {item.owner ? `Owner: ${item.owner}` : "Owner needed"} · {formatDate(item.dueAt)}
                  </span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                    {item.kind === "lead" && item.entityId && !item.owner ? (
                      <ActionButton
                        tone="primary"
                        disabled={busyAction === `${item.id}:assign`}
                        onClick={() => void runQueueAction(`${item.id}:assign`, { action: "assign-default-lead", leadId: item.entityId }, `Assigned lead to ${item.defaultAssignee ?? "default owner"}.`)}
                      >
                        Assign default
                      </ActionButton>
                    ) : null}
                    {item.kind === "lead" && item.entityId ? (
                      <>
                        <ActionButton
                          disabled={busyAction === `${item.id}:contacted`}
                          onClick={() => void runQueueAction(`${item.id}:contacted`, { action: "mark-lead-contacted", leadId: item.entityId }, "Marked lead as contacted.")}
                        >
                          Mark contacted
                        </ActionButton>
                        <ActionButton
                          tone="danger"
                          disabled={busyAction === `${item.id}:lost`}
                          onClick={() => void runQueueAction(`${item.id}:lost`, { action: "close-lead-lost", leadId: item.entityId, reason: "No response from action queue" }, "Closed lead as lost.")}
                        >
                          Close lost
                        </ActionButton>
                      </>
                    ) : null}
                    {item.kind === "opportunity" && item.entityId ? (
                      <ActionButton
                        disabled={busyAction === `${item.id}:opp-snooze`}
                        onClick={() => void runQueueAction(`${item.id}:opp-snooze`, { action: "snooze-opportunity", opportunityId: item.entityId, days: 7 }, "Moved opportunity next step out 7 days.")}
                      >
                        Move due 7d
                      </ActionButton>
                    ) : null}
                    {item.kind === "contact" && item.entityId && item.id.startsWith("contact-followup-") ? (
                      <ActionButton
                        disabled={busyAction === `${item.id}:clear-followup`}
                        onClick={() => void runQueueAction(`${item.id}:clear-followup`, { action: "clear-contact-followup", contactId: item.entityId }, "Cleared contact follow-up state.")}
                      >
                        Clear follow-up
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      disabled={busyAction === `${item.id}:snooze`}
                      onClick={() => void runQueueAction(`${item.id}:snooze`, { action: "snooze", itemId: item.id, days: 7 }, "Snoozed queue item for 7 days.")}
                    >
                      Snooze 7d
                    </ActionButton>
                    <ActionButton
                      disabled={busyAction === `${item.id}:ignore`}
                      onClick={() => void runQueueAction(`${item.id}:ignore`, { action: "ignore", itemId: item.id, reason: "Dismissed from action queue" }, "Ignored queue item.")}
                    >
                      Ignore
                    </ActionButton>
                  </span>
                </span>
                <PriorityPill priority={item.priority} />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-client-text)" }}>CRM Health</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-client-text-muted)", fontSize: 12 }}>
            Backend, pipeline, assignment, sync, and data-quality posture.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text)", fontSize: 12, cursor: "pointer" }}>
          Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 }}>
        <SummaryNumber label="Contacts" value={data.counts.contacts} />
        <SummaryNumber label="Accounts" value={data.counts.accounts} />
        <SummaryNumber label="Activities" value={data.counts.activities} />
        <SummaryNumber label="Leads" value={data.counts.leads} />
        <SummaryNumber label="Opportunities" value={data.counts.opportunities} />
      </div>

      <div style={{ ...panelStyle, padding: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>Backend</span>
        <span style={{ fontSize: 13, color: "var(--color-client-text)", fontWeight: 700 }}>{data.backend.backend}</span>
        <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>Read model</span>
        <span style={{ fontSize: 13, color: "var(--color-client-text)", fontWeight: 700 }}>{data.backend.readModel}</span>
        <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>Path</span>
        <span style={{ fontSize: 13, color: "var(--color-client-text)", fontWeight: 700 }}>{data.backend.readPath ?? "store-abstraction"}</span>
        <MetricPill tone={data.backend.status === "ok" ? "ok" : "risk"} />
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-client-text-dim)" }}>Updated {formatDate(data.generatedAt)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10 }}>
        {sortedMetrics.map((metric) => (
          <div key={metric.key} style={{ ...panelStyle, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--color-client-text)", fontWeight: 700 }}>{metric.label}</div>
              <MetricPill tone={metric.tone} />
            </div>
            <div style={{ marginTop: 12, fontSize: 28, lineHeight: 1, color: "var(--color-client-text)", fontWeight: 800 }}>{metric.value}</div>
            <div style={{ marginTop: 8, color: "var(--color-client-text-muted)", fontSize: 12, lineHeight: 1.45 }}>{metric.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
