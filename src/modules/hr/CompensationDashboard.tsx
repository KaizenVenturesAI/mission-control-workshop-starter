"use client";

import { useEffect, useMemo, useState } from "react";
import { buildOrgPeopleFromRecords } from "@/modules/org-chart/data/hierarchy";
import type { OrgPerson, EmployeeRecord, PersonRecord } from "@/modules/org-chart/types";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

// ── Helpers ──
function parseUsd(rate: string | null | undefined): number {
  if (!rate) return 0;
  if (rate.includes("R$")) return 0;
  if (rate.toLowerCase().includes("variable")) return 0;
  if (rate.includes("/day")) {
    const c = rate.replace(/[^0-9.]/g, "");
    return (parseFloat(c) || 0) / 8;
  }
  const c = rate.replace(/[^0-9.]/g, "");
  return parseFloat(c) || 0;
}

function parseUsdMonthly(comp: string | null | undefined): number {
  if (!comp) return 0;
  if (comp.includes("R$")) return 0;
  if (comp === "0") return 0;
  if (comp.toLowerCase().includes("variable")) return 0;
  // Extract the first dollar amount only (e.g. "$2,500/month + $275 gym perk" → 2500)
  const match = comp.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, "")) || 0;
}

function parseBrl(comp: string | null | undefined): number {
  if (!comp) return 0;
  if (!comp.includes("R$")) return 0;
  if (comp.toLowerCase().includes("variable")) return 0;
  const c = comp.replace(/[^0-9.]/g, "");
  return parseFloat(c) || 0;
}

function isFounder(person: OrgPerson): boolean {
  return (person as any).paymentMethod === "founder-no-salary";
}

interface CompRow {
  person: OrgPerson;
  emp: EmployeeRecord;
  usdHourly: number;
  usdMonthly: number;
  brlMonthly: number;
  founder: boolean;
  hasComp: boolean;
  managerName: string | null;
}

type CompSortKey = "name" | "department" | "region" | "rate" | "manager" | "level";

export function CompensationDashboard() {
  const [deptFilter, setDeptFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All");
  const [currencyView, setCurrencyView] = useState<"all" | "usd" | "brl">("all");
  const [employeeData, setEmployeeData] = useState<Record<string, EmployeeRecord>>({});
  const [orgPeople, setOrgPeople] = useState<PersonRecord[]>([]);

  const { byId } = useMemo(() => buildOrgPeopleFromRecords(orgPeople), [orgPeople]);

  useEffect(() => {
    fetch("/api/employees/org-chart")
      .then((r) => r.json())
      .then((data) => setOrgPeople(Array.isArray(data.people) ? data.people : []))
      .catch(() => {});
    fetch("/api/employees").then((r) => r.json()).then(setEmployeeData).catch(() => {});
  }, []);

  const rows: CompRow[] = useMemo(() => {
    return Array.from(byId.values()).map((person) => {
      const usdHourly = parseUsd(person.hourlyRate);
      const usdMonthly = parseUsdMonthly(person.monthlyComp);
      const brlMonthly = parseBrl(person.monthlyComp);
      const founder = isFounder(person);
      const manager = person.managerId ? byId.get(person.managerId) : null;
      const emp = employeeData[person.id] ?? {};
      return {
        person,
        emp,
        usdHourly,
        usdMonthly,
        brlMonthly,
        founder,
        hasComp: usdHourly > 0 || brlMonthly > 0 || usdMonthly > 0 || founder,
        managerName: manager?.name ?? null,
      };
    });
  }, [byId, employeeData]);

  // Summary stats
  const stats = useMemo(() => {
    const withComp = rows.filter((r) => r.hasComp);
    const usdPeople = rows.filter((r) => r.usdHourly > 0);
    const brlPeople = rows.filter((r) => r.brlMonthly > 0);
    const totalUsdHourly = usdPeople.reduce((s, r) => s + r.usdHourly, 0);
    const avgUsdHourly = usdPeople.length > 0 ? totalUsdHourly / usdPeople.length : 0;
    const usdMonthlyPeople = rows.filter((r) => r.usdMonthly > 0);
    const totalUsdMonthly = usdMonthlyPeople.reduce((s, r) => s + r.usdMonthly, 0);
    const totalBrlMonthly = brlPeople.reduce((s, r) => s + r.brlMonthly, 0);
    const founders = rows.filter((r) => r.founder).length;
    const noComp = rows.filter((r) => !r.hasComp).length;

    // By department
    const deptMap: Record<string, { usdTotal: number; usdCount: number; brlTotal: number; brlCount: number; total: number }> = {};
    rows.forEach((r) => {
      const d = r.person.department;
      if (!deptMap[d]) deptMap[d] = { usdTotal: 0, usdCount: 0, brlTotal: 0, brlCount: 0, total: 0 };
      deptMap[d].total += 1;
      if (r.usdHourly > 0) { deptMap[d].usdTotal += r.usdHourly; deptMap[d].usdCount += 1; }
      if (r.brlMonthly > 0) { deptMap[d].brlTotal += r.brlMonthly; deptMap[d].brlCount += 1; }
    });

    // By region
    const regionMap: Record<string, { usdTotal: number; usdCount: number; brlTotal: number; brlCount: number; total: number }> = {};
    rows.forEach((r) => {
      const loc = r.person.locationLabel;
      if (!regionMap[loc]) regionMap[loc] = { usdTotal: 0, usdCount: 0, brlTotal: 0, brlCount: 0, total: 0 };
      regionMap[loc].total += 1;
      if (r.usdHourly > 0) { regionMap[loc].usdTotal += r.usdHourly; regionMap[loc].usdCount += 1; }
      if (r.brlMonthly > 0) { regionMap[loc].brlTotal += r.brlMonthly; regionMap[loc].brlCount += 1; }
    });

    return { withComp: withComp.length, usdPeople: usdPeople.length, brlPeople: brlPeople.length, totalUsdHourly, avgUsdHourly, totalUsdMonthly, usdMonthlyPeople: usdMonthlyPeople.length, totalBrlMonthly, founders, noComp, deptMap, regionMap };
  }, [rows]);

  const departments = useMemo(() => ["All", ...new Set(rows.map((r) => r.person.department))], [rows]);
  const regions = useMemo(() => ["All", ...new Set(rows.map((r) => r.person.locationLabel))], [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (currencyView === "usd") result = result.filter((r) => r.usdHourly > 0);
    if (currencyView === "brl") result = result.filter((r) => r.brlMonthly > 0);
    if (deptFilter !== "All") result = result.filter((r) => r.person.department === deptFilter);
    if (regionFilter !== "All") result = result.filter((r) => r.person.locationLabel === regionFilter);
    return result;
  }, [rows, currencyView, deptFilter, regionFilter]);

  const compColumns: StandardTableColumn<CompRow>[] = useMemo(() => [
    {
      key: "name",
      label: "Name",
      getValue: (row) => row.person.name,
      render: (row) => (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#f8fafc" }}>{row.person.name}</span>
            {row.emp.crmContactId && (<a href={`/contacts?select=${row.emp.crmContactId}`} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 4, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.18)", color: "#4ade80", textDecoration: "none", fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>CRM</a>)}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{row.person.role}</div>
        </div>
      ),
    },
    {
      key: "department",
      label: "Department",
      getValue: (row) => row.person.department,
      tdStyle: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
    },
    {
      key: "region",
      label: "Region",
      getValue: (row) => row.person.locationLabel,
      tdStyle: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
    },
    {
      key: "level",
      label: "Level",
      getValue: (row) => row.person.level,
      tdStyle: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
    },
    {
      key: "manager",
      label: "Manager",
      getValue: (row) => row.managerName ?? "—",
      tdStyle: { fontSize: 12, color: "rgba(255,255,255,0.45)" },
    },
    {
      key: "rate",
      label: "Rate",
      getValue: (row) => row.usdHourly > 0 ? `$${row.usdHourly}/hr` : row.brlMonthly > 0 ? `R$${row.brlMonthly.toLocaleString()}/mo` : "—",
      render: (row) => (
        <>
          {row.usdHourly > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(52,211,153,0.8)" }}>${row.usdHourly}/hr</div>}
          {row.brlMonthly > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(96,165,250,0.8)" }}>R${row.brlMonthly.toLocaleString()}/mo</div>}
          {!row.hasComp && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>—</span>}
        </>
      ),
    },
    {
      key: "payment",
      label: "Payment",
      sortable: false,
      getValue: (row) => row.person.paymentMethod ?? "—",
      tdStyle: { fontSize: 11, color: "rgba(255,255,255,0.45)" },
    },
  ], []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <SummaryCard label="With Compensation" value={`${stats.withComp}`} color="#4ade80" />
        <SummaryCard label="No Comp Data" value={`${stats.noComp}`} color="#f59e0b" />
        <SummaryCard label="USD Avg Hourly" value={`$${stats.avgUsdHourly.toFixed(0)}/hr`} sub={`${stats.usdPeople} hourly staff`} color="#f8fafc" />
        <SummaryCard label="USD Monthly Salaried" value={`$${stats.totalUsdMonthly.toLocaleString()}/mo`} sub={`${stats.usdMonthlyPeople} people`} color="rgba(255,255,255,0.7)" />
        <SummaryCard label="BRL Monthly Payroll" value={`R$${stats.totalBrlMonthly.toLocaleString()}/mo`} sub={`${stats.brlPeople} people`} color="#f8fafc" />
        <SummaryCard label="Founders (No Salary)" value={`${stats.founders}`} sub="equity only" color="rgba(167,139,250,0.8)" />
      </div>

      {/* Department Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>By Department Avg Rate</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(stats.deptMap).sort((a, b) => b[1].total - a[1].total).map(([dept, data]) => (
              <div key={dept} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.65)" }}>{dept} <span style={{ color: "rgba(255,255,255,0.3)" }}>({data.total})</span></span>
                <div style={{ display: "flex", gap: 8 }}>
                  {data.usdCount > 0 && <span style={{ color: "rgba(52,211,153,0.7)", fontSize: 11 }}>${(data.usdTotal / data.usdCount).toFixed(0)}/hr avg</span>}
                  {data.brlCount > 0 && <span style={{ color: "rgba(96,165,250,0.7)", fontSize: 11 }}>R${(data.brlTotal / data.brlCount).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo avg</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>By Region Avg Rate</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(stats.regionMap).sort((a, b) => b[1].total - a[1].total).map(([region, data]) => (
              <div key={region} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "rgba(255,255,255,0.65)" }}>{region} <span style={{ color: "rgba(255,255,255,0.3)" }}>({data.total})</span></span>
                <div style={{ display: "flex", gap: 8 }}>
                  {data.usdCount > 0 && <span style={{ color: "rgba(52,211,153,0.7)", fontSize: 11 }}>${(data.usdTotal / data.usdCount).toFixed(0)}/hr avg</span>}
                  {data.brlCount > 0 && <span style={{ color: "rgba(96,165,250,0.7)", fontSize: 11 }}>R${(data.brlTotal / data.brlCount).toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo avg</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(["all", "usd", "brl"] as const).map((cv) => (
          <button key={cv} onClick={() => setCurrencyView(cv)} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: currencyView === cv ? 600 : 400,
            background: currencyView === cv ? "rgba(96,165,250,0.1)" : "transparent",
            border: currencyView === cv ? "1px solid rgba(96,165,250,0.2)" : "1px solid rgba(255,255,255,0.06)",
            color: currencyView === cv ? "#93c5fd" : "rgba(255,255,255,0.5)", cursor: "pointer",
          }}>{cv === "all" ? "All" : cv === "usd" ? "USD Only" : "BRL Only"}</button>
        ))}
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, background: "rgba(8,8,14,0.6)", border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none" }}>
          {departments.map((d) => <option key={d} value={d}>{d === "All" ? "All Departments" : d}</option>)}
        </select>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, background: "rgba(8,8,14,0.6)", border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none" }}>
          {regions.map((r) => <option key={r} value={r}>{r === "All" ? "All Regions" : r}</option>)}
        </select>
      </div>

      {/* Compensation Table */}
      <StandardTable<CompRow>
        tableKey="hr-compensation"
        columns={compColumns}
        data={filtered}
        getRowKey={(row) => row.person.id}
        defaultSortKey="department"
        emptyMessage="No compensation data found"
      />
    </div>
  );
}

// ── Summary Card with optional sub-text ──
function SummaryCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ padding: "16px 18px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
