"use client";

import { useState, useEffect, useCallback } from "react";

interface InboxStatus {
  lastSyncAt: string | null;
  lastMessageId: string | null;
}

interface SyncStatus {
  inboxes: Record<string, InboxStatus>;
  totalEmailActivities: number;
  lastRunAt: string | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function inboxBadge(lastSyncAt: string | null): { label: string; color: string; bg: string } {
  if (!lastSyncAt) return { label: "⚠️ Never synced", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" };
  const hoursAgo = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 24) return { label: "✅ Active", color: "#dadadb", bg: "rgba(218,218,219,0.12)" };
  return { label: "❌ Error", color: "#EF4444", bg: "rgba(239,68,68,0.12)" };
}

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 20,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "rgba(255,255,255,0.4)",
  fontWeight: 600,
  marginBottom: 12,
};

export default function EmailSyncHealth() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/sync-email/status", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/crm/sync-email", { method: "POST" });
      await fetchStatus();
    } catch { /* ignore */ }
    setSyncing(false);
  }, [fetchStatus]);

  if (loading) {
    return <div style={cardStyle}><p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Loading email sync status…</p></div>;
  }

  return (
    <div style={cardStyle}>
      <div style={{ ...labelStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Email Sync</span>
        <button
          onClick={runSync}
          disabled={syncing}
          style={{
            fontSize: 11,
            padding: "4px 14px",
            borderRadius: 8,
            background: syncing ? "rgba(255,255,255,0.04)" : "rgba(218,218,219,0.15)",
            border: `1px solid ${syncing ? "rgba(255,255,255,0.06)" : "rgba(218,218,219,0.25)"}`,
            color: syncing ? "rgba(255,255,255,0.3)" : "#dadadb",
            cursor: syncing ? "default" : "pointer",
            fontWeight: 600,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          {syncing ? "Syncing…" : "Run Sync Now"}
        </button>
      </div>

      {!status ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Unable to load status.</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {Object.entries(status.inboxes).map(([inbox, data]) => {
              const badge = inboxBadge(data.lastSyncAt);
              return (
                <div
                  key={inbox}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
                    {inbox}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                      {formatTime(data.lastSyncAt)}
                    </span>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: badge.bg,
                      color: badge.color,
                    }}>
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 24, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{status.totalEmailActivities}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Email Activities</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#f1f5f9" }}>{status.lastRunAt ? formatTime(status.lastRunAt) : "—"}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Last Run</div>
            </div>
          </div>

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, marginTop: 10 }}>
            Delegated inbox access will activate only after real Google Workspace mailboxes are configured.
          </p>
        </>
      )}
    </div>
  );
}
