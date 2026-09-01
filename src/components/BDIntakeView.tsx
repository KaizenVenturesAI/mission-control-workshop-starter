"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

type BDDraftStatus = "pending_approval" | "approved" | "sent" | "send_failed" | "cancelled";

interface PendingBDEmailDraft {
  id: string;
  status: BDDraftStatus;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyText: string;
  contactId: string;
  accountId?: string;
  opportunityId?: string;
  intakeId: string;
  warnings: string[];
  approvalOwner?: string;
  assignedOwner?: string;
  businessMotion?: string;
  packageSuggestion?: string;
  senderMode?: string;
  nextActionDueAt?: string;
  approvalDueAt?: string;
  followUpDueAt?: string;
  bumpDueAt?: string;
  nurtureDueAt?: string;
  promiseActionItemIds?: string[];
  completionStatus?: {
    complete: boolean;
    missing: string[];
  };
  memoryWriteBack?: {
    required: boolean;
    written: boolean;
    ref?: string;
  };
  createdAt: string;
  updatedAt: string;
  gmailDraftId?: string;
  gmailMessageId?: string;
  sendError?: string;
}

interface BDIntakeResponse {
  draft: PendingBDEmailDraft;
}

const statusTone: Record<BDDraftStatus, { color: string; bg: string; border: string; label: string }> = {
  pending_approval: { color: "#FBBF24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.24)", label: "Pending approval" },
  approved: { color: "#93C5FD", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.24)", label: "Approved" },
  sent: { color: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.24)", label: "Sent" },
  send_failed: { color: "#F87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.24)", label: "Send failed" },
  cancelled: { color: "#94A3B8", bg: "rgba(148,163,184,0.12)", border: "rgba(148,163,184,0.24)", label: "Cancelled" },
};

function StatusPill({ status }: { status: BDDraftStatus }) {
  const tone = statusTone[status] ?? statusTone.pending_approval;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 8px", borderRadius: 999, color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, fontSize: 11, fontWeight: 750, whiteSpace: "nowrap" }}>
      {tone.label}
    </span>
  );
}

function compactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function compactLabel(value?: string): string {
  if (!value) return "Not set";
  return value.replace(/_/g, " ");
}

export function BDIntakeView() {
  const [drafts, setDrafts] = useState<PendingBDEmailDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [createOpportunity, setCreateOpportunity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => drafts.find((draft) => draft.id === selectedId) ?? drafts[0], [drafts, selectedId]);

  const loadDrafts = useCallback(async () => {
    const response = await fetch("/api/crm/bd-drafts", { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load BD drafts (${response.status})`);
    const data = await response.json() as PendingBDEmailDraft[];
    setDrafts(data);
    if (!selectedId && data[0]) setSelectedId(data[0].id);
  }, [selectedId]);

  useEffect(() => {
    loadDrafts().catch((err) => setError(err instanceof Error ? err.message : "Could not load BD drafts"));
  }, [loadDrafts]);

  const submitIntake = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/crm/bd-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, createOpportunity }),
      });
      const data = await response.json().catch(() => null) as BDIntakeResponse | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data ? data.error : `BD intake failed (${response.status})`);
      const draft = (data as BDIntakeResponse).draft;
      setMessage(`Draft ready: ${draft.subject}`);
      setNote("");
      setCreateOpportunity(false);
      await loadDrafts();
      setSelectedId(draft.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "BD intake failed");
    } finally {
      setLoading(false);
    }
  };

  const approveDraft = async (draftId: string) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/crm/bd-drafts/${draftId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBy: "Alex", approvalReaction: "manual-crm-approval" }),
      });
      const data = await response.json().catch(() => null) as PendingBDEmailDraft | { error?: string } | null;
      if (!response.ok) throw new Error(data && "error" in data ? data.error : `Approval failed (${response.status})`);
      setMessage((data as PendingBDEmailDraft).status === "sent" ? "Follow-up sent from Mission Agent." : "Approval recorded.");
      await loadDrafts();
      setSelectedId(draftId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      await loadDrafts().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  };

  const columns: StandardTableColumn<PendingBDEmailDraft>[] = [
    {
      key: "createdAt",
      label: "Created",
      getValue: (row) => row.createdAt,
      render: (row) => <span style={{ color: "var(--color-client-text-secondary)", fontSize: 12 }}>{compactDate(row.createdAt)}</span>,
      minWidth: 130,
    },
    {
      key: "subject",
      label: "Draft",
      getValue: (row) => row.subject,
      render: (row) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#F8FAFC", fontWeight: 650 }}>{row.subject}</div>
          <div style={{ marginTop: 3, color: "var(--color-client-text-dim)", fontSize: 11 }}>To {row.to.join(", ")} · CC {row.cc.join(", ")}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      getValue: (row) => row.status,
      render: (row) => <StatusPill status={row.status} />,
      minWidth: 150,
    },
    {
      key: "assignedOwner",
      label: "Owner",
      getValue: (row) => row.assignedOwner ?? "",
      render: (row) => <span style={{ color: "#E2E8F0", fontSize: 12 }}>{row.assignedOwner ?? "Unassigned"}</span>,
      minWidth: 110,
    },
    {
      key: "approvalDueAt",
      label: "Approval due",
      getValue: (row) => row.approvalDueAt ?? "",
      render: (row) => <span style={{ color: "var(--color-client-text-secondary)", fontSize: 12 }}>{row.approvalDueAt ? compactDate(row.approvalDueAt) : "Not set"}</span>,
      minWidth: 130,
    },
    {
      key: "warnings",
      label: "Flags",
      getValue: (row) => String(row.warnings.length),
      render: (row) => <span style={{ color: row.warnings.length ? "#FBBF24" : "var(--color-client-text-dim)", fontSize: 12 }}>{row.warnings.length || "None"}</span>,
      minWidth: 90,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <section style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 8, background: "rgba(15,23,42,0.42)", padding: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>BD intake</div>
            <h2 style={{ margin: "3px 0 0", fontSize: 18, color: "var(--color-client-text)", fontWeight: 750 }}>Chief of Staff follow-up workflow</h2>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)", textAlign: "right" }}>Example Client Mission Agent · Chief of Staff to Alex</div>
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Met Jane Smith jane@brand.com from Brand Co. Talked about a summer partnership. Draft a follow-up and create an opportunity."
          style={{ width: "100%", minHeight: 112, resize: "vertical", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(2,6,23,0.6)", color: "var(--color-client-text)", padding: 12, fontSize: 13, lineHeight: 1.5, outline: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--color-client-text-secondary)", fontSize: 12 }}>
            <input type="checkbox" checked={createOpportunity} onChange={(event) => setCreateOpportunity(event.target.checked)} />
            Create opportunity
          </label>
          <button
            type="button"
            disabled={loading || !note.trim()}
            onClick={submitIntake}
            style={{ height: 34, padding: "0 14px", borderRadius: 7, border: "1px solid rgba(52,211,153,0.26)", background: loading || !note.trim() ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.14)", color: loading || !note.trim() ? "rgba(255,255,255,0.35)" : "#86EFAC", cursor: loading || !note.trim() ? "not-allowed" : "pointer", fontWeight: 750, fontSize: 12 }}
          >
            Draft follow-up
          </button>
        </div>
        {message ? <div style={{ marginTop: 10, color: "#34D399", fontSize: 12 }}>{message}</div> : null}
        {error ? <div style={{ marginTop: 10, color: "#F87171", fontSize: 12 }}>{error}</div> : null}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.75fr)", gap: 14, alignItems: "start" }}>
        <StandardTable
          tableKey="bd-email-drafts"
          data={drafts}
          columns={columns}
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedRowKey={selected?.id ?? null}
          emptyMessage="No BD drafts yet"
        />
        <aside style={{ border: "1px solid rgba(148,163,184,0.14)", borderRadius: 8, background: "rgba(15,23,42,0.42)", padding: 14, minHeight: 280 }}>
          {selected ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>Draft preview</div>
                  <div style={{ marginTop: 3, color: "#F8FAFC", fontWeight: 750 }}>{selected.subject}</div>
                </div>
                <StatusPill status={selected.status} />
              </div>
              <div style={{ display: "grid", gap: 6, color: "var(--color-client-text-secondary)", fontSize: 12, marginBottom: 12 }}>
                <div>From: {selected.from}</div>
                <div>To: {selected.to.join(", ")}</div>
                <div>CC: {selected.cc.join(", ")}</div>
                <div>Signature: Example Client Mission Agent, Chief of Staff to Alex, inline Example Client logo</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                {[
                  ["Motion", selected.businessMotion],
                  ["Owner", selected.assignedOwner],
                  ["Sender", compactLabel(selected.senderMode)],
                  ["Approval", selected.approvalDueAt ? compactDate(selected.approvalDueAt) : undefined],
                  ["Next touch", selected.bumpDueAt ? compactDate(selected.bumpDueAt) : undefined],
                  ["Memory", selected.memoryWriteBack?.required ? selected.memoryWriteBack.written ? "Written" : "Required" : "Not required"],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: "1px solid rgba(148,163,184,0.12)", borderRadius: 7, background: "rgba(2,6,23,0.34)", padding: "8px 9px", minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>{label}</div>
                    <div style={{ marginTop: 3, color: "#F8FAFC", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "Not set"}</div>
                  </div>
                ))}
              </div>
              {selected.packageSuggestion ? (
                <div style={{ marginBottom: 12, border: "1px solid rgba(96,165,250,0.18)", borderRadius: 7, background: "rgba(96,165,250,0.08)", padding: 10, color: "#BFDBFE", fontSize: 12, lineHeight: 1.45 }}>
                  {selected.packageSuggestion}
                </div>
              ) : null}
              {selected.promiseActionItemIds?.length ? (
                <div style={{ marginBottom: 12, color: "var(--color-client-text-secondary)", fontSize: 12 }}>
                  Action items: {selected.promiseActionItemIds.join(", ")}
                </div>
              ) : null}
              {selected.completionStatus && !selected.completionStatus.complete ? (
                <div style={{ marginBottom: 12, color: "#FBBF24", fontSize: 12 }}>
                  Loose-thread check: {selected.completionStatus.missing.join(", ")}
                </div>
              ) : null}
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, maxHeight: 360, overflow: "auto", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(2,6,23,0.56)", padding: 12, color: "var(--color-client-text)", fontSize: 12, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{selected.bodyText}</pre>
              {selected.warnings.length ? (
                <div style={{ marginTop: 12, color: "#FBBF24", fontSize: 12 }}>
                  {selected.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button
                  type="button"
                  disabled={loading || selected.status === "sent"}
                  onClick={() => approveDraft(selected.id)}
                  style={{ height: 34, padding: "0 14px", borderRadius: 7, border: "1px solid rgba(52,211,153,0.28)", background: selected.status === "sent" ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.14)", color: selected.status === "sent" ? "rgba(255,255,255,0.35)" : "#86EFAC", cursor: loading || selected.status === "sent" ? "not-allowed" : "pointer", fontWeight: 750, fontSize: 12 }}
                >
                  Approve and send
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--color-client-text-dim)", fontSize: 13 }}>Select a draft to preview it.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
