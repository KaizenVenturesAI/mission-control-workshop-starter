"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import RacketIcon from "@/components/RacketIcon";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import {
  PROJECTS,
  type Project,
  type SprintEntry,
  type ProjectStatus,
  type SprintStatus,
} from "@/data/devlog";
import { getSupabaseAuthHeaders } from "@/lib/supabase/client";
import type { DevLogLedgerEntry, DevLogSyncRun, DevLogSyncStatus } from "@/lib/devlog/sourceRefs";
import { useResponsive } from "@/lib/useMediaQuery";

// ── Status styles ────────────────────────────────────────────────────────

const PROJECT_STATUS_STYLE: Record<
  ProjectStatus,
  { bg: string; fg: string; label: string }
> = {
  active: { bg: "rgba(52,211,153,0.12)", fg: "#34d399", label: "ACTIVE" },
  completed: { bg: "rgba(96,165,250,0.12)", fg: "#60a5fa", label: "COMPLETED" },
  paused: { bg: "rgba(251,191,36,0.12)", fg: "#fbbf24", label: "PAUSED" },
};

const SPRINT_STATUS_STYLE: Record<
  SprintStatus,
  { bg: string; fg: string; icon: string; label: string }
> = {
  completed: { bg: "rgba(52,211,153,0.12)", fg: "#34d399", icon: "✓", label: "COMPLETE" },
  "in-progress": { bg: "rgba(251,191,36,0.12)", fg: "#fbbf24", icon: "●", label: "IN PROGRESS" },
  review: { bg: "rgba(168,85,247,0.12)", fg: "#a855f7", icon: "◎", label: "REVIEW" },
  blocked: { bg: "rgba(239,68,68,0.12)", fg: "#ef4444", icon: "■", label: "BLOCKED" },
  planned: { bg: "rgba(148,163,184,0.10)", fg: "#94a3b8", icon: "○", label: "PLANNED" },
};

// ── Derived types ────────────────────────────────────────────────────────

interface DaySprint {
  sprint: SprintEntry;
  project: Project;
}

interface DayProjectGroup {
  project: Project;
  sprints: SprintEntry[];
}

interface DayGroup {
  day: string; // ISO date
  label: string;
  projects: DayProjectGroup[];
  totalSprints: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDayLabel(day: string): string {
  const today = new Date();
  const todayStr = toISO(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toISO(yesterday);

  if (day === todayStr) return "Today";
  if (day === yesterdayStr) return "Yesterday";

  const d = new Date(day + "T12:00:00"); // noon to avoid TZ issues
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatEntryDate(occurredAt: string): string {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return occurredAt.slice(0, 10);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatEntryDateTime(occurredAt?: string | null): string {
  if (!occurredAt) return "Never";
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) return occurredAt;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function asPayloadRecord(entry: DevLogLedgerEntry): Record<string, unknown> {
  return entry.payload ?? {};
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function payloadStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function payloadStats(payload: Record<string, unknown>): { additions: number; deletions: number; total: number } {
  const stats = payload.stats;
  if (!stats || typeof stats !== "object") return { additions: 0, deletions: 0, total: 0 };
  const record = stats as Record<string, unknown>;
  return {
    additions: typeof record.additions === "number" ? record.additions : 0,
    deletions: typeof record.deletions === "number" ? record.deletions : 0,
    total: typeof record.total === "number" ? record.total : 0,
  };
}

function syncedEntryToDaySprint(entry: DevLogLedgerEntry): DaySprint {
  const day = toISO(new Date(entry.occurredAt));
  const payload = asPayloadRecord(entry);
  const files = payloadStringArray(payload, "files");
  const stats = payloadStats(payload);
  const shortSha = payloadString(payload, "shortSha");
  const author = payload.author && typeof payload.author === "object" ? payload.author as Record<string, unknown> : {};
  const committer = payload.committer && typeof payload.committer === "object" ? payload.committer as Record<string, unknown> : {};
  const fileCount = payloadNumber(payload, "fileCount") ?? files.length;
  const pullLabels = Array.isArray(payload.pulls)
    ? payload.pulls
        .map((pull) => pull && typeof pull === "object" ? pull as Record<string, unknown> : null)
        .filter(Boolean)
        .map((pull) => `PR #${String(pull!.number ?? "?")}: ${String(pull!.title ?? "Untitled")}`)
    : [];
  const sourceLabel = entry.sources.map((source) => `${source.label}${source.url ? ` (${source.url})` : ""}`).join(", ");
  const project: Project = {
    id: "synced-mission-control-git-history",
    name: "Mission Control — Synced Git History",
    goal: "Automatically capture shipped Mission Control commits and operational fixes",
    channel: payloadString(payload, "repo") ?? "#engineering",
    contributors: entry.owners.length ? entry.owners : ["Example Client Mission Agent"],
    status: "active",
    lastUpdated: formatEntryDate(entry.occurredAt),
    sprints: [],
  };

  return {
    project,
    sprint: {
      id: `synced-${entry.id}`,
      name: entry.title,
      date: formatEntryDate(entry.occurredAt),
      day,
      status: entry.status,
      completionPct: 100,
      projectedCompletion: "Synced",
      summary: entry.summary,
      keyChanges: [
        `Owner attribution: ${entry.owners.join(", ") || "Unknown / Unmapped"}`,
        ...(shortSha ? [`Commit: ${shortSha}`] : []),
        `Author: ${String(author.name ?? "Unknown")}${author.email ? ` <${String(author.email)}>` : ""}${author.login ? ` · @${String(author.login)}` : ""}`,
        `Committer: ${String(committer.name ?? "Unknown")}${committer.email ? ` <${String(committer.email)}>` : ""}${committer.login ? ` · @${String(committer.login)}` : ""}`,
        `Files changed: ${fileCount} · +${stats.additions} / -${stats.deletions}`,
        ...pullLabels,
        ...(files.length ? files.map((file) => `Touched ${file}`) : entry.tags.map((tag) => `Tagged ${tag}`)),
        ...(sourceLabel ? [`Source: ${sourceLabel}`] : []),
      ],
      architectureNotes:
        "This entry was generated from the GitHub-backed Development Log source ledger so recent engineering work appears without manually editing seed data.",
      contributors: entry.owners.length ? entry.owners : ["Example Client Mission Agent"],
    },
  };
}

function buildDayGroups(syncedEntries: DevLogLedgerEntry[] = []): DayGroup[] {
  // Collect all sprints with their parent project
  const allSprints: DaySprint[] = [];
  for (const project of PROJECTS) {
    for (const sprint of project.sprints) {
      allSprints.push({ sprint, project });
    }
  }
  allSprints.push(...syncedEntries.map(syncedEntryToDaySprint));

  // Group by day
  const byDay = new Map<string, DaySprint[]>();
  for (const ds of allSprints) {
    const day = ds.sprint.day;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(ds);
  }

  // Build groups
  const groups: DayGroup[] = [];
  for (const [day, daySprints] of byDay) {
    // Group by project within day
    const byProject = new Map<string, DayProjectGroup>();
    for (const ds of daySprints) {
      if (!byProject.has(ds.project.id)) {
        byProject.set(ds.project.id, { project: ds.project, sprints: [] });
      }
      byProject.get(ds.project.id)!.sprints.push(ds.sprint);
    }

    groups.push({
      day,
      label: formatDayLabel(day),
      projects: Array.from(byProject.values()),
      totalSprints: daySprints.length,
    });
  }

  // Sort descending by date
  groups.sort((a, b) => b.day.localeCompare(a.day));
  return groups;
}

// ── Component ────────────────────────────────────────────────────────────

export function ActivityFeed() {
  const { isMobile } = useResponsive();
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project");
  const [syncedEntries, setSyncedEntries] = useState<DevLogLedgerEntry[]>([]);
  const [syncUpdatedAt, setSyncUpdatedAt] = useState<string | null>(null);
  const [syncBackend, setSyncBackend] = useState<"supabase" | "local-json" | null>(null);
  const [latestRun, setLatestRun] = useState<DevLogSyncRun | null>(null);
  const [syncStatus, setSyncStatus] = useState<DevLogSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const dayGroups = useMemo(() => buildDayGroups(syncedEntries), [syncedEntries]);
  const todayStr = useMemo(() => toISO(new Date()), []);

  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    // Expand today by default, or the most recent day
    const targetDay = dayGroups.find((g) => g.day === todayStr)?.day ?? dayGroups[0]?.day;
    if (targetDay) init[targetDay] = true;
    return init;
  });
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedSprints, setExpandedSprints] = useState<Record<string, boolean>>({});
  const [fullScreenSprint, setFullScreenSprint] = useState<{ sprint: SprintEntry; project: Project } | null>(null);

  useEffect(() => {
    if (!fullScreenSprint) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setFullScreenSprint(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [fullScreenSprint]);

  const loadDevLog = useCallback(() => {
    let alive = true;
    fetch("/api/devlog/events", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((json: { entries?: DevLogLedgerEntry[]; updatedAt?: string; backend?: "supabase" | "local-json"; latestRun?: DevLogSyncRun | null } | null) => {
        if (!alive || !json) return;
        setSyncedEntries(Array.isArray(json.entries) ? json.entries : []);
        setSyncUpdatedAt(typeof json.updatedAt === "string" ? json.updatedAt : null);
        setSyncBackend(json.backend ?? null);
        setLatestRun(json.latestRun ?? null);
      })
      .catch(() => {
        if (alive) {
          setSyncedEntries([]);
          setSyncUpdatedAt(null);
          setSyncBackend(null);
          setLatestRun(null);
        }
      });
    fetch("/api/devlog/sync/status", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((json: DevLogSyncStatus | null) => {
        if (alive && json) setSyncStatus(json);
      })
      .catch(() => {
        if (alive) setSyncStatus(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => loadDevLog(), [loadDevLog]);

  useEffect(() => {
    if (Object.keys(expandedDays).length > 0) return;
    const targetDay = dayGroups.find((g) => g.day === todayStr)?.day ?? dayGroups[0]?.day;
    if (targetDay) setExpandedDays({ [targetDay]: true });
  }, [dayGroups, expandedDays, todayStr]);

  // Deep-link: auto-expand project from URL param
  useEffect(() => {
    if (!projectParam) return;
    // Find which day group contains this project and expand it
    for (const dg of dayGroups) {
      const found = dg.projects.find((pg) => pg.project.id === projectParam);
      if (found) {
        setExpandedDays((prev) => ({ ...prev, [dg.day]: true }));
        setExpandedProjects((prev) => ({ ...prev, [`${dg.day}:${projectParam}`]: true }));
        break;
      }
    }
  }, [projectParam, dayGroups]);

  const [dateFilter, setDateFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleDay = (day: string) =>
    setExpandedDays((prev) => ({ ...prev, [day]: !prev[day] }));
  const toggleProject = (key: string) =>
    setExpandedProjects((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleSprint = (id: string) =>
    setExpandedSprints((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleDatePick = (val: string) => {
    setDateFilter(val);
    if (!val) {
      // Reset: expand today
      const resetDays: Record<string, boolean> = {};
      const targetDay = dayGroups.find((g) => g.day === todayStr)?.day ?? dayGroups[0]?.day;
      if (targetDay) resetDays[targetDay] = true;
      setExpandedDays(resetDays);
      return;
    }
    // Expand the picked day, collapse others
    const newExpanded: Record<string, boolean> = {};
    newExpanded[val] = true;
    setExpandedDays(newExpanded);
    // Scroll to it
    requestAnimationFrame(() => {
      dayRefs.current[val]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const ownerOptions = useMemo(() => ["All", ...Array.from(new Set(syncedEntries.flatMap((entry) => entry.owners.length ? entry.owners : ["Unknown / Unmapped"]))).sort()], [syncedEntries]);
  const sourceOptions = useMemo(() => ["All", ...Array.from(new Set(syncedEntries.flatMap((entry) => entry.sources.map((source) => source.system)))).sort()], [syncedEntries]);
  const statusOptions = useMemo(() => ["All", ...Array.from(new Set(syncedEntries.map((entry) => entry.status))).sort()], [syncedEntries]);

  const filteredEntries = useMemo(() => syncedEntries.filter((entry) => {
    const day = toISO(new Date(entry.occurredAt));
    if (dateFilter && day !== dateFilter) return false;
    if (ownerFilter !== "All" && !entry.owners.includes(ownerFilter)) return false;
    if (sourceFilter !== "All" && !entry.sources.some((source) => source.system === sourceFilter)) return false;
    if (statusFilter !== "All" && entry.status !== statusFilter) return false;
    return true;
  }), [dateFilter, ownerFilter, sourceFilter, statusFilter, syncedEntries]);

  const visibleGroups = useMemo(() => buildDayGroups(filteredEntries), [filteredEntries]);

  const noResults = dateFilter && visibleGroups.length === 0;
  const sourceState = latestRun?.status === "failed"
    ? "Sync error"
    : syncedEntries.length > 0
      ? "Synced"
      : syncStatus?.configured === false
        ? "Needs sync"
        : syncBackend === "local-json"
          ? "Local fallback"
          : "Needs sync";
  const ownerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of syncedEntries) {
      const owners = entry.owners.length ? entry.owners : ["Unknown / Unmapped"];
      for (const owner of owners) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [syncedEntries]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const headers = { "Content-Type": "application/json", ...(await getSupabaseAuthHeaders()) };
      const response = await fetch("/api/devlog/sync", { method: "POST", headers });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || `Sync failed with ${response.status}`);
      loadDevLog();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fade-in-up" style={{ maxWidth: 940 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: isMobile ? "stretch" : "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          flexDirection: isMobile ? "column" : "row",
          gap: isMobile ? 12 : 0,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <h1
              style={{
                fontSize: isMobile ? 18 : 22,
                fontWeight: 700,
                color: "var(--color-client-text)",
                letterSpacing: "-0.03em",
                margin: 0,
              }}
            >
              Development Log
            </h1>
            <SourceStateBadge state={sourceState} />
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-client-text-dim)",
              margin: 0,
            }}
          >
            Engineering &amp; workflow execution history
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => handleDatePick(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              color: "var(--color-client-text-secondary)",
              colorScheme: "dark",
              outline: "none",
            }}
          />
          <FilterSelect value={ownerFilter} onChange={setOwnerFilter} options={ownerOptions} label="Owner" />
          <FilterSelect value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} label="Source" />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={statusOptions} label="Status" />
          {dateFilter && (
            <button
              onClick={() => handleDatePick("")}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 11,
                color: "var(--color-client-text-dim)",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          marginBottom: 16,
          padding: isMobile ? 12 : 14,
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          background: "rgba(255,255,255,0.025)",
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: 12,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--color-client-text)", fontWeight: 700 }}>
            Source sync ledger
          </div>
          <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginTop: 3 }}>
            {syncedEntries.length} synced item{syncedEntries.length === 1 ? "" : "s"}
            {syncUpdatedAt ? ` · updated ${formatEntryDateTime(syncUpdatedAt)}` : " · checking runtime store"}
            {syncBackend ? ` · ${syncBackend}` : ""}
          </div>
          {syncError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{syncError}</div>}
          {latestRun?.error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{latestRun.error}</div>}
          {ownerCounts.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {ownerCounts.map(([owner, count]) => <OwnerPill key={owner} owner={owner} count={count} />)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatPill label="Seeded" value={String(PROJECTS.reduce((sum, project) => sum + project.sprints.length, 0))} />
          <StatPill label="Synced" value={String(syncedEntries.length)} />
          <StatPill label="Latest" value={syncedEntries[0]?.payload?.shortSha ? String(syncedEntries[0].payload.shortSha) : dayGroups[0]?.day ?? "None"} />
          <StatPill label="Repo" value={syncStatus ? `${syncStatus.repo}@${syncStatus.branch}` : "Checking"} />
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              background: syncing ? "rgba(255,255,255,0.03)" : "rgba(52,211,153,0.10)",
              border: "1px solid rgba(52,211,153,0.25)",
              color: syncing ? "var(--color-client-text-dim)" : "#34d399",
              fontSize: 11,
              cursor: syncing ? "default" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {syncing ? "Syncing..." : "Sync GitHub"}
          </button>
        </div>
      </div>

      {/* No results */}
      {noResults && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            color: "var(--color-client-text-dim)",
            fontSize: 14,
          }}
        >
          No development activity recorded for {dateFilter}
        </div>
      )}

      {/* Day Groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Full-screen sprint overlay */}
        {fullScreenSprint && (
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
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--color-client-text)" }}>
                    {fullScreenSprint.sprint.name}
                  </span>
                  {(() => {
                    const st = SPRINT_STATUS_STYLE[fullScreenSprint.sprint.status];
                    return (
                      <span style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 999, background: st.bg, color: st.fg }}>
                        {st.label}
                      </span>
                    );
                  })()}
                </div>
                <button
                  onClick={() => setFullScreenSprint(null)}
                  title="Exit full-screen"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#60A5FA",
                    fontSize: 14,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 15 }}>↙</span>
                </button>
              </div>
              {/* Project context */}
              <div style={{ fontSize: 12, color: "var(--color-client-text-dim)", marginBottom: 16 }}>
                {fullScreenSprint.project.name} · {fullScreenSprint.project.channel} · {fullScreenSprint.sprint.completionPct}% complete · Projected: {fullScreenSprint.sprint.projectedCompletion}
              </div>
              {/* Sprint content */}
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--color-client-text-secondary)" }}>
                <p style={{ margin: "0 0 16px 0" }}>{renderInlineMarkdown(fullScreenSprint.sprint.summary)}</p>
                <FullScreenSection label="What shipped">
                  <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
                    {fullScreenSprint.sprint.keyChanges.map((c, i) => (
                      <li key={i} style={{ paddingBottom: 4, lineHeight: 1.6 }}>{renderInlineMarkdown(c)}</li>
                    ))}
                  </ul>
                </FullScreenSection>
                {fullScreenSprint.sprint.architectureNotes && (
                  <FullScreenSection label="Architecture">
                    <p style={{ margin: 0, fontFamily: "var(--font-mono)", background: "rgba(255,255,255,0.02)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.04)" }}>
                      {renderInlineMarkdown(fullScreenSprint.sprint.architectureNotes)}
                    </p>
                  </FullScreenSection>
                )}
                {fullScreenSprint.sprint.trustNotes && (
                  <FullScreenSection label="Trust notes">
                    <p style={{ margin: 0, color: "#fbbf24", background: "rgba(251,191,36,0.04)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(251,191,36,0.08)" }}>
                      {renderInlineMarkdown(fullScreenSprint.sprint.trustNotes)}
                    </p>
                  </FullScreenSection>
                )}
                {fullScreenSprint.sprint.blockers && (
                  <FullScreenSection label="Blockers">
                    <p style={{ margin: 0, color: "#ef4444", background: "rgba(239,68,68,0.04)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.08)" }}>
                      {fullScreenSprint.sprint.blockers}
                    </p>
                  </FullScreenSection>
                )}
                {/* Progress bar */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Progress</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)" }}>{fullScreenSprint.sprint.completionPct}%</span>
                  </div>
                  <div style={{ width: "100%", height: 10, borderRadius: 5, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                    <div style={{ width: `${fullScreenSprint.sprint.completionPct}%`, height: "100%", borderRadius: 5, background: SPRINT_STATUS_STYLE[fullScreenSprint.sprint.status].fg, transition: "width 0.3s ease" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {visibleGroups.map((dayGroup) => {
          const isExpanded = !!expandedDays[dayGroup.day];
          return (
            <div
              key={dayGroup.day}
              ref={(el) => { dayRefs.current[dayGroup.day] = el; }}
            >
              {/* Day Header */}
              <div
                onClick={() => toggleDay(dayGroup.day)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: isMobile ? "14px 14px" : "10px 14px",
                  minHeight: 44,
                  background: "rgba(255,255,255,0.02)",
                  borderBottom: "1px solid var(--color-client-border)",
                  cursor: "pointer",
                  userSelect: "none",
                  borderRadius: isExpanded ? "8px 8px 0 0" : 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }}
              >
                <RacketIcon expanded={isExpanded} size={18} color="var(--color-client-text-dim)" />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--color-client-text)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {dayGroup.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--color-client-text-dim)",
                  }}
                >
                  ({dayGroup.projects.length} project
                  {dayGroup.projects.length !== 1 ? "s" : ""} &middot;{" "}
                  {dayGroup.totalSprints} sprint
                  {dayGroup.totalSprints !== 1 ? "s" : ""})
                </span>
                <span style={{ flex: 1 }} />
                <SeededBadge syncedCount={dayGroup.projects.reduce((sum, project) => sum + project.sprints.filter((sprint) => sprint.id.startsWith("synced-")).length, 0)} />
              </div>

              {/* Expanded day content */}
              <div
                style={{
                  overflow: "hidden",
                  maxHeight: isExpanded ? 10000 : 0,
                  opacity: isExpanded ? 1 : 0,
                  transition: "max-height 0.4s ease, opacity 0.25s ease",
                }}
              >
                <div
                  style={{
                    border: "1px solid var(--color-client-border)",
                    borderTop: "none",
                    borderRadius: "0 0 8px 8px",
                    overflow: "hidden",
                  }}
                >
                  {dayGroup.projects.map((pg) => {
                    const projectKey = `${dayGroup.day}:${pg.project.id}`;
                    const projExpanded = !!expandedProjects[projectKey];
                    return (
                      <ProjectDayRow
                        key={projectKey}
                        pg={pg}
                        isExpanded={projExpanded}
                        onToggle={() => toggleProject(projectKey)}
                        expandedSprints={expandedSprints}
                        onToggleSprint={toggleSprint}
                        onFullScreenSprint={(sprint) => setFullScreenSprint({ sprint, project: pg.project })}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Project Row (inside a day group) ─────────────────────────────────────

function ProjectDayRow({
  pg,
  isExpanded,
  onToggle,
  expandedSprints,
  onToggleSprint,
  onFullScreenSprint,
}: {
  pg: DayProjectGroup;
  isExpanded: boolean;
  onToggle: () => void;
  expandedSprints: Record<string, boolean>;
  onToggleSprint: (id: string) => void;
  onFullScreenSprint: (sprint: SprintEntry) => void;
}) {
  const project = pg.project;
  const status = PROJECT_STATUS_STYLE[project.status];

  return (
    <div
      style={{
        borderBottom: "1px solid var(--color-client-border)",
      }}
    >
      {/* Project Header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 16px 12px 32px",
          cursor: "pointer",
          transition: "background 0.15s",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span
          style={{
            marginTop: 2,
          }}
        >
          <RacketIcon expanded={isExpanded} size={16} color="var(--color-client-text-dim)" />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Top row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-client-text)",
                letterSpacing: "-0.01em",
              }}
            >
              {project.name}
            </span>
            <span
              style={{
                padding: "2px 7px",
                fontSize: 8,
                fontWeight: 500,
                letterSpacing: "0.04em",
                borderRadius: 999,
                background: "rgba(148,163,184,0.08)",
                color: "#94a3b8",
                border: "1px solid rgba(148,163,184,0.1)",
              }}
            >
              {project.channel}
            </span>
            <span
              style={{
                padding: "2px 7px",
                fontSize: 8,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                borderRadius: 999,
                background: status.bg,
                color: status.fg,
              }}
            >
              {status.label}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--color-client-text-dim)",
                marginLeft: "auto",
                flexShrink: 0,
              }}
            >
              {pg.sprints.length} sprint{pg.sprints.length !== 1 ? "s" : ""}
            </span>
          </div>
          {/* Goal + contributors */}
          <p
            style={{
              fontSize: 11,
              color: "var(--color-client-text-dim)",
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Goal: {project.goal}
          </p>
          <p
            style={{
              fontSize: 10,
              color: "var(--color-client-text-dim)",
              margin: "3px 0 0 0",
              opacity: 0.7,
            }}
          >
            Contributors: {project.contributors.join(", ")}
          </p>
        </div>
      </div>

      {/* Sprint rows */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: isExpanded ? 8000 : 0,
          opacity: isExpanded ? 1 : 0,
          transition: "max-height 0.35s ease, opacity 0.25s ease",
        }}
      >
        <div style={{ paddingBottom: 4 }}>
          {pg.sprints.map((sprint) => (
            <SprintRow
              key={sprint.id}
              sprint={sprint}
              isExpanded={!!expandedSprints[sprint.id]}
              onToggle={() => onToggleSprint(sprint.id)}
              onFullScreen={() => onFullScreenSprint(sprint)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sprint Row ───────────────────────────────────────────────────────────

function SprintRow({
  sprint,
  isExpanded,
  onToggle,
  onFullScreen,
}: {
  sprint: SprintEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onFullScreen: () => void;
}) {
  const st = SPRINT_STATUS_STYLE[sprint.status];

  return (
    <div style={{ paddingLeft: 56 }}>
      {/* Sprint header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px 8px 0",
          flexWrap: "wrap",
          cursor: "pointer",
          transition: "background 0.15s",
          userSelect: "none",
          borderRadius: 6,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Caret */}
        <span
        >
          <RacketIcon expanded={isExpanded} size={14} color="var(--color-client-text-dim)" />
        </span>

        {/* Sprint name */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-client-text)",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          {sprint.name}
        </span>

        {/* Status icon + label */}
        <span style={{ fontSize: 10, color: st.fg, flexShrink: 0 }}>{st.icon}</span>
        <span
          style={{
            padding: "1px 6px",
            fontSize: 8,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            borderRadius: 999,
            background: st.bg,
            color: st.fg,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {st.label}
        </span>

        {/* Completion % */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--color-client-text)",
            flexShrink: 0,
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {sprint.completionPct}%
        </span>

        {/* Mini progress bar */}
        <div
          style={{
            width: 80,
            height: 6,
            borderRadius: 3,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${sprint.completionPct}%`,
              height: "100%",
              borderRadius: 3,
              background: st.fg,
              transition: "width 0.3s ease",
            }}
          />
        </div>

        {/* Projected completion */}
        <span
          style={{
            fontSize: 10,
            color: "var(--color-client-text-dim)",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {sprint.projectedCompletion}
        </span>
      </div>

      {/* Expanded sprint detail */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: isExpanded ? 3000 : 0,
          opacity: isExpanded ? 1 : 0,
          transition: "max-height 0.3s ease, opacity 0.2s ease",
        }}
      >
        <div style={{ padding: "8px 16px 14px 24px" }}>
          {/* Full-screen toggle */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onFullScreen(); }}
              title="Full-screen"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                width: 28,
                height: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-client-text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14 }}>↔</span>
            </button>
          </div>
          {/* Summary */}
          <p
            style={{
              fontSize: 12,
              color: "var(--color-client-text-secondary)",
              lineHeight: 1.6,
              margin: "0 0 10px 0",
            }}
          >
            {renderInlineMarkdown(sprint.summary)}
          </p>

          {/* What shipped */}
          <div style={{ marginBottom: 10 }}>
            <SectionLabel>What shipped</SectionLabel>
            <ul style={{ margin: 0, paddingLeft: 16, listStyle: "disc" }}>
              {sprint.keyChanges.map((c, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: 11,
                    color: "var(--color-client-text-secondary)",
                    lineHeight: 1.5,
                    paddingBottom: 2,
                  }}
                >
                  {renderInlineMarkdown(c)}
                </li>
              ))}
            </ul>
          </div>

          {/* Architecture */}
          {sprint.architectureNotes && (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>Architecture</SectionLabel>
              <p
                style={{
                  fontSize: 11,
                  color: "var(--color-client-text-secondary)",
                  lineHeight: 1.5,
                  margin: 0,
                  fontFamily: "var(--font-mono)",
                  background: "rgba(255,255,255,0.02)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                {sprint.architectureNotes}
              </p>
            </div>
          )}

          {/* Trust notes */}
          {sprint.trustNotes && (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>Trust notes</SectionLabel>
              <p
                style={{
                  fontSize: 11,
                  color: "#fbbf24",
                  lineHeight: 1.5,
                  margin: 0,
                  background: "rgba(251,191,36,0.04)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(251,191,36,0.08)",
                }}
              >
                {sprint.trustNotes}
              </p>
            </div>
          )}

          {/* Blockers */}
          {sprint.blockers && (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>Blockers</SectionLabel>
              <p
                style={{
                  fontSize: 11,
                  color: "#ef4444",
                  lineHeight: 1.5,
                  margin: 0,
                  background: "rgba(239,68,68,0.04)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(239,68,68,0.08)",
                }}
              >
                {sprint.blockers}
              </p>
            </div>
          )}

          {/* Larger progress bar */}
          <div style={{ marginBottom: 6 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
                Progress
              </span>
              <span
                style={{ fontSize: 11, fontWeight: 700, color: "var(--color-client-text)" }}
              >
                {sprint.completionPct}%
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: 8,
                borderRadius: 4,
                background: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${sprint.completionPct}%`,
                  height: "100%",
                  borderRadius: 4,
                  background: SPRINT_STATUS_STYLE[sprint.status].fg,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Projected completion */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
              Projected completion
            </span>
            <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }}>
              {sprint.projectedCompletion}
            </span>
          </div>

          {/* Provenance */}
          <div
            style={{
              fontSize: 9,
              color: "var(--color-client-text-dim)",
              opacity: 0.6,
              marginTop: 6,
            }}
          >
            Manually maintained
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function SeededBadge({ syncedCount = 0 }: { syncedCount?: number }) {
  const label = syncedCount > 0 ? `Synced + Seeded` : "Seeded";
  return (
    <span
      style={{
        padding: "2px 6px",
        fontSize: 8,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        borderRadius: 4,
        background: "rgba(148,163,184,0.08)",
        color: "#475569",
        border: "1px solid rgba(148,163,184,0.1)",
      }}
    >
      {label}
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        padding: "5px 8px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        color: "var(--color-client-text-secondary)",
        fontSize: 11,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--color-client-text-dim)" }}>{label}</span> {value}
    </span>
  );
}

function OwnerPill({ owner, count }: { owner: string; count: number }) {
  return (
    <span
      style={{
        padding: "2px 7px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        color: "var(--color-client-text-secondary)",
        fontSize: 10,
        whiteSpace: "nowrap",
      }}
    >
      {owner} <span style={{ color: "var(--color-client-text-dim)" }}>{count}</span>
    </span>
  );
}

function SourceStateBadge({ state }: { state: string }) {
  const tone =
    state === "Synced"
      ? { bg: "rgba(52,211,153,0.12)", fg: "#34d399", border: "rgba(52,211,153,0.25)" }
      : state === "Sync error"
        ? { bg: "rgba(239,68,68,0.12)", fg: "#ef4444", border: "rgba(239,68,68,0.25)" }
        : { bg: "rgba(251,191,36,0.10)", fg: "#fbbf24", border: "rgba(251,191,36,0.22)" };
  return (
    <span
      style={{
        padding: "2px 6px",
        fontSize: 8,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        borderRadius: 4,
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
    >
      {state}
    </span>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        padding: "5px 8px",
        fontSize: 12,
        color: "var(--color-client-text-secondary)",
        colorScheme: "dark",
        outline: "none",
        maxWidth: 170,
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option === "All" ? label : option}
        </option>
      ))}
    </select>
  );
}

function FullScreenSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-client-text-dim)", display: "block", marginBottom: 6 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--color-client-text-dim)",
        display: "block",
        marginBottom: 4,
      }}
    >
      {children}
    </span>
  );
}
