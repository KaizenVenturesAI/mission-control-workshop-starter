"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RacketIcon from "@/components/RacketIcon";
import type { MeetingBriefing } from "@/data/meetings";
import type { Contact } from "@/data/contacts";
import type { Account } from "@/data/accounts";
import { useResponsive } from "@/lib/useMediaQuery";
import MeetingBriefingDetail from "@/components/MeetingBriefingDetail";
import { resolveAccount as resolveAccountLib } from "@/lib/crm/resolve";

export interface ActionItem {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "complete";
  [key: string]: unknown;
}

type ActionItemStatus = ActionItem["status"];
type PlaudSyncState = {
  status: "not_configured" | "ready" | "syncing" | "error";
  configured: boolean;
  lastSyncAt?: string;
  lastSuccessfulSyncAt?: string;
  lastError?: string;
  importedCount: number;
  skippedDuplicates: number;
  failedCount: number;
  processingCount: number;
};

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
    if (wordsB.includes(w)) {
      consecutive++;
      if (consecutive >= 3) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

const ACTION_KEYWORDS = /\b(overdue|due|needs to|should|blocked|pending|review|send|draft|follow.?up|confirm)\b/i;

export function isActionLine(text: string, inOverdueSection: boolean): boolean {
  if (inOverdueSection) return true;
  return ACTION_KEYWORDS.test(text);
}

function extractOwner(text: string): string | undefined {
  const names = ["Alex", "Morgan", "Mission Agent", "Brian", "Glenda", "Duda", "Isadora"];
  for (const name of names) {
    if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
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
    return d.toISOString().split("T")[0];
  }
  if (t.includes("today")) {
    return today.toISOString().split("T")[0];
  }
  if (t.includes("next week")) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }

  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < days.length; i++) {
    if (new RegExp(`\\b(by|on|this|next)\\s+${days[i]}\\b`, "i").test(t)) {
      const d = new Date();
      const currentDay = d.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split("T")[0];
    }
  }

  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthsRegex = months.join("|");
  const dateMatch = t.match(new RegExp(`\\b(${monthsRegex})[a-z]*\\s+(\\d{1,2})(st|nd|rd|th)?\\b`, "i"));
  if (dateMatch) {
    const monthStr = dateMatch[1].toLowerCase();
    const day = parseInt(dateMatch[2], 10);
    const monthIdx = months.indexOf(monthStr);
    if (monthIdx !== -1 && day >= 1 && day <= 31) {
      const d = new Date();
      d.setMonth(monthIdx, day);
      if (d < today && today.getTime() - d.getTime() > 30 * 24 * 60 * 60 * 1000) {
        d.setFullYear(d.getFullYear() + 1);
      }
      return d.toISOString().split("T")[0];
    }
  }

  return undefined;
}

export function ActionItemChip({
  bulletText,
  actionItems,
  onSync,
  relatedAccountId,
  relatedContactId,
  sourceMeeting,
  sourceDate,
  sourceMessageId,
  notes,
}: {
  bulletText: string;
  actionItems: ActionItem[];
  onSync: () => void;
  relatedAccountId?: string;
  relatedContactId?: string;
  sourceMeeting?: string;
  sourceDate?: string;
  sourceMessageId?: string;
  notes?: string;
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
        const payload: Record<string, unknown> = { title: bulletText.trim(), status: newStatus };
        const owner = extractOwner(bulletText);
        if (owner) payload.owner = owner;
        const deadline = extractDeadline(bulletText);
        if (deadline) payload.deadline = deadline;
        const priority = extractPriority(bulletText);
        if (priority) payload.priority = priority;
        if (relatedAccountId) payload.relatedAccountId = relatedAccountId;
        if (relatedContactId) payload.relatedContactId = relatedContactId;
        if (sourceMeeting) payload.sourceMeeting = sourceMeeting;
        if (sourceDate) payload.sourceDate = sourceDate;
        if (sourceMessageId) payload.sourceMessageId = sourceMessageId;
        if (notes) payload.notes = notes;

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
      const payload: Record<string, unknown> = { title: bulletText.trim(), status: "not_started" };
      const owner = extractOwner(bulletText);
      if (owner) payload.owner = owner;
      const deadline = extractDeadline(bulletText);
      if (deadline) payload.deadline = deadline;
      const priority = extractPriority(bulletText);
      if (priority) payload.priority = priority;
      if (relatedAccountId) payload.relatedAccountId = relatedAccountId;
      if (relatedContactId) payload.relatedContactId = relatedContactId;
      if (sourceMeeting) payload.sourceMeeting = sourceMeeting;
      if (sourceDate) payload.sourceDate = sourceDate;
      if (sourceMessageId) payload.sourceMessageId = sourceMessageId;
      if (notes) payload.notes = notes;

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

  const colors = ACTION_STATUS_COLORS[status] ?? ACTION_STATUS_COLORS.not_started;

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
        onClick={(e) => {
          e.stopPropagation();
          handleTrack();
        }}
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
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "0.6";
        }}
      >
        {error ? "⚠" : saving ? "…" : "Track"}
      </span>
    );
  }

  return (
    <span ref={chipRef} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 6, gap: 4 }}>
      <span
        title={`Action item: ${matched.id}`}
        style={{
          ...chipStyle,
          color: error ? "#EF4444" : colors.text,
          background: error ? "rgba(239,68,68,0.08)" : colors.bg,
          opacity: saving ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {error ? "⚠ Error" : (ACTION_STATUS_LABELS[status] ?? String(status))}
        <span
          style={{ fontSize: 10, cursor: "pointer", marginLeft: 2 }}
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
        >
          ✏️
        </span>
      </span>
      <a
        href={`/action-board?task=${matched.id}`}
        onClick={(e) => {
          e.stopPropagation();
        }}
        title={`Open ${matched.id} in Action Board`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          fontSize: 12,
          lineHeight: 1,
          textDecoration: "none",
          color: "var(--color-client-text-dim)",
          opacity: 0.6,
          transition: "opacity 0.15s, color 0.15s",
          verticalAlign: "middle",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "1";
          (e.currentTarget as HTMLElement).style.color = "var(--color-client-text)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "0.6";
          (e.currentTarget as HTMLElement).style.color = "var(--color-client-text-dim)";
        }}
      >
        ↗
      </a>
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
              onClick={(e) => {
                e.stopPropagation();
                void changeStatus(s);
              }}
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
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = ACTION_STATUS_COLORS[s].bg;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = s === status ? ACTION_STATUS_COLORS[s].bg : "transparent";
              }}
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

export const DEPARTMENT_COLORS: Record<string, string> = {
  Marketing: "#F472B6",
  Partnerships: "#A78BFA",
  Operations: "#FBBF24",
  Engineering: "#60A5FA",
  Leadership: "#E84393",
  "Install Ops": "#34D399",
  Events: "#FB923C",
  Finance: "#22D3EE",
};

const DEPARTMENTS = [
  "Marketing",
  "Partnerships",
  "Operations",
  "Engineering",
  "Leadership",
  "Install Ops",
  "Events",
  "Finance",
];

function formatMeetingDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(durationMin: number): string {
  if (durationMin < 60) return `${durationMin} min`;
  const hours = Math.floor(durationMin / 60);
  const minutes = durationMin % 60;
  if (!minutes) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

function SearchableGroupedDropdown({
  groups,
  value,
  onChange,
  placeholder,
  allLabel,
}: {
  groups: Array<{ label: string; items: Array<{ value: string; label: string }> }>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !query || item.label.toLowerCase().includes(query) || group.label.toLowerCase().includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, search]);

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {};
      filteredGroups.forEach(({ label }) => {
        next[label] = prev[label] ?? false;
      });
      return next;
    });
  }, [filteredGroups]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = useMemo(() => {
    for (const group of groups) {
      const item = group.items.find((entry) => entry.value === value);
      if (item) return item.label;
    }
    return "";
  }, [groups, value]);

  const allExpanded = filteredGroups.length > 0 && filteredGroups.every(({ label }) => expandedGroups[label] ?? true);

  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 180, flex: "1 1 180px" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{ ...filterStyle, width: "100%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel || placeholder}</span>
        <RacketIcon expanded={open} size={10} color="rgba(255,255,255,0.45)" />
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 24,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(8,8,14,0.95)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            padding: 8,
          }}
        >
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {};
              filteredGroups.forEach(({ label }) => {
                next[label] = !allExpanded;
              });
              setExpandedGroups(next);
            }}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "2px 6px", fontSize: 10, marginBottom: 4 }}
          >
            <RacketIcon expanded={allExpanded} size={8} color="rgba(255,255,255,0.35)" />
            <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
          </button>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." style={{ ...filterStyle, width: "100%", marginBottom: 8 }} />
          <div style={{ display: "grid", gap: 6, maxHeight: 300, overflowY: "auto", overflowX: "hidden" }}>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
                setSearch("");
              }}
              style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)", background: value === "" ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.02)", color: value === "" ? "#bfdbfe" : "rgba(255,255,255,0.78)", cursor: "pointer", fontSize: 11 }}
            >
              {allLabel}
            </button>
            {!filteredGroups.length ? <div style={{ padding: "10px 8px", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>No matches found</div> : null}
            {filteredGroups.map((group) => {
              const expanded = expandedGroups[group.label] ?? true;
              return (
                <div key={group.label}>
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [group.label]: !expanded }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: "4px 6px", fontSize: 11, fontWeight: 600, textAlign: "left" }}
                  >
                    <RacketIcon expanded={expanded} size={12} color="rgba(255,255,255,0.65)" />
                    <span>{group.label}</span>
                  </button>
                  {expanded ? (
                    <div style={{ display: "grid", gap: 2, marginTop: 2 }}>
                      {group.items.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => {
                            onChange(item.value);
                            setOpen(false);
                            setSearch("");
                          }}
                          style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)", background: value === item.value ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.02)", color: value === item.value ? "#bfdbfe" : "rgba(255,255,255,0.78)", cursor: "pointer", fontSize: 11 }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type DateRange = { from: string; to: string; presetLabel: string };

const EMPTY_RANGE: DateRange = { from: "", to: "", presetLabel: "" };

function toISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(d: Date): Date {
  // Sunday-start week (US convention)
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function endOfWeek(d: Date): Date {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function buildDatePresets(): Array<{ label: string; range: () => DateRange }> {
  return [
    {
      label: "Today",
      range: () => {
        const today = toISODate(new Date());
        return { from: today, to: today, presetLabel: "Today" };
      },
    },
    {
      label: "Last 7 Days",
      range: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return { from: toISODate(start), to: toISODate(end), presetLabel: "Last 7 Days" };
      },
    },
    {
      label: "This Week",
      range: () => {
        const now = new Date();
        return { from: toISODate(startOfWeek(now)), to: toISODate(endOfWeek(now)), presetLabel: "This Week" };
      },
    },
    {
      label: "Last Week",
      range: () => {
        const ref = new Date();
        ref.setDate(ref.getDate() - 7);
        return { from: toISODate(startOfWeek(ref)), to: toISODate(endOfWeek(ref)), presetLabel: "Last Week" };
      },
    },
    {
      label: "This Month",
      range: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: toISODate(start), to: toISODate(end), presetLabel: "This Month" };
      },
    },
    {
      label: "Last Month",
      range: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: toISODate(start), to: toISODate(end), presetLabel: "Last Month" };
      },
    },
    {
      label: "This Year",
      range: () => {
        const now = new Date();
        return {
          from: toISODate(new Date(now.getFullYear(), 0, 1)),
          to: toISODate(new Date(now.getFullYear(), 11, 31)),
          presetLabel: "This Year",
        };
      },
    },
    {
      label: "Last Year",
      range: () => {
        const y = new Date().getFullYear() - 1;
        return {
          from: toISODate(new Date(y, 0, 1)),
          to: toISODate(new Date(y, 11, 31)),
          presetLabel: "Last Year",
        };
      },
    },
    {
      label: "All Time",
      range: () => EMPTY_RANGE,
    },
  ];
}

function formatRangeLabel(range: DateRange): string {
  if (range.presetLabel) return range.presetLabel;
  if (!range.from && !range.to) return "All dates";
  const fmt = (iso: string) => {
    if (!iso) return "…";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };
  if (range.from && range.to && range.from === range.to) return fmt(range.from);
  return `${fmt(range.from)} – ${fmt(range.to)}`;
}

function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  useEffect(() => {
    setDraftFrom(value.from);
    setDraftTo(value.to);
  }, [value.from, value.to]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const presets = useMemo(() => buildDatePresets(), []);
  const isActive = Boolean(value.from || value.to);
  const label = formatRangeLabel(value);

  const applyDraft = () => {
    if (draftFrom && draftTo && draftFrom > draftTo) {
      onChange({ from: draftTo, to: draftFrom, presetLabel: "" });
    } else {
      onChange({ from: draftFrom, to: draftTo, presetLabel: "" });
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", minWidth: 200, flex: "1 1 200px" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          ...filterStyle,
          width: "100%",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          textAlign: "left",
          color: isActive ? "var(--color-client-text)" : "var(--color-client-text-secondary)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <RacketIcon expanded={open} size={10} color="rgba(255,255,255,0.45)" />
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 24,
            minWidth: 280,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(8,8,14,0.96)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            padding: 12,
          }}
        >
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Quick ranges
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {presets.map((preset) => {
              const selected = value.presetLabel === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange(preset.range());
                    setOpen(false);
                  }}
                  style={{
                    background: selected ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${selected ? "rgba(96,165,250,0.4)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 999,
                    color: selected ? "#bfdbfe" : "rgba(255,255,255,0.78)",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: "4px 10px",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Custom range
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>From</span>
              <input
                type="date"
                value={draftFrom}
                max={draftTo || undefined}
                onChange={(e) => setDraftFrom(e.target.value)}
                style={filterStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>To</span>
              <input
                type="date"
                value={draftTo}
                min={draftFrom || undefined}
                onChange={(e) => setDraftTo(e.target.value)}
                style={filterStyle}
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                onChange(EMPTY_RANGE);
                setDraftFrom("");
                setDraftTo("");
                setOpen(false);
              }}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                color: "rgba(255,255,255,0.6)",
                fontSize: 11,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyDraft}
              disabled={!draftFrom && !draftTo}
              style={{
                background: !draftFrom && !draftTo ? "rgba(96,165,250,0.08)" : "rgba(96,165,250,0.2)",
                border: "1px solid rgba(96,165,250,0.4)",
                borderRadius: 6,
                color: "#bfdbfe",
                fontSize: 11,
                padding: "6px 14px",
                cursor: !draftFrom && !draftTo ? "not-allowed" : "pointer",
              }}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlatSearchableDropdown({
  items,
  value,
  onChange,
  placeholder,
  allLabel,
}: {
  items: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  allLabel: string;
}) {
  const groupedItems = useMemo(() => [{ label: "Departments", items }], [items]);
  return <SearchableGroupedDropdown groups={groupedItems} value={value} onChange={onChange} placeholder={placeholder} allLabel={allLabel} />;
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
      {sub ? <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function PlaudSyncPanel({
  state,
  syncing,
  onSync,
}: {
  state: PlaudSyncState | null;
  syncing: boolean;
  onSync: () => void;
}) {
  const configured = Boolean(state?.configured);
  const status = state?.status ?? "not_configured";
  const statusColor = status === "error" ? "#F87171" : configured ? "#34D399" : "var(--color-client-text-dim)";
  const lastSuccessfulSync = state?.lastSuccessfulSyncAt;
  const lastAttemptedSync = state?.lastSyncAt;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        background: "var(--color-client-surface)",
        border: "1px solid var(--color-client-border)",
        borderRadius: 8,
        padding: "12px 14px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)" }}>Plaud Sync</span>
          <span style={{ fontSize: 10, color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}33`, borderRadius: 999, padding: "2px 8px" }}>
            {configured ? status.replace("_", " ") : "not configured"}
          </span>
          {state?.processingCount ? (
            <span style={{ fontSize: 10, color: "#FBBF24", background: "rgba(251,191,36,0.12)", borderRadius: 999, padding: "2px 8px" }}>
              {state.processingCount} pending transcript{state.processingCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
          {lastSuccessfulSync
            ? `Last successful run ${new Date(lastSuccessfulSync).toLocaleString()}`
            : lastAttemptedSync
              ? `Last attempted run ${new Date(lastAttemptedSync).toLocaleString()}`
              : "Connect Plaud credentials to enable automatic transcript imports."}
          {state?.lastError ? ` · ${state.lastError}` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        style={{
          background: configured ? "rgba(218,218,219,0.16)" : "rgba(255,255,255,0.04)",
          border: configured ? "1px solid rgba(218,218,219,0.38)" : "1px solid var(--color-client-border)",
          borderRadius: 6,
          color: configured ? "#FCA5A5" : "var(--color-client-text-dim)",
          cursor: syncing ? "wait" : "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: "7px 12px",
        }}
      >
        {syncing ? "Syncing..." : "Sync Plaud"}
      </button>
    </div>
  );
}

export function DepartmentBadge({ department }: { department: string }) {
  const color = DEPARTMENT_COLORS[department] ?? "#94A3B8";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}18`,
        border: `1px solid ${color}33`,
        borderRadius: 999,
        padding: "2px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {department}
    </span>
  );
}

function MeetingCardInner({
  meeting,
  contacts,
  accounts,
}: {
  meeting: MeetingBriefing;
  contacts: Contact[];
  accounts: Account[];
}) {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const actionItemsFetched = useRef(false);

  const resolveAccount = useCallback(
    (company: string): Account | undefined => {
      return resolveAccountLib({ name: company }, accounts).match ?? undefined;
    },
    [accounts],
  );

  const headerAccount = useMemo(() => {
    const externalCompanies = new Set<string>();
    meeting.participants.forEach((p) => {
      if (!p.isCLIENT && p.company) externalCompanies.add(p.company.trim());
    });
    if (externalCompanies.size !== 1) return undefined;
    const [only] = Array.from(externalCompanies);
    return resolveAccount(only);
  }, [meeting.participants, resolveAccount]);

  const fetchActionItems = useCallback(async () => {
    try {
      const res = await fetch("/api/action-items");
      if (res.ok) {
        const data = await res.json();
        setActionItems(Array.isArray(data) ? data : data.items ?? []);
      }
    } catch {
      /* graceful degrade */
    }
  }, []);

  useEffect(() => {
    if (expanded && !actionItemsFetched.current) {
      actionItemsFetched.current = true;
      void fetchActionItems();
    }
  }, [expanded, fetchActionItems]);

  useEffect(() => {
    if (!expanded) return;
    const interval = setInterval(() => {
      void fetchActionItems();
    }, 5000);
    return () => clearInterval(interval);
  }, [expanded, fetchActionItems]);

  return (
    <div
      style={{
        background: "var(--color-client-surface)",
        border: "1px solid var(--color-client-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded((current) => !current)}
        style={{
          padding: isMobile ? "12px 14px" : "14px 18px",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: isMobile ? 8 : 12, flexDirection: isMobile ? "column" : "row" }}>
          <span style={{ display: isMobile ? "none" : "inline", marginTop: 3 }}>
            <RacketIcon expanded={expanded} size={16} color={expanded ? "var(--color-client-text)" : "var(--color-client-text-dim)"} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-client-text)" }}>{meeting.title}</span>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", background: "rgba(255,255,255,0.04)", borderRadius: 999, padding: "2px 8px" }}>
                {meeting.participants.length} participant{meeting.participants.length === 1 ? "" : "s"}
              </span>
              {headerAccount ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/contacts?object=accounts&select=${headerAccount.id}`);
                  }}
                  title={`Open ${headerAccount.name} in Accounts`}
                  style={{
                    background: "rgba(96,165,250,0.12)",
                    border: "1px solid rgba(96,165,250,0.33)",
                    color: "#60A5FA",
                    fontSize: 11,
                    padding: "2px 10px",
                    borderRadius: 999,
                    cursor: "pointer",
                  }}
                >
                  → {headerAccount.name}
                </button>
              ) : null}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)", marginBottom: 8 }}>
              {formatMeetingDate(meeting.date)} · {meeting.time} · {formatDuration(meeting.durationMin)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {meeting.departments.map((department) => (
                <DepartmentBadge key={`${meeting.id}-${department}`} department={department} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          maxHeight: expanded ? 2000 : 0,
          opacity: expanded ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s ease, opacity 0.2s ease",
        }}
      >
        <MeetingBriefingDetail
          meeting={meeting}
          actionItems={actionItems}
          onSyncActionItems={fetchActionItems}
          contacts={contacts}
          accounts={accounts}
        />
      </div>
    </div>
  );
}

// Per-card error boundary so one bad card cannot blank the whole page
class MeetingCardBoundary extends React.Component<{ meeting: MeetingBriefing; children: React.ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { meeting: MeetingBriefing; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, msg: error?.message ?? "Render error" };
  }
  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("[MeetingCard]", this.props.meeting?.id, error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: "var(--color-client-surface)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 14, fontSize: 12, color: "#f87171" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Failed to render meeting: {this.props.meeting?.title || this.props.meeting?.id}</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>{this.state.msg}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MeetingCard({
  meeting,
  contacts,
  accounts,
}: {
  meeting: MeetingBriefing;
  contacts: Contact[];
  accounts: Account[];
}) {
  return (
    <MeetingCardBoundary meeting={meeting}>
      <MeetingCardInner meeting={meeting} contacts={contacts} accounts={accounts} />
    </MeetingCardBoundary>
  );
}

export function ClientMeetings() {
  const { isMobile } = useResponsive();
  const [meetings, setMeetings] = useState<MeetingBriefing[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [participantFilter, setParticipantFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [plaudState, setPlaudState] = useState<PlaudSyncState | null>(null);
  const [plaudSyncing, setPlaudSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [contactsRes, accountsRes] = await Promise.all([
          fetch("/api/crm/contacts"),
          fetch("/api/crm/accounts"),
        ]);
        if (!cancelled && contactsRes.ok) {
          const data = await contactsRes.json();
          setContacts(Array.isArray(data) ? data : []);
        }
        if (!cancelled && accountsRes.ok) {
          const data = await accountsRes.json();
          setAccounts(Array.isArray(data) ? data : []);
        }
      } catch {
        /* graceful degrade — links/chip just won't render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        // Normalize/sanitize to keep render code crash-proof
        const normalized: MeetingBriefing[] = list.map((raw: Record<string, unknown>) => {
          const safeStr = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
          const safeArrStr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
          const rawParts = Array.isArray(raw.participants) ? raw.participants : [];
          const participants = (rawParts as Record<string, unknown>[])
            .filter((p) => p && typeof p === "object")
            .map((p) => ({
              name: safeStr(p.name, "Unknown"),
              role: safeStr(p.role, ""),
              company: safeStr(p.company, ""),
              isCLIENT: Boolean(p.isCLIENT),
              department: typeof p.department === "string" ? p.department : undefined,
            }));
          return {
            id: safeStr(raw.id, `m-${Math.random().toString(36).slice(2, 8)}`),
            title: safeStr(raw.title, "Untitled meeting"),
            date: safeStr(raw.date, ""),
            time: safeStr(raw.time, ""),
            durationMin: typeof raw.durationMin === "number" && Number.isFinite(raw.durationMin) ? raw.durationMin : 0,
            participants,
            departments: safeArrStr(raw.departments),
            executiveSummary: safeStr(raw.executiveSummary, ""),
            strategicNote: typeof raw.strategicNote === "string" ? raw.strategicNote : undefined,
            whatsHandled: safeArrStr(raw.whatsHandled),
            nextSteps: safeArrStr(raw.nextSteps),
            transcriptUrl: typeof raw.transcriptUrl === "string" ? raw.transcriptUrl : undefined,
            discordMessageIds: Array.isArray(raw.discordMessageIds) ? (raw.discordMessageIds as unknown[]).filter((x) => typeof x === "string") as string[] : undefined,
            formattedNotesMarkdown: typeof raw.formattedNotesMarkdown === "string" ? raw.formattedNotesMarkdown : undefined,
            sourceSystem: typeof raw.sourceSystem === "string" ? raw.sourceSystem as MeetingBriefing["sourceSystem"] : undefined,
            externalId: typeof raw.externalId === "string" ? raw.externalId : undefined,
            sourceOwner: typeof raw.sourceOwner === "string" ? raw.sourceOwner : undefined,
            sourceStartedAt: typeof raw.sourceStartedAt === "string" ? raw.sourceStartedAt : undefined,
            sourceCreatedAt: typeof raw.sourceCreatedAt === "string" ? raw.sourceCreatedAt : undefined,
            syncStatus: typeof raw.syncStatus === "string" ? raw.syncStatus as MeetingBriefing["syncStatus"] : undefined,
            transcriptSourceUrl: typeof raw.transcriptSourceUrl === "string" ? raw.transcriptSourceUrl : undefined,
            sourceMetadata: raw.sourceMetadata && typeof raw.sourceMetadata === "object" && !Array.isArray(raw.sourceMetadata) ? raw.sourceMetadata as Record<string, unknown> : undefined,
            createdAt: safeStr(raw.createdAt, new Date().toISOString()),
          };
        });
        setMeetings(normalized);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[ClientMeetings] fetch failed", err);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const fetchPlaudStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/meetings/plaud/status", { cache: "no-store" });
      if (res.ok) setPlaudState(await res.json());
    } catch {
      setPlaudState(null);
    }
  }, []);

  useEffect(() => {
    fetchPlaudStatus();
  }, [fetchPlaudStatus]);

  const runPlaudSync = useCallback(async () => {
    setPlaudSyncing(true);
    try {
      const res = await fetch("/api/meetings/plaud/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-actor": "Mission Agent" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setPlaudState((prev) => ({
          ...(prev ?? {
            status: "error",
            configured: false,
            importedCount: 0,
            skippedDuplicates: 0,
            failedCount: 0,
            processingCount: 0,
          }),
          status: "error",
          lastError: typeof body.error === "string" ? body.error : `Sync failed with ${res.status}`,
        }));
      }
      await Promise.all([fetchMeetings(), fetchPlaudStatus()]);
    } finally {
      setPlaudSyncing(false);
    }
  }, [fetchMeetings, fetchPlaudStatus]);

  const clientParticipants = useMemo(() => {
    const map = new Map<string, { name: string; department: string }>();
    meetings.forEach((meeting) => {
      meeting.participants.forEach((participant) => {
        if (participant.isCLIENT && !map.has(participant.name)) {
          map.set(participant.name, { name: participant.name, department: participant.department || "Other" });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [meetings]);

  const participantGroups = useMemo(() => {
    const groups = new Map<string, Array<{ value: string; label: string }>>();
    clientParticipants.forEach((participant) => {
      const current = groups.get(participant.department) ?? [];
      current.push({ value: participant.name, label: participant.name });
      groups.set(participant.department, current);
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, items: items.sort((a, b) => a.label.localeCompare(b.label)) }));
  }, [clientParticipants]);

  const departmentOptions = useMemo(() => {
    return DEPARTMENTS.map((department) => ({ value: department, label: department }));
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const thisMonth = meetings.filter((meeting) => {
      const date = new Date(`${meeting.date}T12:00:00`);
      return date.getMonth() === month && date.getFullYear() === year;
    }).length;

    return {
      totalMeetings: meetings.length,
      thisMonth,
      departmentsCovered: new Set(meetings.flatMap((meeting) => meeting.departments)).size,
      participantsTracked: new Set(meetings.flatMap((meeting) => meeting.participants.map((participant) => participant.name))).size,
    };
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    const query = search.trim().toLowerCase();

    return meetings.filter((meeting) => {
      if (participantFilter && !meeting.participants.some((participant) => participant.name === participantFilter)) {
        return false;
      }
      if (departmentFilter && !meeting.departments.includes(departmentFilter)) {
        return false;
      }
      if (dateRange.from && meeting.date < dateRange.from) {
        return false;
      }
      if (dateRange.to && meeting.date > dateRange.to) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        meeting.title,
        meeting.executiveSummary,
        meeting.formattedNotesMarkdown ?? "",
        meeting.sourceSystem ?? "",
        ...meeting.participants.map((participant) => `${participant.name} ${participant.role} ${participant.company}`),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [dateRange.from, dateRange.to, departmentFilter, meetings, participantFilter, search]);

  const hasActiveFilters = Boolean(
    participantFilter || departmentFilter || dateRange.from || dateRange.to || search.trim()
  );

  return (
    <div>
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
            Example Client Meetings
          </h1>
          <p style={{ fontSize: 12, color: "var(--color-client-text-dim)", margin: "4px 0 0" }}>
            Meeting briefings, operational context, and searchable follow-through
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Total Meetings" value={String(stats.totalMeetings)} />
        <StatCard label="This Month" value={String(stats.thisMonth)} />
        <StatCard label="Departments Covered" value={String(stats.departmentsCovered)} />
        <StatCard label="Participants Tracked" value={String(stats.participantsTracked)} />
      </div>

      <PlaudSyncPanel state={plaudState} syncing={plaudSyncing} onSync={runPlaudSync} />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
          padding: 12,
          background: "var(--color-client-surface)",
          border: "1px solid var(--color-client-border)",
          borderRadius: 8,
        }}
      >
        <SearchableGroupedDropdown
          groups={participantGroups}
          value={participantFilter}
          onChange={setParticipantFilter}
          placeholder="All participants"
          allLabel="All participants"
        />

        <FlatSearchableDropdown
          items={departmentOptions}
          value={departmentFilter}
          onChange={setDepartmentFilter}
          placeholder="All departments"
          allLabel="All departments"
        />

        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, summary, participants"
          style={{ ...filterStyle, minWidth: isMobile ? "100%" : 260, flex: "1 1 260px" }}
        />

        {hasActiveFilters ? (
          <button
            onClick={() => {
              setParticipantFilter("");
              setDepartmentFilter("");
              setDateRange(EMPTY_RANGE);
              setSearch("");
            }}
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
            Clear all
          </button>
        ) : null}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "var(--color-client-text-dim)", padding: 40, fontSize: 13 }}>
          Loading meetings...
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--color-client-text-dim)", padding: 40, fontSize: 13 }}>
          {hasActiveFilters ? "No meetings match the current filters." : "No meeting briefings recorded yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} contacts={contacts} accounts={accounts} />
          ))}
        </div>
      )}
    </div>
  );
}

const filterStyle = {
  background: "var(--color-client-surface)",
  border: "1px solid var(--color-client-border)",
  borderRadius: 6,
  color: "var(--color-client-text-secondary)",
  fontSize: 12,
  padding: "6px 10px",
  outline: "none",
} satisfies React.CSSProperties;
