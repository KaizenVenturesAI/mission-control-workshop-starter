"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import RacketIcon from "@/components/RacketIcon";
import { useResponsive } from "@/lib/useMediaQuery";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import type { BoardAuditRun, BoardAuditSnapshot } from "@/data/board-audit";
import type { StrategyRun, RunStatus, StrategyTheme } from "@/data/strategy-runs";
import { THEME_COLORS, getRunStats } from "@/data/strategy-runs";

/* ── Action Item types & helpers ── */

interface ActionItem {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "complete";
  [key: string]: unknown;
}

type ActionItemStatus = ActionItem["status"];

const ACTION_STATUS_COLORS: Record<ActionItemStatus, { text: string; bg: string }> = {
  not_started: { text: "#EF4444", bg: "rgba(239,68,68,0.12)" },
  in_progress: { text: "#FBBF24", bg: "rgba(251,191,36,0.12)" },
  complete: { text: "#22C55E", bg: "rgba(34,197,94,0.12)" },
};

const ACTION_STATUS_LABELS: Record<ActionItemStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Completed",
};

const ALL_STATUSES: ActionItemStatus[] = ["not_started", "in_progress", "complete"];

/* ── Emoji mapping for section headers ── */

const SECTION_EMOJI_MAP: [RegExp, string][] = [
  [/overnight activity/i, "🌙"],
  [/cross.?functional insights/i, "🔗"],
  [/overdue|at risk/i, "⚠️"],
  [/decisions needed/i, "🎯"],
  [/priorities/i, "📋"],
  [/agent workforce|agent status/i, "🤖"],
  [/executive summary/i, "📊"],
  [/what changed/i, "🔄"],
  [/open decisions/i, "🎯"],
];

function isEmoji(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code > 0x1F000;
}

function getSectionEmoji(headerText: string): string {
  const trimmed = headerText.trim();
  if (trimmed.length > 0 && isEmoji(trimmed.charAt(0))) return "";
  for (const [re, emoji] of SECTION_EMOJI_MAP) {
    if (re.test(trimmed)) return emoji;
  }
  return "";
}

/* ── Fuzzy matching for action items ── */

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\b(overdue|days?|pending)\b/g, "")
    .replace(/\d+/g, "")
    .replace(/\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(bullet: string, title: string): boolean {
  const a = normalizeForMatch(bullet);
  const b = normalizeForMatch(title);
  if (a.length === 0 || b.length === 0) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  let consecutive = 0;
  for (const w of wordsA) {
    if (wordsB.includes(w)) { consecutive++; if (consecutive >= 3) return true; }
    else consecutive = 0;
  }
  return false;
}

const ACTION_KEYWORDS = /\b(overdue|due|needs to|should|blocked|pending|review|send|draft|follow.?up|confirm)\b/i;
const OVERDUE_SECTION = /overdue|at risk/i;

function isActionLine(text: string, inOverdueSection: boolean): boolean {
  // All bullets under "Overdue & At Risk" sections get chips
  if (inOverdueSection) return true;
  return ACTION_KEYWORDS.test(text);
}

function isOverdueHeader(text: string): boolean {
  return OVERDUE_SECTION.test(text);
}

function extractOwner(text: string): string | undefined {
  const names = ["Alex", "Brian", "Glenda", "Duda", "Isadora"];
  for (const name of names) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) {
      return name;
    }
  }
  return undefined;
}

function extractPriority(text: string): "high" | undefined {
  if (/\b(urgent|ASAP|critical|blocker)\b/i.test(text)) {
    return "high";
  }
  return undefined;
}

function extractDeadline(text: string): string | undefined {
  const today = new Date();
  const t = text.toLowerCase();
  
  if (t.includes("tomorrow")) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (t.includes("today")) {
    return today.toISOString().split('T')[0];
  }
  if (t.includes("next week")) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  // by Friday, on Monday, etc.
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < days.length; i++) {
    if (new RegExp(`\\b(by|on|this|next)\\s+${days[i]}\\b`, 'i').test(t)) {
      const d = new Date();
      const currentDay = d.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    }
  }

  // April 12, Apr 12
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthsRegex = months.join("|");
  const dateMatch = t.match(new RegExp(`\\b(${monthsRegex})[a-z]*\\s+(\\d{1,2})(st|nd|rd|th)?\\b`, 'i'));
  if (dateMatch) {
    const monthStr = dateMatch[1].toLowerCase();
    const day = parseInt(dateMatch[2], 10);
    const monthIdx = months.indexOf(monthStr);
    if (monthIdx !== -1 && day >= 1 && day <= 31) {
      const d = new Date();
      d.setMonth(monthIdx, day);
      if (d < today && (today.getTime() - d.getTime()) > 30 * 24 * 60 * 60 * 1000) {
        d.setFullYear(d.getFullYear() + 1);
      }
      return d.toISOString().split('T')[0];
    }
  }

  return undefined;
}

/* ── ActionItemChip component ── */

function ActionItemChip({
  bulletText,
  actionItems,
  onSync,
}: {
  bulletText: string;
  actionItems: ActionItem[];
  onSync: () => void;
}) {
  const matched = actionItems.find((ai) => fuzzyMatch(bulletText, ai.title));
  const [status, setStatus] = useState<ActionItemStatus>(matched?.status ?? "not_started");
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (matched) setStatus(matched.status);
  }, [matched]);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (chipRef.current && !chipRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const changeStatus = async (newStatus: ActionItemStatus) => {
    setShowDropdown(false);
    setSaving(true);
    setError(false);
    try {
      if (matched) {
        const res = await fetch("/api/action-items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: matched.id, status: newStatus }),
        });
        if (!res.ok) throw new Error();
      } else {
        const payload: any = { title: bulletText.trim(), status: newStatus };
        const owner = extractOwner(bulletText);
        if (owner) payload.owner = owner;
        const deadline = extractDeadline(bulletText);
        if (deadline) payload.deadline = deadline;
        const priority = extractPriority(bulletText);
        if (priority) payload.priority = priority;

        const res = await fetch("/api/action-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
      }
      setStatus(newStatus);
      onSync();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleTrack = async () => {
    setSaving(true);
    setError(false);
    try {
      const payload: any = { title: bulletText.trim(), status: "not_started" };
      const owner = extractOwner(bulletText);
      if (owner) payload.owner = owner;
      const deadline = extractDeadline(bulletText);
      if (deadline) payload.deadline = deadline;
      const priority = extractPriority(bulletText);
      if (priority) payload.priority = priority;

      const res = await fetch("/api/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setStatus("not_started");
      onSync();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const colors = ACTION_STATUS_COLORS[status];

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    height: 20,
    borderRadius: 999,
    fontSize: 10,
    padding: "2px 8px",
    gap: 4,
    cursor: "pointer",
    verticalAlign: "middle",
  };

  if (!matched) {
    return (
      <span
        ref={chipRef}
        onClick={(e) => { e.stopPropagation(); handleTrack(); }}
        title="Track as action item"
        style={{
          ...chipStyle,
          marginLeft: 6,
          color: "var(--color-client-text-dim)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--color-client-border)",
          opacity: saving ? 0.5 : 0.6,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.6"; }}
      >
        {error ? "⚠" : saving ? "…" : "Track"}
      </span>
    );
  }

  return (
    <span ref={chipRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 6, gap: 4 }}>
      {/* Status chip with pencil */}
      <span
        title={`Action item: ${matched.id}`}
        style={{
          ...chipStyle,
          color: error ? "#EF4444" : colors.text,
          background: error ? "rgba(239,68,68,0.08)" : colors.bg,
          opacity: saving ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        {error ? "⚠ Error" : ACTION_STATUS_LABELS[status]}
        <span
          style={{ fontSize: 10, cursor: "pointer", marginLeft: 2 }}
          onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}
        >
          ✏️
        </span>
      </span>
      {/* Task Link chip */}
      <a
        href={`/action-board?task=${matched.id}`}
        onClick={(e) => { e.stopPropagation(); }}
        title={`Open ${matched.id} in Action Board`}
        style={{
          ...chipStyle,
          textDecoration: "none",
          color: "#60A5FA",
          background: "rgba(96,165,250,0.10)",
          border: "1px solid rgba(96,165,250,0.20)",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.18)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.10)"; }}
      >
        Task Link ↗
      </a>
      {/* Status dropdown */}
      {showDropdown && (
        <span
          style={{
            position: "absolute",
            top: 24,
            left: 0,
            zIndex: 50,
            background: "var(--color-client-surface)",
            border: "1px solid var(--color-client-border)",
            borderRadius: 8,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 120,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {ALL_STATUSES.map((s) => (
            <span
              key={s}
              onClick={(e) => { e.stopPropagation(); changeStatus(s); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 4,
                fontSize: 11,
                cursor: "pointer",
                color: ACTION_STATUS_COLORS[s].text,
                background: s === status ? ACTION_STATUS_COLORS[s].bg : "transparent",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = ACTION_STATUS_COLORS[s].bg; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = s === status ? ACTION_STATUS_COLORS[s].bg : "transparent"; }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: ACTION_STATUS_COLORS[s].text }} />
              {ACTION_STATUS_LABELS[s]}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

const STATUS_COLORS: Record<RunStatus, string> = {
  completed: "#34D399",
  running: "#FBBF24",
  skipped: "#55556a",
  failed: "#F87171",
};

const STATUS_BG: Record<RunStatus, string> = {
  completed: "rgba(52,211,153,0.12)",
  running: "rgba(251,191,36,0.12)",
  skipped: "rgba(85,85,106,0.12)",
  failed: "rgba(248,113,113,0.12)",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  return remainSec > 0 ? `${minutes}m ${remainSec}s` : `${minutes}m`;
}

function formatDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "Unknown Date";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return "Not recorded";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Not recorded";
  return new Date(parsed).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function runSortTime(run: StrategyRun): number {
  const start = Date.parse(run.startTime);
  if (Number.isFinite(start)) return start;
  const date = Date.parse(`${run.date}T11:00:00.000Z`);
  return Number.isFinite(date) ? date : 0;
}

const QA_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  pass: { text: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.24)" },
  warn: { text: "#FBBF24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.24)" },
  fail: { text: "#F87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.24)" },
  pending: { text: "#A78BFA", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.24)" },
  unknown: { text: "var(--color-client-text-dim)", bg: "rgba(255,255,255,0.04)", border: "var(--color-client-border)" },
};

function AuditBadge({ label, status }: { label: string; status: string }) {
  const colors = QA_COLORS[status] ?? QA_COLORS.unknown;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: colors.text,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
    >
      {label}: {status}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        flex: "1 1 140px",
        background: "var(--color-client-surface)",
        border: "1px solid var(--color-client-border)",
        borderRadius: 8,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: "var(--color-client-text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CompactMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ minWidth: 120, flex: "1 1 120px" }}>
      <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 650, color: "var(--color-client-text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function relativePathLabel(pathValue: string | null): string {
  if (!pathValue) return "Not written";
  return pathValue.replace(/^\.data\//, "");
}

function platformCount(run: BoardAuditRun, platform: string): number {
  return run.sourcePlan.filter((source) => source.platform === platform).length;
}

function BoardAuditPanel({
  audit,
  loading,
  isMobile,
}: {
  audit: BoardAuditSnapshot | null;
  loading: boolean;
  isMobile: boolean;
}) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", color: "var(--color-client-text-dim)", padding: 40, fontSize: 13 }}>
        Loading audit trail...
      </div>
    );
  }

  if (!audit) {
    return (
      <div
        style={{
          border: "1px solid var(--color-client-border)",
          borderRadius: 8,
          padding: 18,
          color: "var(--color-client-text-secondary)",
          fontSize: 13,
          background: "var(--color-client-surface)",
        }}
      >
        No audit data is available yet. The next scheduled Morning Board will populate source coverage, QA status, budget controls, and artifact links here.
      </div>
    );
  }

  if (audit.runs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {audit.watchdog && (
          <div
            style={{
              border: "1px solid var(--color-client-border)",
              borderRadius: 8,
              padding: isMobile ? 14 : 16,
              background: "var(--color-client-surface)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 4 }}>
                  Morning Watchdog
                </div>
                <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
                  {audit.watchdog.date} · checked {audit.watchdog.checkedAtLocal ?? "not recorded"} · <code>{relativePathLabel(audit.watchdog.path)}</code>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <AuditBadge label="Watchdog" status={audit.watchdog.status} />
                {audit.watchdog.needsRecovery && <AuditBadge label="Recovery" status="fail" />}
              </div>
            </div>
            {(audit.watchdog.issues.length > 0 || audit.watchdog.warnings.length > 0) && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-client-text-secondary)" }}>
                {[...audit.watchdog.issues, ...audit.watchdog.warnings].slice(0, 5).join(" · ")}
              </div>
            )}
          </div>
        )}
        <div
          style={{
            border: "1px solid var(--color-client-border)",
            borderRadius: 8,
            padding: 18,
            color: "var(--color-client-text-secondary)",
            fontSize: 13,
            background: "var(--color-client-surface)",
          }}
        >
          No completed audited Morning Board runs yet. The next scheduled run will populate source coverage, QA status, budget controls, and artifact links here.
        </div>
      </div>
    );
  }

  const latest = audit.latest ?? audit.runs[0];
  const coverage = latest.coverage;
  const chatMessages = (coverage?.slack.messageCount ?? 0) + (coverage?.discord.messageCount ?? 0);
  const reportPreview = audit.optimizationReport?.markdown
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("# "))
    .slice(0, 12)
    .join("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {audit.watchdog && (
        <div
          style={{
            border: "1px solid var(--color-client-border)",
            borderRadius: 8,
            padding: isMobile ? 14 : 16,
            background: "var(--color-client-surface)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 4 }}>
                Morning Watchdog
              </div>
              <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
                {audit.watchdog.date} · checked {audit.watchdog.checkedAtLocal ?? "not recorded"} · <code>{relativePathLabel(audit.watchdog.path)}</code>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <AuditBadge label="Watchdog" status={audit.watchdog.status} />
              {audit.watchdog.needsRecovery && <AuditBadge label="Recovery" status="fail" />}
            </div>
          </div>
          {(audit.watchdog.issues.length > 0 || audit.watchdog.warnings.length > 0) && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-client-text-secondary)" }}>
              {[...audit.watchdog.issues, ...audit.watchdog.warnings].slice(0, 5).join(" · ")}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--color-client-border)",
          borderRadius: 8,
          padding: isMobile ? 14 : 16,
          background: "var(--color-client-surface)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexDirection: isMobile ? "column" : "row", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 4 }}>
              Latest Morning Board Audit
            </div>
            <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
              {latest.date || "Unknown date"} · started {formatDateTime(latest.startedAt)} · finished {formatDateTime(latest.finishedAt)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <AuditBadge label="Run" status={latest.status} />
            <AuditBadge label="QA" status={latest.qaStatus} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid var(--color-client-border)" }}>
          <CompactMetric label="Slack" value={String(coverage?.slack.scanned.length ?? 0)} sub={`${platformCount(latest, "slack")} planned`} />
          <CompactMetric label="Discord" value={String(coverage?.discord.scanned.length ?? 0)} sub={`${platformCount(latest, "discord")} planned`} />
          <CompactMetric label="Chat Budget" value={String(chatMessages)} sub={`${latest.budgets.totalChatMessageTarget ?? 90} target`} />
          <CompactMetric label="Context Pack" value={coverage?.durable.contextPackChars == null ? "n/a" : String(coverage.durable.contextPackChars)} sub={`${latest.budgets.contextPackMaxChars ?? 15000} char cap`} />
          <CompactMetric label="Issues" value={`${latest.issueCounts.high}/${latest.issueCounts.medium}/${latest.issueCounts.low}`} sub="high / medium / low" />
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          {[
            ["Memo", latest.memoPath],
            ["Artifact", latest.artifactPath],
            ["QA Report", latest.qaPath],
            ["Run Ledger", latest.runPath],
          ].map(([label, value]) => (
            <div key={label} style={{ fontSize: 11, color: "var(--color-client-text-dim)", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 8 }}>
              <span style={{ color: "var(--color-client-text-secondary)", fontWeight: 600 }}>{label}:</span>{" "}
              <code style={{ fontSize: 11 }}>{relativePathLabel(value)}</code>
            </div>
          ))}
        </div>

        {latest.issues.length > 0 && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--color-client-border)", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 6 }}>QA Issues</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {latest.issues.slice(0, 6).map((issue, idx) => (
                <div key={`${issue.issue}-${idx}`} style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
                  <span style={{ color: QA_COLORS[issue.severity]?.text ?? "var(--color-client-text-dim)", fontWeight: 700 }}>{issue.severity}</span>
                  {" "}· {issue.issue}{issue.detail ? ` · ${issue.detail}` : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {audit.optimizationReport && (
        <div
          style={{
            border: "1px solid var(--color-client-border)",
            borderRadius: 8,
            padding: isMobile ? 14 : 16,
            background: "var(--color-client-surface)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 4 }}>
                Optimization Report
              </div>
              <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
                {audit.optimizationReport.date} · <code>{relativePathLabel(audit.optimizationReport.path)}</code>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
              Source state updated: {formatDateTime(audit.sourceStateUpdatedAt)}
            </div>
          </div>
          {reportPreview && (
            <pre
              style={{
                margin: "12px 0 0",
                padding: 12,
                whiteSpace: "pre-wrap",
                fontSize: 11,
                lineHeight: 1.5,
                color: "var(--color-client-text-secondary)",
                background: "rgba(0,0,0,0.18)",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 6,
                overflow: "auto",
              }}
            >
              {reportPreview}
            </pre>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {audit.runs.slice(0, 10).map((run) => (
          <div
            key={run.runId}
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(180px, 1fr) 100px 90px 120px 1.5fr",
              gap: isMobile ? 6 : 10,
              alignItems: "center",
              border: "1px solid var(--color-client-border)",
              borderRadius: 8,
              padding: "10px 12px",
              background: "var(--color-client-surface)",
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 650, color: "var(--color-client-text)" }}>{run.date || "Unknown date"}</div>
              <div style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>{run.runId}</div>
            </div>
            <AuditBadge label="Run" status={run.status} />
            <AuditBadge label="QA" status={run.qaStatus} />
            <div style={{ color: "var(--color-client-text-secondary)" }}>
              {(run.coverage?.slack.messageCount ?? 0) + (run.coverage?.discord.messageCount ?? 0)} messages
            </div>
            <div style={{ color: "var(--color-client-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {relativePathLabel(run.memoPath)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemeBadge({ theme }: { theme: StrategyTheme }) {
  const color = THEME_COLORS[theme] ?? "#60A5FA";
  if (!theme) return null;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 500,
        color,
        background: `${color}18`,
        border: `1px solid ${color}30`,
        borderRadius: 999,
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {theme}
    </span>
  );
}

function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: STATUS_COLORS[status],
        background: STATUS_BG[status],
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {status}
    </span>
  );
}

function FullScreenToggle({ isFullScreen, onToggle }: { isFullScreen: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={isFullScreen ? "Exit full-screen" : "Full-screen"}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: isFullScreen ? "#60A5FA" : "var(--color-client-text-secondary)",
        fontSize: 14,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 15 }}>{isFullScreen ? "↙" : "↔"}</span>
    </button>
  );
}

// Per-card error boundary so one bad strategy run cannot blank the whole board
class RunCardBoundary extends React.Component<{ run: StrategyRun; children: React.ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { run: StrategyRun; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, msg: error?.message ?? "Render error" };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("[RunCard]", this.props.run?.id, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "var(--color-client-surface)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 14, fontSize: 12, color: "#f87171" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to render run: {this.props.run?.id ?? "unknown"}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{this.state.msg}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RunCard({ run, defaultExpanded = false }: { run: StrategyRun; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const actionItemsFetched = useRef(false);

  const fetchActionItems = useCallback(async () => {
    try {
      const res = await fetch("/api/action-items");
      if (res.ok) {
        const data = await res.json();
        setActionItems(Array.isArray(data) ? data : data.items ?? []);
      }
    } catch { /* graceful degrade */ }
  }, []);

  useEffect(() => {
    if (expanded && !actionItemsFetched.current) {
      actionItemsFetched.current = true;
      fetchActionItems();
    }
  }, [expanded, fetchActionItems]);

  // Bidirectional sync: poll action items every 5s while expanded
  useEffect(() => {
    if (!expanded) return;
    const interval = setInterval(fetchActionItems, 5000);
    return () => clearInterval(interval);
  }, [expanded, fetchActionItems]);

  const handleActionSync = useCallback(() => { fetchActionItems(); }, [fetchActionItems]);

  useEffect(() => {
    if (!isFullScreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullScreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullScreen]);
  const { isMobile } = useResponsive();
  const hasMemo = (run.memo?.length ?? 0) > 0;

  return (
    <div
      style={{
        background: "var(--color-client-surface)",
        border: "1px solid var(--color-client-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onClick={() => hasMemo && setExpanded(!expanded)}
        style={{
          padding: isMobile ? "12px 14px" : "14px 18px",
          cursor: hasMemo ? "pointer" : "default",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => {
          if (hasMemo) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: isMobile ? 8 : 12, flexDirection: isMobile ? "column" : "row" }}>
          {/* Chevron */}
          {hasMemo && (
            <span style={{ display: isMobile ? "none" : "inline", marginTop: isMobile ? 0 : 3 }}>
              <RacketIcon expanded={expanded} size={16} color={expanded ? "var(--color-client-text)" : "var(--color-client-text-dim)"} />
            </span>
          )}
          {!hasMemo && !isMobile && <span style={{ width: 14 }} />}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Top row: date + badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)" }}>
                {formatDate(run.date)}
              </span>
              <ThemeBadge theme={run.theme} />
              <StatusBadge status={run.status} />
            </div>

            {/* Timing */}
            {run.status === "completed" && (
              <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 6 }}>
                Started {formatTime(run.startTime)} · Completed {formatTime(run.endTime)} · Duration: {formatDuration(run.durationMs)}
              </div>
            )}
            {run.status === "skipped" && run.skipReason && (
              <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", fontStyle: "italic", marginBottom: 6 }}>
                {run.skipReason}
              </div>
            )}
            {run.status === "failed" && run.skipReason && (
              <div style={{ fontSize: 11, color: STATUS_COLORS.failed, marginBottom: 6 }}>
                {run.skipReason}
              </div>
            )}

            {/* Meta row */}
            {((run.signalSources?.length ?? 0) > 0 || (run.agentsConsulted?.length ?? 0) > 0 || (run.tokenEstimate?.cost ?? 0) > 0) && (
              <div style={{ display: "flex", gap: isMobile ? 8 : 16, flexWrap: "wrap", fontSize: 11, color: "var(--color-client-text-dim)" }}>
                {(run.signalSources?.length ?? 0) > 0 && (
                  <span>
                    <span style={{ color: "var(--color-client-text-secondary)" }}>Sources:</span>{" "}
                    {(run.signalSources ?? []).join(", ")}
                  </span>
                )}
                {(run.agentsConsulted?.length ?? 0) > 0 && (
                  <span>
                    <span style={{ color: "var(--color-client-text-secondary)" }}>Agents:</span>{" "}
                    {(run.agentsConsulted ?? []).join(", ")}
                  </span>
                )}
                {(run.tokenEstimate?.cost ?? 0) > 0 && (
                  <span>
                    <span style={{ color: "var(--color-client-text-secondary)" }}>Cost:</span>{" "}
                    ${(run.tokenEstimate?.cost ?? 0).toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible memo */}
      <div
        style={{
          maxHeight: expanded ? 10000 : 0,
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease, opacity 0.2s ease",
        }}
      >
        <div style={{ borderTop: "1px solid var(--color-client-border)", padding: isMobile ? "14px 14px" : "12px 18px 4px 44px", display: "flex", justifyContent: "flex-end" }}>
          {!isMobile && <FullScreenToggle isFullScreen={false} onToggle={() => setIsFullScreen(true)} />}
        </div>
        <div
          style={{
            padding: isMobile ? "0 14px 14px" : "4px 18px 18px 44px",
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--color-client-text-secondary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {(() => {
            let inOverdueSection = false;
            return (run.memo ?? "").split("\n").map((line, i) => {
              if (line.startsWith("# ")) {
                inOverdueSection = false;
                return (
                  <div key={i} style={{ fontSize: 16, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 12, marginTop: i > 0 ? 8 : 0 }}>
                    {renderInlineMarkdown(line.replace("# ", ""))}
                  </div>
                );
              }
              if (line.startsWith("### ")) {
                const text = line.replace("### ", "");
                inOverdueSection = isOverdueHeader(text);
                const emoji = getSectionEmoji(text);
                return (
                  <div key={i} style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)", marginTop: 14, marginBottom: 4 }}>
                    {emoji ? `${emoji} ` : ""}{renderInlineMarkdown(text)}
                  </div>
                );
              }
              if (line.startsWith("## ")) {
                const text = line.replace("## ", "");
                inOverdueSection = isOverdueHeader(text);
                const emoji = getSectionEmoji(text);
                return (
                  <div key={i} style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)", marginTop: 16, marginBottom: 6 }}>
                    {emoji ? `${emoji} ` : ""}{renderInlineMarkdown(text)}
                  </div>
                );
              }
              if (line.startsWith("- ") || line.startsWith("• ")) {
                const bulletText = line.replace(/^[-•] /, "");
                const showChip = isActionLine(bulletText, inOverdueSection);
                return (
                  <div key={i} style={{ paddingLeft: 16, position: "relative" }}>
                    <span style={{ position: "absolute", left: 4 }}>·</span>
                    {renderInlineMarkdown(bulletText)}
                    {showChip && <ActionItemChip bulletText={bulletText} actionItems={actionItems} onSync={handleActionSync} />}
                  </div>
                );
              }
              if (line.trim() === "") {
                return <div key={i} style={{ height: 8 }} />;
              }
              return <div key={i}>{renderInlineMarkdown(line)}</div>;
            });
          })()}
        </div>
      </div>

      {/* Full-screen memo overlay */}
      {isFullScreen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            background: "var(--color-client-bg, #0a0a0f)",
            overflow: "auto",
          }}
        >
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 32px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)" }}>
                  {formatDate(run.date)}
                </span>
                <ThemeBadge theme={run.theme} />
                <StatusBadge status={run.status} />
              </div>
              <FullScreenToggle isFullScreen={true} onToggle={() => setIsFullScreen(false)} />
            </div>
            {/* Timing */}
            {run.status === "completed" && (
              <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 16 }}>
                Started {formatTime(run.startTime)} · Completed {formatTime(run.endTime)} · Duration: {formatDuration(run.durationMs)}
              </div>
            )}
            {/* Memo content */}
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--color-client-text-secondary)", whiteSpace: "pre-wrap" }}>
              {(() => {
                let inOverdueSection = false;
                return (run.memo ?? "").split("\n").map((line, i) => {
                  if (line.startsWith("# ")) {
                    inOverdueSection = false;
                    return (
                      <div key={i} style={{ fontSize: 20, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 14, marginTop: i > 0 ? 12 : 0 }}>
                        {renderInlineMarkdown(line.replace("# ", ""))}
                      </div>
                    );
                  }
                  if (line.startsWith("### ")) {
                    const text = line.replace("### ", "");
                    inOverdueSection = isOverdueHeader(text);
                    const emoji = getSectionEmoji(text);
                    return (
                      <div key={i} style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)", marginTop: 14, marginBottom: 4 }}>
                        {emoji ? `${emoji} ` : ""}{renderInlineMarkdown(text)}
                      </div>
                    );
                  }
                  if (line.startsWith("## ")) {
                    const text = line.replace("## ", "");
                    inOverdueSection = isOverdueHeader(text);
                    const emoji = getSectionEmoji(text);
                    return (
                      <div key={i} style={{ fontSize: 16, fontWeight: 600, color: "var(--color-client-text)", marginTop: 20, marginBottom: 8 }}>
                        {emoji ? `${emoji} ` : ""}{renderInlineMarkdown(text)}
                      </div>
                    );
                  }
                  if (line.startsWith("- ") || line.startsWith("• ")) {
                    const bulletText = line.replace(/^[-•] /, "");
                    const showChip = isActionLine(bulletText, inOverdueSection);
                    return (
                      <div key={i} style={{ paddingLeft: 20, position: "relative" }}>
                        <span style={{ position: "absolute", left: 6 }}>·</span>
                        {renderInlineMarkdown(bulletText)}
                        {showChip && <ActionItemChip bulletText={bulletText} actionItems={actionItems} onSync={handleActionSync} />}
                      </div>
                    );
                  }
                  if (line.trim() === "") {
                    return <div key={i} style={{ height: 10 }} />;
                  }
                  return <div key={i}>{renderInlineMarkdown(line)}</div>;
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StrategyRuns() {
  const { isMobile } = useResponsive();
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");
  const [runs, setRuns] = useState<StrategyRun[]>([]);
  const [audit, setAudit] = useState<BoardAuditSnapshot | null>(null);
  const [view, setView] = useState<"memos" | "audit">("memos");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/strategy-runs");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.runs) ? data.runs : [];
        const safeStr = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
        const safeArrStr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
        const safeNum = (v: unknown, fb = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
        const normalized: StrategyRun[] = list.map((raw: Record<string, unknown>) => {
          const te = (raw.tokenEstimate && typeof raw.tokenEstimate === "object") ? (raw.tokenEstimate as Record<string, unknown>) : {};
          return {
            id: safeStr(raw.id, `run-${Math.random().toString(36).slice(2, 8)}`),
            date: safeStr(raw.date, ""),
            theme: safeStr(raw.theme, "") as StrategyRun["theme"],
            status: safeStr(raw.status, "completed") as RunStatus,
            startTime: safeStr(raw.startTime, new Date().toISOString()),
            endTime: safeStr(raw.endTime, new Date().toISOString()),
            durationMs: safeNum(raw.durationMs),
            signalSources: safeArrStr(raw.signalSources),
            agentsConsulted: safeArrStr(raw.agentsConsulted),
            tokenEstimate: {
              input: safeNum(te.input),
              output: safeNum(te.output),
              cost: safeNum(te.cost),
            },
            memo: safeStr(raw.memo, ""),
            skipReason: typeof raw.skipReason === "string" ? raw.skipReason : undefined,
          };
        });
        setRuns(normalized);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[StrategyRuns] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch("/api/board-runs");
      if (res.ok) {
        const data = await res.json();
        setAudit(data);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[StrategyRuns] board audit fetch failed", err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const filteredRuns = dateFilter
    ? runs.filter((r) => r.date === dateFilter)
    : runs;

  const sortedRuns = [...filteredRuns].sort((a, b) => runSortTime(b) - runSortTime(a));

  const stats = getRunStats(runs);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          gap: isMobile ? 12 : 0,
          flexDirection: isMobile ? "column" : "row",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: "var(--color-client-text)", margin: 0 }}>
            Agentic Board Meetings
          </h1>
          <p style={{ fontSize: 12, color: "var(--color-client-text-dim)", margin: "4px 0 0" }}>
            Nightly strategic synthesis run history
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              gap: 4,
              padding: 3,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--color-client-border)",
              borderRadius: 999,
            }}
          >
            {(["memos", "audit"] as const).map((nextView) => (
              <button
                key={nextView}
                onClick={() => setView(nextView)}
                style={{
                  minHeight: 30,
                  padding: "0 11px",
                  borderRadius: 999,
                  border: view === nextView ? "1px solid rgba(96,165,250,0.28)" : "1px solid transparent",
                  background: view === nextView ? "rgba(96,165,250,0.18)" : "transparent",
                  color: view === nextView ? "#DCEBFF" : "var(--color-client-text-secondary)",
                  fontSize: 11,
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                {nextView === "memos" ? "Memos" : "Audit"}
              </button>
            ))}
          </div>
          {view === "memos" && (
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                background: "var(--color-client-surface)",
                border: "1px solid var(--color-client-border)",
                borderRadius: 6,
                color: "var(--color-client-text-secondary)",
                fontSize: 12,
                padding: "6px 10px",
                outline: "none",
              }}
            />
          )}
          {view === "memos" && dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              style={{
                background: "var(--color-client-surface)",
                border: "1px solid var(--color-client-border)",
                borderRadius: 6,
                color: "var(--color-client-text-secondary)",
                fontSize: 11,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {view === "memos" && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total Runs" value={String(stats.totalRuns)} sub={`${stats.completedRuns} completed`} />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDurationMs)} sub="completed runs" />
        <StatCard label="Total Cost" value={`$${stats.totalCost.toFixed(2)}`} sub="estimated" />
        <StatCard label="Skip Rate" value={`${Math.round(stats.skipRate * 100)}%`} sub={`${runs.filter((r) => r.status === "skipped").length} skipped`} />
      </div>}

      {/* Run list */}
      {view === "audit" ? (
        <BoardAuditPanel audit={audit} loading={auditLoading} isMobile={isMobile} />
      ) : loading ? (
        <div style={{ textAlign: "center", color: "var(--color-client-text-dim)", padding: 40, fontSize: 13 }}>
          Loading runs...
        </div>
      ) : sortedRuns.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--color-client-text-dim)", padding: 40, fontSize: 13 }}>
          {dateFilter ? "No runs found for this date." : "No strategy runs recorded yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sortedRuns.map((run) => (
            <RunCardBoundary key={run.id} run={run}>
              <RunCard run={run} defaultExpanded={run.id === runParam} />
            </RunCardBoundary>
          ))}
        </div>
      )}
    </div>
  );
}
