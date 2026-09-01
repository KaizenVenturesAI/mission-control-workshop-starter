"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import type { AuditAction, AuditEntityType, AuditFieldChange, AuditLogEntry } from "@/types/audit-log";

type DateRange = "24h" | "7d" | "30d" | "all";
type AuditLogRow = AuditLogEntry & Record<string, unknown>;

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7d" },
  { key: "30d", label: "Last 30d" },
  { key: "all", label: "All" },
];

const ACTION_COLORS: Record<AuditAction, { bg: string; text: string; border: string }> = {
  create: { bg: "rgba(52,211,153,0.14)", text: "#34D399", border: "rgba(52,211,153,0.30)" },
  patch: { bg: "rgba(96,165,250,0.14)", text: "#60A5FA", border: "rgba(96,165,250,0.30)" },
  update: { bg: "rgba(96,165,250,0.14)", text: "#60A5FA", border: "rgba(96,165,250,0.30)" },
  delete: { bg: "rgba(245,158,11,0.14)", text: "#F59E0B", border: "rgba(245,158,11,0.30)" },
  merge: { bg: "rgba(167,139,250,0.14)", text: "#A78BFA", border: "rgba(167,139,250,0.30)" },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.round(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.round(month / 12)}y ago`;
}

function sinceFromRange(range: DateRange): string | undefined {
  const now = Date.now();
  if (range === "24h") return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  if (range === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (range === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return undefined;
}

function dateBucket(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "Unknown";
  if (ms <= 24 * 60 * 60 * 1000) return "Last 24h";
  if (ms <= 7 * 24 * 60 * 60 * 1000) return "Last 7d";
  if (ms <= 30 * 24 * 60 * 60 * 1000) return "Last 30d";
  return "Older than 30d";
}

function entityLabel(entityType: AuditEntityType, entityId: string): string {
  return `${entityType.replace("-", " ")} ${entityId}`;
}

function stringifyValue(value: unknown): string {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(s: string, n = 40): { display: string; truncated: boolean } {
  if (s.length <= n) return { display: s, truncated: false };
  return { display: `${s.slice(0, n - 1)}...`, truncated: true };
}

function ChangeRow({ change }: { change: AuditFieldChange }) {
  const beforeStr = stringifyValue(change.before);
  const afterStr = stringifyValue(change.after);
  const before = truncate(beforeStr);
  const after = truncate(afterStr);
  return (
    <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, lineHeight: 1.6 }}>
      <span style={{ color: "rgba(255,255,255,0.55)" }}>{change.field}</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>: </span>
      <span title={before.truncated ? beforeStr : undefined} style={{ color: "rgba(245,158,11,0.85)", fontFamily: "system-ui, sans-serif" }}>
        {before.display}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}> {"->"} </span>
      <span title={after.truncated ? afterStr : undefined} style={{ color: "rgba(52,211,153,0.85)", fontFamily: "system-ui, sans-serif" }}>
        {after.display}
      </span>
    </div>
  );
}

interface FetchState {
  entries: AuditLogEntry[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
}

export function AuditLogView() {
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [state, setState] = useState<FetchState>({ entries: [], nextCursor: null, loading: true, error: null });

  const buildQuery = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    const since = sinceFromRange(dateRange);
    if (since) params.set("since", since);
    params.set("limit", "50");
    if (cursor) params.set("cursor", cursor);
    return params.toString();
  }, [dateRange]);

  const load = useCallback(async (mode: "fresh" | "more") => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const cursor = mode === "more" ? state.nextCursor : null;
      const res = await fetch(`/api/audit?${buildQuery(cursor)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { entries: AuditLogEntry[]; nextCursor: string | null };
      setState((s) => ({
        entries: mode === "more" ? [...s.entries, ...json.entries] : json.entries,
        nextCursor: json.nextCursor,
        loading: false,
        error: null,
      }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Failed to load" }));
    }
  }, [buildQuery, state.nextCursor]);

  useEffect(() => {
    void load("fresh");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const openEntity = useCallback((entityType: AuditEntityType, entityId: string) => {
    if (entityType === "contact") {
      window.location.href = `/contacts?select=${entityId}`;
    } else if (entityType === "account") {
      window.location.href = `/contacts?object=accounts&select=${entityId}`;
    } else if (entityType === "opportunity") {
      window.location.href = `/contacts?object=opportunities&select=${entityId}`;
    } else if (entityType === "lead") {
      window.location.href = `/contacts?object=leads&select=${entityId}`;
    }
  }, []);

  const rows = useMemo(() => state.entries as AuditLogRow[], [state.entries]);

  const columns = useMemo<StandardTableColumn<AuditLogRow>[]>(() => [
    {
      key: "timestamp",
      label: "Date/Time",
      minWidth: 142,
      getValue: (row) => relativeTime(row.timestamp),
      getSortValue: (row) => Date.parse(row.timestamp),
      getFilterValue: (row) => dateBucket(row.timestamp),
      render: (row) => (
        <div title={row.timestamp} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ color: "rgba(255,255,255,0.76)", fontSize: 12, fontWeight: 650 }}>{relativeTime(row.timestamp)}</span>
          <span style={{ color: "var(--color-client-text-dim)", fontSize: 10 }}>{new Date(row.timestamp).toLocaleString()}</span>
        </div>
      ),
    },
    {
      key: "actor",
      label: "Actor",
      minWidth: 120,
      getValue: (row) => row.actor,
      render: (row) => <span style={{ color: "rgba(255,255,255,0.86)", fontWeight: 650 }}>{row.actor}</span>,
    },
    {
      key: "entity",
      label: "Entity",
      minWidth: 230,
      getValue: (row) => entityLabel(row.entityType, row.entityId),
      getFilterValue: (row) => row.entityType.replace("-", " "),
      render: (row) => {
        const isClickable = row.entityType === "account" || row.entityType === "contact" || row.entityType === "opportunity" || row.entityType === "lead";
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>
              {row.entityType.replace("-", " ")}
            </div>
            <button
              type="button"
              onClick={isClickable ? () => openEntity(row.entityType, row.entityId) : undefined}
              disabled={!isClickable}
              title={isClickable ? "Open in CRM" : undefined}
              style={{
                padding: 0,
                maxWidth: "100%",
                background: "transparent",
                border: "none",
                color: isClickable ? "#60A5FA" : "rgba(255,255,255,0.65)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 11,
                cursor: isClickable ? "pointer" : "default",
                textDecoration: isClickable ? "underline" : "none",
                textUnderlineOffset: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.entityId}
            </button>
          </div>
        );
      },
    },
    {
      key: "action",
      label: "Action",
      minWidth: 108,
      getValue: (row) => row.action,
      render: (row) => {
        const color = ACTION_COLORS[row.action] ?? ACTION_COLORS.update;
        return (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0,
              background: color.bg,
              color: color.text,
              border: `1px solid ${color.border}`,
            }}
          >
            {row.action}
          </span>
        );
      },
    },
    {
      key: "changes",
      label: "Changes",
      minWidth: 360,
      sortable: false,
      filterable: false,
      getValue: (row) => row.context?.summary ?? row.changes.map((change) => change.field).join(", "),
      render: (row) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          {row.context?.summary ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginBottom: 2 }}>{row.context.summary}</div>
          ) : null}
          {row.changes.length === 0 && !row.context?.summary ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>-</div>
          ) : null}
          {row.changes.map((change, i) => <ChangeRow key={`${row.id}-${i}`} change={change} />)}
        </div>
      ),
    },
  ], [openEntity]);

  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <div
        aria-label="Audit date range"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 3,
          borderRadius: 7,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.035)",
        }}
      >
        {DATE_RANGES.map((range) => {
          const active = dateRange === range.key;
          return (
            <button
              key={range.key}
              type="button"
              onClick={() => setDateRange(range.key)}
              style={{
                minHeight: 28,
                padding: "0 9px",
                borderRadius: 5,
                border: active ? "1px solid rgba(96,165,250,0.30)" : "1px solid transparent",
                background: active ? "rgba(96,165,250,0.14)" : "transparent",
                color: active ? "#BFDBFE" : "var(--color-client-text-secondary)",
                fontSize: 11,
                fontWeight: active ? 750 : 650,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {range.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => load("fresh")}
        disabled={state.loading}
        style={{
          minHeight: 34,
          padding: "0 12px",
          fontSize: 11,
          fontWeight: 750,
          borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "rgba(255,255,255,0.85)",
          cursor: state.loading ? "default" : "pointer",
          opacity: state.loading ? 0.55 : 1,
        }}
      >
        {state.loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-client-text-primary)" }}>Audit Log</div>
          <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginTop: 2 }}>
            Append-only history of every CRM write.
          </div>
        </div>
        {state.error ? <div style={{ fontSize: 12, color: "#F87171" }}>Error: {state.error}</div> : null}
      </div>

      <StandardTable<AuditLogRow>
        tableKey="crm-audit-log"
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        defaultSortKey="timestamp"
        defaultSortDir="desc"
        emptyMessage={state.loading ? "Loading audit entries..." : "No audit entries match these filters."}
        toolbar={toolbar}
        showTableManagement={false}
      />

      {state.nextCursor ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => load("more")}
            disabled={state.loading}
            style={{
              padding: "7px 14px",
              fontSize: 11,
              fontWeight: 750,
              borderRadius: 6,
              background: "rgba(96,165,250,0.10)",
              border: "1px solid rgba(96,165,250,0.20)",
              color: "#60A5FA",
              cursor: state.loading ? "default" : "pointer",
              opacity: state.loading ? 0.55 : 1,
            }}
          >
            {state.loading ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
