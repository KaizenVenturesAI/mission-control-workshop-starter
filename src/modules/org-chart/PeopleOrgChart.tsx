"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useResponsive } from "@/lib/useMediaQuery";
import { buildOrgPeopleFromRecords, buildTree, getPersonPath, getSearchResults, getVisibleIds } from "./data/hierarchy";
import type { GeographyFilter, OrgPerson, OrgTreeNode, PersonRecord } from "./types";
import seedPeople from "./data/people.json";
import { ReactFlowProvider } from "@xyflow/react";
import { computeBranchSummary, type BranchSummary } from "./data/branch-summary";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

const OrgFlowGraph = dynamic(() => import("./OrgFlowGraph").then((m) => ({ default: m.OrgFlowGraph })), { ssr: false, loading: () => <div style={{ height: 600, display: "grid", placeItems: "center", color: "rgba(255,255,255,0.3)" }}>Loading graph...</div> });

const VIEW_MODES = ["Graph", "Table", "Headcount"] as const;
type ViewMode = (typeof VIEW_MODES)[number];
const DEFAULT_EXPANDED = ["example-client-rose", "secondary-mignone"];
const FALLBACK_PEOPLE = seedPeople as PersonRecord[];

const DRAWER_MIN = 320;
const DRAWER_MAX = 640;
const DRAWER_DEFAULT = 420;

export function PeopleOrgChart() {
  const { isMobile } = useResponsive();
  const [orgPeople, setOrgPeople] = useState<PersonRecord[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loadingOrgChart, setLoadingOrgChart] = useState(true);
  const [refreshingOrgChart, setRefreshingOrgChart] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const { people, byId, roots } = useMemo(() => buildOrgPeopleFromRecords(orgPeople), [orgPeople]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(DEFAULT_EXPANDED));
  const geoFilter: GeographyFilter = "All";
  const [viewMode, setViewMode] = useState<ViewMode>("Graph");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT);
  const [drawerMinimized, setDrawerMinimized] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [searchFocusTarget, setSearchFocusTarget] = useState<string | null>(null);
  const [employeeData, setEmployeeData] = useState<Record<string, any>>({});

  const applyOrgChartPayload = useCallback((payload: unknown) => {
    const data = payload && typeof payload === "object" ? payload as { people?: unknown; lastSyncedAt?: unknown } : {};
    const nextPeople = Array.isArray(data.people) && data.people.length > 0 ? data.people as PersonRecord[] : FALLBACK_PEOPLE;
    setOrgPeople(nextPeople);
    setLastSyncedAt(typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null);
  }, []);

  const readJsonPayload = useCallback(async (res: Response) => {
    const text = await res.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }, []);

  const loadOrgChart = useCallback(async () => {
    const res = await fetch('/api/employees/org-chart', { cache: 'no-store' });
    const data = await readJsonPayload(res);
    if (!res.ok) {
      applyOrgChartPayload(data);
      throw new Error('Using local org seed while the live org endpoint recovers');
    }
    applyOrgChartPayload(data);
    setRefreshError(null);
  }, [applyOrgChartPayload, readJsonPayload]);

  useEffect(() => {
    loadOrgChart().catch((error) => {
      setOrgPeople(FALLBACK_PEOPLE);
      setRefreshError(error instanceof Error ? error.message : 'Using local org seed while the live org endpoint recovers');
    }).finally(() => setLoadingOrgChart(false));
    fetch('/api/employees').then((r) => r.json()).then(setEmployeeData).catch(() => {});
  }, [loadOrgChart]);

  useEffect(() => {
    if (selectedId && !byId.has(selectedId)) setSelectedId(null);
    if (focusedId && !byId.has(focusedId)) setFocusedId(null);
  }, [byId, focusedId, selectedId]);

  const refreshOrgChart = useCallback(async () => {
    setRefreshingOrgChart(true);
    setRefreshError(null);
    try {
      const res = await fetch('/api/employees/org-chart', { method: 'POST' });
      const data = await readJsonPayload(res);
      const errorMessage = data && typeof data === "object" && "error" in data ? String((data as { error?: unknown }).error) : "Refresh failed";
      if (!res.ok) throw new Error(errorMessage);
      applyOrgChartPayload(data);
      setSelectedId(null);
      setFocusedId(null);
      setSearch('');
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setRefreshingOrgChart(false);
    }
  }, [applyOrgChartPayload, readJsonPayload]);

  const selectedPerson = selectedId ? byId.get(selectedId) ?? null : null;
  const searchResults = useMemo(() => getSearchResults(search, people), [search, people]);
  const visibleIds = useMemo(() => getVisibleIds(geoFilter, people, byId), [geoFilter, people, byId]);
  const filteredPeople = useMemo(() => people.filter((p) => visibleIds.has(p.id)), [people, visibleIds]);

  const headcountRows = useMemo(() => {
    const byDept = new Map<string, { department: string; total: number; leaders: number }>();
    filteredPeople.forEach((p) => {
      const c = byDept.get(p.department) ?? { department: p.department, total: 0, leaders: 0 };
      c.total += 1;
      if (p.isLeader) c.leaders += 1;
      byDept.set(p.department, c);
    });
    return Array.from(byDept.values()).sort((a, b) => b.total - a.total || a.department.localeCompare(b.department));
  }, [filteredPeople]);

  const focusedPath = useMemo(() => {
    if (!focusedId) return [];
    const path: OrgPerson[] = [];
    let current = byId.get(focusedId);
    while (current) {
      path.unshift(current);
      current = current.managerId ? byId.get(current.managerId) : undefined;
    }
    return path;
  }, [focusedId, byId]);

  function selectPerson(personId: string) {
    if (selectedId === personId) {
      setSelectedId(null);
      return;
    }
    const path = getPersonPath(personId, byId);
    setExpandedIds((prev) => { const next = new Set(prev); path.forEach((id) => next.add(id)); return next; });
    setSelectedId(personId);
    setDrawerMinimized(false);
    setSearchFocusTarget(personId);
    setSearch("");
    setSearchOpen(false);
  }

  function toggleExpanded(personId: string) {
    setExpandedIds((prev) => { const next = new Set(prev); if (next.has(personId)) next.delete(personId); else next.add(personId); return next; });
  }

  // Esc to close drawer
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const drawerOpen = selectedPerson !== null && !drawerMinimized;

  return (
    <div className="fade-in-up" style={{ display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>
      {/* Header */}
      <header style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>Organization</div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "#f1f5f9", letterSpacing: "-0.03em", margin: 0 }}>Org Chart</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Leadership graph, people table, and department headcount for Example Client.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Metric label="Active" value={String(people.length)} />
            <Metric label="Visible" value={String(filteredPeople.length)} />
            <Metric label="Depts" value={String(new Set(people.map((p) => p.department)).size)} />
            <button
              onClick={refreshOrgChart}
              disabled={refreshingOrgChart || loadingOrgChart}
              style={{
                padding: '11px 14px',
                borderRadius: 14,
                border: '1px solid rgba(96,165,250,0.22)',
                background: refreshingOrgChart ? 'rgba(96,165,250,0.08)' : 'linear-gradient(180deg, rgba(96,165,250,0.16) 0%, rgba(59,130,246,0.1) 100%)',
                color: '#dbeafe',
                fontSize: 12,
                fontWeight: 600,
                cursor: refreshingOrgChart || loadingOrgChart ? 'not-allowed' : 'pointer',
                opacity: refreshingOrgChart || loadingOrgChart ? 0.7 : 1,
                minWidth: 112,
              }}
            >
              {refreshingOrgChart ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {(lastSyncedAt || refreshError) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: refreshError ? '#fca5a5' : 'rgba(255,255,255,0.45)' }}>
            <span>{refreshError ? `Sync error: ${refreshError}` : `Last synced ${new Date(lastSyncedAt!).toLocaleString()}`}</span>
            {!refreshError && <span style={{ color: 'rgba(255,255,255,0.35)' }}>Supabase-backed org data with local seed fallback</span>}
          </div>
        )}

        {/* Controls bar */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: isMobile ? 14 : 16, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {/* View mode tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {VIEW_MODES.map((mode) => {
              const active = viewMode === mode;
              return <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "8px 14px", borderRadius: 999, border: active ? "1px solid rgba(232,67,147,0.28)" : "1px solid rgba(255,255,255,0.08)", background: active ? "rgba(232,67,147,0.12)" : "rgba(255,255,255,0.03)", color: active ? "#f8fafc" : "rgba(255,255,255,0.58)", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer" }}>{mode}</button>;
            })}
          </div>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: isMobile ? "100%" : 220 }}>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 200)} placeholder="Search name, role, department..." style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,8,14,0.76)", color: "#f8fafc", fontSize: 13, outline: "none" }} />
            {searchOpen && search.trim() && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 30, borderRadius: 14, background: "linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(12,12,19,0.99) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 18px 42px rgba(0,0,0,0.35)", overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
                {searchResults.length > 0 ? searchResults.slice(0, 8).map((p) => (
                  <button key={p.id} onMouseDown={() => selectPerson(p.id)} style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#f8fafc", cursor: "pointer" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{p.role} · {p.department}</div>
                  </button>
                )) : <div style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>No matches</div>}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div style={{ display: "grid", gridTemplateColumns: drawerOpen && !isMobile ? `minmax(0, 1fr) ${drawerWidth}px` : "1fr", gap: 16, minHeight: 0, alignItems: "start" }}>
        {/* Left: graph / table / headcount */}
        <section style={{ borderRadius: 20, background: "linear-gradient(180deg, rgba(14,14,22,0.98) 0%, rgba(10,10,16,0.99) 100%)", border: "1px solid rgba(255,255,255,0.06)", overflow: "auto", padding: isMobile ? 12 : 20, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 18% 18%, rgba(96,165,250,0.07), transparent 25%), radial-gradient(circle at 82% 14%, rgba(232,67,147,0.06), transparent 22%), radial-gradient(circle at 55% 78%, rgba(52,211,153,0.04), transparent 25%)" }} />
          <div style={{ position: "relative" }}>
            {loadingOrgChart && <div style={{ padding: '28px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Loading org chart…</div>}
            {!loadingOrgChart && people.length === 0 && <div style={{ padding: '28px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>No active people found in the HR sheet.</div>}
            {!loadingOrgChart && people.length > 0 && viewMode === "Graph" && focusedId && <BranchSummaryPanel summary={computeBranchSummary(focusedId, byId)} />}
            {!loadingOrgChart && people.length > 0 && viewMode === "Graph" && (
              <ReactFlowProvider>
                <OrgFlowGraph people={people} byId={byId} roots={roots} expandedIds={expandedIds} visibleIds={visibleIds} geoFilter={geoFilter} selectedId={selectedId} focusedId={focusedId} focusedPath={focusedPath} onSelect={selectPerson} onToggle={toggleExpanded} onFocus={(id) => { setFocusedId(id); const path = getPersonPath(id, byId); setExpandedIds((prev) => { const next = new Set(prev); path.forEach((pid) => next.add(pid)); return next; }); }} onClearFocus={() => setFocusedId(null)} onSearchFocus={searchFocusTarget} />
              </ReactFlowProvider>
            )}
            {!loadingOrgChart && people.length > 0 && viewMode === "Table" && <TableView people={filteredPeople} byId={byId} selectedId={selectedId} onSelect={selectPerson} employeeData={employeeData} />}
            {!loadingOrgChart && people.length > 0 && viewMode === "Headcount" && <HeadcountView rows={headcountRows} />}
          </div>
        </section>

        {/* Right: drawer */}
        {drawerOpen && !isMobile && (
          <PersonDrawer
            person={selectedPerson}
            byId={byId}
            onJump={selectPerson}
            onClose={() => setSelectedId(null)}
            onMinimize={() => setDrawerMinimized(true)}
            width={drawerWidth}
            onWidthChange={setDrawerWidth}
          />
        )}
      </div>

      {/* Minimized drawer indicator */}
      {selectedPerson && drawerMinimized && !isMobile && (
        <button onClick={() => setDrawerMinimized(false)} style={{ position: "fixed", bottom: 20, right: 20, zIndex: 40, padding: "10px 16px", borderRadius: 14, background: "rgba(18,18,26,0.95)", border: "1px solid rgba(96,165,250,0.2)", color: "#f8fafc", fontSize: 12, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          ↑ {selectedPerson.name}
        </button>
      )}

      {/* Mobile bottom sheet */}
      {selectedPerson && isMobile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
          <div onClick={() => setSelectedId(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80vh", borderRadius: "20px 20px 0 0", background: "linear-gradient(180deg, rgba(18,18,26,0.99) 0%, rgba(12,12,19,0.99) 100%)", border: "1px solid rgba(255,255,255,0.06)", overflow: "auto", padding: 20 }}>
            <PersonDrawerContent person={selectedPerson} byId={byId} onJump={selectPerson} onClose={() => setSelectedId(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Graph View ═══ */
function GraphView({ roots, byId, visibleIds, geoFilter, selectedId, expandedIds, onSelect, onToggle, isMobile }: { roots: OrgPerson[]; byId: Map<string, OrgPerson>; visibleIds: Set<string>; geoFilter: GeographyFilter; selectedId: string | null; expandedIds: Set<string>; onSelect: (id: string) => void; onToggle: (id: string) => void; isMobile: boolean; }) {
  return (
    <div style={{ display: "flex", gap: 24, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-start", overflowX: "auto", paddingBottom: 8 }}>
      {roots.filter((r) => visibleIds.has(r.id)).map((root) => (
        <div key={root.id} style={{ minWidth: isMobile ? "100%" : 280, flex: 1 }}>
          <OrgBranch node={buildTree(root.id, byId)} selectedId={selectedId} expandedIds={expandedIds} visibleIds={visibleIds} geoFilter={geoFilter} onSelect={onSelect} onToggle={onToggle} depth={0} />
        </div>
      ))}
    </div>
  );
}

function OrgBranch({ node, selectedId, expandedIds, visibleIds, geoFilter, onSelect, onToggle, depth }: { node: OrgTreeNode; selectedId: string | null; expandedIds: Set<string>; visibleIds: Set<string>; geoFilter: GeographyFilter; onSelect: (id: string) => void; onToggle: (id: string) => void; depth: number; }) {
  const { person, children } = node;
  const visibleChildren = children.filter((c) => visibleIds.has(c.person.id));
  const expanded = expandedIds.has(person.id);
  const muted = geoFilter !== "All" && person.locationLabel !== geoFilter;
  const isLeader = person.level.startsWith("L") || person.directReports > 0;
  const isSelected = selectedId === person.id;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10, marginLeft: depth > 0 ? 20 : 0, position: "relative" }}>
      {depth > 0 && <div style={{ position: "absolute", left: -11, top: -8, bottom: 8, borderLeft: "1.5px dashed rgba(255,255,255,0.12)" }} />}
      {depth > 0 && <div style={{ position: "absolute", left: -11, top: 20, width: 11, borderBottom: "1.5px dashed rgba(255,255,255,0.12)" }} />}
      <button onClick={() => onSelect(person.id)} style={{ textAlign: "left", borderRadius: 20, padding: isLeader ? "16px 18px" : "13px 15px", background: muted ? "linear-gradient(180deg, rgba(22,22,30,0.6) 0%, rgba(14,14,22,0.65) 100%)" : "linear-gradient(180deg, rgba(24,24,34,0.96) 0%, rgba(16,16,24,0.96) 100%)", border: isSelected ? "1.5px solid rgba(232,67,147,0.5)" : muted ? "1px dashed rgba(255,255,255,0.14)" : isLeader ? "1px solid rgba(96,165,250,0.2)" : "1px solid rgba(255,255,255,0.08)", boxShadow: isSelected ? "0 0 0 1px rgba(232,67,147,0.15), 0 12px 28px rgba(0,0,0,0.3)" : "0 8px 20px rgba(0,0,0,0.2)", color: "#f8fafc", opacity: muted ? 0.6 : 1, cursor: "pointer", transition: "all 0.15s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", background: isLeader ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.07)", color: isLeader ? "#93c5fd" : "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0 }}>{getInitials(person.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>{person.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>{person.role}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>{person.department}</span>
                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>{person.level}</span>
              </div>
              {person.directReports > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>{person.directReports} direct · {person.totalDownstream} total</div>}
            </div>
          </div>
          {visibleChildren.length > 0 && <button onClick={(e) => { e.stopPropagation(); onToggle(person.id); }} style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: expanded ? "rgba(96,165,250,0.1)" : "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.7)", cursor: "pointer", flexShrink: 0, fontSize: 14, display: "grid", placeItems: "center" }}>{expanded ? "−" : "+"}</button>}
        </div>
      </button>
      {expanded && visibleChildren.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 6 }}>{visibleChildren.map((c) => <OrgBranch key={c.person.id} node={c} selectedId={selectedId} expandedIds={expandedIds} visibleIds={visibleIds} geoFilter={geoFilter} onSelect={onSelect} onToggle={onToggle} depth={depth + 1} />)}</div>}
    </div>
  );
}

/* ═══ Table View ═══ */
function TableView({ people, byId, selectedId, onSelect, employeeData }: { people: OrgPerson[]; byId: Map<string, OrgPerson>; selectedId: string | null; onSelect: (id: string) => void; employeeData?: Record<string, any> }) {
  const columns: StandardTableColumn<OrgPerson>[] = [
    {
      key: "name",
      label: "Name",
      getValue: (p) => p.name,
      render: (p) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#f8fafc", fontSize: 13, fontWeight: 600 }}>
          {p.name}
          {employeeData?.[p.id]?.crmContactId && (
            <a href={`/contacts?select=${employeeData[p.id].crmContactId}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 7, padding: "1px 5px", borderRadius: 3, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.15)", color: "#4ade80", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em" }}>CRM</a>
          )}
        </span>
      ),
    },
    {
      key: "department",
      label: "Department",
      getValue: (p) => p.department,
      tdStyle: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
    },
    {
      key: "level",
      label: "Level",
      getValue: (p) => p.level,
      tdStyle: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
    },
    {
      key: "manager",
      label: "Manager",
      getValue: (p) => p.managerId ? byId.get(p.managerId)?.name ?? "—" : "—",
      tdStyle: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
    },
    {
      key: "role",
      label: "Role",
      getValue: (p) => p.role,
      tdStyle: { color: "rgba(255,255,255,0.55)", fontSize: 12 },
    },
  ];

  return (
    <StandardTable<OrgPerson>
      tableKey="hr-org-chart"
      columns={columns}
      data={people}
      getRowKey={(p) => p.id}
      defaultSortKey="name"
      selectedRowKey={selectedId}
      onRowClick={(p) => onSelect(p.id)}
      emptyMessage="No people found"
    />
  );
}

/* ═══ Headcount View ═══ */
function HeadcountView({ rows }: { rows: { department: string; total: number; leaders: number }[] }) {
  const totalActive = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.12)" }}>
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Total active headcount: </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc" }}>{totalActive}</span>
      </div>
      {rows.map((row) => (
        <div key={row.department} style={{ padding: 16, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#f8fafc" }}>{row.department}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{row.leaders} leader{row.leaders !== 1 ? "s" : ""} · {row.total - row.leaders} IC{row.total - row.leaders !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#f8fafc" }}>{row.total}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══ Person Drawer (Desktop) ═══ */
function PersonDrawer({ person, byId, onJump, onClose, onMinimize, width, onWidthChange }: { person: OrgPerson; byId: Map<string, OrgPerson>; onJump: (id: string) => void; onClose: () => void; onMinimize: () => void; width: number; onWidthChange: (w: number) => void; }) {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX;
      onWidthChange(Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, dragRef.current.startW + delta)));
    };
    const onUp = () => { dragRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width, onWidthChange]);

  return (
    <aside style={{ position: "sticky", top: 0, borderRadius: 20, background: "linear-gradient(180deg, rgba(18,18,26,0.98) 0%, rgba(12,12,19,0.99) 100%)", border: "1px solid rgba(255,255,255,0.06)", overflow: "auto", maxHeight: "calc(100vh - 200px)" }}>
      {/* Resize handle */}
      <div onMouseDown={onDragStart} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, cursor: "col-resize", zIndex: 10, background: "transparent" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(96,165,250,0.2)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"} />
      {/* Top controls */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, padding: "12px 16px 0" }}>
        <button onClick={onMinimize} title="Minimize" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, display: "grid", placeItems: "center" }}>↓</button>
        <button onClick={onClose} title="Close" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 14, display: "grid", placeItems: "center" }}>✕</button>
      </div>
      <div style={{ padding: "8px 20px 20px" }}>
        <PersonDrawerContent person={person} byId={byId} onJump={onJump} onClose={onClose} />
      </div>
    </aside>
  );
}

import { PERFORMANCE_RATINGS, type PerformanceRating } from "./types";

function PersonDrawerContent({ person, byId, onJump, onClose }: { person: OrgPerson; byId: Map<string, OrgPerson>; onJump: (id: string) => void; onClose: () => void; }) {
  const manager = person.managerId ? byId.get(person.managerId) ?? null : null;
  const [empData, setEmpData] = useState<{ startDate?: string | null; promotions?: number; lastPromotionDate?: string | null; performanceReviews?: Array<{ date: string; rating: string; notes: string; reviewer: string }>; crmContactId?: string | null }>({});
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Fetch employee data
  useEffect(() => {
    fetch(`/api/employees?personId=${person.id}`).then((r) => r.json()).then(setEmpData).catch(() => {});
  }, [person.id]);

  async function saveField(field: string, value: string | number | null) {
    const res = await fetch('/api/employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: person.id, [field]: value }) });
    if (res.ok) { const updated = await res.json(); setEmpData(updated); }
    setEditingField(null);
  }

  async function addReview(review: { date: string; rating: string; notes: string; reviewer: string }) {
    const res = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add-review', personId: person.id, review }) });
    if (res.ok) { const updated = await res.json(); setEmpData(updated); }
    setShowReviewForm(false);
  }

  return (
    <>
      {/* Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", background: person.isLeader ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.07)", color: person.isLeader ? "#93c5fd" : "rgba(255,255,255,0.82)", fontSize: 16, fontWeight: 700, overflow: "hidden", flexShrink: 0 }}>
          {person.photoUrl ? <img src={person.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : getInitials(person.name)}
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#f8fafc", letterSpacing: "-0.02em" }}>{person.name}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{person.role}</div>
        </div>
      </div>

      {(person.profileTitle || person.bio) && (
        <DrawerSection title="Website Profile">
          {person.profileTitle && <DrawerRow label="Profile" value={person.profileTitle} />}
          {person.bio && <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 1.5 }}>{person.bio}</div>}
        </DrawerSection>
      )}

      {/* Section: Org Overview */}
      <DrawerSection title="Org Overview">
        <DrawerRow label="Department" value={person.department} />
        <DrawerRow label="Level" value={person.level} />
        <DrawerRow label="Status" value={person.status} />
      </DrawerSection>

      {/* Section: Reporting Structure */}
      <DrawerSection title="Reporting Structure">
        <DrawerRow label="Reports to" value={person.managerIds.length > 0 ? person.managerIds.map((id) => byId.get(id)?.name).filter(Boolean).join(" + ") : "Root"} onClick={manager ? () => onJump(manager.id) : undefined} />
        <DrawerRow label="Direct reports" value={String(person.directReports)} />
        <DrawerRow label="Total downstream" value={String(person.totalDownstream)} />
      </DrawerSection>

      {/* Section: Contact Info */}
      <DrawerSection title="Contact Info">
        <DrawerRow label="Phone" value={person.phone ?? "—"} />
        <DrawerRow label="Email" value={person.email ?? "—"} />
        <DrawerRow label="Address" value={person.address ?? "—"} />
      </DrawerSection>

      {/* Section: Compensation / Payment */}
      <DrawerSection title="Compensation / Payment">
        <DrawerRow label="Hourly rate" value={person.hourlyRate ?? "—"} />
        <DrawerRow label="Monthly comp" value={person.monthlyComp ?? "—"} />
        <DrawerRow label="Coaching rate" value={person.coachingRate ?? "—"} />
        <DrawerRow label="Payment method" value={person.paymentMethod ?? "—"} />
        <DrawerRow label="Payment username" value={person.paymentUsername ?? "—"} />
      </DrawerSection>

      {/* Section: Employee Lifecycle */}
      <DrawerSection title="Employee Lifecycle">
        <EditableRow label="Start date" value={empData.startDate ?? ''} placeholder="YYYY-MM-DD" onSave={(v) => saveField('startDate', v || null)} />
        <EditableRow label="Promotions" value={String(empData.promotions ?? 0)} placeholder="0" onSave={(v) => saveField('promotions', parseInt(v) || 0)} />
        <EditableRow label="Last promotion" value={empData.lastPromotionDate ?? ''} placeholder="YYYY-MM-DD" onSave={(v) => saveField('lastPromotionDate', v || null)} />
        {empData.crmContactId ? (
          <div style={{ padding: '4px 0' }}>
            <a href={`/contacts?select=${empData.crmContactId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)', color: '#4ade80', fontSize: 11, fontWeight: 500, textDecoration: 'none' }}>CRM Link</a>
          </div>
        ) : (
          <div style={{ padding: '4px 0' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>CRM Unlinked</div>
          </div>
        )}
      </DrawerSection>

      {/* Section: Performance Reviews */}
      <DrawerSection title="Performance Reviews">
        <button onClick={() => setShowReviewForm(!showReviewForm)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px dashed rgba(96,165,250,0.2)', background: 'rgba(96,165,250,0.05)', color: '#93c5fd', fontSize: 12, cursor: 'pointer', textAlign: 'center' }}>{showReviewForm ? 'Cancel' : '+ Add Review'}</button>
        {showReviewForm && <ReviewForm onSubmit={addReview} />}
        {(empData.performanceReviews ?? []).map((review, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: getRatingMeta(review.rating).color }}>{getRatingMeta(review.rating).label}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{review.date}</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{review.notes}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>by {review.reviewer}</div>
          </div>
        ))}
        {(empData.performanceReviews ?? []).length === 0 && !showReviewForm && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', padding: '8px 0', textAlign: 'center' }}>No reviews yet</div>}
      </DrawerSection>

      {/* Direct reports list */}
      {person.allDirectReportIds.length > 0 && (
        <DrawerSection title="Direct Reports">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {person.allDirectReportIds.map((rid) => {
              const r = byId.get(rid);
              if (!r) return null;
              return <button key={r.id} onClick={() => onJump(r.id)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "#f8fafc", cursor: "pointer" }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{r.role}</div></button>;
            })}
          </div>
        </DrawerSection>
      )}
    </>
  );
}

/* ═══ Shared Components ═══ */
function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function DrawerRow({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.36)", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>{label}</span>
      {onClick ? <button onClick={onClick} style={{ fontSize: 12, color: "#93c5fd", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, textAlign: "right", overflowWrap: "anywhere" }}>{value}</button> : <span style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", textAlign: "right", overflowWrap: "anywhere", minWidth: 0 }}>{value}</span>}
    </div>
  );
}

function BranchSummaryPanel({ summary }: { summary: BranchSummary }) {
  const costParts: string[] = [];
  if (summary.usdHourlyTotal > 0) costParts.push(`$${summary.usdHourlyTotal.toLocaleString()}/hr (${summary.usdCount} people)`);
  if (summary.brlMonthlyTotal > 0) costParts.push(`R$${summary.brlMonthlyTotal.toLocaleString()}/mo (${summary.brlCount} people)`);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: 14, marginBottom: 12, borderRadius: 14, background: 'rgba(192,132,252,0.05)', border: '1px solid rgba(192,132,252,0.12)' }}>
      <div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Branch: {summary.leaderName}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>{summary.totalPeople} <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>people</span></div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{summary.directReports} direct reports</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Role Mix</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
          {Object.entries(summary.roleMix).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
            <div key={role} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.65)' }}><span>{role}</span><span style={{ fontWeight: 600 }}>{count}</span></div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Compensation</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
          {costParts.length > 0 ? costParts.map((part, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(52,211,153,0.7)' }}>~{part}</div>
          )) : <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>No comp data</div>}
          {Object.entries(summary.levelMix).map(([band, count]) => (
            <div key={band} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}><span>{band}</span><span style={{ fontWeight: 600 }}>{count}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditableRow({ label, value, placeholder, onSave }: { label: string; value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (editing) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 10, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 }}>{label}</span>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(8,8,14,0.6)', color: '#f8fafc', fontSize: 12, outline: 'none' }} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }} />
        <button onClick={() => { onSave(draft); setEditing(false); }} style={{ fontSize: 10, color: '#4ade80', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Save</button>
      </div>
    );
  }
  return (
    <div onClick={() => setEditing(true)} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <span style={{ fontSize: 12, color: value ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{value || placeholder}</span>
    </div>
  );
}

function getRatingMeta(rating: number | string) {
  const num = typeof rating === 'number' ? rating : parseInt(String(rating), 10);
  const found = PERFORMANCE_RATINGS.find((r) => r.value === num);
  if (found) return found;
  // Legacy string fallback
  const legacy: Record<string, { label: string; color: string }> = {
    'Exceeds': { label: '4 — Above the Bar', color: '#60a5fa' },
    'Meets': { label: '3 — At the Bar', color: 'rgba(255,255,255,0.7)' },
    'Below': { label: '1 — Below the Bar', color: '#ef4444' },
    'New': { label: '3 — At the Bar', color: 'rgba(255,255,255,0.7)' },
  };
  return legacy[String(rating)] ?? { label: String(rating), color: 'rgba(255,255,255,0.7)' };
}

function ReviewForm({ onSubmit }: { onSubmit: (review: { date: string; rating: string; notes: string; reviewer: string }) => void }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [rating, setRating] = useState<string>('3');
  const [notes, setNotes] = useState('');
  const [reviewer, setReviewer] = useState('');
  return (
    <div style={{ display: 'grid', gap: 8, padding: '12px', borderRadius: 12, background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.1)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Date" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,8,14,0.6)', color: '#f8fafc', fontSize: 12, outline: 'none' }} />
        <select value={rating} onChange={(e) => setRating(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,8,14,0.6)', color: '#f8fafc', fontSize: 12, outline: 'none' }}>
          {PERFORMANCE_RATINGS.map((r) => <option key={r.value} value={r.value}>{r.value} — {r.label}</option>)}
        </select>
      </div>
      <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Reviewer name" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,8,14,0.6)', color: '#f8fafc', fontSize: 12, outline: 'none' }} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes..." rows={3} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(8,8,14,0.6)', color: '#f8fafc', fontSize: 12, outline: 'none', resize: 'vertical' }} />
      <button onClick={() => { if (date && rating) onSubmit({ date, rating, notes, reviewer }); }} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.1)', color: '#4ade80', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save Review</button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 90 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.34)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div><div style={{ fontSize: 20, fontWeight: 600, color: "#f8fafc", marginTop: 6 }}>{value}</div></div>;
}

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}
