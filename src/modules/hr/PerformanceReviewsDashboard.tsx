"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { PERFORMANCE_RATINGS, type EmployeeRecord, type OrgPerson } from "@/modules/org-chart/types";
import { buildOrgPeople } from "@/modules/org-chart/data/hierarchy";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import RacketIcon from "@/components/RacketIcon";

// ── Types ──
interface EmployeeRow {
  person: OrgPerson;
  emp: EmployeeRecord;
  latestRating: number | null;
  latestRatingLabel: string;
  latestRatingColor: string;
  lastReviewDate: string | null;
  reviewCount: number;
  managerName: string | null;
}

type FilterKey = "all" | "top" | "suggested-promo" | "improvement" | "no-reviews" | "overdue" | "upcoming";
type SortKey = "name" | "department" | "region" | "rating" | "lastReview" | "promotions" | "manager";

// ── Helpers ──
function getRatingMeta(rating: number | string) {
  const num = typeof rating === "number" ? rating : parseInt(String(rating), 10);
  return PERFORMANCE_RATINGS.find((r) => r.value === num) ?? { value: 0, label: String(rating), color: "rgba(255,255,255,0.5)" };
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,8,14,0.6)",
  color: "#f8fafc", fontSize: 11, outline: "none",
};

function formatLevel(level: string | null | undefined) {
  if (!level) return "";
  const match = String(level).match(/^([A-Za-z]+)\s*(\d+)$/);
  return match ? `${match[1]} ${match[2]}` : String(level);
}

function SearchableGroupedDropdown({
  items,
  value,
  onChange,
  placeholder,
  filterFn,
}: {
  items: OrgPerson[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  filterFn?: (item: OrgPerson) => boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => items.filter((item) => filterFn?.(item) ?? true), [items, filterFn]);
  const selectedItem = useMemo(() => filteredItems.find((item) => item.id === value) ?? null, [filteredItems, value]);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const groups = new Map<string, OrgPerson[]>();

    filteredItems.forEach((item) => {
      const label = `${item.name} ${item.department} ${item.role} ${formatLevel(item.level)}`.toLowerCase();
      if (query && !label.includes(query)) return;
      const department = item.department || "Other";
      const existing = groups.get(department) ?? [];
      existing.push(item);
      groups.set(department, existing);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([department, people]) => ({
        department,
        people: [...people].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [filteredItems, search]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {};
      grouped.forEach(({ department }) => {
        next[department] = prev[department] ?? false;
      });
      return next;
    });
  }, [grouped]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayValue = selectedItem?.name ?? "";

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={displayValue}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={() => {}}
        placeholder={placeholder}
        readOnly
        style={{ ...inputStyle, cursor: "pointer" }}
      />
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: 10, padding: 2, display: "flex", alignItems: "center" }}
      >
        <RacketIcon expanded={open} size={10} color="rgba(255,255,255,0.45)" />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 20, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(8,8,14,0.95)", boxShadow: "0 12px 32px rgba(0,0,0,0.35)", padding: 8 }}>
          {(() => {
            const allExpanded = grouped.length > 0 && grouped.every(({ department }) => expandedGroups[department] ?? true);
            return (
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  grouped.forEach(({ department }) => { next[department] = !allExpanded; });
                  setExpandedGroups(next);
                }}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "2px 6px", fontSize: 10, marginBottom: 4 }}
              >
                <RacketIcon expanded={allExpanded} size={8} color="rgba(255,255,255,0.35)" />
                <span>{allExpanded ? "Collapse All" : "Expand All"}</span>
              </button>
            );
          })()}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 300, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain" as any, display: "flex", flexDirection: "column", gap: 6 }}>
            {!grouped.length && (
              <div style={{ padding: "10px 8px", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>No matches found</div>
            )}
            {grouped.map(({ department, people }) => {
              const expanded = expandedGroups[department] ?? true;
              return (
                <div key={department}>
                  <button
                    type="button"
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [department]: !expanded }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "rgba(255,255,255,0.65)", cursor: "pointer", padding: "4px 6px", fontSize: 11, fontWeight: 600, textAlign: "left" }}
                  >
                    <RacketIcon expanded={expanded} size={12} color="rgba(255,255,255,0.65)" />
                    <span>{department}</span>
                  </button>
                  {expanded && (
                    <div style={{ display: "grid", gap: 2, marginTop: 2 }}>
                      {people.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onChange(item.id);
                            setOpen(false);
                            setSearch("");
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.04)",
                            background: value === item.id ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.02)",
                            color: value === item.id ? "#bfdbfe" : "rgba(255,255,255,0.78)",
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          {item.name} ({item.department}, {item.role} {formatLevel(item.level)})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ──
export function PerformanceReviewsDashboard() {
  const [employeeData, setEmployeeData] = useState<Record<string, EmployeeRecord>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [showNewReviewPanel, setShowNewReviewPanel] = useState(false);
  const [newReviewEmployeeId, setNewReviewEmployeeId] = useState("");
  const [newReviewDate, setNewReviewDate] = useState(new Date().toISOString().split("T")[0]);
  const [newReviewRating, setNewReviewRating] = useState(3);
  const [newReviewReviewer, setNewReviewReviewer] = useState("");
  const [newReviewNotes, setNewReviewNotes] = useState("");
  const [savingReview, setSavingReview] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [reviewCycleMode, setReviewCycleMode] = useState(false);

  const { people, byId } = useMemo(() => buildOrgPeople(), []);

  const prColumns: StandardTableColumn<EmployeeRow>[] = [
    { key: "name", label: "Name", getValue: (r) => r.person.name, render: (r) => (<><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 500, color: "#f8fafc" }}>{r.person.name}</span>{r.emp.crmContactId && (<a href={`/contacts?select=${r.emp.crmContactId}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.18)", color: "#4ade80", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>CRM</a>)}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{r.person.role}</div></>) },
    { key: "department", label: "Department", getValue: (r) => r.person.department, render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{r.person.department}</span> },
    { key: "region", label: "Region", getValue: (r) => r.person.locationLabel, render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{r.person.locationLabel}</span> },
    { key: "manager", label: "Manager", getValue: (r) => r.managerName ?? "\u2014", render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{r.managerName ?? "\u2014"}</span> },
    { key: "rating", label: "Latest Rating", getValue: (r) => r.latestRating ? `${r.latestRating} \u2014 ${r.latestRatingLabel}` : "No review", render: (r) => r.latestRating ? <span style={{ fontSize: 11, fontWeight: 600, color: r.latestRatingColor }}>{r.latestRating} \u2014 {r.latestRatingLabel}</span> : <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>No review</span> },
    { key: "lastReview", label: "Last Review", getValue: (r) => r.lastReviewDate ?? "\u2014", render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.lastReviewDate ?? "\u2014"}</span> },
    { key: "promotions", label: "Promos", getValue: (r) => String(r.emp.promotions ?? 0), align: "center", render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.emp.promotions ?? 0}</span> },
    { key: "flags", label: "Flags", sortable: false, align: "center", getValue: (r) => [r.emp.suggestedPromotion ? "Promo" : "", r.emp.improvementPlan?.active ? "PIP" : ""].filter(Boolean).join(", ") || "\u2014", render: (r) => (<div style={{ display: "flex", gap: 4, justifyContent: "center" }}>{r.emp.suggestedPromotion && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", color: "#a78bfa" }}>\u2b06 Promo</span>}{r.emp.improvementPlan?.active && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>PIP</span>}</div>) },
    { key: "actions", label: "Actions", sortable: false, align: "center", getValue: () => "", render: (r) => (
      <button
        onClick={(e) => { e.stopPropagation(); setNewReviewEmployeeId(r.person.id); setShowNewReviewPanel(true); }}
        title="Quick Review"
        style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 6, color: "#93c5fd", cursor: "pointer", fontSize: 12, padding: "3px 8px", lineHeight: 1 }}
      >✏️</button>
    ) },
  ];



  const refreshData = useCallback(() => {
    fetch("/api/employees").then((r) => r.json()).then(setEmployeeData).catch(() => {});
  }, []);

  const saveNewReview = useCallback(async () => {
    if (!newReviewEmployeeId) return;
    setSavingReview("saving");
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-review",
          personId: newReviewEmployeeId,
          review: { date: newReviewDate, rating: newReviewRating, reviewer: byId.get(newReviewReviewer)?.name ?? newReviewReviewer, notes: newReviewNotes },
        }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      setSavingReview("saved");
      setTimeout(() => setSavingReview("idle"), 1500);
      setNewReviewEmployeeId("");
      setNewReviewNotes("");
      setNewReviewReviewer("");
      setNewReviewRating(3);
      setShowNewReviewPanel(false);
      refreshData();
    } catch {
      setSavingReview("error");
      setTimeout(() => setSavingReview("idle"), 2000);
    }
  }, [newReviewEmployeeId, newReviewDate, newReviewRating, newReviewReviewer, newReviewNotes, refreshData]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Build employee rows
  const rows: EmployeeRow[] = useMemo(() => {
    return Array.from(byId.values()).map((person) => {
      const emp = employeeData[person.id] ?? { performanceReviews: [], promotions: 0 };
      const reviews = emp.performanceReviews ?? [];
      const latest = reviews[0];
      const ratingNum = latest ? (typeof latest.rating === "number" ? latest.rating : parseInt(String(latest.rating), 10) || null) : null;
      const meta = ratingNum ? getRatingMeta(ratingNum) : null;
      const manager = person.managerId ? byId.get(person.managerId) : null;
      return {
        person,
        emp,
        latestRating: ratingNum,
        latestRatingLabel: meta?.label ?? "No review",
        latestRatingColor: meta?.color ?? "rgba(255,255,255,0.3)",
        lastReviewDate: latest?.date ?? null,
        reviewCount: reviews.length,
        managerName: manager?.name ?? null,
      };
    });
  }, [byId, employeeData]);

  // Stats
  const today = new Date().toISOString().split("T")[0];
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  const stats = useMemo(() => {
    const total = rows.length;
    const reviewed = rows.filter((r) => r.reviewCount > 0).length;
    const noReviews = total - reviewed;
    const topPerformers = rows.filter((r) => r.latestRating !== null && r.latestRating >= 4).length;
    const suggestedPromos = rows.filter((r) => r.emp.suggestedPromotion).length;
    const improvementPlans = rows.filter((r) => r.emp.improvementPlan?.active).length;
    const overdue = rows.filter((r) => r.emp.nextReviewDate && r.emp.nextReviewDate < today).length;
    const upcoming = rows.filter((r) => r.emp.nextReviewDate && r.emp.nextReviewDate >= today && r.emp.nextReviewDate <= in30Days).length;
    const ratingDist: Record<number, number> = {};
    rows.forEach((r) => { if (r.latestRating) ratingDist[r.latestRating] = (ratingDist[r.latestRating] || 0) + 1; });
    return { total, reviewed, noReviews, topPerformers, suggestedPromos, improvementPlans, overdue, upcoming, ratingDist };
  }, [rows, today, in30Days]);

  const departments = useMemo(() => ["All", ...new Set(rows.map((r) => r.person.department))], [rows]);
  const regions = useMemo(() => ["All", ...new Set(rows.map((r) => r.person.locationLabel))], [rows]);

  const ninetyDaysAgo = useMemo(() => new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0], []);
  const reviewCycleCount = useMemo(() => rows.filter((r) => !r.lastReviewDate || r.lastReviewDate < ninetyDaysAgo).length, [rows, ninetyDaysAgo]);

  const filtered = useMemo(() => {
    let result = rows;
    if (reviewCycleMode) result = result.filter((r) => !r.lastReviewDate || r.lastReviewDate < ninetyDaysAgo);
    if (filter === "top") result = result.filter((r) => r.latestRating !== null && r.latestRating >= 4);
    if (filter === "suggested-promo") result = result.filter((r) => r.emp.suggestedPromotion);
    if (filter === "improvement") result = result.filter((r) => r.emp.improvementPlan?.active);
    if (filter === "no-reviews") result = result.filter((r) => r.reviewCount === 0);
    if (filter === "overdue") result = result.filter((r) => r.emp.nextReviewDate && r.emp.nextReviewDate < today);
    if (filter === "upcoming") result = result.filter((r) => r.emp.nextReviewDate && r.emp.nextReviewDate >= today && r.emp.nextReviewDate <= in30Days);
    if (deptFilter !== "All") result = result.filter((r) => r.person.department === deptFilter);
    if (regionFilter !== "All") result = result.filter((r) => r.person.locationLabel === regionFilter);
    return result;
  }, [rows, filter, deptFilter, regionFilter, reviewCycleMode, ninetyDaysAgo]);

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }, [sortKey]);

  const sorted = useMemo(() => {
    const compare = (a: EmployeeRow, b: EmployeeRow) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.person.name.localeCompare(b.person.name); break;
        case "department": cmp = a.person.department.localeCompare(b.person.department); break;
        case "region": cmp = a.person.locationLabel.localeCompare(b.person.locationLabel); break;
        case "rating": cmp = (b.latestRating ?? 0) - (a.latestRating ?? 0); break;
        case "lastReview": cmp = (b.lastReviewDate ?? "").localeCompare(a.lastReviewDate ?? ""); break;
        case "promotions": cmp = (b.emp.promotions ?? 0) - (a.emp.promotions ?? 0); break;
        case "manager": cmp = (a.managerName ?? "").localeCompare(b.managerName ?? ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    };
    return [...filtered].sort(compare);
  }, [filtered, sortKey, sortDir]);



  // FIX: Always select on click, never toggle off by clicking same row
  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const selectedRow = selectedId ? rows.find((r) => r.person.id === selectedId) ?? null : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        <SummaryCard label="Total Employees" value={stats.total} color="#f8fafc" />
        <SummaryCard label="Reviews Completed" value={stats.reviewed} color="#4ade80" />
        <SummaryCard label="No Reviews Yet" value={stats.noReviews} color="#f59e0b" />
        <SummaryCard label="Overdue Reviews" value={stats.overdue} color="#ef4444" />
        <SummaryCard label="Upcoming (30d)" value={stats.upcoming} color="#fb923c" />
        <SummaryCard label="Top Performers" value={stats.topPerformers} color="#60a5fa" />
        <SummaryCard label="Suggested Promos" value={stats.suggestedPromos} color="#a78bfa" />
        <SummaryCard label="Improvement Plans" value={stats.improvementPlans} color="#ef4444" />
      </div>

      {/* New Review Panel */}
      <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <button
          onClick={() => setShowNewReviewPanel((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "transparent", border: "none", color: "#93c5fd", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
        >
          <span>+ New Performance Review</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{showNewReviewPanel ? "▲ collapse" : "▼ expand"}</span>
        </button>
        {showNewReviewPanel && (
          <div style={{ padding: "0 20px 20px", display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Employee</div>
                <SearchableGroupedDropdown
                  items={Array.from(byId.values())}
                  value={newReviewEmployeeId}
                  onChange={setNewReviewEmployeeId}
                  placeholder="— Select employee —"
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Review Date</div>
                <input type="date" value={newReviewDate} onChange={(e) => setNewReviewDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Rating</div>
                <select value={newReviewRating} onChange={(e) => setNewReviewRating(Number(e.target.value))} style={inputStyle}>
                  {PERFORMANCE_RATINGS.map((r) => (
                    <option key={r.value} value={r.value}>{r.value} — {r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Reviewer Name</div>
                <SearchableGroupedDropdown
                  items={Array.from(byId.values())}
                  value={newReviewReviewer}
                  onChange={setNewReviewReviewer}
                  placeholder="Reviewer name..."
                  filterFn={(item) => String(item.level).startsWith("L")}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Review Notes</div>
              <textarea value={newReviewNotes} onChange={(e) => setNewReviewNotes(e.target.value)} placeholder="Add review notes..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={saveNewReview}
                disabled={!newReviewEmployeeId || savingReview === "saving"}
                style={{ padding: "8px 20px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: newReviewEmployeeId ? "pointer" : "not-allowed", background: newReviewEmployeeId ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.03)", border: newReviewEmployeeId ? "1px solid rgba(96,165,250,0.25)" : "1px solid rgba(255,255,255,0.06)", color: newReviewEmployeeId ? "#93c5fd" : "rgba(255,255,255,0.25)" }}
              >{savingReview === "saving" ? "Saving..." : "Save Review"}</button>
              {savingReview === "saved" && <span style={{ fontSize: 11, color: "rgba(52,211,153,0.8)" }}>✓ Review saved</span>}
              {savingReview === "error" && <span style={{ fontSize: 11, color: "rgba(239,68,68,0.8)" }}>✗ Error saving</span>}
            </div>
          </div>
        )}
      </div>

      {/* Rating Distribution */}
      <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>Rating Distribution</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 120 }}>
          {PERFORMANCE_RATINGS.slice().reverse().map((r) => {
            const count = stats.ratingDist[r.value] ?? 0;
            const maxCount = Math.max(...Object.values(stats.ratingDist), 1);
            const height = count > 0 ? Math.max((count / maxCount) * 90, 20) : 8;
            return (
              <div key={r.value} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{count}</span>
                <div style={{ width: "100%", maxWidth: 60, height, borderRadius: 8, background: r.color, opacity: count > 0 ? 0.25 : 0.08, transition: "height 0.3s ease" }} />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textAlign: "center", lineHeight: 1.3 }}>{r.value} — {r.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {([
          { key: "all" as FilterKey, label: "All" },
          { key: "overdue" as FilterKey, label: "Overdue" },
          { key: "upcoming" as FilterKey, label: "Upcoming" },
          { key: "top" as FilterKey, label: "Top Performers" },
          { key: "suggested-promo" as FilterKey, label: "Suggested Promos" },
          { key: "improvement" as FilterKey, label: "Improvement Plans" },
          { key: "no-reviews" as FilterKey, label: "No Reviews" },
        ]).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: filter === f.key ? 600 : 400,
            background: filter === f.key ? "rgba(96,165,250,0.1)" : "transparent",
            border: filter === f.key ? "1px solid rgba(96,165,250,0.2)" : "1px solid rgba(255,255,255,0.06)",
            color: filter === f.key ? "#93c5fd" : "rgba(255,255,255,0.5)", cursor: "pointer",
          }}>{f.label}</button>
        ))}
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, background: "rgba(8,8,14,0.6)", border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none" }}>
          {departments.map((d) => <option key={d} value={d}>{d === "All" ? "All Departments" : d}</option>)}
        </select>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, background: "rgba(8,8,14,0.6)", border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none" }}>
          {regions.map((r) => <option key={r} value={r}>{r === "All" ? "All Regions" : r}</option>)}
        </select>
        <button
          onClick={() => setReviewCycleMode((v) => !v)}
          style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: reviewCycleMode ? 600 : 400, background: reviewCycleMode ? "rgba(251,146,60,0.1)" : "transparent", border: reviewCycleMode ? "1px solid rgba(251,146,60,0.25)" : "1px solid rgba(255,255,255,0.06)", color: reviewCycleMode ? "#fb923c" : "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          🔄 Start Review Cycle
          {reviewCycleCount > 0 && <span style={{ padding: "1px 6px", borderRadius: 10, background: "rgba(251,146,60,0.2)", color: "#fb923c", fontSize: 10, fontWeight: 700 }}>{reviewCycleCount}</span>}
        </button>
      </div>

      {/* Main content: table + detail panel */}
      <div style={{ display: "grid", gridTemplateColumns: selectedRow ? "1fr 400px" : "1fr", gap: 16, minHeight: 0, transition: "grid-template-columns 0.2s ease" }}>
        {/* Employee Review Table — StandardTable */}
        <StandardTable<EmployeeRow>
          tableKey="hr-perf-reviews"
          columns={prColumns}
          data={sorted}
          getRowKey={(r) => r.person.id}
          defaultSortKey="name"
          onRowClick={(r) => handleRowClick(r.person.id)}
          selectedRowKey={selectedId ?? undefined}
          emptyMessage="No employees match the current filters"
        />

        {/* Detail Panel — always visible when selected, explicit close */}
        {selectedRow && (
          <DetailPanel
            key={selectedRow.person.id}
            row={selectedRow}
            onClose={() => setSelectedId(null)}
            onUpdate={refreshData}
          />
        )}
      </div>
    </div>
  );
}

// ── Summary Card ──
function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

// ── Detail Panel with native editing, photo, save feedback ──
function DetailPanel({ row, onClose, onUpdate }: { row: EmployeeRow; onClose: () => void; onUpdate: () => void }) {
  const { person, emp } = row;
  const [suggestPromo, setSuggestPromo] = useState(emp.suggestedPromotion ?? false);
  const [promoNote, setPromoNote] = useState(emp.suggestedPromotionNote ?? "");
  const [pipActive, setPipActive] = useState(emp.improvementPlan?.active ?? false);
  const [pipNotes, setPipNotes] = useState(emp.improvementPlan?.notes ?? "");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [photoUrl, setPhotoUrl] = useState(emp.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);

  // Editable employee fields
  const [startDate, setStartDate] = useState(emp.startDate ?? "");
  const [promoCount, setPromoCount] = useState(String(emp.promotions ?? 0));
  const [lastPromoDate, setLastPromoDate] = useState(emp.lastPromotionDate ?? "");
  const [nextReviewDate, setNextReviewDate] = useState(emp.nextReviewDate ?? "");

  const save = async (data: Partial<EmployeeRecord>) => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/employees", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: person.id, ...data }) });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
      onUpdate();
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2500);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("personId", person.id);
      const res = await fetch("/api/employees/photo", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();
      if (data.url) {
        setPhotoUrl(data.url);
        save({ photoUrl: data.url });
      }
    } catch { /* silent */ }
    setUploading(false);
  };

  return (
    <div
      style={{
        borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        padding: 20, display: "flex", flexDirection: "column", gap: 16,
        overflowY: "auto", position: "sticky", top: 20,
        resize: "both", minWidth: 320, minHeight: 300, maxWidth: "60vw", maxHeight: "85vh",
      }}
    >
      {/* Header with photo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {/* Profile photo */}
          <label style={{ cursor: "pointer", position: "relative", flexShrink: 0 }}>
            <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
            {photoUrl ? (
              <img src={photoUrl} alt={person.name} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,0.1)" }} />
            ) : (
              <div style={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(96,165,250,0.12)", border: "2px dashed rgba(255,255,255,0.1)", color: "#93c5fd", fontSize: 16, fontWeight: 700 }}>
                {person.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
            )}
            {uploading && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "grid", placeItems: "center", fontSize: 10, color: "#fff" }}>...</div>}
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "rgba(96,165,250,0.2)", border: "1px solid rgba(96,165,250,0.3)", display: "grid", placeItems: "center", fontSize: 9 }}>📷</div>
          </label>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>{person.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{person.role} · {person.department}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>📍 {person.locationLabel} · {person.level}</div>
            {row.managerName && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>Manager: {row.managerName}</div>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Save indicator */}
          {saveStatus === "saving" && <span style={{ fontSize: 10, color: "rgba(96,165,250,0.7)" }}>Saving...</span>}
          {saveStatus === "saved" && <span style={{ fontSize: 10, color: "rgba(52,211,153,0.8)" }}>✓ Saved</span>}
          {saveStatus === "error" && <span style={{ fontSize: 10, color: "rgba(239,68,68,0.8)" }}>✗ Error</span>}
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, padding: "4px 10px", fontWeight: 500 }}>✕</button>
        </div>
      </div>

      {/* CRM Link Status — deep-links to unique contact page */}
      {emp.crmContactId ? (
        <a href={`/contacts?select=${emp.crmContactId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)", color: "#4ade80", fontSize: 11, fontWeight: 500, textDecoration: "none", width: "fit-content" }}>
          CRM Link
        </a>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)", fontSize: 11, width: "fit-content" }}>
          CRM Unlinked
        </div>
      )}

      {/* Contact Info */}
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Contact</div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Email</span>
            <span style={{ color: person.email ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)" }}>{person.email ?? "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: "rgba(255,255,255,0.45)" }}>Phone</span>
            <span style={{ color: person.phone ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)" }}>{person.phone ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Compensation (from sheet, read-only) */}
      {(person.hourlyRate || person.monthlyComp) && (
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Compensation</div>
          <div style={{ display: "grid", gap: 4 }}>
            {person.hourlyRate && <div style={{ fontSize: 12, color: "rgba(52,211,153,0.7)" }}>{person.hourlyRate}/hr</div>}
            {person.monthlyComp && <div style={{ fontSize: 12, color: "rgba(52,211,153,0.7)" }}>{person.monthlyComp}/mo</div>}
          </div>
        </div>
      )}

      {/* Employee Lifecycle — Editable */}
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Employee Lifecycle</div>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>Start Date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={() => save({ startDate: startDate || null })} style={{ ...inputStyle, width: 140, textAlign: "right" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>Promotions</span>
            <input type="number" min={0} value={promoCount} onChange={(e) => setPromoCount(e.target.value)} onBlur={() => save({ promotions: parseInt(promoCount, 10) || 0 })} style={{ ...inputStyle, width: 60, textAlign: "right" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>Last Promotion</span>
            <input type="date" value={lastPromoDate} onChange={(e) => setLastPromoDate(e.target.value)} onBlur={() => save({ lastPromotionDate: lastPromoDate || null })} style={{ ...inputStyle, width: 140, textAlign: "right" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap" }}>Next Review</span>
            <input type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} onBlur={() => save({ nextReviewDate: nextReviewDate || null })} style={{ ...inputStyle, width: 140, textAlign: "right" }} />
          </div>
        </div>
      </div>

      {/* Latest Rating */}
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Latest Rating</div>
        {row.latestRating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: row.latestRatingColor }}>{row.latestRating}</span>
            <span style={{ fontSize: 12, color: row.latestRatingColor }}>{row.latestRatingLabel}</span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No reviews yet</span>
        )}
      </div>

      {/* Suggested Promotion */}
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Suggested Promotion</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <button onClick={() => { const next = !suggestPromo; setSuggestPromo(next); save({ suggestedPromotion: next }); }} style={{
            padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
            background: suggestPromo ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.03)",
            border: suggestPromo ? "1px solid rgba(167,139,250,0.25)" : "1px solid rgba(255,255,255,0.06)",
            color: suggestPromo ? "#a78bfa" : "rgba(255,255,255,0.4)", fontWeight: suggestPromo ? 600 : 400,
          }}>{suggestPromo ? "⬆ Suggested for Promotion" : "Not flagged"}</button>
        </div>
        {suggestPromo && (
          <input value={promoNote} onChange={(e) => setPromoNote(e.target.value)} onBlur={() => save({ suggestedPromotionNote: promoNote })} placeholder="Promotion rationale..." style={inputStyle} />
        )}
      </div>

      {/* Improvement Plan */}
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Improvement Plan</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <button onClick={() => { const next = !pipActive; setPipActive(next); save({ improvementPlan: { active: next, notes: pipNotes, startDate: next ? new Date().toISOString().split("T")[0] : undefined } }); }} style={{
            padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
            background: pipActive ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.03)",
            border: pipActive ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(255,255,255,0.06)",
            color: pipActive ? "#ef4444" : "rgba(255,255,255,0.4)", fontWeight: pipActive ? 600 : 400,
          }}>{pipActive ? "Active Improvement Plan" : "No Improvement Plan"}</button>
        </div>
        {pipActive && (
          <div style={{ display: "grid", gap: 6 }}>
            {emp.improvementPlan?.startDate && <div style={{ fontSize: 10, color: "rgba(239,68,68,0.6)" }}>Started: {emp.improvementPlan.startDate}</div>}
            <input value={pipNotes} onChange={(e) => setPipNotes(e.target.value)} onBlur={() => save({ improvementPlan: { active: true, notes: pipNotes, startDate: emp.improvementPlan?.startDate } })} placeholder="Plan details, goals, and expected outcomes..." style={inputStyle} />
          </div>
        )}
      </div>

      {/* Last Updated */}
      {emp.lastUpdatedAt && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          Last updated: {new Date(emp.lastUpdatedAt).toLocaleString()} {emp.lastUpdatedBy ? `by ${emp.lastUpdatedBy}` : ''}
        </div>
      )}

      {/* Review History */}
      <div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Review History</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(emp.performanceReviews ?? []).map((review, i) => {
            const meta = getRatingMeta(review.rating);
            return (
              <div key={i} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>{meta.label}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{review.date}</span>
                </div>
                {review.notes && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{review.notes}</div>}
                {review.reviewer && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>by {review.reviewer}</div>}
              </div>
            );
          })}
          {(emp.performanceReviews ?? []).length === 0 && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 12 }}>No reviews yet</div>
          )}
        </div>
      </div>

      {/* Audit Trail */}
      {(emp.auditLog ?? []).length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>Change History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
            {(emp.auditLog ?? []).slice().reverse().slice(0, 20).map((entry, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: getAuditColor(entry.action), fontWeight: 500 }}>{formatAuditAction(entry.action)}</span>
                  {entry.field && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>{entry.field}</span>}
                </div>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap", flexShrink: 0 }}>{new Date(entry.timestamp).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    field_update: "Field Updated",
    review_added: "Review Added",
    pip_activated: "PIP Activated",
    pip_deactivated: "PIP Deactivated",
    promotion_suggested: "Promotion Suggested",
    promotion_unflagged: "Promotion Unflagged",
  };
  return map[action] ?? action;
}

function getAuditColor(action: string): string {
  if (action.includes("pip")) return "rgba(239,68,68,0.7)";
  if (action.includes("promotion")) return "rgba(167,139,250,0.8)";
  if (action.includes("review")) return "rgba(52,211,153,0.7)";
  return "rgba(255,255,255,0.5)";
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#f8fafc", marginTop: 2 }}>{value}</div>
    </div>
  );
}
