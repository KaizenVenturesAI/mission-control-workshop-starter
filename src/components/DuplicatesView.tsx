"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type MatchedOn = "name" | "alias" | "domain" | "email" | "fuzzy";

interface AccountSummary {
  id: string;
  name: string;
  aliases?: string[];
  domain?: string;
}

interface ContactSummary {
  id: string;
  name: string;
  emails: string[];
  accountId?: string;
}

interface AccountPair {
  a: AccountSummary;
  b: AccountSummary;
  confidence: number;
  matchedOn: MatchedOn[];
  counts: {
    activitiesA: number;
    activitiesB: number;
    contactsA: number;
    contactsB: number;
    opportunitiesA: number;
    opportunitiesB: number;
  };
}

interface ContactPair {
  a: ContactSummary;
  b: ContactSummary;
  confidence: number;
  matchedOn: MatchedOn[];
  counts: {
    activitiesA: number;
    activitiesB: number;
    opportunitiesA: number;
    opportunitiesB: number;
  };
}

interface DuplicatesPayload {
  accounts: AccountPair[];
  contacts: ContactPair[];
}

const DISMISS_KEY = "mc:crm:dismissedDuplicatePairs";

function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

const confidenceColor = (c: number): { bg: string; text: string; border: string } => {
  if (c >= 0.95) return { bg: "rgba(52,211,153,0.14)", text: "#34D399", border: "rgba(52,211,153,0.30)" };
  return { bg: "rgba(245,158,11,0.14)", text: "#F59E0B", border: "rgba(245,158,11,0.30)" };
};

const matchedColor = (m: MatchedOn): { bg: string; text: string } => {
  switch (m) {
    case "domain": return { bg: "rgba(96,165,250,0.14)", text: "#60A5FA" };
    case "email": return { bg: "rgba(96,165,250,0.14)", text: "#60A5FA" };
    case "name": return { bg: "rgba(167,139,250,0.14)", text: "#A78BFA" };
    case "alias": return { bg: "rgba(218,218,219,0.14)", text: "#dadadb" };
    case "fuzzy": return { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.55)" };
  }
};

interface ConfirmModalState {
  pairKey: string;
  kind: "account" | "contact";
  winner: AccountSummary | ContactSummary;
  loser: AccountSummary | ContactSummary;
  activityCount: number;
  contactCount: number;
  opportunityCount: number;
}

interface Toast {
  message: string;
  tone: "success" | "error";
}

export function DuplicatesView() {
  const [data, setData] = useState<DuplicatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [pendingPair, setPendingPair] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmModalState | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/duplicates", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DuplicatesPayload;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load duplicates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const dismiss = useCallback(async (kind: "account" | "contact", idA: string, idB: string) => {
    const key = pairKey(idA, idB);
    try {
      const res = await fetch("/api/crm/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", kind, idA, idB }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Dismiss failed (HTTP ${res.status})`);
      }
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(key);
        saveDismissed(next);
        return next;
      });
      setToast({ message: "Duplicate pair permanently dismissed.", tone: "success" });
      await refresh();
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "Dismiss failed", tone: "error" });
    }
  }, [refresh]);

  const visibleAccountPairs = useMemo(() => {
    if (!data) return [];
    return data.accounts.filter((p) => !dismissed.has(pairKey(p.a.id, p.b.id)));
  }, [data, dismissed]);

  const visibleContactPairs = useMemo(() => {
    if (!data) return [];
    return data.contacts.filter((p) => !dismissed.has(pairKey(p.a.id, p.b.id)));
  }, [data, dismissed]);

  const performMerge = useCallback(async (state: ConfirmModalState) => {
    setPendingPair(state.pairKey);
    try {
      const res = await fetch("/api/crm/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: state.kind,
          winnerId: state.winner.id,
          loserId: state.loser.id,
        }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; mergedActivityCount?: number } | null;
      if (res.status === 409) {
        setToast({ message: payload?.error ? `Merge blocked: ${payload.error}` : "Already merged elsewhere", tone: "error" });
      } else if (!res.ok) {
        setToast({ message: payload?.error ?? `Merge failed (HTTP ${res.status})`, tone: "error" });
      } else {
        setToast({
          message: `Merged. Activities re-pointed: ${payload?.mergedActivityCount ?? 0}.`,
          tone: "success",
        });
        await refresh();
      }
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : "Merge failed", tone: "error" });
    } finally {
      setPendingPair(null);
      setConfirm(null);
    }
  }, [refresh]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {toast ? (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 4,
            padding: "10px 14px",
            background: toast.tone === "success" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
            border: `1px solid ${toast.tone === "success" ? "rgba(52,211,153,0.30)" : "rgba(248,113,113,0.30)"}`,
            color: toast.tone === "success" ? "#34D399" : "#F87171",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {toast.message}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--color-client-text)", margin: 0 }}>Potential Duplicates</h2>
          <p style={{ fontSize: 12, color: "var(--color-client-text-muted)", marginTop: 4 }}>
            High-confidence Account and Contact pairs detected via the resolver.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "var(--color-client-text)",
            cursor: loading ? "wait" : "pointer",
            fontSize: 12,
          }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div style={{ padding: 12, color: "#F87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Section title="Potential Duplicate Accounts" count={visibleAccountPairs.length}>
        {visibleAccountPairs.length === 0 && !loading ? (
          <EmptyState onRefresh={refresh} loading={loading} />
        ) : (
          visibleAccountPairs.map((pair) => (
            <AccountPairCard
              key={pairKey(pair.a.id, pair.b.id)}
              pair={pair}
              pending={pendingPair === pairKey(pair.a.id, pair.b.id)}
              onMerge={(winner, loser) =>
                setConfirm({
                  pairKey: pairKey(pair.a.id, pair.b.id),
                  kind: "account",
                  winner,
                  loser,
                  activityCount: winner.id === pair.a.id ? pair.counts.activitiesB : pair.counts.activitiesA,
                  contactCount: winner.id === pair.a.id ? pair.counts.contactsB : pair.counts.contactsA,
                  opportunityCount: winner.id === pair.a.id ? pair.counts.opportunitiesB : pair.counts.opportunitiesA,
                })
              }
              onDismiss={() => void dismiss("account", pair.a.id, pair.b.id)}
            />
          ))
        )}
      </Section>

      <Section title="Potential Duplicate Contacts" count={visibleContactPairs.length}>
        {visibleContactPairs.length === 0 && !loading ? (
          <EmptyState onRefresh={refresh} loading={loading} />
        ) : (
          visibleContactPairs.map((pair) => (
            <ContactPairCard
              key={pairKey(pair.a.id, pair.b.id)}
              pair={pair}
              pending={pendingPair === pairKey(pair.a.id, pair.b.id)}
              onMerge={(winner, loser) =>
                setConfirm({
                  pairKey: pairKey(pair.a.id, pair.b.id),
                  kind: "contact",
                  winner,
                  loser,
                  activityCount: winner.id === pair.a.id ? pair.counts.activitiesB : pair.counts.activitiesA,
                  contactCount: 0,
                  opportunityCount: winner.id === pair.a.id ? pair.counts.opportunitiesB : pair.counts.opportunitiesA,
                })
              }
              onDismiss={() => void dismiss("contact", pair.a.id, pair.b.id)}
            />
          ))
        )}
      </Section>

      {confirm ? (
        <ConfirmModal
          state={confirm}
          pending={pendingPair === confirm.pairKey}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void performMerge(confirm)}
        />
      ) : null}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)", margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>{count} pair{count === 1 ? "" : "s"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function EmptyState({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div
      style={{
        padding: 20,
        background: "var(--color-client-bg-card)",
        border: "1px solid var(--color-client-border)",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span style={{ color: "var(--color-client-text-muted)", fontSize: 13 }}>
        {loading ? "Loading…" : "No high-confidence duplicates found."}
      </span>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          padding: "4px 10px",
          fontSize: 12,
          borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "var(--color-client-text)",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: number }) {
  const c = confidenceColor(confidence);
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {Math.round(confidence * 100)}% match
    </span>
  );
}

function MatchedTags({ matched }: { matched: MatchedOn[] }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
      {matched.map((m) => {
        const c = matchedColor(m);
        return (
          <span
            key={m}
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 500,
              background: c.bg,
              color: c.text,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {m}
          </span>
        );
      })}
    </div>
  );
}

function AccountSummaryBlock({ a, counts }: { a: AccountSummary; counts: { activities: number; contacts: number; opportunities: number } }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)" }}>{a.name}</div>
      {a.domain ? (
        <div style={{ fontSize: 11, color: "var(--color-client-text-muted)" }}>{a.domain}</div>
      ) : null}
      {a.aliases && a.aliases.length > 0 ? (
        <div style={{ fontSize: 11, color: "var(--color-client-text-muted)" }}>
          aka {a.aliases.join(", ")}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--color-client-text-muted)" }}>
        <span>{counts.activities} activities</span>
        <span>{counts.contacts} contacts</span>
        <span>{counts.opportunities} opportunities</span>
      </div>
    </div>
  );
}

function ContactSummaryBlock({ c, counts }: { c: ContactSummary; counts: { activities: number; opportunities: number } }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)" }}>{c.name}</div>
      <div style={{ fontSize: 11, color: "var(--color-client-text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {c.emails.length > 0 ? c.emails.join(", ") : "No email"}
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--color-client-text-muted)" }}>
        <span>{counts.activities} activities</span>
        <span>{counts.opportunities} opportunities</span>
      </div>
    </div>
  );
}

function PairCardShell({
  left,
  center,
  right,
  footer,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--color-client-bg-card)",
        border: "1px solid var(--color-client-border)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
        {left}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            paddingLeft: 12,
            paddingRight: 12,
            borderLeft: "1px solid rgba(255,255,255,0.06)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            minWidth: 140,
          }}
        >
          {center}
        </div>
        {right}
      </div>
      {footer}
    </div>
  );
}

function FooterRow({
  pending,
  onMergeIntoLeft,
  onMergeIntoRight,
  onDismiss,
}: {
  pending: boolean;
  onMergeIntoLeft: () => void;
  onMergeIntoRight: () => void;
  onDismiss: () => void;
}) {
  const baseBtn: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: pending ? "wait" : "pointer",
    transition: "all 0.15s",
  };
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
      {pending ? (
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.15)",
            borderTopColor: "rgb(232,67,147)",
            animation: "mc-spin 0.8s linear infinite",
            marginRight: 6,
          }}
        />
      ) : null}
      <button
        onClick={onDismiss}
        disabled={pending}
        style={{
          ...baseBtn,
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "var(--color-client-text-muted)",
        }}
      >
        Dismiss
      </button>
      <button
        onClick={onMergeIntoLeft}
        disabled={pending}
        style={{
          ...baseBtn,
          background: "rgba(96,165,250,0.10)",
          border: "1px solid rgba(96,165,250,0.30)",
          color: "#60A5FA",
        }}
      >
        ← Merge into left
      </button>
      <button
        onClick={onMergeIntoRight}
        disabled={pending}
        style={{
          ...baseBtn,
          background: "rgba(96,165,250,0.10)",
          border: "1px solid rgba(96,165,250,0.30)",
          color: "#60A5FA",
        }}
      >
        Merge into right →
      </button>
    </div>
  );
}

function AccountPairCard({
  pair,
  pending,
  onMerge,
  onDismiss,
}: {
  pair: AccountPair;
  pending: boolean;
  onMerge: (winner: AccountSummary, loser: AccountSummary) => void;
  onDismiss: () => void;
}) {
  return (
    <PairCardShell
      left={
        <AccountSummaryBlock
          a={pair.a}
          counts={{ activities: pair.counts.activitiesA, contacts: pair.counts.contactsA, opportunities: pair.counts.opportunitiesA }}
        />
      }
      center={
        <>
          <ConfidencePill confidence={pair.confidence} />
          <MatchedTags matched={pair.matchedOn} />
        </>
      }
      right={
        <AccountSummaryBlock
          a={pair.b}
          counts={{ activities: pair.counts.activitiesB, contacts: pair.counts.contactsB, opportunities: pair.counts.opportunitiesB }}
        />
      }
      footer={
        <FooterRow
          pending={pending}
          onDismiss={onDismiss}
          onMergeIntoLeft={() => onMerge(pair.a, pair.b)}
          onMergeIntoRight={() => onMerge(pair.b, pair.a)}
        />
      }
    />
  );
}

function ContactPairCard({
  pair,
  pending,
  onMerge,
  onDismiss,
}: {
  pair: ContactPair;
  pending: boolean;
  onMerge: (winner: ContactSummary, loser: ContactSummary) => void;
  onDismiss: () => void;
}) {
  return (
    <PairCardShell
      left={
        <ContactSummaryBlock
          c={pair.a}
          counts={{ activities: pair.counts.activitiesA, opportunities: pair.counts.opportunitiesA }}
        />
      }
      center={
        <>
          <ConfidencePill confidence={pair.confidence} />
          <MatchedTags matched={pair.matchedOn} />
        </>
      }
      right={
        <ContactSummaryBlock
          c={pair.b}
          counts={{ activities: pair.counts.activitiesB, opportunities: pair.counts.opportunitiesB }}
        />
      }
      footer={
        <FooterRow
          pending={pending}
          onDismiss={onDismiss}
          onMergeIntoLeft={() => onMerge(pair.a, pair.b)}
          onMergeIntoRight={() => onMerge(pair.b, pair.a)}
        />
      }
    />
  );
}

function ConfirmModal({
  state,
  pending,
  onCancel,
  onConfirm,
}: {
  state: ConfirmModalState;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={pending ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "92vw",
          background: "var(--color-client-bg-card)",
          border: "1px solid var(--color-client-border)",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)" }}>
            Merge {state.kind}s
          </div>
          <div style={{ fontSize: 12, color: "var(--color-client-text-muted)", marginTop: 4 }}>
            About to merge <strong style={{ color: "var(--color-client-text)" }}>{state.loser.name}</strong> into{" "}
            <strong style={{ color: "var(--color-client-text)" }}>{state.winner.name}</strong>. This will move{" "}
            {state.activityCount} activities
            {state.kind === "account" ? `, ${state.contactCount} contacts` : ""}, and {state.opportunityCount} opportunities. Continue?
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={pending}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "var(--color-client-text)",
              cursor: pending ? "wait" : "pointer",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: "rgb(232,67,147)",
              border: "1px solid rgb(232,67,147)",
              color: "#fff",
              cursor: pending ? "wait" : "pointer",
              fontSize: 12,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {pending ? (
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.35)",
                  borderTopColor: "#fff",
                  animation: "mc-spin 0.8s linear infinite",
                }}
              />
            ) : null}
            Merge
          </button>
        </div>
      </div>
      <style>{`@keyframes mc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
