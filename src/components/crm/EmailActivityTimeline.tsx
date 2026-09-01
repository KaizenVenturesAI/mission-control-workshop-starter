"use client";

import { useState, useMemo, useCallback } from "react";
import type { CRMActivity } from "@/data/crm-activities";

interface Props {
  activities: CRMActivity[];
  onSync?: () => void;
  syncing?: boolean;
  lastSyncedAt?: string | null;
}

const PAGE_SIZE = 20;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEmailDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  );
}

function getInboxBadge(from: string): { label: string; bg: string; color: string } {
  const f = from.toLowerCase();
  if (f.includes("ops@")) return { label: "ops@", bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" };
  if (f.includes("partnerships@")) return { label: "partnerships@", bg: "rgba(196,201,209,0.15)", color: "#C4C9D1" };
  if (f.includes("marketing@")) return { label: "marketing@", bg: "rgba(218,218,219,0.15)", color: "#dadadb" };
  return { label: from.split("@")[0] + "@", bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" };
}

/** Normalize a subject for grouping: strip Re:/Fwd: prefixes and lowercase. */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd?):[\s]*/gi, "")
    .trim()
    .toLowerCase();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailThread {
  threadKey: string;         // normalized subject
  displaySubject: string;    // original subject from the most recent email
  emails: CRMActivity[];     // sorted newest-first within thread
}

// ── EmailItem: renders a single expanded/collapsed email row ──────────────────

function EmailItem({ email, defaultExpanded = false }: { email: CRMActivity; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const subject = email.emailSubject || email.content || "(no subject)";
  const from = email.emailFrom || "unknown";
  const badge = getInboxBadge(from);
  const toList = email.emailTo?.join(", ") || "—";
  const body = email.emailBodyText || email.content || "";

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        marginBottom: 4,
        padding: "10px 14px",
        background: "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.02)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
    >
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
      >
        <span style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          transition: "transform 0.2s",
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
          flexShrink: 0,
          width: 14,
          textAlign: "center",
        }}>
          ▶
        </span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {formatEmailDate(email.occurredAt)}
        </span>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(255,255,255,0.88)",
          flexGrow: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}>
          {subject}
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 999,
          background: badge.bg,
          color: badge.color,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {badge.label}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 8, marginLeft: 22 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
            To: {toList}
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 8 }} />
          <div style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.75)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            maxHeight: 300,
            overflowY: "auto",
          }}>
            {body}
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              background: "rgba(218,218,219,0.12)",
              color: "#dadadb",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              Email
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ThreadGroup: renders a collapsible thread of emails ───────────────────────

function ThreadGroup({ thread }: { thread: EmailThread }) {
  const [open, setOpen] = useState(false);

  if (thread.emails.length === 1) {
    return <EmailItem email={thread.emails[0]} />;
  }

  const mostRecent = thread.emails[0];
  const badge = getInboxBadge(mostRecent.emailFrom || "");

  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      marginBottom: 6,
      background: open ? "rgba(255,255,255,0.02)" : "transparent",
    }}>
      {/* Thread header */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.4)",
          transition: "transform 0.2s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          display: "inline-block",
          flexShrink: 0,
          width: 14,
          textAlign: "center",
        }}>
          ▶
        </span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flexShrink: 0, whiteSpace: "nowrap" }}>
          {formatEmailDate(mostRecent.occurredAt)}
        </span>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: "rgba(255,255,255,0.88)",
          flexGrow: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}>
          {thread.displaySubject}
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 8px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.4)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {thread.emails.length} emails in thread
        </span>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "2px 8px",
          borderRadius: 999,
          background: badge.bg,
          color: badge.color,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {badge.label}
        </span>
      </div>

      {/* Expanded thread emails */}
      {open && (
        <div style={{ padding: "0 14px 10px 14px" }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", marginBottom: 8 }} />
          {thread.emails.map((email) => (
            <EmailItem key={email.id} email={email} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmailActivityTimeline({ activities, onSync, syncing, lastSyncedAt }: Props) {
  const [sortNewest, setSortNewest] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((v) => v + PAGE_SIZE);
  }, []);

  // Sort all activities
  const sorted = useMemo(() => {
    const copy = [...activities];
    copy.sort((a, b) =>
      sortNewest
        ? (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "")
        : (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""),
    );
    return copy;
  }, [activities, sortNewest]);

  // Client-side search filter
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((email) => {
      const subject = (email.emailSubject || email.content || "").toLowerCase();
      const recipients = (email.emailTo || []).join(" ").toLowerCase();
      return subject.includes(q) || recipients.includes(q);
    });
  }, [sorted, searchQuery]);

  // Group by normalized subject (thread grouping)
  const threads = useMemo<EmailThread[]>(() => {
    const threadMap = new Map<string, CRMActivity[]>();

    for (const email of filtered) {
      const subject = email.emailSubject || email.content || "(no subject)";
      const key = normalizeSubject(subject);
      const existing = threadMap.get(key);
      if (existing) {
        existing.push(email);
      } else {
        threadMap.set(key, [email]);
      }
    }

    // Convert to thread objects, sort within each thread newest-first
    return Array.from(threadMap.entries()).map(([key, emails]) => {
      const sorted = [...emails].sort((a, b) =>
        sortNewest
          ? (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "")
          : (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""),
      );
      return {
        threadKey: key,
        displaySubject: sorted[0].emailSubject || sorted[0].content || "(no subject)",
        emails: sorted,
      };
    });
  }, [filtered, sortNewest]);

  // Paginated slice for display
  const visibleThreads = useMemo(() => threads.slice(0, visibleCount), [threads, visibleCount]);
  const hasMore = threads.length > visibleCount;

  // Reset visible count when search query changes
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setVisibleCount(PAGE_SIZE);
  }, []);

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            Emails ({activities.length})
          </span>
          {onSync && (
            <button
              onClick={onSync}
              disabled={syncing}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: syncing ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.5)",
                cursor: syncing ? "default" : "pointer",
              }}
            >
              {syncing ? "Syncing…" : "Sync ↻"}
            </button>
          )}
          {lastSyncedAt && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              Synced {formatEmailDate(lastSyncedAt)}
            </span>
          )}
        </div>
        <button
          onClick={() => setSortNewest((v) => !v)}
          style={{
            fontSize: 11,
            padding: "3px 10px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
          }}
        >
          {sortNewest ? "Newest first" : "Oldest first"}
        </button>
      </div>

      {/* Search input */}
      {activities.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by subject or recipient…"
            style={{
              width: "100%",
              padding: "7px 12px",
              fontSize: 13,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              color: "rgba(255,255,255,0.8)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Empty state */}
      {activities.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px" }}>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>No emails logged yet.</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            Emails sent from ops@, partnerships@, and marketing@ will appear here automatically.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 16px" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>No emails match "{searchQuery}"</p>
        </div>
      ) : (
        <div>
          {visibleThreads.map((thread) => (
            <ThreadGroup key={thread.threadKey} thread={thread} />
          ))}

          {/* Load more */}
          {hasMore && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button
                onClick={handleLoadMore}
                style={{
                  fontSize: 12,
                  padding: "6px 18px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                }}
              >
                Load {Math.min(PAGE_SIZE, threads.length - visibleCount)} more
              </button>
            </div>
          )}

          {/* Total count indicator when filtered */}
          {searchQuery && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                {filtered.length} email{filtered.length !== 1 ? "s" : ""} matched
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
