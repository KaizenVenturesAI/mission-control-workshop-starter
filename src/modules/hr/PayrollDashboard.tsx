"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import { useColumnOrder } from "@/lib/useColumnOrder";
import { useColumnFilters } from "@/lib/useColumnFilters";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TableManagement } = require("@/components/TableManagement");
const { ColumnFilterDropdown } = require("@/components/ColumnFilterDropdown");

type PayrollRateType = "hourly" | "coaching" | "override";
type PayPeriodStatus = "open" | "locked" | "paid";
type DetailSection = "time" | "payments" | "reimbursements";
type EditKind = DetailSection;
type BalanceColumnKey =
  | "employee"
  | "location"
  | "department"
  | "opsHours"
  | "coachingHours"
  | "overrideHours"
  | "grossWages"
  | "reimbursements"
  | "totalOwed"
  | "totalPaid"
  | "balance";
type ActivityColumnKey = "date" | "type" | "employee" | "detail" | "amount" | "meta";

interface PayrollEmployee {
  id: string;
  name: string;
  role: string;
  department: string;
  location: string;
  paymentMethod: string;
  paymentHandle?: string;
  rates: {
    hourly: number;
    coaching: number;
  };
}

interface PayrollSummary {
  totalTimeEntries: number;
  totalHours: number;
  grossPayroll: number;
  totalPayments: number;
  totalReimbursements: number;
  pendingPayroll: number;
}

interface PayrollEmployeeSummary {
  employeeId: string;
  name: string;
  role: string;
  location: string;
  department: string;
  paymentMethod: string;
  paymentHandle: string;
  opsHours: number;
  coachingHours: number;
  overrideHours: number;
  grossWages: number;
  reimbursements: number;
  totalOwed: number;
  totalPaid: number;
  balance: number;
  status: "pending" | "approved" | "paid";
  approvedForPayment: boolean;
  approvedAt?: string;
  approvedAmount?: number;
}

interface PayrollActivityRow {
  id: string;
  kind: "time-entry" | "payment" | "reimbursement";
  date: string;
  employeeId: string;
  employeeName: string;
  detail: string;
  amount: number;
  meta: string;
  createdAt: string;
}

interface PayrollTimeEntry {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  rateType: PayrollRateType;
  rate: number;
  subtotal: number;
  notes: string;
  location: string;
  createdAt: string;
}

interface PayrollPayment {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  createdAt: string;
}

interface PayrollReimbursement {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  description: string;
  createdAt: string;
}

interface PayPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PayPeriodStatus;
  notes?: string;
  createdAt: string;
}

interface PayrollSnapshot {
  employees: PayrollEmployee[];
  employeeSummaries: PayrollEmployeeSummary[];
  timeEntries: PayrollTimeEntry[];
  payments: PayrollPayment[];
  reimbursements: PayrollReimbursement[];
  payPeriods: PayPeriod[];
  payPeriodEntryCounts: Record<string, number>;
  summary: PayrollSummary;
  recentActivity: PayrollActivityRow[];
}

interface PayrollAnalyticsLocationRow {
  location: string;
  hours: number;
  grossWages: number;
  payments: number;
  balance: number;
  avgHourlyCost: number;
  shareOfTotal: number;
}

interface PayrollAnalyticsMonthRow {
  month: string;
  label: string;
  total: number;
  locations: Record<string, number>;
}

interface PayrollAnalyticsDepartmentRow {
  department: string;
  amount: number;
  shareOfTotal: number;
}

interface PayrollAnalyticsTopEarnerRow {
  employeeId: string;
  employee: string;
  hours: number;
  earnings: number;
  shareOfTotal: number;
}

interface PayrollAnalytics {
  cards: {
    currentMonthLaborCost: number;
    previousMonthLaborCost: number;
    monthOverMonthDelta: number;
    monthOverMonthDeltaPct: number | null;
    averageHourlyCost: number;
    totalYtdPayrollSpend: number;
  };
  locationBreakdown: {
    rows: PayrollAnalyticsLocationRow[];
    total: PayrollAnalyticsLocationRow;
  };
  monthlyTrend: PayrollAnalyticsMonthRow[];
  departmentBreakdown: PayrollAnalyticsDepartmentRow[];
  topEarners: PayrollAnalyticsTopEarnerRow[];
  efficiency: {
    coachingCostPerHour: number;
    opsCostPerHour: number;
    coachingHoursPct: number;
    opsHoursPct: number;
    averageSessionsPerEmployeePerWeek: number;
  };
}

interface PayrollFilters {
  startDate: string;
  endDate: string;
  location: string;
}

interface TimeEntryEditForm {
  date: string;
  hours: string;
  rateType: PayrollRateType;
  rate: string;
  subtotal: string;
  notes: string;
  location: string;
}

interface PaymentEditForm {
  date: string;
  amount: string;
  method: string;
  notes: string;
}

interface ReimbursementEditForm {
  date: string;
  amount: string;
  description: string;
}

interface TimeEntryFormState {
  employeeId: string;
  date: string;
  hours: string;
  rateType: PayrollRateType;
  rate: string;
  subtotal: string;
  notes: string;
  location: string;
}

interface PaymentFormState {
  employeeId: string;
  date: string;
  amount: string;
  method: string;
  notes: string;
  reimbursementAmount: string;
  reimbursementDescription: string;
}

interface BulkTimeEntryFormState {
  date: string;
  startTime: string;
  endTime: string;
  rateType: PayrollRateType;
  rate: string;
  location: string;
  notes: string;
  employeeIds: string[];
}

type EditFormState = TimeEntryEditForm | PaymentEditForm | ReimbursementEditForm;

const emptySummary: PayrollSummary = {
  totalTimeEntries: 0,
  totalHours: 0,
  grossPayroll: 0,
  totalPayments: 0,
  totalReimbursements: 0,
  pendingPayroll: 0,
};

const emptySnapshot: PayrollSnapshot = {
  employees: [],
  employeeSummaries: [],
  timeEntries: [],
  payments: [],
  reimbursements: [],
  payPeriods: [],
  payPeriodEntryCounts: {},
  summary: emptySummary,
  recentActivity: [],
};

const emptyFilters: PayrollFilters = {
  startDate: "",
  endDate: "",
  location: "All",
};

const emptyAnalytics: PayrollAnalytics = {
  cards: {
    currentMonthLaborCost: 0,
    previousMonthLaborCost: 0,
    monthOverMonthDelta: 0,
    monthOverMonthDeltaPct: null,
    averageHourlyCost: 0,
    totalYtdPayrollSpend: 0,
  },
  locationBreakdown: {
    rows: [],
    total: {
      location: "Total",
      hours: 0,
      grossWages: 0,
      payments: 0,
      balance: 0,
      avgHourlyCost: 0,
      shareOfTotal: 1,
    },
  },
  monthlyTrend: [],
  departmentBreakdown: [],
  topEarners: [],
  efficiency: {
    coachingCostPerHour: 0,
    opsCostPerHour: 0,
    coachingHoursPct: 0,
    opsHoursPct: 0,
    averageSessionsPerEmployeePerWeek: 0,
  },
};

const balanceDefaultColumns = [
  { key: "employee" as const, label: "Employee" },
  { key: "location" as const, label: "Location" },
  { key: "department" as const, label: "Department" },
  { key: "opsHours" as const, label: "Ops Hrs" },
  { key: "coachingHours" as const, label: "Coaching Hrs" },
  { key: "overrideHours" as const, label: "Override Hrs" },
  { key: "grossWages" as const, label: "Gross Wages" },
  { key: "reimbursements" as const, label: "Reimbursements" },
  { key: "totalOwed" as const, label: "Total Owed" },
  { key: "totalPaid" as const, label: "Total Paid" },
  { key: "balance" as const, label: "Balance" },
];

const activityDefaultColumns = [
  { key: "date" as const, label: "Date" },
  { key: "type" as const, label: "Type" },
  { key: "employee" as const, label: "Employee" },
  { key: "detail" as const, label: "Detail" },
  { key: "amount" as const, label: "Amount" },
  { key: "meta" as const, label: "Meta" },
];

const emptyEmployeeSummaryTotals = {
  opsHours: 0,
  coachingHours: 0,
  overrideHours: 0,
  grossWages: 0,
  reimbursements: 0,
  totalOwed: 0,
  totalPaid: 0,
  balance: 0,
};

export function PayrollDashboard() {
  const [snapshot, setSnapshot] = useState<PayrollSnapshot>(emptySnapshot);
  const [analytics, setAnalytics] = useState<PayrollAnalytics>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [submittingTime, setSubmittingTime] = useState(false);
  const [submittingBulkTime, setSubmittingBulkTime] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [detailSection, setDetailSection] = useState<DetailSection>("time");
  const [filters, setFilters] = useState<PayrollFilters>(emptyFilters);
  const [draftFilters, setDraftFilters] = useState<PayrollFilters>(emptyFilters);
  const [timeForm, setTimeForm] = useState<TimeEntryFormState>({
    employeeId: "",
    date: today(),
    hours: "1",
    rateType: "hourly",
    rate: "0",
    subtotal: "0",
    notes: "",
    location: "",
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkTimeEntryFormState>({
    date: today(),
    startTime: "08:45",
    endTime: "14:00",
    rateType: "hourly",
    rate: "0",
    location: "",
    notes: "",
    employeeIds: [],
  });
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    employeeId: "",
    date: today(),
    amount: "",
    method: "",
    notes: "",
    reimbursementAmount: "",
    reimbursementDescription: "",
  });
  const [balanceSortKey, setBalanceSortKey] = useState<BalanceColumnKey>("employee");
  const [balanceSortDir, setBalanceSortDir] = useState<"asc" | "desc">("asc");
  const [activitySortKey, setActivitySortKey] = useState<ActivityColumnKey>("date");
  const [activitySortDir, setActivitySortDir] = useState<"asc" | "desc">("desc");
  const { orderedColumns: balanceColumns, dragHandlers: balanceDragHandlers, reorderColumns: reorderBalanceCols } = useColumnOrder("payroll-balances", balanceDefaultColumns);
  const { filters: balanceFilters, setFilter: setBalanceFilter, clearAll: clearBalanceFilters, activeFilterCount: balanceActiveFilterCount, passesFilters: balancePassesFilters } = useColumnFilters();
  const { orderedColumns: activityColumns, dragHandlers: activityDragHandlers, reorderColumns: reorderActivityCols } = useColumnOrder("payroll-activity", activityDefaultColumns);
  const { filters: activityFilters, setFilter: setActivityFilter, clearAll: clearActivityFilters, activeFilterCount: activityActiveFilterCount, passesFilters: activityPassesFilters } = useColumnFilters();
  const [payPeriodsOpen, setPayPeriodsOpen] = useState(false);
  const [paymentQueueOpen, setPaymentQueueOpen] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(true);
  const [queueDraftEmployeeId, setQueueDraftEmployeeId] = useState<string | null>(null);
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);
  const [newPeriodForm, setNewPeriodForm] = useState({ name: "", startDate: "", endDate: "" });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  function buildFilterQuery(nextFilters: PayrollFilters) {
    const query = new URLSearchParams();
    if (nextFilters.startDate) query.set("startDate", nextFilters.startDate);
    if (nextFilters.endDate) query.set("endDate", nextFilters.endDate);
    if (nextFilters.location && nextFilters.location !== "All") query.set("location", nextFilters.location);
    return query.toString() ? `?${query.toString()}` : "";
  }

  async function loadSnapshot(nextFilters: PayrollFilters = filters) {
    setLoading(true);
    try {
      const response = await fetch(`/api/payroll${buildFilterQuery(nextFilters)}`, { cache: "no-store" });
      const data = (await response.json()) as PayrollSnapshot;
      setSnapshot({
        ...emptySnapshot,
        ...data,
        payPeriods: Array.isArray(data.payPeriods) ? data.payPeriods : [],
        payPeriodEntryCounts: data.payPeriodEntryCounts ?? {},
        summary: { ...emptySummary, ...data.summary },
      });
      setLastUpdated(new Date());
      setStatus(null);
    } catch {
      setStatus("Unable to load payroll data.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalytics(nextFilters: PayrollFilters = filters) {
    setAnalyticsLoading(true);
    try {
      const response = await fetch(`/api/payroll/analytics${buildFilterQuery(nextFilters)}`, { cache: "no-store" });
      const data = (await response.json()) as PayrollAnalytics;
      setAnalytics({ ...emptyAnalytics, ...data });
    } catch {
      setAnalytics(emptyAnalytics);
      setStatus((current) => current ?? "Unable to load payroll analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([loadSnapshot(emptyFilters), loadAnalytics(emptyFilters)]);
  }, []);

  useEffect(() => {
    if (!snapshot.employees.length) return;
    const employee = snapshot.employees.find((item) => item.id === timeForm.employeeId) ?? snapshot.employees[0];
    if (!employee) return;

    const nextRate = resolveRate(employee, timeForm.rateType, timeForm.rate);
    const nextHours = Number(timeForm.hours) || 0;
    setTimeForm((current) => ({
      ...current,
      employeeId: current.employeeId || employee.id,
      location: current.location || employee.location,
      rate: `${nextRate}`,
      subtotal: formatNumber(nextRate * nextHours),
    }));
    setPaymentForm((current) => ({
      ...current,
      employeeId: current.employeeId || employee.id,
      method: current.method || employee.paymentMethod || "Manual",
    }));
    setBulkForm((current) => ({
      ...current,
      location: current.location || employee.location,
    }));
  }, [snapshot.employees]);

  useEffect(() => {
    if (selectedEmployeeId && !snapshot.employees.some((employee) => employee.id === selectedEmployeeId)) {
      setSelectedEmployeeId(null);
    }
  }, [selectedEmployeeId, snapshot.employees]);

  const selectedTimeEmployee = useMemo(
    () => snapshot.employees.find((employee) => employee.id === timeForm.employeeId) ?? null,
    [snapshot.employees, timeForm.employeeId]
  );

  const selectedPaymentEmployee = useMemo(
    () => snapshot.employees.find((employee) => employee.id === paymentForm.employeeId) ?? null,
    [snapshot.employees, paymentForm.employeeId]
  );

  const selectedEmployee = useMemo(
    () => snapshot.employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [snapshot.employees, selectedEmployeeId]
  );

  const selectedEmployeeSummary = useMemo(
    () => snapshot.employeeSummaries.find((employee) => employee.employeeId === selectedEmployeeId) ?? null,
    [snapshot.employeeSummaries, selectedEmployeeId]
  );

  const selectedEmployeeTimeEntries = useMemo(
    () => sortByDateDesc(snapshot.timeEntries.filter((entry) => entry.employeeId === selectedEmployeeId)),
    [selectedEmployeeId, snapshot.timeEntries]
  );

  const selectedEmployeePayments = useMemo(
    () => sortByDateDesc(snapshot.payments.filter((payment) => payment.employeeId === selectedEmployeeId)),
    [selectedEmployeeId, snapshot.payments]
  );

  const selectedEmployeeReimbursements = useMemo(
    () => sortByDateDesc(snapshot.reimbursements.filter((item) => item.employeeId === selectedEmployeeId)),
    [selectedEmployeeId, snapshot.reimbursements]
  );

  const coachingMismatchWarning = useMemo(
    () => (selectedEmployee ? hasCoachingMismatch(selectedEmployee, selectedEmployeeTimeEntries) : false),
    [selectedEmployee, selectedEmployeeTimeEntries]
  );

  const bulkHours = useMemo(
    () => calculateHoursFromTimes(bulkForm.startTime, bulkForm.endTime),
    [bulkForm.endTime, bulkForm.startTime]
  );

  const toggleBalanceSort = useCallback((key: BalanceColumnKey) => {
    setBalanceSortKey((currentKey) => {
      if (currentKey === key) {
        setBalanceSortDir((currentDir) => currentDir === "asc" ? "desc" : "asc");
        return currentKey;
      }
      setBalanceSortDir("asc");
      return key;
    });
  }, []);

  const toggleActivitySort = useCallback((key: ActivityColumnKey) => {
    setActivitySortKey((currentKey) => {
      if (currentKey === key) {
        setActivitySortDir((currentDir) => currentDir === "asc" ? "desc" : "asc");
        return currentKey;
      }
      setActivitySortDir("asc");
      return key;
    });
  }, []);

  const getBalanceCellValue = useCallback((employee: PayrollEmployeeSummary, key: BalanceColumnKey) => {
    switch (key) {
      case "employee":
        return employee.name;
      case "location":
        return employee.location || "—";
      case "department":
        return employee.department || "—";
      case "opsHours":
        return formatDecimal(employee.opsHours);
      case "coachingHours":
        return formatDecimal(employee.coachingHours);
      case "overrideHours":
        return formatDecimal(employee.overrideHours);
      case "grossWages":
        return formatMoney(employee.grossWages);
      case "reimbursements":
        return formatMoney(employee.reimbursements);
      case "totalOwed":
        return formatMoney(employee.totalOwed);
      case "totalPaid":
        return formatMoney(employee.totalPaid);
      case "balance":
        return formatMoney(employee.balance);
      default:
        return "—";
    }
  }, []);

  const balanceColumnValues = useMemo(() => {
    const values: Record<BalanceColumnKey, string[]> = {
      employee: [],
      location: [],
      department: [],
      opsHours: [],
      coachingHours: [],
      overrideHours: [],
      grossWages: [],
      reimbursements: [],
      totalOwed: [],
      totalPaid: [],
      balance: [],
    };
    for (const column of balanceDefaultColumns) {
      const unique = new Set<string>();
      for (const row of snapshot.employeeSummaries) unique.add(getBalanceCellValue(row, column.key));
      values[column.key] = [...unique];
    }
    return values;
  }, [getBalanceCellValue, snapshot.employeeSummaries]);

  const balanceSortedRows = useMemo(() => {
    const rows = [...snapshot.employeeSummaries];
    rows.sort((a, b) => {
      let compare = 0;
      switch (balanceSortKey) {
        case "employee":
          compare = a.name.localeCompare(b.name) || a.role.localeCompare(b.role);
          break;
        case "location":
          compare = a.location.localeCompare(b.location) || a.name.localeCompare(b.name);
          break;
        case "department":
          compare = a.department.localeCompare(b.department) || a.name.localeCompare(b.name);
          break;
        case "opsHours":
          compare = a.opsHours - b.opsHours;
          break;
        case "coachingHours":
          compare = a.coachingHours - b.coachingHours;
          break;
        case "overrideHours":
          compare = a.overrideHours - b.overrideHours;
          break;
        case "grossWages":
          compare = a.grossWages - b.grossWages;
          break;
        case "reimbursements":
          compare = a.reimbursements - b.reimbursements;
          break;
        case "totalOwed":
          compare = a.totalOwed - b.totalOwed;
          break;
        case "totalPaid":
          compare = a.totalPaid - b.totalPaid;
          break;
        case "balance":
          compare = a.balance - b.balance;
          break;
      }
      return balanceSortDir === "asc" ? compare : -compare;
    });
    return rows;
  }, [balanceSortDir, balanceSortKey, snapshot.employeeSummaries]);

  const balanceFilteredRows = useMemo(() => {
    if (balanceActiveFilterCount === 0) return balanceSortedRows;
    return balanceSortedRows.filter((row) => balancePassesFilters((columnKey) => getBalanceCellValue(row, columnKey as BalanceColumnKey)));
  }, [balanceActiveFilterCount, balancePassesFilters, balanceSortedRows, getBalanceCellValue]);

  const paymentQueueRows = useMemo(() => {
    return [...snapshot.employeeSummaries]
      .filter((employee) => employee.balance > 0)
      .sort((a, b) => {
        if (a.status === "approved" && b.status !== "approved") return -1;
        if (a.status !== "approved" && b.status === "approved") return 1;
        return b.balance - a.balance || a.name.localeCompare(b.name);
      });
  }, [snapshot.employeeSummaries]);

  const employeeSummaryTotals = useMemo(
    () => balanceFilteredRows.reduce((totals, employee) => ({
      opsHours: totals.opsHours + employee.opsHours,
      coachingHours: totals.coachingHours + employee.coachingHours,
      overrideHours: totals.overrideHours + employee.overrideHours,
      grossWages: totals.grossWages + employee.grossWages,
      reimbursements: totals.reimbursements + employee.reimbursements,
      totalOwed: totals.totalOwed + employee.totalOwed,
      totalPaid: totals.totalPaid + employee.totalPaid,
      balance: totals.balance + employee.balance,
    }), emptyEmployeeSummaryTotals),
    [balanceFilteredRows]
  );

  const getActivityCellValue = useCallback((row: PayrollActivityRow, key: ActivityColumnKey) => {
    switch (key) {
      case "date":
        return formatDate(row.date);
      case "type":
        return labelForKind(row.kind);
      case "employee":
        return row.employeeName;
      case "detail":
        return row.detail || "—";
      case "amount":
        return formatMoney(row.amount);
      case "meta":
        return row.meta || "—";
      default:
        return "—";
    }
  }, []);

  const activityColumnValues = useMemo(() => {
    const values: Record<ActivityColumnKey, string[]> = {
      date: [],
      type: [],
      employee: [],
      detail: [],
      amount: [],
      meta: [],
    };
    for (const column of activityDefaultColumns) {
      const unique = new Set<string>();
      for (const row of snapshot.recentActivity) unique.add(getActivityCellValue(row, column.key));
      values[column.key] = [...unique];
    }
    return values;
  }, [getActivityCellValue, snapshot.recentActivity]);

  const activitySortedRows = useMemo(() => {
    const rows = [...snapshot.recentActivity];
    rows.sort((a, b) => {
      let compare = 0;
      switch (activitySortKey) {
        case "date":
          compare = a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
          break;
        case "type":
          compare = labelForKind(a.kind).localeCompare(labelForKind(b.kind)) || a.employeeName.localeCompare(b.employeeName);
          break;
        case "employee":
          compare = a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date);
          break;
        case "detail":
          compare = a.detail.localeCompare(b.detail) || a.employeeName.localeCompare(b.employeeName);
          break;
        case "amount":
          compare = a.amount - b.amount;
          break;
        case "meta":
          compare = (a.meta || "—").localeCompare(b.meta || "—") || a.employeeName.localeCompare(b.employeeName);
          break;
      }
      return activitySortDir === "asc" ? compare : -compare;
    });
    return rows;
  }, [activitySortDir, activitySortKey, snapshot.recentActivity]);

  const activityFilteredRows = useMemo(() => {
    if (activityActiveFilterCount === 0) return activitySortedRows;
    return activitySortedRows.filter((row) => activityPassesFilters((columnKey) => getActivityCellValue(row, columnKey as ActivityColumnKey)));
  }, [activityActiveFilterCount, activityPassesFilters, activitySortedRows, getActivityCellValue]);

  function syncTimeDerived(next: typeof timeForm) {
    const employee = snapshot.employees.find((item) => item.id === next.employeeId) ?? null;
    const rate = employee ? resolveRate(employee, next.rateType, next.rate) : Number(next.rate) || 0;
    const hours = Number(next.hours) || 0;
    return {
      ...next,
      location: next.location || employee?.location || "",
      rate: `${rate}`,
      subtotal: formatNumber(rate * hours),
    };
  }

  function resetBulkForm() {
    setBulkForm({
      date: today(),
      startTime: "08:45",
      endTime: "14:00",
      rateType: "hourly",
      rate: "0",
      location: snapshot.employees[0]?.location ?? "",
      notes: "",
      employeeIds: [],
    });
  }

  async function refreshSnapshot(nextStatus?: string) {
    await Promise.all([loadSnapshot(filters), loadAnalytics(filters)]);
    if (nextStatus) setStatus(nextStatus);
  }

  async function submitTimeEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingTime(true);
    setStatus(null);
    try {
      const response = await fetch("/api/payroll/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: timeForm.employeeId,
          date: timeForm.date,
          hours: Number(timeForm.hours),
          rateType: timeForm.rateType,
          rate: Number(timeForm.rate),
          subtotal: Number(timeForm.subtotal),
          notes: timeForm.notes,
          location: timeForm.location,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to save time entry");
      }
      await refreshSnapshot();
      const employee = selectedTimeEmployee ?? snapshot.employees[0];
      setTimeForm({
        employeeId: employee?.id ?? "",
        date: today(),
        hours: "1",
        rateType: "hourly",
        rate: `${employee?.rates.hourly ?? 0}`,
        subtotal: formatNumber(employee?.rates.hourly ?? 0),
        notes: "",
        location: employee?.location ?? "",
      });
      setStatus("Time entry saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save time entry.");
    } finally {
      setSubmittingTime(false);
    }
  }

  async function submitBulkTimeEntries(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bulkForm.employeeIds.length === 0) {
      setStatus("Select at least one employee for bulk entry.");
      return;
    }
    if (bulkHours <= 0) {
      setStatus("Bulk entry hours must be greater than zero.");
      return;
    }

    setSubmittingBulkTime(true);
    setStatus(null);
    try {
      const requests = bulkForm.employeeIds.map(async (employeeId) => {
        const employee = snapshot.employees.find((item) => item.id === employeeId);
        if (!employee) {
          throw new Error("Employee not found");
        }

        const rate = resolveRate(employee, bulkForm.rateType, bulkForm.rate);
        const response = await fetch("/api/payroll/time-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            date: bulkForm.date,
            hours: bulkHours,
            rateType: bulkForm.rateType,
            rate,
            subtotal: Number(formatNumber(rate * bulkHours)),
            notes: bulkForm.notes,
            location: bulkForm.location || employee.location,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || `Failed to save time entry for ${employee.name}`);
        }
      });

      await Promise.all(requests);
      await refreshSnapshot();
      resetBulkForm();
      setBulkMode(false);
      setStatus(`Saved ${bulkForm.employeeIds.length} bulk time entr${bulkForm.employeeIds.length === 1 ? "y" : "ies"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save bulk time entries.");
    } finally {
      setSubmittingBulkTime(false);
    }
  }

  async function submitPaymentAndReimbursement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingPayment(true);
    setStatus(null);
    try {
      const requests: Promise<Response>[] = [
        fetch("/api/payroll/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: paymentForm.employeeId,
            date: paymentForm.date,
            amount: Number(paymentForm.amount),
            method: paymentForm.method,
            notes: paymentForm.notes,
          }),
        }),
      ];

      if (Number(paymentForm.reimbursementAmount) > 0 && paymentForm.reimbursementDescription.trim()) {
        requests.push(
          fetch("/api/payroll/reimbursements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: paymentForm.employeeId,
              date: paymentForm.date,
              amount: Number(paymentForm.reimbursementAmount),
              description: paymentForm.reimbursementDescription,
            }),
          })
        );
      }

      const responses = await Promise.all(requests);
      for (const response of responses) {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "Failed to save payroll activity");
        }
      }

      await refreshSnapshot();
      const employee = selectedPaymentEmployee ?? snapshot.employees[0];
      setPaymentForm({
        employeeId: employee?.id ?? "",
        date: today(),
        amount: "",
        method: employee?.paymentMethod || "Manual",
        notes: "",
        reimbursementAmount: "",
        reimbursementDescription: "",
      });
      setStatus("Payment activity saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save payment.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function approveEmployee(employeeId: string, amount: number, approved: boolean) {
    try {
      const response = await fetch(approved ? `/api/payroll/approve?employeeId=${encodeURIComponent(employeeId)}` : "/api/payroll/approve", {
        method: approved ? "DELETE" : "POST",
        headers: approved ? undefined : { "Content-Type": "application/json" },
        body: approved ? undefined : JSON.stringify({ employeeId, amount }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to update approval status");
      }
      await refreshSnapshot(approved ? "Payment approval removed." : "Employee approved for payment.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update approval status.");
    }
  }

  async function copyPaymentHandle(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedHandle(value);
      window.setTimeout(() => setCopiedHandle((current) => current === value ? null : current), 1800);
    } catch {
      setStatus("Clipboard copy failed.");
    }
  }

  async function submitQuickPayment(input: { employeeId: string; amount: number; method: string; notes?: string }, successMessage = "Payment activity saved.") {
    setSubmittingPayment(true);
    setStatus(null);
    try {
      const response = await fetch("/api/payroll/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: input.employeeId,
          date: today(),
          amount: input.amount,
          method: input.method,
          notes: input.notes ?? "",
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to save payment");
      }
      setQueueDraftEmployeeId(null);
      await refreshSnapshot(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save payment.");
    } finally {
      setSubmittingPayment(false);
    }
  }

  async function applyFilters() {
    setFilters(draftFilters);
    await Promise.all([loadSnapshot(draftFilters), loadAnalytics(draftFilters)]);
  }

  async function clearFilters() {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    await Promise.all([loadSnapshot(emptyFilters), loadAnalytics(emptyFilters)]);
  }

  const filtersActive = Boolean(filters.startDate || filters.endDate || filters.location !== "All");

  const totalTrendValue = useMemo(
    () => Math.max(...analytics.monthlyTrend.map((row) => row.total), 1),
    [analytics.monthlyTrend]
  );

  function exportCDT() {
    const headers = ["Employee", "Location", "Department", "Ops Hours", "Coaching Hours", "Override Hours", "Gross Wages", "Reimbursements", "Total Owed", "Total Paid", "Balance"];
    const escapeCDT = (val: string) => (val.includes(",") || val.includes('"') || val.includes("\n")) ? `"${val.replace(/"/g, '""')}"` : val;
    const rows = balanceFilteredRows.map((s) => [
      escapeCDT(s.name), escapeCDT(s.location), escapeCDT(s.department),
      s.opsHours.toFixed(2), s.coachingHours.toFixed(2), s.overrideHours.toFixed(2),
      s.grossWages.toFixed(2), s.reimbursements.toFixed(2), s.totalOwed.toFixed(2),
      s.totalPaid.toFixed(2), s.balance.toFixed(2),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-balances-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createNewPeriod(event: FormEvent) {
    event.preventDefault();
    if (!newPeriodForm.name || !newPeriodForm.startDate || !newPeriodForm.endDate) return;
    try {
      const response = await fetch("/api/payroll/pay-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPeriodForm),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to create pay period");
      }
      setNewPeriodForm({ name: "", startDate: "", endDate: "" });
      await refreshSnapshot("Pay period created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create pay period.");
    }
  }

  async function togglePeriodLock(period: PayPeriod) {
    try {
      if (period.status === "open") {
        const response = await fetch("/api/payroll/pay-periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lock", id: period.id }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "Failed to lock");
        }
        await refreshSnapshot("Pay period locked.");
      } else if (period.status === "locked") {
        const response = await fetch("/api/payroll/pay-periods", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: period.id, status: "open" }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "Failed to unlock");
        }
        await refreshSnapshot("Pay period unlocked.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to update pay period.");
    }
  }

  async function markPeriodPaid(period: PayPeriod) {
    try {
      const response = await fetch("/api/payroll/pay-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markPaid", id: period.id }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to mark paid");
      }
      await refreshSnapshot("Pay period marked as paid.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to mark pay period paid.");
    }
  }

  function selectPeriodDateRange(period: PayPeriod) {
    const next = { ...draftFilters, startDate: period.startDate, endDate: period.endDate };
    setDraftFilters(next);
    setFilters(next);
    void loadSnapshot(next);
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)", marginBottom: 6 }}>Payroll</div>
            <h2 style={{ margin: 0, fontSize: 22, color: "#f8fafc", letterSpacing: "-0.02em" }}>Payroll operations</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(255,255,255,0.52)" }}>
              Track coach hours, reimbursements, and payments against the current employee roster.
            </p>
          </div>
          {status && (
            <div style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(96,165,250,0.08)",
              border: "1px solid rgba(96,165,250,0.16)",
              color: "#bfdbfe",
              fontSize: 12,
            }}>
              {status}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <SummaryCard label="Gross Payroll" value={formatMoney(snapshot.summary.grossPayroll)} accent="#f8fafc" sub={`${snapshot.summary.totalTimeEntries} time entries`} />
          <SummaryCard label="Pending Payroll" value={formatMoney(snapshot.summary.pendingPayroll)} accent="#60a5fa" sub="time + reimbursements - payments" />
          <SummaryCard label="Hours Logged" value={formatDecimal(snapshot.summary.totalHours)} accent="#4ade80" sub={filtersActive ? "filtered selection" : "current store total"} />
          <SummaryCard label="Payments Logged" value={formatMoney(snapshot.summary.totalPayments)} accent="#f59e0b" sub={filtersActive ? "filtered payout total" : "paid out so far"} />
          <SummaryCard label="Reimbursements" value={formatMoney(snapshot.summary.totalReimbursements)} accent="#f472b6" sub={filtersActive ? "filtered expenses" : "expense reimbursements"} />
        </div>


        <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ ...headerWithActionStyle, padding: 18, borderBottom: paymentQueueOpen ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <PanelHeader eyebrow="Payment Queue" title="Ready to execute payroll" />
              <span style={{ ...badgeStyle, color: "#fbbf24", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.22)", marginTop: 16 }}>
                {paymentQueueRows.length}
              </span>
            </div>
            <button type="button" onClick={() => setPaymentQueueOpen((current) => !current)} style={secondaryButtonStyle}>
              {paymentQueueOpen ? "Collapse" : "Expand"}
            </button>
          </div>
          {paymentQueueOpen && (
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              {paymentQueueRows.length === 0 ? (
                <div style={hintStyle}>No employees currently have a positive balance.</div>
              ) : (
                paymentQueueRows.map((employee) => (
                  <PaymentQueueCard
                    key={employee.employeeId}
                    employee={employee}
                    expanded={queueDraftEmployeeId === employee.employeeId}
                    submitting={submittingPayment && queueDraftEmployeeId === employee.employeeId}
                    copied={copiedHandle === employee.paymentHandle}
                    onToggleExpand={() => setQueueDraftEmployeeId((current) => current === employee.employeeId ? null : employee.employeeId)}
                    onCopyHandle={() => void copyPaymentHandle(employee.paymentHandle)}
                    onApprove={() => void approveEmployee(employee.employeeId, employee.balance, employee.approvedForPayment)}
                    onMarkPaid={() => void submitQuickPayment({ employeeId: employee.employeeId, amount: employee.balance, method: employee.paymentMethod || "Manual" }, `${employee.name} marked paid.`)}
                  />
                ))
              )}
            </div>
          )}
        </section>

        <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
          <div style={{ ...headerWithActionStyle, padding: 18, borderBottom: analyticsOpen ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <PanelHeader eyebrow="Payroll Analytics" title="Payroll Analytics" />
              <span style={{ ...badgeStyle, color: "#34d399", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.22)", marginTop: 16 }}>
                {analytics.monthlyTrend.length || analytics.locationBreakdown.rows.length}
              </span>
            </div>
            <button type="button" onClick={() => setAnalyticsOpen((current) => !current)} style={secondaryButtonStyle}>
              {analyticsOpen ? "Collapse" : "Expand"}
            </button>
          </div>
          <div style={{ maxHeight: analyticsOpen ? 2400 : 0, opacity: analyticsOpen ? 1 : 0, overflow: "hidden", transition: "max-height 280ms ease, opacity 220ms ease" }}>
            <div style={{ padding: 18, display: "grid", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <SummaryCard label="Current Month Labor" value={formatMoney(analytics.cards.currentMonthLaborCost)} accent="#f8fafc" />
                <SummaryCard label="Previous Month Labor" value={formatMoney(analytics.cards.previousMonthLaborCost)} accent="#93c5fd" />
                <SummaryCard label="MoM Change" value={`${analytics.cards.monthOverMonthDelta >= 0 ? "+" : ""}${formatMoney(analytics.cards.monthOverMonthDelta)}`} accent={analytics.cards.monthOverMonthDelta >= 0 ? "#34d399" : "#f87171"} sub={formatPercent(analytics.cards.monthOverMonthDeltaPct)} />
                <SummaryCard label="Avg Hourly Cost" value={formatMoney(analytics.cards.averageHourlyCost)} accent="#fbbf24" />
                <SummaryCard label="YTD Payroll Spend" value={formatMoney(analytics.cards.totalYtdPayrollSpend)} accent="#c084fc" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <div style={analyticsCardStyle}>
                  <PanelHeader eyebrow="Cost by Location" title="Cost by location breakdown" />
                  {analyticsLoading ? <div style={hintStyle}>Loading analytics…</div> : <LocationBreakdown rows={analytics.locationBreakdown.rows} total={analytics.locationBreakdown.total} />}
                </div>
                <div style={analyticsCardStyle}>
                  <PanelHeader eyebrow="Department Mix" title="Department cost breakdown" />
                  {analyticsLoading ? <div style={hintStyle}>Loading analytics…</div> : <DepartmentBreakdownChart rows={analytics.departmentBreakdown} />}
                </div>
              </div>

              <div style={analyticsCardStyle}>
                <PanelHeader eyebrow="Monthly Trend" title="Monthly payroll trend" />
                {analyticsLoading ? <div style={hintStyle}>Loading analytics…</div> : <MonthlyTrendChart rows={analytics.monthlyTrend} maxValue={totalTrendValue} />}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <div style={analyticsCardStyle}>
                  <PanelHeader eyebrow="Top Earners" title="Top 5 earners" />
                  <TopEarnersTable rows={analytics.topEarners} />
                </div>
                <div style={analyticsCardStyle}>
                  <PanelHeader eyebrow="Efficiency" title="Cost efficiency metrics" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <MetricCard label="Coaching $/hr" value={formatMoney(analytics.efficiency.coachingCostPerHour)} sub="Total coaching wages / hours" />
                    <MetricCard label="Ops $/hr" value={formatMoney(analytics.efficiency.opsCostPerHour)} sub="Total ops wages / hours" />
                    <MetricCard label="Coaching vs Ops" value={`${formatPercentValue(analytics.efficiency.coachingHoursPct)} / ${formatPercentValue(analytics.efficiency.opsHoursPct)}`} sub="Share of total hours" />
                    <MetricCard label="Sessions / Employee / Week" value={formatDecimal(analytics.efficiency.averageSessionsPerEmployeePerWeek)} sub="Average workload density" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={headerWithActionStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PanelHeader eyebrow="Employee Balances" title="Employee balances" />
              <span style={{ ...badgeStyle, color: "#60a5fa", background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.2)", marginTop: 16 }}>
                {balanceFilteredRows.length}
              </span>
            </div>
            <button type="button" onClick={exportCDT} style={{ ...secondaryButtonStyle, padding: "8px 12px", fontSize: 12 }}>Export CDT</button>
          </div>
          <div style={filterBarStyle}>
            <Field label="Start Date">
              <input type="date" value={draftFilters.startDate} onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))} style={inputStyle} />
            </Field>
            <Field label="End Date">
              <input type="date" value={draftFilters.endDate} onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Location">
              <select value={draftFilters.location} onChange={(event) => setDraftFilters((current) => ({ ...current, location: event.target.value }))} style={inputStyle}>
                <option value="All">All</option>
                <option value="Miami">Miami</option>
                <option value="LA">LA</option>
                <option value="Brasil">Brasil</option>
              </select>
            </Field>
            <div style={filterActionsStyle}>
              <button type="button" onClick={() => void applyFilters()} style={primaryButtonStyle}>Apply</button>
              <button type="button" onClick={() => void clearFilters()} style={secondaryButtonStyle}>Clear</button>
            </div>
          </div>
          {/* Pay Periods */}
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setPayPeriodsOpen((v) => !v)}
              style={{ ...secondaryButtonStyle, padding: "7px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ display: "inline-block", transform: payPeriodsOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}>▶</span>
              Pay Periods ({snapshot.payPeriods.length})
            </button>
            {payPeriodsOpen && (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {snapshot.payPeriods.map((period) => {
                    const entryCount = snapshot.payPeriodEntryCounts[period.id] ?? 0;
                    const statusColors: Record<PayPeriodStatus, { bg: string; border: string; text: string }> = {
                      open: { bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.2)", text: "#4ade80" },
                      locked: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", text: "#fbbf24" },
                      paid: { bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.2)", text: "#60a5fa" },
                    };
                    const colors = statusColors[period.status];
                    return (
                      <div
                        key={period.id}
                        onClick={() => selectPeriodDateRange(period)}
                        style={{ padding: "10px 14px", borderRadius: 14, background: colors.bg, border: `1px solid ${colors.border}`, cursor: "pointer", minWidth: 180 }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc" }}>{period.name}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: colors.text, padding: "2px 6px", borderRadius: 6, background: colors.bg, border: `1px solid ${colors.border}` }}>
                            {period.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                          {formatDate(period.startDate)} — {formatDate(period.endDate)} · {entryCount} entries
                        </div>
                        <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                          {(period.status === "open" || period.status === "locked") && (
                            <button type="button" onClick={() => void togglePeriodLock(period)} style={{ ...miniButtonStyle, padding: "4px 8px", fontSize: 11 }}>
                              {period.status === "open" ? "Lock" : "Unlock"}
                            </button>
                          )}
                          {period.status === "locked" && (
                            <button type="button" onClick={() => void markPeriodPaid(period)} style={{ ...miniPrimaryButtonStyle, padding: "4px 8px", fontSize: 11 }}>
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={createNewPeriod} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                  <Field label="Name">
                    <input type="text" placeholder="e.g. Mar 1–15" value={newPeriodForm.name} onChange={(e) => setNewPeriodForm((c) => ({ ...c, name: e.target.value }))} style={{ ...inputStyle, padding: "8px 10px", fontSize: 12 }} />
                  </Field>
                  <Field label="Start">
                    <input type="date" value={newPeriodForm.startDate} onChange={(e) => setNewPeriodForm((c) => ({ ...c, startDate: e.target.value }))} style={{ ...inputStyle, padding: "8px 10px", fontSize: 12 }} />
                  </Field>
                  <Field label="End">
                    <input type="date" value={newPeriodForm.endDate} onChange={(e) => setNewPeriodForm((c) => ({ ...c, endDate: e.target.value }))} style={{ ...inputStyle, padding: "8px 10px", fontSize: 12 }} />
                  </Field>
                  <button type="submit" style={{ ...primaryButtonStyle, padding: "8px 12px", fontSize: 12 }}>+ New Period</button>
                </form>
              </div>
            )}
          </div>
          {balanceActiveFilterCount > 0 && (
            <div style={activeFilterBarStyle}>
              <span style={{ fontSize: 11, color: "#4ade80" }}>{balanceActiveFilterCount} column filter{balanceActiveFilterCount > 1 ? "s" : ""} active</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>· {balanceFilteredRows.length} of {balanceSortedRows.length} shown</span>
              <button type="button" onClick={clearBalanceFilters} style={clearFilterButtonStyle}>Clear all</button>
            </div>
          )}
          {loading ? (
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading employee balances…</div>
          ) : (
            <div style={tableShellStyle}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><TableManagement columns={balanceColumns} onReorder={reorderBalanceCols} onReset={() => reorderBalanceCols(balanceDefaultColumns)} /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1240 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {balanceColumns.map((column, index) => (
                      <th key={column.key} style={{ padding: 0, textAlign: "left" }}>
                        <ColumnFilterDropdown
                          colKey={column.key}
                          label={column.label}
                          allValues={balanceColumnValues[column.key] ?? []}
                          activeFilter={balanceFilters[column.key]}
                          sortKey={balanceSortKey}
                          sortDir={balanceSortDir}
                          onSort={(key: BalanceColumnKey) => toggleBalanceSort(key)}
                          onFilter={setBalanceFilter}
                          dragProps={balanceDragHandlers(index)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {balanceFilteredRows.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ padding: "18px 16px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                        {snapshot.employeeSummaries.length === 0 ? "No employee payroll activity yet." : "No employees match the current column filters."}
                      </td>
                    </tr>
                  )}
                  {balanceFilteredRows.map((employee) => {
                    const isSelected = employee.employeeId === selectedEmployeeId;
                    return (
                      <tr
                        key={employee.employeeId}
                        onClick={() => {
                          setSelectedEmployeeId(employee.employeeId);
                          setDetailSection("time");
                        }}
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          cursor: "pointer",
                          background: isSelected ? "rgba(96,165,250,0.08)" : "transparent",
                          transition: "background 160ms ease, transform 160ms ease",
                        }}
                      >
                        {balanceColumns.map((column) => {
                          switch (column.key) {
                            case "employee":
                              return (
                                <td key={column.key} style={tableCellStyle}>
                                  <div style={{ color: "#f8fafc", fontWeight: 600 }}>{employee.name}</div>
                                  <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{employee.role}</div>
                                </td>
                              );
                            case "location":
                              return <td key={column.key} style={tableCellStyle}>{employee.location}</td>;
                            case "department":
                              return <td key={column.key} style={tableCellStyle}>{employee.department}</td>;
                            case "opsHours":
                              return <td key={column.key} style={tableCellStyle}>{formatDecimal(employee.opsHours)}</td>;
                            case "coachingHours":
                              return <td key={column.key} style={tableCellStyle}>{formatDecimal(employee.coachingHours)}</td>;
                            case "overrideHours":
                              return <td key={column.key} style={tableCellStyle}>{formatDecimal(employee.overrideHours)}</td>;
                            case "grossWages":
                              return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{formatMoney(employee.grossWages)}</td>;
                            case "reimbursements":
                              return <td key={column.key} style={tableCellStyle}>{formatMoney(employee.reimbursements)}</td>;
                            case "totalOwed":
                              return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{formatMoney(employee.totalOwed)}</td>;
                            case "totalPaid":
                              return <td key={column.key} style={tableCellStyle}>{formatMoney(employee.totalPaid)}</td>;
                            case "balance":
                              return <td key={column.key} style={{ ...tableCellStyle, ...balanceTextStyle(employee.balance), fontWeight: 700 }}>{formatMoney(employee.balance)}</td>;
                            default:
                              return null;
                          }
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                    {balanceColumns.map((column) => {
                      switch (column.key) {
                        case "employee":
                          return (
                            <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>
                              Total
                              <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>
                                {balanceFilteredRows.length} employees in view
                              </div>
                            </td>
                          );
                        case "location":
                        case "department":
                          return <td key={column.key} style={tableCellStyle}>—</td>;
                        case "opsHours":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatDecimal(employeeSummaryTotals.opsHours)}</td>;
                        case "coachingHours":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatDecimal(employeeSummaryTotals.coachingHours)}</td>;
                        case "overrideHours":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatDecimal(employeeSummaryTotals.overrideHours)}</td>;
                        case "grossWages":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(employeeSummaryTotals.grossWages)}</td>;
                        case "reimbursements":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(employeeSummaryTotals.reimbursements)}</td>;
                        case "totalOwed":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(employeeSummaryTotals.totalOwed)}</td>;
                        case "totalPaid":
                          return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(employeeSummaryTotals.totalPaid)}</td>;
                        case "balance":
                          return <td key={column.key} style={{ ...tableCellStyle, ...balanceTextStyle(employeeSummaryTotals.balance), fontWeight: 700 }}>{formatMoney(employeeSummaryTotals.balance)}</td>;
                        default:
                          return null;
                      }
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)", gap: 16 }}>
          <section style={panelStyle}>
            <div style={headerWithActionStyle}>
              <PanelHeader eyebrow="Time Entry" title={bulkMode ? "Bulk time entry" : "Log payable hours"} />
              <button
                type="button"
                onClick={() => {
                  if (bulkMode) {
                    resetBulkForm();
                    setBulkMode(false);
                    return;
                  }
                  setBulkMode(true);
                }}
                style={bulkMode ? primaryButtonStyle : secondaryButtonStyle}
              >
                {bulkMode ? "Bulk Entry On" : "Bulk Entry"}
              </button>
            </div>
            {bulkMode ? (
              <form onSubmit={submitBulkTimeEntries} style={{ display: "grid", gap: 12 }}>
                <div style={twoColGrid}>
                  <Field label="Date">
                    <input type="date" value={bulkForm.date} onChange={(event) => setBulkForm((current) => ({ ...current, date: event.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Location">
                    <input type="text" value={bulkForm.location} onChange={(event) => setBulkForm((current) => ({ ...current, location: event.target.value }))} style={inputStyle} />
                  </Field>
                </div>
                <div style={threeColGrid}>
                  <Field label="Start Time">
                    <input type="time" value={bulkForm.startTime} onChange={(event) => setBulkForm((current) => ({ ...current, startTime: event.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="End Time">
                    <input type="time" value={bulkForm.endTime} onChange={(event) => setBulkForm((current) => ({ ...current, endTime: event.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Hours">
                    <input type="number" value={formatNumber(bulkHours)} readOnly style={{ ...inputStyle, color: "#f8fafc" }} />
                  </Field>
                </div>
                <div style={twoColGrid}>
                  <Field label="Rate Type">
                    <select
                      value={bulkForm.rateType}
                      onChange={(event) => setBulkForm((current) => ({ ...current, rateType: event.target.value as PayrollRateType }))}
                      style={inputStyle}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="coaching">Coaching</option>
                      <option value="override">Override</option>
                    </select>
                  </Field>
                  <Field label="Rate Override">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={bulkForm.rate}
                      onChange={(event) => setBulkForm((current) => ({ ...current, rate: event.target.value }))}
                      disabled={bulkForm.rateType !== "override"}
                      style={{ ...inputStyle, opacity: bulkForm.rateType !== "override" ? 0.75 : 1 }}
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={bulkForm.notes} onChange={(event) => setBulkForm((current) => ({ ...current, notes: event.target.value }))} rows={3} style={textareaStyle} />
                </Field>
                <div style={hintStyle}>
                  Example block: 8:45 AM to 2:00 PM = {formatNumber(calculateHoursFromTimes("08:45", "14:00"))} hours.
                </div>
                <Field label="Employees">
                  <div style={checklistShellStyle}>
                    <div style={checklistActionRowStyle}>
                      <button type="button" onClick={() => setBulkForm((current) => ({ ...current, employeeIds: snapshot.employees.map((employee) => employee.id) }))} style={miniButtonStyle}>Select all</button>
                      <button type="button" onClick={() => setBulkForm((current) => ({ ...current, employeeIds: [] }))} style={miniButtonStyle}>Clear</button>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{bulkForm.employeeIds.length} selected</span>
                    </div>
                    <div style={employeeChecklistGridStyle}>
                      {snapshot.employees.map((employee) => {
                        const checked = bulkForm.employeeIds.includes(employee.id);
                        return (
                          <label key={employee.id} style={{ ...employeeChecklistItemStyle, border: checked ? "1px solid rgba(74,222,128,0.24)" : "1px solid rgba(255,255,255,0.08)", background: checked ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.02)" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setBulkForm((current) => ({
                                ...current,
                                employeeIds: checked
                                  ? current.employeeIds.filter((id) => id !== employee.id)
                                  : [...current.employeeIds, employee.id],
                              }))}
                              style={{ accentColor: "#4ade80", width: 15, height: 15, marginTop: 2 }}
                            />
                            <span>
                              <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 600 }}>{employee.name}</div>
                              <div style={{ marginTop: 3, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{employee.role} · {employee.location}</div>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </Field>
                <div style={formActionRowStyle}>
                  <button type="submit" disabled={submittingBulkTime || bulkForm.employeeIds.length === 0 || bulkHours <= 0} style={primaryButtonStyle}>
                    {submittingBulkTime ? "Submitting..." : "Submit All"}
                  </button>
                  <button type="button" onClick={() => { resetBulkForm(); setBulkMode(false); }} style={secondaryButtonStyle}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitTimeEntry} style={{ display: "grid", gap: 12 }}>
                <EmployeeSelect
                  label="Employee"
                  value={timeForm.employeeId}
                  employees={snapshot.employees}
                  onChange={(employeeId) => {
                    const employee = snapshot.employees.find((item) => item.id === employeeId) ?? null;
                    setTimeForm((current) => syncTimeDerived({
                      ...current,
                      employeeId,
                      location: employee?.location ?? current.location,
                    }));
                  }}
                />
                <div style={twoColGrid}>
                  <Field label="Date">
                    <input type="date" value={timeForm.date} onChange={(event) => setTimeForm((current) => ({ ...current, date: event.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="Hours">
                    <input type="number" min="0" step="0.25" value={timeForm.hours} onChange={(event) => setTimeForm((current) => syncTimeDerived({ ...current, hours: event.target.value }))} style={inputStyle} />
                  </Field>
                </div>
                <div style={twoColGrid}>
                  <Field label="Rate Type">
                    <select
                      value={timeForm.rateType}
                      onChange={(event) => setTimeForm((current) => syncTimeDerived({ ...current, rateType: event.target.value as PayrollRateType }))}
                      style={inputStyle}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="coaching">Coaching</option>
                      <option value="override">Override</option>
                    </select>
                  </Field>
                  <Field label="Rate">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={timeForm.rate}
                      onChange={(event) => setTimeForm((current) => syncTimeDerived({ ...current, rate: event.target.value }))}
                      disabled={timeForm.rateType !== "override"}
                      style={{ ...inputStyle, opacity: timeForm.rateType !== "override" ? 0.75 : 1 }}
                    />
                  </Field>
                </div>
                <div style={twoColGrid}>
                  <Field label="Subtotal">
                    <input type="number" value={timeForm.subtotal} readOnly style={{ ...inputStyle, color: "#f8fafc" }} />
                  </Field>
                  <Field label="Location">
                    <input type="text" value={timeForm.location} onChange={(event) => setTimeForm((current) => ({ ...current, location: event.target.value }))} style={inputStyle} />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea value={timeForm.notes} onChange={(event) => setTimeForm((current) => ({ ...current, notes: event.target.value }))} rows={3} style={textareaStyle} />
                </Field>
                {selectedTimeEmployee && (
                  <div style={hintStyle}>
                    Default rates for {selectedTimeEmployee.name}: hourly {formatMoney(selectedTimeEmployee.rates.hourly)}, coaching {formatMoney(selectedTimeEmployee.rates.coaching)}.
                  </div>
                )}
                <button type="submit" disabled={submittingTime || !timeForm.employeeId} style={primaryButtonStyle}>
                  {submittingTime ? "Saving..." : "Save time entry"}
                </button>
              </form>
            )}
          </section>

          <section style={panelStyle}>
            <PanelHeader eyebrow="Payments" title="Log payment activity" />
            <form onSubmit={submitPaymentAndReimbursement} style={{ display: "grid", gap: 12 }}>
              <EmployeeSelect
                label="Employee"
                value={paymentForm.employeeId}
                employees={snapshot.employees}
                onChange={(employeeId) => {
                  const employee = snapshot.employees.find((item) => item.id === employeeId) ?? null;
                  setPaymentForm((current) => ({
                    ...current,
                    employeeId,
                    method: employee?.paymentMethod || current.method || "Manual",
                  }));
                }}
              />
              <div style={twoColGrid}>
                <Field label="Date">
                  <input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm((current) => ({ ...current, date: event.target.value }))} style={inputStyle} />
                </Field>
                <Field label="Amount">
                  <input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} style={inputStyle} />
                </Field>
              </div>
              <div style={twoColGrid}>
                <Field label="Method">
                  <input type="text" value={paymentForm.method} onChange={(event) => setPaymentForm((current) => ({ ...current, method: event.target.value }))} style={inputStyle} />
                </Field>
                <Field label="Notes">
                  <input type="text" value={paymentForm.notes} onChange={(event) => setPaymentForm((current) => ({ ...current, notes: event.target.value }))} style={inputStyle} />
                </Field>
              </div>
              <div style={{ ...sectionDividerStyle, marginTop: 4 }}>Optional reimbursement</div>
              <div style={twoColGrid}>
                <Field label="Reimbursement Amount">
                  <input type="number" min="0" step="0.01" value={paymentForm.reimbursementAmount} onChange={(event) => setPaymentForm((current) => ({ ...current, reimbursementAmount: event.target.value }))} style={inputStyle} />
                </Field>
                <Field label="Description">
                  <input type="text" value={paymentForm.reimbursementDescription} onChange={(event) => setPaymentForm((current) => ({ ...current, reimbursementDescription: event.target.value }))} style={inputStyle} />
                </Field>
              </div>
              {selectedPaymentEmployee && (
                <div style={hintStyle}>
                  Preferred payout method: {selectedPaymentEmployee.paymentMethod || "Not set"}.
                </div>
              )}
              <button type="submit" disabled={submittingPayment || !paymentForm.employeeId} style={primaryButtonStyle}>
                {submittingPayment ? "Saving..." : "Save payment activity"}
              </button>
            </form>
          </section>
        </div>

        <section style={panelStyle}>
          <PanelHeader eyebrow="Recent Activity" title="Latest payroll records" />
          {activityActiveFilterCount > 0 && (
            <div style={activeFilterBarStyle}>
              <span style={{ fontSize: 11, color: "#4ade80" }}>{activityActiveFilterCount} column filter{activityActiveFilterCount > 1 ? "s" : ""} active</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>· {activityFilteredRows.length} of {activitySortedRows.length} shown</span>
              <button type="button" onClick={clearActivityFilters} style={clearFilterButtonStyle}>Clear all</button>
            </div>
          )}
          {loading ? (
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading payroll activity…</div>
          ) : (
            <div style={tableShellStyle}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}><TableManagement columns={activityColumns} onReorder={reorderActivityCols} onReset={() => reorderActivityCols(activityDefaultColumns)} /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {activityColumns.map((column, index) => (
                      <th key={column.key} style={{ padding: 0, textAlign: "left" }}>
                        <ColumnFilterDropdown
                          colKey={column.key}
                          label={column.label}
                          allValues={activityColumnValues[column.key] ?? []}
                          activeFilter={activityFilters[column.key]}
                          sortKey={activitySortKey}
                          sortDir={activitySortDir}
                          onSort={(key: ActivityColumnKey) => toggleActivitySort(key)}
                          onFilter={setActivityFilter}
                          dragProps={activityDragHandlers(index)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activityFilteredRows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: "18px 16px", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                        {snapshot.recentActivity.length === 0 ? "No payroll records yet." : "No activity rows match the current column filters."}
                      </td>
                    </tr>
                  )}
                  {activityFilteredRows.map((row) => (
                    <tr key={row.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {activityColumns.map((column) => {
                        switch (column.key) {
                          case "date":
                            return <td key={column.key} style={tableCellStyle}>{formatDate(row.date)}</td>;
                          case "type":
                            return <td key={column.key} style={tableCellStyle}><span style={activityPillStyle(row.kind)}>{labelForKind(row.kind)}</span></td>;
                          case "employee":
                            return <td key={column.key} style={tableCellStyle}><div style={{ color: "#f8fafc", fontWeight: 500 }}>{row.employeeName}</div></td>;
                          case "detail":
                            return <td key={column.key} style={tableCellStyle}>{row.detail}</td>;
                          case "amount":
                            return <td key={column.key} style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{formatMoney(row.amount)}</td>;
                          case "meta":
                            return <td key={column.key} style={tableCellStyle}>{row.meta || "—"}</td>;
                          default:
                            return null;
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {lastUpdated && (
          <div style={{ textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
            Last updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      <EmployeeDetailDrawer
        employee={selectedEmployee}
        summary={selectedEmployeeSummary}
        timeEntries={selectedEmployeeTimeEntries}
        payments={selectedEmployeePayments}
        reimbursements={selectedEmployeeReimbursements}
        activeSection={detailSection}
        coachingMismatchWarning={coachingMismatchWarning}
        employees={snapshot.employees}
        onSectionChange={setDetailSection}
        onClose={() => setSelectedEmployeeId(null)}
        onRefresh={(message) => void refreshSnapshot(message)}
        onCopyHandle={(value) => void copyPaymentHandle(value)}
        copiedHandle={copiedHandle}
      />
    </>
  );
}

function EmployeeDetailDrawer({
  employee,
  summary,
  timeEntries,
  payments,
  reimbursements,
  activeSection,
  coachingMismatchWarning,
  employees,
  onSectionChange,
  onClose,
  onRefresh,
  onCopyHandle,
  copiedHandle,
}: {
  employee: PayrollEmployee | null;
  summary: PayrollEmployeeSummary | null;
  timeEntries: PayrollTimeEntry[];
  payments: PayrollPayment[];
  reimbursements: PayrollReimbursement[];
  activeSection: DetailSection;
  coachingMismatchWarning: boolean;
  employees: PayrollEmployee[];
  onSectionChange: (section: DetailSection) => void;
  onClose: () => void;
  onRefresh: (message?: string) => void;
  onCopyHandle: (value: string) => void;
  copiedHandle: string | null;
}) {
  const [editing, setEditing] = useState<{ kind: EditKind; id: string } | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ kind: EditKind; id: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPaySubmitting, setQuickPaySubmitting] = useState(false);

  if (!employee || !summary) return null;

  const timeSubtotal = timeEntries.reduce((sum, entry) => sum + entry.subtotal, 0);
  const paymentTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const reimbursementTotal = reimbursements.reduce((sum, item) => sum + item.amount, 0);

  const startEditingTime = (entry: PayrollTimeEntry) => {
    setDeleting(null);
    setEditing({ kind: "time", id: entry.id });
    setEditForm({
      date: entry.date,
      hours: `${entry.hours}`,
      rateType: entry.rateType,
      rate: `${entry.rate}`,
      subtotal: formatNumber(entry.subtotal),
      notes: entry.notes,
      location: entry.location,
    });
  };

  const startEditingPayment = (payment: PayrollPayment) => {
    setDeleting(null);
    setEditing({ kind: "payments", id: payment.id });
    setEditForm({
      date: payment.date,
      amount: `${payment.amount}`,
      method: payment.method,
      notes: payment.notes,
    });
  };

  const startEditingReimbursement = (item: PayrollReimbursement) => {
    setDeleting(null);
    setEditing({ kind: "reimbursements", id: item.id });
    setEditForm({
      date: item.date,
      amount: `${item.amount}`,
      description: item.description,
    });
  };

  const cancelEditing = () => {
    setEditing(null);
    setEditForm(null);
  };

  const employeeRecord = employees.find((item) => item.id === employee.id) ?? employee;

  function syncTimeEdit(next: TimeEntryEditForm) {
    const rate = resolveRate(employeeRecord, next.rateType, next.rate);
    const hours = Number(next.hours) || 0;
    return {
      ...next,
      rate: `${rate}`,
      subtotal: formatNumber(rate * hours),
    };
  }

  async function saveEdit() {
    if (!editing || !editForm || !employee) return;
    setSavingId(editing.id);
    try {
      if (editing.kind === "time") {
        const form = editForm as TimeEntryEditForm;
        const response = await fetch("/api/payroll/time-entries", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            employeeId: employee.id,
            date: form.date,
            hours: Number(form.hours),
            rateType: form.rateType,
            rate: Number(form.rate),
            subtotal: Number(form.subtotal),
            notes: form.notes,
            location: form.location,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "Failed to update time entry");
        }
        cancelEditing();
        onRefresh("Time entry updated.");
        return;
      }

      if (editing.kind === "payments") {
        const form = editForm as PaymentEditForm;
        const response = await fetch("/api/payroll/payments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            employeeId: employee.id,
            date: form.date,
            amount: Number(form.amount),
            method: form.method,
            notes: form.notes,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error || "Failed to update payment");
        }
        cancelEditing();
        onRefresh("Payment updated.");
        return;
      }

      const form = editForm as ReimbursementEditForm;
      const response = await fetch("/api/payroll/reimbursements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          employeeId: employee.id,
          date: form.date,
          amount: Number(form.amount),
          description: form.description,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to update reimbursement");
      }
      cancelEditing();
      onRefresh("Reimbursement updated.");
    } catch (error) {
      onRefresh(error instanceof Error ? error.message : "Failed to update entry.");
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete(kind: EditKind, id: string) {
    setDeletingId(id);
    try {
      const route = kind === "time"
        ? `/api/payroll/time-entries?id=${encodeURIComponent(id)}`
        : kind === "payments"
          ? `/api/payroll/payments?id=${encodeURIComponent(id)}`
          : `/api/payroll/reimbursements?id=${encodeURIComponent(id)}`;

      const response = await fetch(route, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete entry");
      }

      if (editing?.id === id) cancelEditing();
      setDeleting(null);
      onRefresh(kind === "time" ? "Time entry deleted." : kind === "payments" ? "Payment deleted." : "Reimbursement deleted.");
    } catch (error) {
      onRefresh(error instanceof Error ? error.message : "Failed to delete entry.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <button type="button" aria-label="Close employee detail panel" onClick={onClose} style={drawerOverlayStyle} />
      <aside style={drawerStyle}>
        <div style={drawerHeaderStyle}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.38)", marginBottom: 8 }}>
              Employee Detail
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 28, color: "#f8fafc", letterSpacing: "-0.03em" }}>{employee.name}</h3>
              {summary.balance > 500 && <Badge tone="danger">High Balance</Badge>}
              {coachingMismatchWarning && <Badge tone="warning">⚠️ Coaching rate mismatch</Badge>}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", color: "rgba(255,255,255,0.56)", fontSize: 13 }}>
              <span>{employee.role}</span>
              <span style={metaDividerStyle}>•</span>
              <span>{employee.department}</span>
              <span style={metaDividerStyle}>•</span>
              <span>{employee.location}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle}>
            ×
          </button>
        </div>

        <div style={drawerBodyStyle}>
          <div style={drawerCardStyle}>
            <div style={detailGridStyle}>
              <DetailStat label="Hourly Rate" value={formatRate(employee.rates.hourly)} />
              <DetailStat label="Coaching Rate" value={formatRate(employee.rates.coaching)} />
              <DetailStat label="Payment Method" value={employee.paymentMethod || "Not set"} />
              <DetailStat label="Handle" value={employee.paymentHandle || "Not set"} />
            </div>
          </div>

          <div style={drawerCardStyle}>
            <div style={summaryGridStyle}>
              <SummaryChip label="Total Owed" value={formatMoney(summary.totalOwed)} color="#f8fafc" />
              <SummaryChip label="Total Paid" value={formatMoney(summary.totalPaid)} color="#60a5fa" />
              <SummaryChip label="Current Balance" value={formatMoney(summary.balance)} color={balanceTextStyle(summary.balance).color || "#4ade80"} />
            </div>
          </div>

          {summary.balance > 0 && (
            <QuickPayCard
              employee={summary}
              copied={copiedHandle === summary.paymentHandle}
              expanded={quickPayOpen}
              submitting={quickPaySubmitting}
              onToggleExpand={() => setQuickPayOpen((current) => !current)}
              onCopyHandle={() => onCopyHandle(summary.paymentHandle)}
              onApprove={async () => {
                try {
                  const response = await fetch(summary.approvedForPayment ? `/api/payroll/approve?employeeId=${encodeURIComponent(summary.employeeId)}` : "/api/payroll/approve", {
                    method: summary.approvedForPayment ? "DELETE" : "POST",
                    headers: summary.approvedForPayment ? undefined : { "Content-Type": "application/json" },
                    body: summary.approvedForPayment ? undefined : JSON.stringify({ employeeId: summary.employeeId, amount: summary.balance }),
                  });
                  if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.error || "Failed to update approval status");
                  }
                  onRefresh(summary.approvedForPayment ? "Payment approval removed." : "Employee approved for payment.");
                } catch (error) {
                  onRefresh(error instanceof Error ? error.message : "Failed to update approval status.");
                }
              }}
              onMarkPaid={async () => {
                setQuickPaySubmitting(true);
                try {
                  const response = await fetch("/api/payroll/payments", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      employeeId: summary.employeeId,
                      date: today(),
                      amount: summary.balance,
                      method: summary.paymentMethod || "Manual",
                      notes: "",
                    }),
                  });
                  if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.error || "Failed to save payment");
                  }
                  setQuickPayOpen(false);
                  onRefresh(`${summary.name} marked paid.`);
                } catch (error) {
                  onRefresh(error instanceof Error ? error.message : "Failed to save payment.");
                } finally {
                  setQuickPaySubmitting(false);
                }
              }}
            />
          )}

          {coachingMismatchWarning && (
            <div style={warningCardStyle}>
              This employee has coaching-capable rates, and at least one hourly entry looks like coaching work based on the notes. Review those logs before payroll goes out.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <SectionToggle active={activeSection === "time"} onClick={() => onSectionChange("time")}>
              Time Entries ({timeEntries.length})
            </SectionToggle>
            <SectionToggle active={activeSection === "payments"} onClick={() => onSectionChange("payments")}>
              Payments ({payments.length})
            </SectionToggle>
            <SectionToggle active={activeSection === "reimbursements"} onClick={() => onSectionChange("reimbursements")}>
              Reimbursements ({reimbursements.length})
            </SectionToggle>
          </div>

          {activeSection === "time" && (
            <DrawerTableCard title="Time Entries" emptyLabel="No time entries yet." hasRows={timeEntries.length > 0}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                    {["Date", "Hours", "Rate Type", "Rate", "Subtotal", "Notes", "Location", "Actions"].map((label) => (
                      <th key={label} style={tableHeadStyle}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeEntries.map((entry) => {
                    const isEditing = editing?.kind === "time" && editing.id === entry.id;
                    const isDeleting = deleting?.kind === "time" && deleting.id === entry.id;
                    const form = isEditing ? editForm as TimeEntryEditForm : null;
                    return (
                      <tr key={entry.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {isEditing && form ? (
                          <>
                            <td style={tableCellStyle}><input type="date" value={form.date} onChange={(event) => setEditForm(syncTimeEdit({ ...form, date: event.target.value }))} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="number" min="0" step="0.25" value={form.hours} onChange={(event) => setEditForm(syncTimeEdit({ ...form, hours: event.target.value }))} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}>
                              <select value={form.rateType} onChange={(event) => setEditForm(syncTimeEdit({ ...form, rateType: event.target.value as PayrollRateType }))} style={compactInputStyle}>
                                <option value="hourly">Hourly</option>
                                <option value="coaching">Coaching</option>
                                <option value="override">Override</option>
                              </select>
                            </td>
                            <td style={tableCellStyle}><input type="number" min="0" step="0.01" value={form.rate} disabled={form.rateType !== "override"} onChange={(event) => setEditForm(syncTimeEdit({ ...form, rate: event.target.value }))} style={{ ...compactInputStyle, opacity: form.rateType !== "override" ? 0.75 : 1 }} /></td>
                            <td style={tableCellStyle}><input type="number" value={form.subtotal} readOnly style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="text" value={form.notes} onChange={(event) => setEditForm({ ...form, notes: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="text" value={form.location} onChange={(event) => setEditForm({ ...form, location: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}>
                              <div style={rowActionsStyle}>
                                <button type="button" onClick={() => void saveEdit()} disabled={savingId === entry.id} style={miniPrimaryButtonStyle}>{savingId === entry.id ? "Saving..." : "Save"}</button>
                                <button type="button" onClick={cancelEditing} style={miniButtonStyle}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={tableCellStyle}>{formatDate(entry.date)}</td>
                            <td style={tableCellStyle}>{formatDecimal(entry.hours)}</td>
                            <td style={tableCellStyle}>{capitalize(entry.rateType)}</td>
                            <td style={tableCellStyle}>{formatMoney(entry.rate)}</td>
                            <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{formatMoney(entry.subtotal)}</td>
                            <td style={tableCellStyle}>{entry.notes || "—"}</td>
                            <td style={tableCellStyle}>{entry.location || "—"}</td>
                            <td style={tableCellStyle}>
                              {isDeleting ? (
                                <InlineDeleteConfirm
                                  busy={deletingId === entry.id}
                                  onConfirm={() => void confirmDelete("time", entry.id)}
                                  onCancel={() => setDeleting(null)}
                                />
                              ) : (
                                <RowActions
                                  onEdit={() => startEditingTime(entry)}
                                  onDelete={() => {
                                    cancelEditing();
                                    setDeleting({ kind: "time", id: entry.id });
                                  }}
                                />
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={drawerFootRowStyle}>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>Subtotal</td>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatDecimal(timeEntries.reduce((sum, entry) => sum + entry.hours, 0))}</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(timeSubtotal)}</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={tableCellStyle}>—</td>
                  </tr>
                </tfoot>
              </table>
            </DrawerTableCard>
          )}

          {activeSection === "payments" && (
            <DrawerTableCard title="Payments" emptyLabel="No payments yet." hasRows={payments.length > 0}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                    {["Date", "Amount", "Method", "Notes", "Actions"].map((label) => (
                      <th key={label} style={tableHeadStyle}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const isEditing = editing?.kind === "payments" && editing.id === payment.id;
                    const isDeleting = deleting?.kind === "payments" && deleting.id === payment.id;
                    const form = isEditing ? editForm as PaymentEditForm : null;
                    return (
                      <tr key={payment.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {isEditing && form ? (
                          <>
                            <td style={tableCellStyle}><input type="date" value={form.date} onChange={(event) => setEditForm({ ...form, date: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setEditForm({ ...form, amount: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="text" value={form.method} onChange={(event) => setEditForm({ ...form, method: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="text" value={form.notes} onChange={(event) => setEditForm({ ...form, notes: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}>
                              <div style={rowActionsStyle}>
                                <button type="button" onClick={() => void saveEdit()} disabled={savingId === payment.id} style={miniPrimaryButtonStyle}>{savingId === payment.id ? "Saving..." : "Save"}</button>
                                <button type="button" onClick={cancelEditing} style={miniButtonStyle}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={tableCellStyle}>{formatDate(payment.date)}</td>
                            <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{formatMoney(payment.amount)}</td>
                            <td style={tableCellStyle}>{payment.method}</td>
                            <td style={tableCellStyle}>{payment.notes || "—"}</td>
                            <td style={tableCellStyle}>
                              {isDeleting ? (
                                <InlineDeleteConfirm
                                  busy={deletingId === payment.id}
                                  onConfirm={() => void confirmDelete("payments", payment.id)}
                                  onCancel={() => setDeleting(null)}
                                />
                              ) : (
                                <RowActions
                                  onEdit={() => startEditingPayment(payment)}
                                  onDelete={() => {
                                    cancelEditing();
                                    setDeleting({ kind: "payments", id: payment.id });
                                  }}
                                />
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={drawerFootRowStyle}>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>Total</td>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(paymentTotal)}</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={tableCellStyle}>—</td>
                  </tr>
                </tfoot>
              </table>
            </DrawerTableCard>
          )}

          {activeSection === "reimbursements" && (
            <DrawerTableCard title="Reimbursements" emptyLabel="No reimbursements yet." hasRows={reimbursements.length > 0}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                    {["Date", "Amount", "Description", "Actions"].map((label) => (
                      <th key={label} style={tableHeadStyle}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reimbursements.map((item) => {
                    const isEditing = editing?.kind === "reimbursements" && editing.id === item.id;
                    const isDeleting = deleting?.kind === "reimbursements" && deleting.id === item.id;
                    const form = isEditing ? editForm as ReimbursementEditForm : null;
                    return (
                      <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        {isEditing && form ? (
                          <>
                            <td style={tableCellStyle}><input type="date" value={form.date} onChange={(event) => setEditForm({ ...form, date: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setEditForm({ ...form, amount: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}><input type="text" value={form.description} onChange={(event) => setEditForm({ ...form, description: event.target.value })} style={compactInputStyle} /></td>
                            <td style={tableCellStyle}>
                              <div style={rowActionsStyle}>
                                <button type="button" onClick={() => void saveEdit()} disabled={savingId === item.id} style={miniPrimaryButtonStyle}>{savingId === item.id ? "Saving..." : "Save"}</button>
                                <button type="button" onClick={cancelEditing} style={miniButtonStyle}>Cancel</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={tableCellStyle}>{formatDate(item.date)}</td>
                            <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{formatMoney(item.amount)}</td>
                            <td style={tableCellStyle}>{item.description}</td>
                            <td style={tableCellStyle}>
                              {isDeleting ? (
                                <InlineDeleteConfirm
                                  busy={deletingId === item.id}
                                  onConfirm={() => void confirmDelete("reimbursements", item.id)}
                                  onCancel={() => setDeleting(null)}
                                />
                              ) : (
                                <RowActions
                                  onEdit={() => startEditingReimbursement(item)}
                                  onDelete={() => {
                                    cancelEditing();
                                    setDeleting({ kind: "reimbursements", id: item.id });
                                  }}
                                />
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={drawerFootRowStyle}>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>Total</td>
                    <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(reimbursementTotal)}</td>
                    <td style={tableCellStyle}>—</td>
                    <td style={tableCellStyle}>—</td>
                  </tr>
                </tfoot>
              </table>
            </DrawerTableCard>
          )}
        </div>
      </aside>
    </>
  );
}

function DrawerTableCard({ title, emptyLabel, hasRows, children }: { title: string; emptyLabel: string; hasRows: boolean; children: ReactNode }) {
  return (
    <div style={drawerCardStyle}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h4 style={{ margin: 0, fontSize: 15, color: "#f8fafc" }}>{title}</h4>
      </div>
      <div style={{ overflowX: "auto" }}>
        {hasRows ? children : <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>{emptyLabel}</div>}
      </div>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div style={rowActionsStyle}>
      <button type="button" onClick={onEdit} style={miniButtonStyle}>✏️</button>
      <button type="button" onClick={onDelete} style={miniDangerButtonStyle}>🗑️</button>
    </div>
  );
}

function InlineDeleteConfirm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={inlineConfirmStyle}>
      <div style={{ fontSize: 11, color: "#fecaca" }}>Delete this entry?</div>
      <div style={rowActionsStyle}>
        <button type="button" onClick={onConfirm} disabled={busy} style={miniDangerButtonStyle}>{busy ? "Deleting..." : "Delete"}</button>
        <button type="button" onClick={onCancel} style={miniButtonStyle}>Cancel</button>
      </div>
    </div>
  );
}

function EmployeeSelect({
  label,
  value,
  employees,
  onChange,
}: {
  label: string;
  value: string;
  employees: PayrollEmployee[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle}>
        {!value && <option value="">Select employee</option>}
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name} · {employee.role}
          </option>
        ))}
      </select>
    </Field>
  );
}

function PanelHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.38)", marginBottom: 6 }}>{eyebrow}</div>
      <h3 style={{ margin: 0, fontSize: 16, color: "#f8fafc" }}>{title}</h3>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.48)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
  return (
    <div style={{
      borderRadius: 16,
      padding: 16,
      background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, lineHeight: 1, color: accent, fontWeight: 700, letterSpacing: "-0.03em" }}>{value}</div>
      {sub && <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{sub}</div>}
    </div>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={summaryChipStyle}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.42)" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={metricCardStyle}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.42)" }}>{label}</div>
      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, color: "#f8fafc" }}>{value}</div>
      {sub ? <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{sub}</div> : null}
    </div>
  );
}

function LocationBreakdown({ rows, total }: { rows: PayrollAnalyticsLocationRow[]; total: PayrollAnalyticsLocationRow }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row) => (
          <div key={row.location} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "#e2e8f0" }}>
              <span>{row.location}</span>
              <span>{formatMoney(row.grossWages)} · {formatPercentValue(row.shareOfTotal)}</span>
            </div>
            <div style={analyticsBarTrackStyle}>
              <div style={{ ...analyticsBarFillStyle, width: `${Math.max(row.shareOfTotal * 100, row.grossWages > 0 ? 8 : 0)}%`, background: locationColor(row.location) }} />
            </div>
          </div>
        ))}
      </div>
      <div style={tableShellStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              {["Location", "Hours", "Gross Wages", "Payments", "Balance", "Avg $/hr"].map((label) => <th key={label} style={tableHeadStyle}>{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.location} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={tableCellStyle}>{row.location}</td>
                <td style={tableCellStyle}>{formatDecimal(row.hours)}</td>
                <td style={tableCellStyle}>{formatMoney(row.grossWages)}</td>
                <td style={tableCellStyle}>{formatMoney(row.payments)}</td>
                <td style={{ ...tableCellStyle, ...balanceTextStyle(row.balance) }}>{formatMoney(row.balance)}</td>
                <td style={tableCellStyle}>{formatMoney(row.avgHourlyCost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={drawerFootRowStyle}>
              <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>Total</td>
              <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatDecimal(total.hours)}</td>
              <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(total.grossWages)}</td>
              <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(total.payments)}</td>
              <td style={{ ...tableCellStyle, ...balanceTextStyle(total.balance), fontWeight: 700 }}>{formatMoney(total.balance)}</td>
              <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 700 }}>{formatMoney(total.avgHourlyCost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DepartmentBreakdownChart({ rows }: { rows: PayrollAnalyticsDepartmentRow[] }) {
  const stops = rows.reduce<{ gradient: string[]; legend: PayrollAnalyticsDepartmentRow[]; cursor: number }>((acc, row) => {
    const next = acc.cursor + row.shareOfTotal * 100;
    acc.gradient.push(`${departmentColor(row.department)} ${acc.cursor}% ${next}%`);
    acc.cursor = next;
    acc.legend.push(row);
    return acc;
  }, { gradient: [], legend: [], cursor: 0 });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ ...departmentPieStyle, background: `conic-gradient(${stops.gradient.join(", ") || "rgba(148,163,184,0.2) 0 100%"})` }}>
          <div style={departmentPieInnerStyle} />
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.department} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "#e2e8f0" }}>
              <span>{row.department}</span>
              <span>{formatMoney(row.amount)} · {formatPercentValue(row.shareOfTotal)}</span>
            </div>
            <div style={analyticsBarTrackStyle}>
              <div style={{ ...analyticsBarFillStyle, width: `${Math.max(row.shareOfTotal * 100, row.amount > 0 ? 6 : 0)}%`, background: departmentColor(row.department) }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyTrendChart({ rows, maxValue }: { rows: PayrollAnalyticsMonthRow[]; maxValue: number }) {
  if (!rows.length) return <div style={hintStyle}>No monthly payroll trend yet.</div>;

  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100;
    const y = 100 - ((row.total / maxValue) * 100);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ position: "relative", paddingTop: 28, paddingBottom: 28 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          <polyline points={points} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, minmax(80px, 1fr))`, alignItems: "end", gap: 12, minHeight: 240 }}>
          {rows.map((row) => {
            const miamiHeight = (row.locations.Miami ?? 0) / maxValue * 160;
            const laHeight = (row.locations.LA ?? 0) / maxValue * 160;
            const brasilHeight = (row.locations.Brasil ?? 0) / maxValue * 160;
            return (
              <div key={row.month} style={{ display: "grid", gap: 8, alignItems: "end" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>{formatMoney(row.total)}</div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", minHeight: 170 }}>
                  <div style={{ width: 48, display: "flex", flexDirection: "column-reverse", borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ height: brasilHeight, background: locationColor("Brasil") }} />
                    <div style={{ height: laHeight, background: locationColor("LA") }} />
                    <div style={{ height: miamiHeight, background: locationColor("Miami") }} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>{row.label}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(["Miami", "LA", "Brasil"] as const).map((location) => (
          <div key={location} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: locationColor(location), display: "inline-block" }} />
            {location}
          </div>
        ))}
      </div>
    </div>
  );
}

function TopEarnersTable({ rows }: { rows: PayrollAnalyticsTopEarnerRow[] }) {
  if (!rows.length) return <div style={hintStyle}>No earnings data yet.</div>;
  return (
    <div style={tableShellStyle}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.04)" }}>
            {["Rank", "Employee", "Hours", "Earnings", "% of Total"].map((label) => <th key={label} style={tableHeadStyle}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.employeeId} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={tableCellStyle}>#{index + 1}</td>
              <td style={{ ...tableCellStyle, color: "#f8fafc", fontWeight: 600 }}>{row.employee}</td>
              <td style={tableCellStyle}>{formatDecimal(row.hours)}</td>
              <td style={tableCellStyle}>{formatMoney(row.earnings)}</td>
              <td style={tableCellStyle}>{formatPercentValue(row.shareOfTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.42)" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 14, color: "#f8fafc", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "danger" | "warning"; children: ReactNode }) {
  const toneStyle = tone === "danger"
    ? { color: "#fecaca", background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.28)" }
    : { color: "#fde68a", background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.28)" };

  return <span style={{ ...badgeStyle, ...toneStyle }}>{children}</span>;
}

function SectionToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...sectionToggleStyle,
      color: active ? "#dbeafe" : "rgba(255,255,255,0.65)",
      border: active ? "1px solid rgba(96,165,250,0.32)" : "1px solid rgba(255,255,255,0.08)",
      background: active ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.03)",
    }}>
      {children}
    </button>
  );
}

function PaymentQueueCard({
  employee,
  expanded,
  submitting,
  copied,
  onToggleExpand,
  onCopyHandle,
  onApprove,
  onMarkPaid,
}: {
  employee: PayrollEmployeeSummary;
  expanded: boolean;
  submitting: boolean;
  copied: boolean;
  onToggleExpand: () => void;
  onCopyHandle: () => void;
  onApprove: () => void;
  onMarkPaid: () => void;
}) {
  return (
    <div style={paymentQueueCardStyle}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, color: "#f8fafc", fontWeight: 700 }}>{employee.name}</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{employee.role}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={paymentMethodBadgeCompactStyle(employee.paymentMethod)}>{employee.paymentMethod || "Manual"}</span>
            <span style={paymentStatusBadgeCompactStyle(employee.status)}>{capitalize(employee.status)}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc" }}>{formatMoney(employee.balance)}</span>
            {employee.totalPaid > 0 && employee.balance > 0 && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>remaining</span>
            )}
          </div>
          <button type="button" onClick={onCopyHandle} style={paymentHandleCompactStyle}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{employee.paymentHandle || "Not set"}</span>
            <span style={{ fontSize: 10, color: copied ? "#86efac" : "rgba(255,255,255,0.35)", marginLeft: 6 }}>{copied ? "Copied!" : "Copy"}</span>
          </button>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button type="button" onClick={onApprove} style={employee.approvedForPayment ? compactSecondaryBtnStyle : compactPrimaryBtnStyle}>
              {employee.approvedForPayment ? "Unapprove" : "Approve"}
            </button>
            <button type="button" onClick={expanded ? onMarkPaid : onToggleExpand} disabled={submitting} style={compactPrimaryBtnStyle}>
              {submitting ? "Saving..." : expanded ? "Confirm Paid" : "Mark Paid"}
            </button>
          </div>
        </div>
        {expanded && (
          <div style={{ ...quickPayFormStyle, padding: 10, marginTop: 2 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Payment entry for {employee.name} via {employee.paymentMethod || "Manual"} dated today: {formatMoney(employee.balance)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickPayCard({
  employee,
  copied,
  expanded,
  submitting,
  onToggleExpand,
  onCopyHandle,
  onApprove,
  onMarkPaid,
}: {
  employee: PayrollEmployeeSummary;
  copied: boolean;
  expanded: boolean;
  submitting: boolean;
  onToggleExpand: () => void;
  onCopyHandle: () => void;
  onApprove: () => void;
  onMarkPaid: () => void;
}) {
  return (
    <div style={quickPayCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.38)" }}>Pay now</div>
          <div style={{ marginTop: 8, fontSize: 28, fontWeight: 800, color: "#f8fafc" }}>{formatMoney(employee.balance)}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={paymentMethodBadgeStyle(employee.paymentMethod)}>{employee.paymentMethod || "Manual"}</span>
          <span style={paymentStatusBadgeStyle(employee.status)}>{capitalize(employee.status)}</span>
        </div>
      </div>
      <button type="button" onClick={onCopyHandle} style={{ ...paymentHandleButtonStyle, marginTop: 14 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.38)" }}>Payment handle</div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700, color: "#e2e8f0", wordBreak: "break-word" }}>{employee.paymentHandle || "Not set"}</div>
        <div style={{ marginTop: 8, fontSize: 12, color: copied ? "#86efac" : "rgba(255,255,255,0.45)" }}>{copied ? "Copied!" : "Tap to copy"}</div>
      </button>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <button type="button" onClick={onApprove} style={employee.approvedForPayment ? secondaryButtonStyle : primaryButtonStyle}>
          {employee.approvedForPayment ? "Unapprove" : "Approve"}
        </button>
        <button type="button" onClick={expanded ? onMarkPaid : onToggleExpand} disabled={submitting} style={miniPrimaryButtonStyle}>
          {submitting ? "Saving..." : expanded ? "Confirm Paid" : "Mark Paid"}
        </button>
      </div>
      {expanded && <div style={{ ...quickPayFormStyle, marginTop: 12 }}>Payment entry will be created for today using {employee.paymentMethod || "Manual"}.</div>}
    </div>
  );
}

function resolveRate(employee: PayrollEmployee, rateType: PayrollRateType, overrideRate: string) {
  if (rateType === "override") return Number(overrideRate) || 0;
  return rateType === "coaching" ? employee.rates.coaching : employee.rates.hourly;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDecimal(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "No prior month";
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function formatPercentValue(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function locationColor(location: string) {
  if (location === "Miami") return "linear-gradient(90deg, #38bdf8, #2563eb)";
  if (location === "LA") return "linear-gradient(90deg, #34d399, #059669)";
  if (location === "Brasil") return "linear-gradient(90deg, #fbbf24, #f97316)";
  return "linear-gradient(90deg, #94a3b8, #64748b)";
}

function departmentColor(department: string) {
  if (department === "Install Ops") return "#38bdf8";
  if (department === "Operations") return "#34d399";
  if (department === "Reception") return "#f59e0b";
  if (department === "Marketing") return "#c084fc";
  return "#94a3b8";
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

function calculateHoursFromTimes(startTime: string, endTime: string) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null || end <= start) return 0;
  return Number(((end - start) / 60).toFixed(2));
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return (hours * 60) + minutes;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatRate(value: number) {
  return value > 0 ? `${formatMoney(value)}/hr` : "—";
}

function labelForKind(kind: PayrollActivityRow["kind"]) {
  if (kind === "time-entry") return "Time";
  if (kind === "payment") return "Payment";
  return "Reimbursement";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sortByDateDesc<T extends { date: string; createdAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function hasCoachingMismatch(employee: PayrollEmployee, timeEntries: PayrollTimeEntry[]) {
  if (employee.rates.coaching <= 0) return false;
  return timeEntries.some((entry) => {
    if (entry.rateType !== "hourly") return false;
    const haystack = `${entry.notes} ${entry.location}`.toLowerCase();
    return ["coach", "coaching", "lesson", "clinic", "private"].some((keyword) => haystack.includes(keyword));
  });
}

const panelStyle: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const twoColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const threeColGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(15,23,42,0.65)",
  color: "#e5eefc",
  outline: "none",
  fontSize: 13,
};

const compactInputStyle: CSSProperties = {
  ...inputStyle,
  padding: "8px 10px",
  fontSize: 12,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 84,
};

const primaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 12,
  background: "linear-gradient(180deg, rgba(59,130,246,0.22), rgba(37,99,235,0.16))",
  color: "#dbeafe",
  padding: "11px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.86)",
  padding: "11px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const miniButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.04)",
  color: "#e5eefc",
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const miniPrimaryButtonStyle: CSSProperties = {
  ...miniButtonStyle,
  border: "1px solid rgba(96,165,250,0.24)",
  background: "rgba(59,130,246,0.18)",
  color: "#dbeafe",
};

const miniDangerButtonStyle: CSSProperties = {
  ...miniButtonStyle,
  border: "1px solid rgba(248,113,113,0.26)",
  background: "rgba(239,68,68,0.14)",
  color: "#fecaca",
};

const paymentQueueCardStyle: CSSProperties = {
  borderRadius: 14,
  padding: "12px 14px",
  background: "linear-gradient(180deg, rgba(30,41,59,0.9), rgba(15,23,42,0.84))",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const quickPayCardStyle: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: "linear-gradient(180deg, rgba(30,41,59,0.72), rgba(15,23,42,0.9))",
  border: "1px solid rgba(96,165,250,0.16)",
};

const paymentHandleButtonStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: 16,
  padding: 16,
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer",
};

const quickPayFormStyle: CSSProperties = {
  borderRadius: 14,
  padding: 14,
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "grid",
  gap: 8,
};

const hintStyle: CSSProperties = {
  borderRadius: 10,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  fontSize: 12,
  color: "rgba(255,255,255,0.5)",
};

const sectionDividerStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.38)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  marginBottom: 18,
  alignItems: "end",
};

const filterActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "end",
  flexWrap: "wrap",
};

const headerWithActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const activeFilterBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
  padding: "6px 12px",
  background: "rgba(74,222,128,0.06)",
  border: "1px solid rgba(74,222,128,0.12)",
  borderRadius: 8,
};

const clearFilterButtonStyle: CSSProperties = {
  marginLeft: "auto",
  background: "none",
  border: "none",
  color: "#60a5fa",
  fontSize: 11,
  cursor: "pointer",
  fontWeight: 500,
};

const tableShellStyle: CSSProperties = {
  borderRadius: 16,
  overflowX: "auto",
  overflowY: "visible",
  border: "1px solid rgba(255,255,255,0.06)",
};

const tableHeadStyle: CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 11,
  color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontWeight: 600,
};

const tableCellStyle: CSSProperties = {
  padding: "14px 16px",
  fontSize: 13,
  color: "rgba(255,255,255,0.68)",
  verticalAlign: "top",
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const inlineConfirmStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 10,
  borderRadius: 12,
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.16)",
};

const formActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const checklistShellStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const checklistActionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const employeeChecklistGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const employeeChecklistItemStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 12,
  cursor: "pointer",
};

const drawerOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  border: "none",
  padding: 0,
  margin: 0,
  background: "rgba(2,6,23,0.72)",
  backdropFilter: "blur(6px)",
  zIndex: 80,
  cursor: "pointer",
};

const drawerStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  width: "min(760px, 100vw)",
  height: "100vh",
  background: "linear-gradient(180deg, rgba(7,11,25,0.98), rgba(2,6,23,0.98))",
  borderLeft: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "-24px 0 64px rgba(0,0,0,0.45)",
  zIndex: 81,
  display: "flex",
  flexDirection: "column",
  transform: "translateX(0)",
  transition: "transform 220ms ease",
};

const drawerHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  padding: "24px 24px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const drawerBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
  flex: 1,
  overflowY: "auto",
  minHeight: 0,
};

const drawerCardStyle: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const summaryChipStyle: CSSProperties = {
  borderRadius: 14,
  padding: 16,
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const analyticsCardStyle: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: "linear-gradient(180deg, rgba(15,23,42,0.72), rgba(2,6,23,0.84))",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
};

const metricCardStyle: CSSProperties = {
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

const analyticsBarTrackStyle: CSSProperties = {
  width: "100%",
  height: 12,
  borderRadius: 999,
  background: "rgba(255,255,255,0.06)",
  overflow: "hidden",
};

const analyticsBarFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
};

const departmentPieStyle: CSSProperties = {
  width: 220,
  height: 220,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,0.08)",
};

const departmentPieInnerStyle: CSSProperties = {
  width: 108,
  height: 108,
  borderRadius: "50%",
  background: "rgba(2,6,23,0.96)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const warningCardStyle: CSSProperties = {
  borderRadius: 14,
  padding: "12px 14px",
  background: "rgba(245,158,11,0.08)",
  border: "1px solid rgba(245,158,11,0.2)",
  color: "#fde68a",
  fontSize: 13,
  lineHeight: 1.5,
};

const sectionToggleStyle: CSSProperties = {
  borderRadius: 999,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const iconButtonStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#f8fafc",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
};

const drawerFootRowStyle: CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.03)",
};

const metaDividerStyle: CSSProperties = {
  color: "rgba(255,255,255,0.24)",
};

const paymentHandleCompactStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 8,
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(255,255,255,0.08)",
  cursor: "pointer",
};

const compactPrimaryBtnStyle: CSSProperties = {
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 8,
  background: "rgba(59,130,246,0.18)",
  color: "#dbeafe",
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const compactSecondaryBtnStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.86)",
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

function paymentMethodBadgeCompactStyle(method: string): CSSProperties {
  const base = paymentMethodBadgeStyle(method);
  return { ...base, padding: "3px 8px", fontSize: 10 };
}

function paymentStatusBadgeCompactStyle(status: PayrollEmployeeSummary["status"]): CSSProperties {
  const base = paymentStatusBadgeStyle(status);
  return { ...base, padding: "3px 8px", fontSize: 10 };
}

function paymentMethodBadgeStyle(method: string): CSSProperties {
  const normalized = method.trim().toLowerCase();
  const palette = normalized === "zelle"
    ? { color: "#bfdbfe", background: "rgba(59,130,246,0.18)", border: "rgba(59,130,246,0.28)" }
    : normalized === "venmo"
      ? { color: "#ddd6fe", background: "rgba(139,92,246,0.18)", border: "rgba(139,92,246,0.28)" }
      : normalized === "cashapp"
        ? { color: "#bbf7d0", background: "rgba(34,197,94,0.18)", border: "rgba(34,197,94,0.28)" }
        : normalized === "wise"
          ? { color: "#99f6e4", background: "rgba(20,184,166,0.18)", border: "rgba(20,184,166,0.28)" }
          : { color: "#e2e8f0", background: "rgba(148,163,184,0.16)", border: "rgba(148,163,184,0.24)" };
  return { ...badgeStyle, ...palette };
}

function paymentStatusBadgeStyle(status: PayrollEmployeeSummary["status"]): CSSProperties {
  const palette = status === "paid"
    ? { color: "#86efac", background: "rgba(34,197,94,0.16)", border: "rgba(34,197,94,0.26)" }
    : status === "approved"
      ? { color: "#fde68a", background: "rgba(245,158,11,0.16)", border: "rgba(245,158,11,0.26)" }
      : { color: "#cbd5e1", background: "rgba(148,163,184,0.16)", border: "rgba(148,163,184,0.24)" };
  return { ...badgeStyle, ...palette };
}

function balanceTextStyle(balance: number): CSSProperties {
  if (balance > 500) {
    return { color: "#f87171" };
  }
  if (balance > 0) {
    return { color: "#f59e0b" };
  }
  return { color: "#4ade80" };
}

function activityPillStyle(kind: PayrollActivityRow["kind"]): CSSProperties {
  const colors = {
    "time-entry": { text: "#4ade80", bg: "rgba(74,222,128,0.1)", border: "rgba(74,222,128,0.16)" },
    payment: { text: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.18)" },
    reimbursement: { text: "#f472b6", bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.18)" },
  }[kind];
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 600,
    color: colors.text,
    background: colors.bg,
    border: `1px solid ${colors.border}`,
  };
}
