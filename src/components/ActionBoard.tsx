"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import RacketIcon from "@/components/RacketIcon";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import { OwnerBadge, OwnerSelect } from "@/components/crm/FunnelPhase2";
import type { ActionItem, Status, Priority } from "@/types/action-item";

// ── Types ──

type ViewMode = "board" | "list";
type SortField = "status" | "title" | "owner" | "department" | "deadline" | "sourceMeeting" | "priority" | "updatedAt";
type SortDir = "asc" | "desc";
type GroupField = "none" | "project" | "owner" | "department" | "priority";

// ── Constants ──

const COMPLETION_SIGNAL_TYPES = [
  { value: "", label: "— None —" },
  { value: "email-sent", label: "Email Sent" },
  { value: "slack-sent", label: "Slack/Discord Message Sent" },
  { value: "file-uploaded", label: "File / Deck Uploaded" },
  { value: "webhook", label: "Webhook / API Event" },
  { value: "manual", label: "Manual Confirmation" },
  { value: "other", label: "Other" },
];

const STATUS_ORDER: Status[] = ["not_started", "in_progress", "complete"];
const STATUS_LABEL: Record<Status, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  complete: "Completed",
};
const STATUS_COLOR: Record<Status, string> = {
  not_started: "#EF4444",
  in_progress: "#FBBF24",
  complete: "#22C55E",
};

const STATUS_BG: Record<Status, string> = {
  not_started: "rgba(239,68,68,0.12)",
  in_progress: "rgba(251,191,36,0.12)",
  complete: "rgba(34,197,94,0.12)",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

// Shared dark-themed select styles
const SELECT_STYLE: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "rgba(20,20,30,0.9)",
  color: "#e2e2e8",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  fontSize: 12,
  padding: "5px 28px 5px 10px",
  cursor: "pointer",
  outline: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
  backgroundSize: "10px 6px",
};

const OWNER_COLORS: Record<string, string> = {
  Alex: "#dadadb",
  "Morgan": "#60A5FA",
  "Mission Agent": "#D8DDE1",
  Unassigned: "#59616A",
};

const OWNER_OPTIONS = ["Alex", "Morgan", "Mission Agent"];

const PRIORITY_DOT: Record<Priority, string> = {
  high: "#dadadb",
  medium: "#60A5FA",
  low: "var(--color-client-text-dim)",
};

const PRIORITY_SORT: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function isEngineeringLinked(item: Pick<ActionItem, "department" | "externalId">): boolean {
  return item.department === "Engineering" && Boolean(item.externalId);
}

function ownerColor(name: string): string {
  for (const [key, color] of Object.entries(OWNER_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "var(--color-client-text-secondary)";
}

function ownerSelectStyle(name: string, compact = false): React.CSSProperties {
  const oc = ownerColor(name);
  return {
    ...SELECT_STYLE,
    fontSize: compact ? 10 : 12,
    padding: compact ? "3px 26px 3px 10px" : "5px 30px 5px 12px",
    borderRadius: 999,
    fontWeight: 600,
    color: "#F5F3FF",
    backgroundColor: "rgba(17, 24, 39, 0.96)",
    backgroundImage: `linear-gradient(90deg, ${oc}30 0%, rgba(15,23,42,0.9) 72%), ${String(SELECT_STYLE.backgroundImage)}`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundPosition: "left top, right 8px center",
    backgroundSize: "100% 100%, 10px 6px",
    border: `1px solid ${oc}66`,
    boxShadow: `inset 0 0 0 1px ${oc}20, 0 0 0 1px rgba(15,23,42,0.35)`,
  };
}

const GROUP_BY_OPTIONS: { value: GroupField; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "project", label: "Project" },
  { value: "owner", label: "Owner" },
  { value: "department", label: "Department" },
  { value: "priority", label: "Priority" },
];

function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false;
  return new Date(deadline + "T23:59:59") < new Date();
}

function isUrgent(deadline: string | null): boolean {
  if (!deadline) return false;
  const diff = new Date(deadline + "T23:59:59").getTime() - Date.now();
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
}

function isDueThisWeek(deadline: string | null): boolean {
  if (!deadline) return false;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day === 0 ? 7 : day) - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  const d = new Date(deadline + "T23:59:59");
  return d >= monday && d <= sunday;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d.includes("T") ? d : d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateTime(d: string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function relativeTime(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Component ──

export function ActionBoard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Lazy-loaded CRM lookups for surfacing relatedAccountId/relatedContactId chips on cards.
  const [accountsById, setAccountsById] = useState<Map<string, string>>(() => new Map());
  const [contactsById, setContactsById] = useState<Map<string, string>>(() => new Map());
  const [view, setView] = useState<ViewMode>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedCols, setCollapsedCols] = useState<Record<Status, boolean>>({
    not_started: false,
    in_progress: false,
    complete: false,
  });

  // Filters
  const [filterOwner, setFilterOwner] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [groupBy, setGroupBy] = useState<GroupField>("none");
  const [showOwnerBreakdown, setShowOwnerBreakdown] = useState(false);

  // List sort
  const [sortField, setSortField] = useState<SortField>("deadline");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Flash feedback for inline edits
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

  // Deep-link highlight from ?task=<id>
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Detail panel resize
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("ab-panel-width");
      return saved ? parseInt(saved, 10) : 420;
    }
    return 420;
  });
  const [panelFullscreen, setPanelFullscreen] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Deep-link: scroll to and highlight task from URL param
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId || loading || items.length === 0) return;
    setHighlightId(taskId);
    // Select it to open the detail panel
    setSelectedId(taskId);
    // Scroll to the element
    setTimeout(() => {
      const el = document.querySelector(`[data-task-id="${taskId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    // Clear highlight after 3 seconds
    const timer = setTimeout(() => setHighlightId(null), 3500);
    return () => clearTimeout(timer);
  }, [searchParams, loading, items.length]);

  // Fetch items
  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/action-items");
      const data = await res.json();
      setItems(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // One-time CRM lookup load — used to render relatedAccountId/relatedContactId chips on cards.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accountsRes, contactsRes] = await Promise.all([
          fetch("/api/crm/accounts", { cache: "no-store" }),
          fetch("/api/crm/contacts", { cache: "no-store" }),
        ]);
        if (!cancelled && accountsRes.ok) {
          const data = await accountsRes.json();
          if (Array.isArray(data)) {
            const map = new Map<string, string>();
            for (const a of data as Array<{ id?: unknown; name?: unknown }>) {
              if (typeof a?.id === "string" && typeof a?.name === "string") map.set(a.id, a.name);
            }
            setAccountsById(map);
          }
        }
        if (!cancelled && contactsRes.ok) {
          const data = await contactsRes.json();
          if (Array.isArray(data)) {
            const map = new Map<string, string>();
            for (const c of data as Array<{ id?: unknown; name?: unknown }>) {
              if (typeof c?.id === "string" && typeof c?.name === "string") map.set(c.id, c.name);
            }
            setContactsById(map);
          }
        }
      } catch {
        /* graceful degrade — chips just won't render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link
  useEffect(() => {
    const itemParam = searchParams.get("item");
    if (itemParam && items.length > 0) {
      const found = items.find((i) => i.id === itemParam);
      if (found) setSelectedId(found.id);
    }
  }, [searchParams, items]);

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setPanelFullscreen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Drag resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - e.clientX;
      const newW = Math.max(320, Math.min(800, dragRef.current.startW + delta));
      setPanelWidth(newW);
    };
    const onUp = () => {
      if (dragRef.current) {
        window.localStorage.setItem("ab-panel-width", String(panelWidth));
        dragRef.current = null;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panelWidth]);

  // Generic patch helper — optimistic update + flash
  const patchItem = async (id: string, fields: Partial<ActionItem>) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, ...fields, updatedAt: new Date().toISOString() } : i
      )
    );

    try {
      const res = await fetch("/api/action-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
        // Flash green
        setFlashIds((prev) => new Set(prev).add(id));
        setTimeout(() => setFlashIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        }), 600);
      }
    } catch {
      // Revert on failure by re-fetching
      fetchItems();
    }
  };

  // Update status (used by detail panel)
  const updateStatus = async (id: string, status: Status) => {
    patchItem(id, { status });
  };

  // Drop handler for drag-and-drop between columns
  const handleDropItem = (id: string, newStatus: Status) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.status === newStatus) return;
    patchItem(id, { status: newStatus });
  };

  // Delete item
  const deleteItem = async (id: string) => {
    try {
      const res = await fetch("/api/action-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      selectItem(null);
    } catch {
      // silent
    }
  };

  // Select item + update URL
  const selectItem = (id: string | null) => {
    setSelectedId(id);
    if (id) {
      router.replace(`/action-board?item=${id}`, { scroll: false });
    } else {
      router.replace("/action-board", { scroll: false });
    }
  };

  // Filter logic
  const matchesSharedFilters = useCallback((item: ActionItem) => {
    if (filterDept && item.department !== filterDept) return false;
    if (filterPriority && item.priority !== filterPriority) return false;
    if (filterProject && item.projectId !== filterProject && item.projectName !== filterProject) return false;
    return true;
  }, [filterDept, filterPriority, filterProject]);

  const ownerScopedItems = items.filter(matchesSharedFilters);
  const filtered = ownerScopedItems.filter((item) => !filterOwner || item.owner === filterOwner);

  const departments = [...new Set(items.map((i) => i.department))].filter(Boolean).sort();
  const projects = [...new Set(items.map((i) => i.projectId ?? i.projectName).filter(Boolean))].sort() as string[];

  const ownerCounts = OWNER_OPTIONS.reduce<Record<string, number>>((acc, owner) => {
    acc[owner] = ownerScopedItems.filter((item) => item.owner === owner).length;
    return acc;
  }, {});

  const ownerStatusCounts = OWNER_OPTIONS.map((owner) => {
    const personItems = ownerScopedItems.filter((item) => item.owner === owner);
    return {
      owner,
      total: personItems.length,
      notStarted: personItems.filter((item) => item.status === "not_started").length,
      inProgress: personItems.filter((item) => item.status === "in_progress").length,
      complete: personItems.filter((item) => item.status === "complete").length,
    };
  }).filter((entry) => entry.total > 0);

  // Stats
  const total = filtered.length;
  const notStarted = filtered.filter((i) => i.status === "not_started").length;
  const inProgress = filtered.filter((i) => i.status === "in_progress").length;
  const complete = filtered.filter((i) => i.status === "complete").length;
  const overdue = filtered.filter((i) => i.status !== "complete" && isOverdue(i.deadline)).length;
  const dueThisWeek = filtered.filter((i) => i.status !== "complete" && isDueThisWeek(i.deadline)).length;

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-client-text-dim)" }}>
        Loading action items...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Header */}
        <Header
          total={total}
          notStarted={notStarted}
          inProgress={inProgress}
          complete={complete}
          overdue={overdue}
          dueThisWeek={dueThisWeek}
          view={view}
          onViewChange={setView}
          filterOwner={filterOwner}
          onFilterOwner={setFilterOwner}
          filterDept={filterDept}
          onFilterDept={setFilterDept}
          filterPriority={filterPriority}
          onFilterPriority={setFilterPriority}
          filterProject={filterProject}
          onFilterProject={setFilterProject}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          showOwnerBreakdown={showOwnerBreakdown}
          onToggleOwnerBreakdown={() => setShowOwnerBreakdown((prev) => !prev)}
          departments={departments}
          projects={projects}
          ownerCounts={ownerCounts}
          ownerStatusCounts={ownerStatusCounts}
        />

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 0 24px 0" }}>
          {view === "board" ? (
            <BoardView
              items={filtered}
              collapsedCols={collapsedCols}
              onToggleCol={(s) => setCollapsedCols((prev) => ({ ...prev, [s]: !prev[s] }))}
              onSelect={selectItem}
              selectedId={selectedId}
              onDropItem={handleDropItem}
              highlightId={highlightId}
              accountsById={accountsById}
              contactsById={contactsById}
            />
          ) : (
            <ListView
              items={filtered}
              sortField={sortField}
              sortDir={sortDir}
              onSort={(f) => {
                if (f === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else { setSortField(f); setSortDir("asc"); }
              }}
              onSelect={selectItem}
              selectedId={selectedId}
              onPatchItem={patchItem}
              flashIds={flashIds}
              highlightId={highlightId}
              groupBy={groupBy}
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          width={panelFullscreen ? undefined : panelWidth}
          fullscreen={panelFullscreen}
          onClose={() => selectItem(null)}
          onToggleFullscreen={() => setPanelFullscreen((f) => !f)}
          onDragStart={(x) => { dragRef.current = { startX: x, startW: panelWidth }; }}
          onStatusChange={(status) => updateStatus(selectedItem.id, status)}
          onPatch={(fields) => patchItem(selectedItem.id, fields)}
          onDelete={() => void deleteItem(selectedItem.id)}
          departments={departments}
          projects={projects}
        />
      )}
    </div>
  );
}

// ── Header ──

function Header({
  total, notStarted, inProgress, complete, overdue, dueThisWeek,
  view, onViewChange,
  filterOwner, onFilterOwner, filterDept, onFilterDept, filterPriority, onFilterPriority,
  filterProject, onFilterProject, groupBy, onGroupByChange,
  showOwnerBreakdown, onToggleOwnerBreakdown, departments, projects, ownerCounts, ownerStatusCounts,
}: {
  total: number; notStarted: number; inProgress: number; complete: number; overdue: number; dueThisWeek: number;
  view: ViewMode; onViewChange: (v: ViewMode) => void;
  filterOwner: string; onFilterOwner: (v: string) => void;
  filterDept: string; onFilterDept: (v: string) => void;
  filterPriority: string; onFilterPriority: (v: string) => void;
  filterProject: string; onFilterProject: (v: string) => void;
  groupBy: GroupField; onGroupByChange: (value: GroupField) => void;
  showOwnerBreakdown: boolean; onToggleOwnerBreakdown: () => void;
  departments: string[]; projects: string[];
  ownerCounts: Record<string, number>;
  ownerStatusCounts: { owner: string; total: number; notStarted: number; inProgress: number; complete: number }[];
}) {
  return (
    <div style={{ padding: "0 0 16px 0", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--color-client-text)", margin: 0 }}>
          Action Board
        </h1>
        <div style={{ display: "flex", gap: 2, background: "var(--color-client-surface)", borderRadius: 8, padding: 2, border: "1px solid var(--color-client-border)" }}>
          {(["board", "list"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "none",
                background: view === v ? "var(--color-client-surface-raised)" : "transparent",
                color: view === v ? "var(--color-client-text)" : "var(--color-client-text-dim)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.15s",
              }}
            >
              {v === "board" ? "Board" : "List"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, marginBottom: 12, flexWrap: "wrap" }}>
        <StatChip label="Total" value={total} />
        <StatChip label="Not Started" value={notStarted} />
        <StatChip label="In Progress" value={inProgress} />
        <StatChip label="Completed" value={complete} />
        <StatChip label="Overdue" value={overdue} />
        <StatChip label="Due This Week" value={dueThisWeek} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <FilterSelect
          label="Owner"
          value={filterOwner}
          onChange={onFilterOwner}
          options={OWNER_OPTIONS.filter((owner) => ownerCounts[owner] > 0)}
          getOptionLabel={(owner) => `${owner} (${ownerCounts[owner] || 0})`}
          tone={filterOwner ? "owner" : "default"}
        />
        <FilterSelect label="Department" value={filterDept} onChange={onFilterDept} options={departments} />
        <FilterSelect label="Priority" value={filterPriority} onChange={onFilterPriority} options={["high", "medium", "low"]} displayMap={PRIORITY_LABEL} />
        {projects.length > 0 && (
          <FilterSelect label="Project" value={filterProject} onChange={onFilterProject} options={projects} />
        )}
        {view === "list" && (
          <FilterSelect
            label="Group"
            value={groupBy}
            onChange={(value) => onGroupByChange(value as GroupField)}
            options={GROUP_BY_OPTIONS.map((option) => option.value)}
            getOptionLabel={(value) => GROUP_BY_OPTIONS.find((option) => option.value === value)?.label ?? value}
            tone={groupBy !== "none" ? "accent" : "default"}
          />
        )}
      </div>

      <OwnerBreakdown
        entries={ownerStatusCounts}
        filterOwner={filterOwner}
        expanded={showOwnerBreakdown}
        onToggle={onToggleOwnerBreakdown}
        onSelectOwner={onFilterOwner}
      />
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: "var(--color-client-text)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, displayMap, getOptionLabel, tone = "default" }: { label: string; value: string; onChange: (v: string) => void; options: string[]; displayMap?: Record<string, string>; getOptionLabel?: (value: string) => string; tone?: "default" | "accent" | "owner" }) {
  const allLabel = label === "Priority"
    ? "All Priorities"
    : label === "Group"
    ? "No grouping"
    : `All ${label}s`;
  const ownerTone = tone === "owner" && value ? ownerSelectStyle(value) : null;
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={ownerTone ?? {
        ...SELECT_STYLE,
        background: tone === "accent" && value !== "none"
          ? "rgba(167,139,250,0.16)"
          : value
          ? "rgba(96,165,250,0.12)"
          : "rgba(20,20,30,0.9)",
        border: tone === "accent" && value !== "none"
          ? "1px solid rgba(167,139,250,0.35)"
          : SELECT_STYLE.border,
        color: tone === "accent" && value !== "none" ? "#DDD6FE" : SELECT_STYLE.color,
        backgroundImage: SELECT_STYLE.backgroundImage,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        backgroundSize: "10px 6px",
      }}
    >
      <option value="" style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o} style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>{getOptionLabel?.(o) ?? displayMap?.[o] ?? o}</option>
      ))}
    </select>
  );
}

function OwnerBreakdown({
  entries,
  filterOwner,
  expanded,
  onToggle,
  onSelectOwner,
}: {
  entries: { owner: string; total: number; notStarted: number; inProgress: number; complete: number }[];
  filterOwner: string;
  expanded: boolean;
  onToggle: () => void;
  onSelectOwner: (value: string) => void;
}) {
  return (
    <div style={{ background: "var(--color-client-surface)", border: "1px solid var(--color-client-border)", borderRadius: 12, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          color: "var(--color-client-text)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>{expanded ? "▼" : "▶"} By Person</span>
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{entries.length} active owners</span>
      </button>
      {expanded && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {entries.map((entry) => {
            const active = filterOwner === entry.owner;
            const color = ownerColor(entry.owner);
            return (
              <div
                key={entry.owner}
                style={{
                  minHeight: 28,
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 1.3fr) repeat(3, minmax(120px, 1fr))",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 12,
                  borderRadius: 8,
                  padding: "6px 8px",
                  background: active ? `${color}12` : "transparent",
                }}
              >
                <button
                  onClick={() => onSelectOwner(active ? "" : entry.owner)}
                  style={{
                    justifySelf: "start",
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: active ? color : "var(--color-client-text)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {entry.owner}
                </button>
                <OwnerStatusPill label="Not Started" value={entry.notStarted} color="#EF4444" />
                <OwnerStatusPill label="In Progress" value={entry.inProgress} color="#FBBF24" />
                <OwnerStatusPill label="Completed" value={entry.complete} color="#22C55E" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OwnerStatusPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-client-text-dim)", fontSize: 11 }}>
      <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span>{label}</span>
    </div>
  );
}

// ── Board View ──

function BoardView({
  items, collapsedCols, onToggleCol, onSelect, selectedId, onDropItem, highlightId,
  accountsById, contactsById,
}: {
  items: ActionItem[];
  collapsedCols: Record<Status, boolean>;
  onToggleCol: (s: Status) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  onDropItem: (id: string, newStatus: Status) => void;
  highlightId?: string | null;
  accountsById: Map<string, string>;
  contactsById: Map<string, string>;
}) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<Status | null>(null);

  return (
    <div style={{ display: "flex", gap: 12, height: "100%", minHeight: 0, padding: "0 2px" }}>
      {STATUS_ORDER.map((status) => {
        const colItems = items
          .filter((i) => i.status === status)
          .sort((a, b) => PRIORITY_SORT[a.priority] - PRIORITY_SORT[b.priority]);
        const collapsed = collapsedCols[status];
        const isDragTarget = dragOverStatus === status && draggedId !== null;
        const draggedItem = draggedId ? items.find((i) => i.id === draggedId) : null;
        // Only highlight column if dragged item is from a different status
        const isValidDrop = isDragTarget && draggedItem?.status !== status;

        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverStatus(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverStatus(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) onDropItem(id, status);
              setDraggedId(null);
              setDragOverStatus(null);
            }}
            style={{
              flex: collapsed ? "0 0 48px" : 1,
              display: "flex",
              flexDirection: "column",
              minWidth: collapsed ? 48 : 240,
              background: isValidDrop ? STATUS_BG[status] : "var(--color-client-surface)",
              borderRadius: 12,
              border: isValidDrop
                ? `2px dashed ${STATUS_COLOR[status]}`
                : "1px solid var(--color-client-border)",
              overflow: "hidden",
              transition: "flex 0.2s ease, min-width 0.2s ease, background 0.15s, border 0.15s",
            }}
          >
            {/* Column header */}
            <div
              onClick={() => onToggleCol(status)}
              style={{
                padding: collapsed ? "12px 8px" : "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                borderBottom: "1px solid var(--color-client-border)",
                flexShrink: 0,
                userSelect: "none",
              }}
            >
              <RacketIcon expanded={!collapsed} size={14} color={STATUS_COLOR[status]} />
              {!collapsed && (
                <>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: STATUS_COLOR[status],
                    textTransform: "uppercase",
                  }}>
                    {STATUS_LABEL[status]}
                  </span>
                  <span style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: "var(--color-client-text-dim)",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    padding: "1px 7px",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {colItems.length}
                  </span>
                </>
              )}
              {collapsed && (
                <span style={{
                  writingMode: "vertical-rl",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: STATUS_COLOR[status],
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}>
                  {STATUS_LABEL[status]} ({colItems.length})
                </span>
              )}
            </div>

            {/* Cards */}
            {!collapsed && (
              <div style={{ flex: 1, overflow: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {colItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    highlight={item.id === highlightId}
                    onSelect={() => onSelect(item.id)}
                    isDragging={item.id === draggedId}
                    onDragStart={(id) => setDraggedId(id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverStatus(null); }}
                    accountsById={accountsById}
                    contactsById={contactsById}
                  />
                ))}
                {colItems.length === 0 && (
                  <div style={{
                    padding: 16,
                    textAlign: "center",
                    color: isValidDrop ? STATUS_COLOR[status] : "var(--color-client-text-dim)",
                    fontSize: 12,
                    fontWeight: isValidDrop ? 600 : 400,
                    transition: "color 0.15s",
                  }}>
                    {isValidDrop ? `Drop here → ${STATUS_LABEL[status]}` : "No items"}
                  </div>
                )}
                {isValidDrop && colItems.length > 0 && (
                  <div style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px dashed ${STATUS_COLOR[status]}`,
                    color: STATUS_COLOR[status],
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: "center",
                    opacity: 0.8,
                  }}>
                    Drop to move here
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemCard({ item, selected, onSelect, isDragging, onDragStart, onDragEnd, highlight, accountsById, contactsById }: {
  item: ActionItem;
  selected: boolean;
  onSelect: () => void;
  isDragging?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  highlight?: boolean;
  accountsById?: Map<string, string>;
  contactsById?: Map<string, string>;
}) {
  const router = useRouter();
  const deadlineOverdue = item.status !== "complete" && isOverdue(item.deadline);
  const deadlineUrgent = item.status !== "complete" && isUrgent(item.deadline);
  const linkedAccountName = item.relatedAccountId ? accountsById?.get(item.relatedAccountId) : undefined;
  const linkedContactName = item.relatedContactId ? contactsById?.get(item.relatedContactId) : undefined;

  return (
    <div
      draggable
      data-task-id={item.id}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.(item.id);
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: highlight ? "1px solid rgba(250,204,21,0.8)" : selected ? "1px solid rgba(96,165,250,0.4)" : "1px solid var(--color-client-border-subtle)",
        background: highlight ? "rgba(250,204,21,0.12)" : selected ? "rgba(96,165,250,0.06)" : "var(--color-client-surface-raised)",
        boxShadow: highlight ? "0 0 12px rgba(250,204,21,0.35)" : undefined,
        cursor: "grab",
        opacity: isDragging ? 0.4 : 1,
        transition: "all 0.5s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.borderColor = "var(--color-client-border)";
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.borderColor = "var(--color-client-border-subtle)";
      }}
    >
      {/* Title + priority dot + overdue badge */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3, flexShrink: 0, marginTop: 5,
          background: PRIORITY_DOT[item.priority],
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-client-text)", lineHeight: 1.4, flex: 1 }}>
          {item.title}
        </span>
        {deadlineOverdue && (
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            color: "#fff",
            background: "#dadadb",
            borderRadius: 3,
            padding: "1px 5px",
            flexShrink: 0,
            letterSpacing: "0.04em",
            lineHeight: 1.6,
          }}>
            OVERDUE
          </span>
        )}
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {/* Owner pill */}
        <OwnerBadge owner={item.owner} compact />
        {/* Department tag */}
        <span style={{
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 4,
          background: "rgba(255,255,255,0.04)",
          color: "var(--color-client-text-dim)",
        }}>
          {item.department}
        </span>
        {/* CRM linkage chips — set when item was tracked from inside an account/contact drawer */}
        {linkedAccountName && item.relatedAccountId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); router.push(`/contacts?object=accounts&select=${item.relatedAccountId}`); }}
            title={`Open ${linkedAccountName} in Accounts`}
            style={{
              fontSize: 10,
              padding: "1px 8px",
              borderRadius: 999,
              background: "rgba(96,165,250,0.10)",
              border: "1px solid rgba(96,165,250,0.25)",
              color: "#60A5FA",
              fontWeight: 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            🏢 {linkedAccountName}
          </button>
        )}
        {linkedContactName && item.relatedContactId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); router.push(`/contacts?select=${item.relatedContactId}`); }}
            title={`Open ${linkedContactName} in Contacts`}
            style={{
              fontSize: 10,
              padding: "1px 8px",
              borderRadius: 999,
              background: "rgba(167,139,250,0.10)",
              border: "1px solid rgba(167,139,250,0.25)",
              color: "#A78BFA",
              fontWeight: 500,
              whiteSpace: "nowrap",
              cursor: "pointer",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {linkedContactName}
          </button>
        )}
      </div>

      {/* Bottom row: deadline + source */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 10,
          color: deadlineOverdue ? "#dadadb" : deadlineUrgent ? "#F59E0B" : "var(--color-client-text-dim)",
          fontWeight: deadlineOverdue || deadlineUrgent ? 600 : 400,
        }}>
          {item.deadline ? formatDate(item.deadline) : "No deadline"}
        </span>
        <span style={{
          fontSize: 9,
          color: "var(--color-client-text-dim)",
          maxWidth: 120,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {item.sourceMeeting}
        </span>
      </div>

      {/* Linear badge + timestamp */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 9, color: "var(--color-client-text-dim)", opacity: 0.6 }}>
          Updated {relativeTime(item.updatedAt)}
        </div>
        {isEngineeringLinked(item) && item.externalId && item.externalUrl && (
          <a
            href={item.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: "#A78BFA",
              background: "rgba(167,139,250,0.12)",
              border: "1px solid rgba(167,139,250,0.25)",
              borderRadius: 3,
              padding: "1px 5px",
              textDecoration: "none",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}
          >
            {item.externalId}
          </a>
        )}
        {isEngineeringLinked(item) && item.externalId && (
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            color: "#DDD6FE",
            background: "rgba(167,139,250,0.08)",
            border: "1px solid rgba(167,139,250,0.18)",
            borderRadius: 999,
            padding: "1px 6px",
            whiteSpace: "nowrap",
          }}>
            Synced with Linear
          </span>
        )}
      </div>
    </div>
  );
}

// ── List View ──

function ListView({
  items, sortField, sortDir, onSort, onSelect, selectedId, onPatchItem, flashIds, highlightId, groupBy,
}: {
  items: ActionItem[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
  onPatchItem: (id: string, fields: Partial<ActionItem>) => void;
  flashIds: Set<string>;
  highlightId?: string | null;
  groupBy?: GroupField;
}) {
  const [editingDeadline, setEditingDeadline] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    if (!groupBy || groupBy === "none") return null;
    const groups: Record<string, ActionItem[]> = {};
    for (const item of items) {
      let key = "";
      switch (groupBy) {
        case "project":
          key = item.projectId || item.projectName || "No Project";
          break;
        case "owner":
          key = item.owner || "Unassigned";
          break;
        case "department":
          key = item.department || "No Department";
          break;
        case "priority":
          key = PRIORITY_LABEL[item.priority] || "No Priority";
          break;
        default:
          key = "";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [groupBy, items]);

  const columns: StandardTableColumn<ActionItem>[] = useMemo(() => [
    {
      key: "status",
      label: "Status",
      getValue: (item) => STATUS_LABEL[item.status],
      render: (item) => (
        <select
          value={item.status}
          onChange={(e) => { e.stopPropagation(); onPatchItem(item.id, { status: e.target.value as Status }); }}
          onClick={(e) => e.stopPropagation()}
          style={{ ...SELECT_STYLE, fontSize: 10, padding: "3px 24px 3px 8px", fontWeight: 600, color: STATUS_COLOR[item.status], background: STATUS_BG[item.status], backgroundImage: SELECT_STYLE.backgroundImage, backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center", backgroundSize: "8px 5px", border: `1px solid ${STATUS_COLOR[item.status]}33` }}
        >
          {STATUS_ORDER.map((s) => (<option key={s} value={s} style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>{STATUS_LABEL[s]}</option>))}
        </select>
      ),
    },
    {
      key: "title",
      label: "Title",
      getValue: (item) => item.title,
      render: (item) => <span style={{ color: "var(--color-client-text)" }}>{item.title}</span>,
    },
    {
      key: "owner",
      label: "Owner",
      getValue: (item) => item.owner,
      render: (item) => {
        return (
          <div onClick={(event) => event.stopPropagation()}>
            <OwnerSelect value={item.owner} onChange={(owner) => onPatchItem(item.id, { owner })} compact />
          </div>
        );
      },
    },
    {
      key: "department",
      label: "Dept",
      getValue: (item) => item.department,
      render: (item) => <span style={{ color: "var(--color-client-text-dim)" }}>{item.department}</span>,
    },
    {
      key: "deadline",
      label: "Deadline",
      getValue: (item) => item.deadline ?? "",
      render: (item) => {
        const deadlineOverdue = item.status !== "complete" && isOverdue(item.deadline);
        const deadlineUrgent = item.status !== "complete" && isUrgent(item.deadline);
        return (
          <span
            style={{ color: deadlineOverdue ? "#dadadb" : deadlineUrgent ? "#F59E0B" : "var(--color-client-text-dim)", fontWeight: deadlineOverdue || deadlineUrgent ? 600 : 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            {editingDeadline === item.id ? (
              <input type="date" defaultValue={item.deadline ?? ""} autoFocus
                onChange={(e) => { const val = e.target.value || null; onPatchItem(item.id, { deadline: val }); setEditingDeadline(null); }}
                onBlur={() => setEditingDeadline(null)}
                onKeyDown={(e) => { if (e.key === "Escape") setEditingDeadline(null); }}
                style={{ fontSize: 11, padding: "1px 4px", borderRadius: 4, border: "1px solid var(--color-client-border)", background: "var(--color-client-surface-raised)", color: "var(--color-client-text)", outline: "none", width: 100 }}
              />
            ) : (
              <span onClick={() => setEditingDeadline(item.id)} style={{ cursor: "pointer", borderBottom: "1px dashed currentColor" }} title="Click to edit deadline">
                {formatDate(item.deadline)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "sourceMeeting",
      label: "Source",
      getValue: (item) => item.sourceMeeting,
      render: (item) => <span style={{ color: "var(--color-client-text-dim)", display: "block", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.sourceMeeting}</span>,
      truncate: true,
      maxWidth: 160,
    },
    {
      key: "priority",
      label: "Pri",
      getValue: (item) => PRIORITY_LABEL[item.priority],
      render: (item) => <span style={{ width: 8, height: 8, borderRadius: 4, background: PRIORITY_DOT[item.priority], display: "inline-block" }} />,
    },
    {
      key: "updatedAt",
      label: "Updated",
      getValue: (item) => item.updatedAt,
      render: (item) => <span style={{ color: "var(--color-client-text-dim)", whiteSpace: "nowrap" }}>{formatDate(item.updatedAt)}</span>,
    },
    {
      key: "externalId" as SortField,
      label: "Linear",
      getValue: (item) => item.externalId ?? "",
      render: (item) => isEngineeringLinked(item) && item.externalId && item.externalUrl ? (
        <a
          href={item.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#A78BFA",
            background: "rgba(167,139,250,0.12)",
            border: "1px solid rgba(167,139,250,0.25)",
            borderRadius: 4,
            padding: "1px 6px",
            textDecoration: "none",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
          }}
        >
          {item.externalId}
        </a>
      ) : null,
    },
  ], [editingDeadline, onPatchItem]);

  const tableProps = {
    tableKey: "action-board-list" as const,
    columns,
    getRowKey: (item: ActionItem) => item.id,
    defaultSortKey: "updatedAt" as SortField,
    defaultSortDir: "desc" as SortDir,
    onRowClick: (item: ActionItem) => onSelect(item.id),
    selectedRowKey: selectedId,
    emptyMessage: "No actions found",
    getRowStyle: (item: ActionItem) => ({
      background: item.id === highlightId
        ? "rgba(250,204,21,0.12)"
        : flashIds.has(item.id)
        ? "rgba(52,211,153,0.12)"
        : "transparent",
      boxShadow: item.id === highlightId ? "inset 0 0 0 1px rgba(250,204,21,0.6)" : undefined,
      transition: "all 0.5s",
    }),
  };

  if (groupedItems) {
    const sortedGroups = Object.entries(groupedItems).sort(([a], [b]) => {
      if (groupBy === "priority") {
        const aPriority = Object.entries(PRIORITY_LABEL).find(([, label]) => label === a)?.[0] as Priority | undefined;
        const bPriority = Object.entries(PRIORITY_LABEL).find(([, label]) => label === b)?.[0] as Priority | undefined;
        return (aPriority ? PRIORITY_SORT[aPriority] : 999) - (bPriority ? PRIORITY_SORT[bPriority] : 999);
      }
      return a.localeCompare(b);
    });

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sortedGroups.map(([groupLabel, groupItems]) => {
          const accent = groupBy === "owner"
            ? ownerColor(groupLabel)
            : groupBy === "priority"
            ? PRIORITY_DOT[(Object.entries(PRIORITY_LABEL).find(([, label]) => label === groupLabel)?.[0] as Priority | undefined) ?? "low"]
            : "#A78BFA";
          const icon = groupBy === "project" ? "📁" : groupBy === "owner" ? "👤" : groupBy === "department" ? "🏷️" : "⚑";
          const subtitle = GROUP_BY_OPTIONS.find((option) => option.value === groupBy)?.label ?? "Group";
          return (
            <div key={groupLabel}>
              <div style={{
                padding: "7px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: accent,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                background: `${accent}14`,
                borderLeft: `3px solid ${accent}`,
                borderRadius: "0 8px 8px 0",
                marginBottom: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span>{icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{groupLabel}</span>
                </span>
                <span style={{ fontWeight: 500, color: "var(--color-client-text-dim)", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                  {subtitle} • {groupItems.length} item{groupItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              <StandardTable {...tableProps} data={groupItems} />
            </div>
          );
        })}
      </div>
    );
  }

  return <StandardTable {...tableProps} data={items} />;
}

// ── Detail Panel ──

function DetailPanel({
  item, width, fullscreen, onClose, onToggleFullscreen, onDragStart, onStatusChange, onPatch, onDelete, departments, projects,
}: {
  item: ActionItem;
  width: number | undefined;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onDragStart: (x: number) => void;
  onStatusChange: (status: Status) => void;
  onPatch: (fields: Partial<ActionItem>) => void;
  onDelete: () => void;
  departments: string[];
  projects: string[];
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const deadlineOverdue = item.status !== "complete" && isOverdue(item.deadline);
  const deadlineUrgent = item.status !== "complete" && isUrgent(item.deadline);
  const departmentOptions = Array.from(new Set([item.department, ...departments].filter(Boolean))).sort((a, b) => a.localeCompare(b));

  return (
    <div
      style={{
        width: fullscreen ? "100%" : width,
        position: fullscreen ? "absolute" : "relative",
        inset: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 50 : undefined,
        background: "var(--color-client-surface)",
        borderLeft: fullscreen ? "none" : "1px solid var(--color-client-border)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        animation: "slide-in 0.2s ease",
      }}
    >
      {/* Drag handle */}
      {!fullscreen && (
        <div
          onMouseDown={(e) => onDragStart(e.clientX)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            zIndex: 10,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(96,165,250,0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        />
      )}

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid var(--color-client-border)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {item.id}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onToggleFullscreen}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-client-text-dim)",
              cursor: "pointer",
              padding: "4px 6px",
              fontSize: 14,
              borderRadius: 4,
            }}
            title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            {fullscreen ? "⊟" : "⊞"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-client-text-dim)",
              cursor: "pointer",
              padding: "4px 6px",
              fontSize: 14,
              borderRadius: 4,
            }}
            title="Close (Esc)"
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Title */}
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--color-client-text)", margin: 0, lineHeight: 1.4 }}>
          {item.title}
        </h2>

        {/* Status dropdown */}
        <DetailRow label="Status">
          <select
            value={item.status}
            onChange={(e) => onStatusChange(e.target.value as Status)}
            style={{
              ...SELECT_STYLE,
              padding: "4px 28px 4px 10px",
              fontWeight: 600,
              color: STATUS_COLOR[item.status],
              background: STATUS_BG[item.status],
              backgroundImage: SELECT_STYLE.backgroundImage,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              backgroundSize: "10px 6px",
              border: `1px solid ${STATUS_COLOR[item.status]}33`,
            }}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s} style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </DetailRow>

        <DetailRow label="Owner">
          <OwnerSelect value={item.owner} onChange={(owner) => onPatch({ owner })} />
        </DetailRow>

        <DetailRow label="Department">
          <select
            value={item.department}
            onChange={(e) => onPatch({ department: e.target.value })}
            style={{
              ...SELECT_STYLE,
              width: "100%",
              padding: "4px 28px 4px 10px",
              color: "var(--color-client-text)",
              background: "rgba(20,20,30,0.92)",
            }}
          >
            {departmentOptions.map((department) => (
              <option key={department} value={department} style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>{department}</option>
            ))}
          </select>
        </DetailRow>

        <DetailRow label="Type">
          <span style={{ color: "var(--color-client-text)", fontSize: 13 }}>{item.type}</span>
        </DetailRow>

        <DetailRow label="Priority">
          <select
            value={item.priority}
            onChange={(e) => onPatch({ priority: e.target.value as Priority })}
            style={{
              ...SELECT_STYLE,
              width: "100%",
              padding: "4px 28px 4px 10px",
              color: "var(--color-client-text)",
              background: `linear-gradient(90deg, ${PRIORITY_DOT[item.priority]}22 0%, rgba(20,20,30,0.92) 68%)`,
              border: `1px solid ${PRIORITY_DOT[item.priority]}44`,
            }}
          >
            {(["high", "medium", "low"] as Priority[]).map((priority) => (
              <option key={priority} value={priority} style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>{PRIORITY_LABEL[priority]}</option>
            ))}
          </select>
        </DetailRow>

        <DetailRow label="Deadline">
          <span style={{
            fontSize: 13,
            color: deadlineOverdue ? "#dadadb" : deadlineUrgent ? "#F59E0B" : "var(--color-client-text)",
            fontWeight: deadlineOverdue || deadlineUrgent ? 600 : 400,
          }}>
            {item.deadline ?? "None"}
            {deadlineOverdue && " (overdue)"}
            {deadlineUrgent && " (due soon)"}
          </span>
        </DetailRow>

        <DetailRow label="Related Account">
          <span style={{ color: "var(--color-client-text)", fontSize: 13 }}>{item.relatedAccount || "\u2014"}</span>
        </DetailRow>

        <DetailRow label="Source Meeting">
          <span style={{ color: "var(--color-client-text)", fontSize: 13 }}>{item.sourceMeeting}</span>
        </DetailRow>

        <DetailRow label="Source Date">
          <span style={{ color: "var(--color-client-text)", fontSize: 13 }}>{item.sourceDate}</span>
        </DetailRow>

        {item.notes && (
          <DetailRow label="Notes">
            <MarkdownNotes notes={item.notes} />
          </DetailRow>
        )}

        {/* ── Linear Badge ── */}
        {isEngineeringLinked(item) && item.externalId && item.externalUrl && (
          <DetailRow label="Sync">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#DDD6FE",
                background: "rgba(167,139,250,0.12)",
                border: "1px solid rgba(167,139,250,0.25)",
                borderRadius: 999,
                padding: "3px 8px",
              }}>
                Synced with Linear
              </span>
              <a
                href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "#A78BFA",
                background: "rgba(167,139,250,0.12)",
                border: "1px solid rgba(167,139,250,0.3)",
                borderRadius: 6,
                padding: "4px 10px",
                textDecoration: "none",
                fontFamily: "monospace",
              }}
            >
              ↗ {item.externalId}
            </a>
            </div>
          </DetailRow>
        )}

        <DetailRow label="Project">
          <ProjectField
            value={item.projectName || item.projectId || ""}
            options={projects}
            onSave={(nextProject) => {
              const trimmed = nextProject.trim();
              onPatch({
                projectId: item.projectId,
                projectName: trimmed || undefined,
              });
            }}
          />
        </DetailRow>

        {/* ── Relations ── */}
        <RelationsSection relations={item.relations} />

        {/* ── Sub-issues (placeholder) ── */}
        <SubIssuesSectionPlaceholder />

        {/* ── Traceable-completion section ── */}
        <div style={{
          borderTop: "1px solid var(--color-client-border)",
          paddingTop: 12,
          marginTop: 4,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Auto-Complete Signal
            </span>
            <span style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 4,
              background: item.autoCompletable ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
              color: item.autoCompletable ? "#22C55E" : "var(--color-client-text-dim)",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}>
              {item.autoCompletable ? "ENABLED" : "OFF"}
            </span>
          </div>

          {/* Enable toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!item.autoCompletable}
              onChange={(e) => onPatch({ autoCompletable: e.target.checked })}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#22C55E" }}
            />
            <span style={{ fontSize: 12, color: "var(--color-client-text)" }}>Allow monitor to auto-complete this task</span>
          </label>

          {/* Signal type */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Signal Type</span>
            <select
              value={item.completionSignalType ?? ""}
              onChange={(e) => onPatch({ completionSignalType: e.target.value || undefined })}
              style={{
                ...SELECT_STYLE,
                fontSize: 12,
                padding: "5px 28px 5px 10px",
              }}
            >
              {COMPLETION_SIGNAL_TYPES.map((t) => (
                <option key={t.value} value={t.value} style={{ background: "rgba(20,20,30,0.95)", color: "#e2e2e8" }}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Signal ref */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Signal Reference</span>
            <input
              type="text"
              defaultValue={item.completionSignalRef ?? ""}
              key={`ref-${item.id}`}
              onBlur={(e) => onPatch({ completionSignalRef: e.target.value || undefined })}
              placeholder={item.completionSignalType === "email-sent" ? "e.g. Email subject line or recipient" : "e.g. thread ID, file name, URL"}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(20,20,30,0.9)",
                color: "#e2e2e8",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Check hint */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Monitor Check Hint</span>
            <textarea
              defaultValue={item.completionCheckHint ?? ""}
              key={`hint-${item.id}`}
              onBlur={(e) => onPatch({ completionCheckHint: e.target.value || undefined })}
              placeholder={item.completionSignalType === "email-sent"
                ? "e.g. Look for sent email to tillie@ with subject containing 'sponsorship deck'"
                : "Describe how a monitor can verify this task is complete"}
              rows={3}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(20,20,30,0.9)",
                color: "#e2e2e8",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.4,
              }}
            />
          </div>
        </div>

        {/* Timestamps */}
        <div style={{ borderTop: "1px solid var(--color-client-border)", paddingTop: 12, marginTop: 4 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
              Created {formatDateTime(item.createdAt)} by {item.createdBy}
            </span>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
              Updated {formatDateTime(item.updatedAt)} by {item.updatedBy}
            </span>
            {item.completedAt && (
              <span style={{ fontSize: 10, color: "var(--color-client-green)" }}>
                Completed {formatDateTime(item.completedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Delete */}
        <div style={{ borderTop: "1px solid var(--color-client-border)", paddingTop: 12, marginTop: 4 }}>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{ padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              🗑️ Delete
            </button>
          ) : (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#F87171", marginBottom: 8 }}>Delete this action item?</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
                <button onClick={onDelete} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", cursor: "pointer" }}>Delete</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Markdown Notes Renderer ──

function MarkdownNotes({ notes }: { notes: string }) {
  const lines = notes.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  let listType: "ul" | "ol" | "checklist" | null = null;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    if (listType === "checklist") {
      elements.push(
        <div key={elements.length} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 4 }}>
          {listBuffer}
        </div>
      );
    } else if (listType === "ol") {
      elements.push(<ol key={elements.length} style={{ color: "var(--color-client-text)", fontSize: 13, paddingLeft: 20, margin: "0 0 4px 0" }}>{listBuffer}</ol>);
    } else {
      elements.push(<ul key={elements.length} style={{ color: "var(--color-client-text)", fontSize: 13, paddingLeft: 20, margin: "0 0 4px 0" }}>{listBuffer}</ul>);
    }
    listBuffer = [];
    listType = null;
  };

  lines.forEach((line, i) => {
    const checkMatch = line.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      if (listType !== "checklist") { flushList(); listType = "checklist"; }
      const checked = checkMatch[1].toLowerCase() === "x";
      listBuffer.push(
        <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <input type="checkbox" checked={checked} readOnly style={{ marginTop: 2, accentColor: "#22C55E" }} />
          <span style={{ color: checked ? "var(--color-client-text-dim)" : "var(--color-client-text)", textDecoration: checked ? "line-through" : "none", fontSize: 13, lineHeight: 1.4 }}>
            {checkMatch[2]}
          </span>
        </label>
      );
      return;
    }
    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listBuffer.push(<li key={i}>{ulMatch[1]}</li>);
      return;
    }
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listBuffer.push(<li key={i}>{olMatch[1]}</li>);
      return;
    }
    flushList();
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      elements.push(<div key={i} style={{ fontSize: level === 1 ? 15 : level === 2 ? 14 : 13, fontWeight: 700, color: "var(--color-client-text)", margin: "6px 0 2px" }}>{hMatch[2]}</div>);
      return;
    }
    if (line.trim() === "") {
      if (elements.length > 0) elements.push(<div key={i} style={{ height: 4 }} />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
      elements.push(
        <div key={i} style={{ fontSize: 13, color: "var(--color-client-text)", lineHeight: 1.5 }}>
          {parts.map((p, pi) => {
            if (p.startsWith("**") && p.endsWith("**")) return <strong key={pi}>{p.slice(2, -2)}</strong>;
            if (p.startsWith("`") && p.endsWith("`")) return <code key={pi} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, padding: "0 4px", fontFamily: "monospace", fontSize: 12 }}>{p.slice(1, -1)}</code>;
            return p;
          })}
        </div>
      );
    }
  });
  flushList();
  return <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>{elements}</div>;
}

// ── Relations Section ──

function RelationsSection({ relations }: { relations?: Array<{ type: string; itemId: string }> }) {
  return (
    <div style={{ borderTop: "1px solid var(--color-client-border)", paddingTop: 12, marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        Relations {relations && relations.length > 0 && <span style={{ color: "#60A5FA" }}>({relations.length})</span>}
      </div>
      {!relations || relations.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No relations</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {relations.map((rel, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 8px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--color-client-border-subtle)",
              fontSize: 12,
            }}>
              <span style={{ color: "var(--color-client-text-dim)", fontSize: 10, textTransform: "capitalize", minWidth: 70 }}>{rel.type.replace("_", " ")}</span>
              <span style={{ color: "#60A5FA", fontFamily: "monospace", fontSize: 11 }}>{rel.itemId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-issues Placeholder ──

function SubIssuesSectionPlaceholder() {
  return (
    <div style={{ borderTop: "1px solid var(--color-client-border)", paddingTop: 12, marginTop: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Sub-issues</div>
      <div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No sub-issues</div>
    </div>
  );
}

function ProjectField({ value, options, onSave }: { value: string; options: string[]; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const normalizedOptions = useMemo(
    () => Array.from(new Set([value, ...options].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [options, value],
  );

  const commit = () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    onSave(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        list="action-board-project-options"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.currentTarget as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(value);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="Select or create a project"
        style={{
          width: "100%",
          borderRadius: 10,
          border: "1px solid rgba(167,139,250,0.32)",
          background: "linear-gradient(90deg, rgba(167,139,250,0.14) 0%, rgba(20,20,30,0.94) 72%)",
          color: "var(--color-client-text)",
          fontSize: 13,
          padding: "8px 10px",
          outline: "none",
          boxShadow: "inset 0 0 0 1px rgba(167,139,250,0.12)",
        }}
      />
      <datalist id="action-board-project-options">
        {normalizedOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
        Search an existing project or type a new one, then press Enter.
      </span>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}
