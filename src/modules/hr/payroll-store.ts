import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import rawPeople from "@/modules/org-chart/data/people.json";
import type { PersonRecord } from "@/modules/org-chart/types";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "payroll.json");

try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // already exists
}

export type PayrollRateType = "hourly" | "coaching" | "override";

export interface PayrollTimeEntry {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  rateType: PayrollRateType;
  rate: number;
  subtotal: number;
  notes: string;
  location: string;
  payPeriodId?: string;
  createdAt: string;
}

export type PayPeriodStatus = "open" | "locked" | "paid";

export interface PayPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PayPeriodStatus;
  notes?: string;
  createdAt: string;
}

export interface PayrollPayment {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  method: string;
  notes: string;
  createdAt: string;
}

export interface PayrollReimbursement {
  id: string;
  employeeId: string;
  date: string;
  amount: number;
  description: string;
  createdAt: string;
}

export interface PayrollEmployeeSummary {
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

export interface PayrollApproval {
  approved: boolean;
  approvedAt?: string;
  approvedAmount?: number;
}

interface PayrollStore {
  timeEntries: PayrollTimeEntry[];
  payments: PayrollPayment[];
  reimbursements: PayrollReimbursement[];
  payPeriods: PayPeriod[];
  approvedForPayment: Record<string, PayrollApproval>;
}

interface NewTimeEntryInput {
  employeeId: string;
  date: string;
  hours: number;
  rateType?: PayrollRateType;
  rate?: number;
  subtotal?: number;
  notes?: string;
  location?: string;
  payPeriodId?: string;
}

interface NewPaymentInput {
  employeeId: string;
  date: string;
  amount: number;
  method: string;
  notes?: string;
}

interface NewReimbursementInput {
  employeeId: string;
  date: string;
  amount: number;
  description: string;
}

interface PayrollSnapshotFilters {
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
}

interface PayrollAnalyticsFilters {
  startDate?: string;
  endDate?: string;
  location?: string;
}

export interface PayrollAnalyticsLocationRow {
  location: string;
  hours: number;
  grossWages: number;
  payments: number;
  balance: number;
  avgHourlyCost: number;
  shareOfTotal: number;
}

export interface PayrollAnalyticsMonthRow {
  month: string;
  label: string;
  total: number;
  locations: Record<string, number>;
}

export interface PayrollAnalyticsDepartmentRow {
  department: string;
  amount: number;
  shareOfTotal: number;
}

export interface PayrollAnalyticsTopEarnerRow {
  employeeId: string;
  employee: string;
  hours: number;
  earnings: number;
  shareOfTotal: number;
}

export interface PayrollAnalytics {
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

const people = rawPeople as PersonRecord[];

function readStore(): PayrollStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PayrollStore;
    if (Array.isArray(parsed.timeEntries) && Array.isArray(parsed.payments) && Array.isArray(parsed.reimbursements)) {
      return {
        ...parsed,
        payPeriods: Array.isArray(parsed.payPeriods) ? parsed.payPeriods : [],
        approvedForPayment: parsed.approvedForPayment && typeof parsed.approvedForPayment === "object" ? parsed.approvedForPayment : {},
      };
    }
  } catch {
    // missing or corrupt
  }

  const seed: PayrollStore = { timeEntries: [], payments: [], reimbursements: [], payPeriods: [], approvedForPayment: {} };
  writeStore(seed);
  return seed;
}

function writeStore(store: PayrollStore): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseCurrency(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.toLowerCase();
  if (normalized.includes("variable") || normalized.includes("r$")) return 0;
  if (normalized.includes("/day")) {
    const perDay = parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
    return perDay / 8;
  }
  return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
}

function getEmployee(employeeId: string) {
  return people.find((person) => person.id === employeeId) ?? null;
}

function normalizeLocation(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function canonicalLocation(value: string | null | undefined) {
  const normalized = normalizeLocation(value);
  if (!normalized) return "Other";
  if (normalized.includes("miami")) return "Miami";
  if (normalized === "la" || normalized.includes("los angeles")) return "LA";
  if (normalized.includes("brasil") || normalized.includes("brazil")) return "Brasil";
  return value?.trim() || "Other";
}

function mapDepartmentBucket(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("academy")) return "Install Ops";
  if (normalized.includes("operation")) return "Operations";
  if (normalized.includes("reception")) return "Reception";
  if (normalized.includes("marketing")) return "Marketing";
  return "Other";
}

function formatMonthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, (monthIndex || 1) - 1, 1));
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function matchesDateRange(date: string, startDate?: string | null, endDate?: string | null) {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

export function getPayrollEmployees() {
  return people
    .filter((person) => person.status === "Active")
    .map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      department: person.department,
      location: person.locationLabel,
      paymentMethod: person.paymentMethod ?? "",
      paymentHandle: person.paymentUsername ?? "",
      rates: {
        hourly: parseCurrency(person.hourlyRate),
        coaching: parseCurrency(person.coachingRate),
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getDefaultRate(employeeId: string, rateType: PayrollRateType): number {
  if (rateType === "override") return 0;
  const employee = getEmployee(employeeId);
  if (!employee) return 0;
  return rateType === "hourly" ? parseCurrency(employee.hourlyRate) : parseCurrency(employee.coachingRate);
}

export function listTimeEntries() {
  return [...readStore().timeEntries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function listPayments() {
  return [...readStore().payments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function listReimbursements() {
  return [...readStore().reimbursements].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function isEntryProtectedByLockedPeriod(entry: { date: string; payPeriodId?: string }, store: PayrollStore): boolean {
  for (const period of store.payPeriods) {
    if (period.status !== "locked" && period.status !== "paid") continue;
    if (entry.payPeriodId === period.id) return true;
    if (entry.date >= period.startDate && entry.date <= period.endDate) return true;
  }
  return false;
}

export function createTimeEntry(input: NewTimeEntryInput) {
  const employee = getEmployee(input.employeeId);
  if (!employee) {
    throw new Error("Employee not found");
  }

  const rateType = input.rateType ?? "hourly";
  const explicitRate = input.rate !== undefined ? Number(input.rate) : undefined;
  const resolvedRate = explicitRate ?? (rateType === "override" ? 0 : getDefaultRate(input.employeeId, rateType));
  const hours = Number(input.hours);
  const subtotal = Number(input.subtotal ?? resolvedRate * hours);

  if (!input.date || Number.isNaN(hours) || hours <= 0 || Number.isNaN(resolvedRate) || resolvedRate < 0) {
    throw new Error("Invalid time entry");
  }

  const entry: PayrollTimeEntry = {
    id: makeId("time"),
    employeeId: input.employeeId,
    date: input.date,
    hours,
    rateType,
    rate: resolvedRate,
    subtotal,
    notes: input.notes?.trim() ?? "",
    location: input.location?.trim() || employee.locationLabel,
    ...(input.payPeriodId ? { payPeriodId: input.payPeriodId } : {}),
    createdAt: now(),
  };

  const store = readStore();
  store.timeEntries.unshift(entry);
  writeStore(store);
  return entry;
}

export function updateTimeEntry(id: string, updates: Partial<NewTimeEntryInput>) {
  const store = readStore();
  const index = store.timeEntries.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error("Time entry not found");

  const current = store.timeEntries[index];
  if (isEntryProtectedByLockedPeriod(current, store)) {
    throw new Error("Cannot update a time entry in a locked or paid pay period");
  }

  const employeeId = updates.employeeId ?? current.employeeId;
  const employee = getEmployee(employeeId);
  if (!employee) throw new Error("Employee not found");

  const rateType = updates.rateType ?? current.rateType;
  const hours = updates.hours !== undefined ? Number(updates.hours) : current.hours;
  let rate = current.rate;
  if (updates.rate !== undefined) {
    rate = Number(updates.rate);
  } else if (updates.rateType !== undefined || updates.employeeId !== undefined) {
    rate = rateType === "override" ? current.rate : getDefaultRate(employeeId, rateType);
  }

  const subtotal = updates.subtotal !== undefined ? Number(updates.subtotal) : rate * hours;
  const date = updates.date ?? current.date;
  const location = updates.location?.trim() ?? (current.location || employee.locationLabel);
  const notes = updates.notes !== undefined ? updates.notes.trim() : current.notes;

  if (!date || Number.isNaN(hours) || hours <= 0 || Number.isNaN(rate) || rate < 0 || Number.isNaN(subtotal) || subtotal < 0) {
    throw new Error("Invalid time entry");
  }

  const payPeriodId = updates.payPeriodId !== undefined ? updates.payPeriodId : current.payPeriodId;
  const next: PayrollTimeEntry = {
    ...current,
    employeeId,
    date,
    hours,
    rateType,
    rate,
    subtotal,
    notes,
    location,
    ...(payPeriodId ? { payPeriodId } : {}),
  };

  store.timeEntries[index] = next;
  writeStore(store);
  return next;
}

export function deleteTimeEntry(id: string) {
  const store = readStore();
  const index = store.timeEntries.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error("Time entry not found");
  if (isEntryProtectedByLockedPeriod(store.timeEntries[index], store)) {
    throw new Error("Cannot delete a time entry in a locked or paid pay period");
  }
  const [deleted] = store.timeEntries.splice(index, 1);
  writeStore(store);
  return deleted;
}

export function createPayment(input: NewPaymentInput) {
  if (!getEmployee(input.employeeId)) {
    throw new Error("Employee not found");
  }

  const amount = Number(input.amount);
  if (!input.date || !input.method?.trim() || Number.isNaN(amount) || amount <= 0) {
    throw new Error("Invalid payment");
  }

  const payment: PayrollPayment = {
    id: makeId("payment"),
    employeeId: input.employeeId,
    date: input.date,
    amount,
    method: input.method.trim(),
    notes: input.notes?.trim() ?? "",
    createdAt: now(),
  };

  const store = readStore();
  store.payments.unshift(payment);
  writeStore(store);
  return payment;
}

export function updatePayment(id: string, updates: Partial<NewPaymentInput>) {
  const store = readStore();
  const index = store.payments.findIndex((payment) => payment.id === id);
  if (index === -1) throw new Error("Payment not found");

  const current = store.payments[index];
  const employeeId = updates.employeeId ?? current.employeeId;
  if (!getEmployee(employeeId)) throw new Error("Employee not found");

  const amount = updates.amount !== undefined ? Number(updates.amount) : current.amount;
  const method = updates.method !== undefined ? updates.method.trim() : current.method;
  const date = updates.date ?? current.date;
  const notes = updates.notes !== undefined ? updates.notes.trim() : current.notes;

  if (!date || !method || Number.isNaN(amount) || amount <= 0) {
    throw new Error("Invalid payment");
  }

  const next: PayrollPayment = {
    ...current,
    employeeId,
    date,
    amount,
    method,
    notes,
  };

  store.payments[index] = next;
  writeStore(store);
  return next;
}

export function deletePayment(id: string) {
  const store = readStore();
  const index = store.payments.findIndex((payment) => payment.id === id);
  if (index === -1) throw new Error("Payment not found");
  const [deleted] = store.payments.splice(index, 1);
  writeStore(store);
  return deleted;
}

export function createReimbursement(input: NewReimbursementInput) {
  if (!getEmployee(input.employeeId)) {
    throw new Error("Employee not found");
  }

  const amount = Number(input.amount);
  if (!input.date || !input.description?.trim() || Number.isNaN(amount) || amount <= 0) {
    throw new Error("Invalid reimbursement");
  }

  const reimbursement: PayrollReimbursement = {
    id: makeId("reimbursement"),
    employeeId: input.employeeId,
    date: input.date,
    amount,
    description: input.description.trim(),
    createdAt: now(),
  };

  const store = readStore();
  store.reimbursements.unshift(reimbursement);
  writeStore(store);
  return reimbursement;
}

export function updateReimbursement(id: string, updates: Partial<NewReimbursementInput>) {
  const store = readStore();
  const index = store.reimbursements.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Reimbursement not found");

  const current = store.reimbursements[index];
  const employeeId = updates.employeeId ?? current.employeeId;
  if (!getEmployee(employeeId)) throw new Error("Employee not found");

  const amount = updates.amount !== undefined ? Number(updates.amount) : current.amount;
  const description = updates.description !== undefined ? updates.description.trim() : current.description;
  const date = updates.date ?? current.date;

  if (!date || !description || Number.isNaN(amount) || amount <= 0) {
    throw new Error("Invalid reimbursement");
  }

  const next: PayrollReimbursement = {
    ...current,
    employeeId,
    date,
    amount,
    description,
  };

  store.reimbursements[index] = next;
  writeStore(store);
  return next;
}

export function deleteReimbursement(id: string) {
  const store = readStore();
  const index = store.reimbursements.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Reimbursement not found");
  const [deleted] = store.reimbursements.splice(index, 1);
  writeStore(store);
  return deleted;
}

export function listPayPeriods() {
  return [...readStore().payPeriods].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt));
}

export function createPayPeriod(input: { name: string; startDate: string; endDate: string; notes?: string }) {
  if (!input.name?.trim() || !input.startDate || !input.endDate || input.endDate < input.startDate) {
    throw new Error("Invalid pay period");
  }
  const period: PayPeriod = {
    id: makeId("pp"),
    name: input.name.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: "open",
    notes: input.notes?.trim() || undefined,
    createdAt: now(),
  };
  const store = readStore();
  store.payPeriods.unshift(period);
  writeStore(store);
  return period;
}

export function updatePayPeriod(id: string, updates: { name?: string; startDate?: string; endDate?: string; notes?: string; status?: PayPeriodStatus }) {
  const store = readStore();
  const index = store.payPeriods.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("Pay period not found");
  const current = store.payPeriods[index];
  const next: PayPeriod = {
    ...current,
    name: updates.name?.trim() || current.name,
    startDate: updates.startDate || current.startDate,
    endDate: updates.endDate || current.endDate,
    status: updates.status || current.status,
    notes: updates.notes !== undefined ? (updates.notes.trim() || undefined) : current.notes,
  };
  if (next.endDate < next.startDate) throw new Error("End date must be after start date");
  store.payPeriods[index] = next;
  writeStore(store);
  return next;
}

export function lockPayPeriod(id: string) {
  return updatePayPeriod(id, { status: "locked" });
}

export function markPayPeriodPaid(id: string) {
  const store = readStore();
  const period = store.payPeriods.find((p) => p.id === id);
  if (!period) throw new Error("Pay period not found");
  if (period.status !== "locked") throw new Error("Pay period must be locked before marking as paid");
  return updatePayPeriod(id, { status: "paid" });
}

export function approveForPayment(employeeId: string, amount: number) {
  if (!getEmployee(employeeId)) {
    throw new Error("Employee not found");
  }

  const approvedAmount = Number(amount);
  if (Number.isNaN(approvedAmount) || approvedAmount <= 0) {
    throw new Error("Invalid approval amount");
  }

  const store = readStore();
  store.approvedForPayment[employeeId] = {
    approved: true,
    approvedAt: now(),
    approvedAmount,
  };
  writeStore(store);
  return store.approvedForPayment[employeeId];
}

export function unapproveForPayment(employeeId: string) {
  const store = readStore();
  delete store.approvedForPayment[employeeId];
  writeStore(store);
  return { success: true };
}

export function getPayPeriodEntryCounts(): Record<string, number> {
  const store = readStore();
  const counts: Record<string, number> = {};
  for (const period of store.payPeriods) {
    counts[period.id] = store.timeEntries.filter((entry) =>
      entry.payPeriodId === period.id || (entry.date >= period.startDate && entry.date <= period.endDate)
    ).length;
  }
  return counts;
}

export function exportEmployeeSummariesCDT(summaries: PayrollEmployeeSummary[]): string {
  const headers = ["Employee", "Location", "Department", "Ops Hours", "Coaching Hours", "Override Hours", "Gross Wages", "Reimbursements", "Total Owed", "Total Paid", "Balance"];
  const escapeCDT = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const rows = summaries.map((s) => [
    escapeCDT(s.name),
    escapeCDT(s.location),
    escapeCDT(s.department),
    s.opsHours.toFixed(2),
    s.coachingHours.toFixed(2),
    s.overrideHours.toFixed(2),
    s.grossWages.toFixed(2),
    s.reimbursements.toFixed(2),
    s.totalOwed.toFixed(2),
    s.totalPaid.toFixed(2),
    s.balance.toFixed(2),
  ].join(","));
  return [headers.join(","), ...rows].join("\n");
}

export function getPayrollSnapshot(filters: PayrollSnapshotFilters = {}) {
  const store = readStore();
  const employees = getPayrollEmployees();
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const normalizedLocation = normalizeLocation(filters.location);
  const shouldFilterByLocation = normalizedLocation && normalizedLocation !== "all";

  const locationMatchesEmployee = (employeeId: string) => {
    if (!shouldFilterByLocation) return true;
    const employee = employeeMap.get(employeeId);
    return normalizeLocation(employee?.location) === normalizedLocation;
  };

  const timeEntries = listTimeEntries().filter((entry) => {
    if (!matchesDateRange(entry.date, filters.startDate, filters.endDate)) return false;
    if (shouldFilterByLocation) {
      const entryLocation = normalizeLocation(entry.location);
      if (entryLocation && entryLocation === normalizedLocation) return true;
      return locationMatchesEmployee(entry.employeeId);
    }
    return true;
  });

  const payments = listPayments().filter((payment) => (
    matchesDateRange(payment.date, filters.startDate, filters.endDate) && locationMatchesEmployee(payment.employeeId)
  ));

  const reimbursements = listReimbursements().filter((reimbursement) => (
    matchesDateRange(reimbursement.date, filters.startDate, filters.endDate) && locationMatchesEmployee(reimbursement.employeeId)
  ));

  const employeeSummaryMap = new Map<string, PayrollEmployeeSummary>();

  const ensureEmployeeSummary = (employeeId: string) => {
    const existing = employeeSummaryMap.get(employeeId);
    if (existing) return existing;

    const employee = employeeMap.get(employeeId);
    const approval = store.approvedForPayment[employeeId];
    const summary: PayrollEmployeeSummary = {
      employeeId,
      name: employee?.name ?? employeeId,
      role: employee?.role ?? "Unknown role",
      location: employee?.location ?? "Unknown",
      department: employee?.department ?? "Unassigned",
      paymentMethod: employee?.paymentMethod ?? "",
      paymentHandle: employee?.paymentHandle ?? "",
      opsHours: 0,
      coachingHours: 0,
      overrideHours: 0,
      grossWages: 0,
      reimbursements: 0,
      totalOwed: 0,
      totalPaid: 0,
      balance: 0,
      status: "pending",
      approvedForPayment: approval?.approved ?? false,
      approvedAt: approval?.approvedAt,
      approvedAmount: approval?.approvedAmount,
    };

    employeeSummaryMap.set(employeeId, summary);
    return summary;
  };

  for (const entry of timeEntries) {
    const summary = ensureEmployeeSummary(entry.employeeId);
    if (entry.rateType === "coaching") summary.coachingHours += entry.hours;
    else if (entry.rateType === "override") summary.overrideHours += entry.hours;
    else summary.opsHours += entry.hours;

    summary.grossWages += entry.subtotal;
  }

  for (const reimbursement of reimbursements) {
    const summary = ensureEmployeeSummary(reimbursement.employeeId);
    summary.reimbursements += reimbursement.amount;
  }

  for (const payment of payments) {
    const summary = ensureEmployeeSummary(payment.employeeId);
    summary.totalPaid += payment.amount;
  }

  const employeeSummaries = Array.from(employeeSummaryMap.values())
    .map((summary) => {
      summary.totalOwed = summary.grossWages + summary.reimbursements;
      summary.balance = summary.totalOwed - summary.totalPaid;
      summary.status = summary.balance <= 0 ? "paid" : summary.approvedForPayment ? "approved" : "pending";
      return summary;
    })
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));

  const activity = [
    ...timeEntries.map((entry) => ({
      id: entry.id,
      kind: "time-entry" as const,
      date: entry.date,
      employeeId: entry.employeeId,
      employeeName: employeeMap.get(entry.employeeId)?.name ?? entry.employeeId,
      detail: `${entry.hours}h @ $${entry.rate.toFixed(2)}/${entry.rateType === "coaching" ? "coach hr" : "hr"}`,
      amount: entry.subtotal,
      meta: entry.location,
      createdAt: entry.createdAt,
    })),
    ...payments.map((payment) => ({
      id: payment.id,
      kind: "payment" as const,
      date: payment.date,
      employeeId: payment.employeeId,
      employeeName: employeeMap.get(payment.employeeId)?.name ?? payment.employeeId,
      detail: payment.method,
      amount: payment.amount,
      meta: payment.notes,
      createdAt: payment.createdAt,
    })),
    ...reimbursements.map((reimbursement) => ({
      id: reimbursement.id,
      kind: "reimbursement" as const,
      date: reimbursement.date,
      employeeId: reimbursement.employeeId,
      employeeName: employeeMap.get(reimbursement.employeeId)?.name ?? reimbursement.employeeId,
      detail: reimbursement.description,
      amount: reimbursement.amount,
      meta: "",
      createdAt: reimbursement.createdAt,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const pendingPayroll = timeEntries.reduce((sum, entry) => sum + entry.subtotal, 0)
    + reimbursements.reduce((sum, item) => sum + item.amount, 0)
    - payments.reduce((sum, item) => sum + item.amount, 0);

  const payPeriods = listPayPeriods();
  const periodEntryCounts = getPayPeriodEntryCounts();

  return {
    employees,
    employeeSummaries,
    timeEntries,
    payments,
    reimbursements,
    payPeriods,
    payPeriodEntryCounts: periodEntryCounts,
    summary: {
      totalTimeEntries: timeEntries.length,
      totalHours: timeEntries.reduce((sum, entry) => sum + entry.hours, 0),
      grossPayroll: timeEntries.reduce((sum, entry) => sum + entry.subtotal, 0),
      totalPayments: payments.reduce((sum, item) => sum + item.amount, 0),
      totalReimbursements: reimbursements.reduce((sum, item) => sum + item.amount, 0),
      pendingPayroll,
    },
    recentActivity: activity.slice(0, 12),
  };
}

export function getPayrollAnalytics(filters: PayrollAnalyticsFilters = {}): PayrollAnalytics {
  const snapshot = getPayrollSnapshot(filters);
  const employees = getPayrollEmployees();
  const employeeSummaryMap = new Map(snapshot.employeeSummaries.map((employee) => [employee.employeeId, employee]));
  const employeeListMap = new Map(employees.map((employee) => [employee.id, employee]));
  const requestedLocation = normalizeLocation(filters.location);
  const shouldFilterByLocation = Boolean(requestedLocation && requestedLocation !== "all");

  const filteredPayments = listPayments().filter((payment) => {
    if (!matchesDateRange(payment.date, filters.startDate, filters.endDate)) return false;
    if (!shouldFilterByLocation) return true;
    const employee = employeeListMap.get(payment.employeeId);
    return canonicalLocation(employee?.location) === canonicalLocation(filters.location);
  });

  const monthWages = new Map<string, number>();
  const monthLocationWages = new Map<string, Record<string, number>>();
  const locationAggregates = new Map<string, PayrollAnalyticsLocationRow>();
  const departmentTotals = new Map<string, number>();

  for (const entry of snapshot.timeEntries) {
    const month = entry.date.slice(0, 7);
    const employee = employeeSummaryMap.get(entry.employeeId);
    const location = canonicalLocation(entry.location || employee?.location);
    const department = mapDepartmentBucket(employee?.department);

    monthWages.set(month, (monthWages.get(month) ?? 0) + entry.subtotal);
    const monthLocations = monthLocationWages.get(month) ?? { Miami: 0, LA: 0, Brasil: 0 };
    monthLocations[location] = (monthLocations[location] ?? 0) + entry.subtotal;
    monthLocationWages.set(month, monthLocations);

    const currentLocation = locationAggregates.get(location) ?? {
      location,
      hours: 0,
      grossWages: 0,
      payments: 0,
      balance: 0,
      avgHourlyCost: 0,
      shareOfTotal: 0,
    };
    currentLocation.hours += entry.hours;
    currentLocation.grossWages += entry.subtotal;
    locationAggregates.set(location, currentLocation);

    departmentTotals.set(department, (departmentTotals.get(department) ?? 0) + entry.subtotal);
  }

  for (const payment of filteredPayments) {
    const employee = employeeSummaryMap.get(payment.employeeId) ?? employeeListMap.get(payment.employeeId);
    const location = canonicalLocation(employee?.location);
    const currentLocation = locationAggregates.get(location) ?? {
      location,
      hours: 0,
      grossWages: 0,
      payments: 0,
      balance: 0,
      avgHourlyCost: 0,
      shareOfTotal: 0,
    };
    currentLocation.payments += payment.amount;
    locationAggregates.set(location, currentLocation);
  }

  const totalGrossWages = snapshot.summary.grossPayroll;
  const currentMonth = snapshot.timeEntries.map((entry) => entry.date.slice(0, 7)).sort().at(-1) ?? new Date().toISOString().slice(0, 7);
  const [currentYear, currentMonthIndex] = currentMonth.split("-").map(Number);
  const previousMonthDate = new Date(Date.UTC(currentYear, (currentMonthIndex || 1) - 2, 1));
  const previousMonth = `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const ytdPrefix = `${currentYear || new Date().getUTCFullYear()}-`;

  const locationRows = ["Miami", "LA", "Brasil"].map((location) => {
    const row = locationAggregates.get(location) ?? {
      location,
      hours: 0,
      grossWages: 0,
      payments: 0,
      balance: 0,
      avgHourlyCost: 0,
      shareOfTotal: 0,
    };
    row.balance = row.grossWages - row.payments;
    row.avgHourlyCost = row.hours > 0 ? row.grossWages / row.hours : 0;
    row.shareOfTotal = totalGrossWages > 0 ? row.grossWages / totalGrossWages : 0;
    return row;
  });

  const totalLocationRow: PayrollAnalyticsLocationRow = {
    location: "Total",
    hours: locationRows.reduce((sum, row) => sum + row.hours, 0),
    grossWages: locationRows.reduce((sum, row) => sum + row.grossWages, 0),
    payments: locationRows.reduce((sum, row) => sum + row.payments, 0),
    balance: locationRows.reduce((sum, row) => sum + row.balance, 0),
    avgHourlyCost: snapshot.summary.totalHours > 0 ? totalGrossWages / snapshot.summary.totalHours : 0,
    shareOfTotal: 1,
  };

  const monthlyTrend = [...new Set(snapshot.timeEntries.map((entry) => entry.date.slice(0, 7)))]
    .sort()
    .map((month) => ({
      month,
      label: formatMonthLabel(month),
      total: monthWages.get(month) ?? 0,
      locations: { Miami: 0, LA: 0, Brasil: 0, ...(monthLocationWages.get(month) ?? {}) },
    }));

  const departmentBreakdown = ["Install Ops", "Operations", "Reception", "Marketing", "Other"].map((department) => {
    const amount = departmentTotals.get(department) ?? 0;
    return {
      department,
      amount,
      shareOfTotal: totalGrossWages > 0 ? amount / totalGrossWages : 0,
    };
  });

  const topEarners = snapshot.employeeSummaries
    .map((employee) => ({
      employeeId: employee.employeeId,
      employee: employee.name,
      hours: employee.opsHours + employee.coachingHours + employee.overrideHours,
      earnings: employee.grossWages,
      shareOfTotal: totalGrossWages > 0 ? employee.grossWages / totalGrossWages : 0,
    }))
    .filter((employee) => employee.earnings > 0)
    .sort((a, b) => b.earnings - a.earnings || b.hours - a.hours)
    .slice(0, 5);

  const coachingEntries = snapshot.timeEntries.filter((entry) => entry.rateType === "coaching");
  const coachingHours = coachingEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const coachingWages = coachingEntries.reduce((sum, entry) => sum + entry.subtotal, 0);
  const opsEntries = snapshot.timeEntries.filter((entry) => entry.rateType !== "coaching");
  const opsHours = opsEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const opsWages = opsEntries.reduce((sum, entry) => sum + entry.subtotal, 0);

  const uniqueEmployeesWithEntries = new Set(snapshot.timeEntries.map((entry) => entry.employeeId)).size;
  const weeksCovered = (() => {
    if (snapshot.timeEntries.length === 0) return 0;
    const orderedEntries = [...snapshot.timeEntries].sort((a, b) => a.date.localeCompare(b.date));
    const start = new Date(`${orderedEntries[0].date}T00:00:00Z`).getTime();
    const end = new Date(`${orderedEntries[orderedEntries.length - 1].date}T00:00:00Z`).getTime();
    return Math.max(1, Math.ceil((((end - start) / (1000 * 60 * 60 * 24)) + 1) / 7));
  })();

  const currentMonthLaborCost = monthWages.get(currentMonth) ?? 0;
  const previousMonthLaborCost = monthWages.get(previousMonth) ?? 0;
  const monthOverMonthDelta = currentMonthLaborCost - previousMonthLaborCost;
  const monthOverMonthDeltaPct = previousMonthLaborCost > 0 ? monthOverMonthDelta / previousMonthLaborCost : null;
  const totalYtdPayrollSpend = Array.from(monthWages.entries())
    .filter(([month]) => month.startsWith(ytdPrefix))
    .reduce((sum, [, value]) => sum + value, 0);

  return {
    cards: {
      currentMonthLaborCost,
      previousMonthLaborCost,
      monthOverMonthDelta,
      monthOverMonthDeltaPct,
      averageHourlyCost: snapshot.summary.totalHours > 0 ? totalGrossWages / snapshot.summary.totalHours : 0,
      totalYtdPayrollSpend,
    },
    locationBreakdown: {
      rows: locationRows,
      total: totalLocationRow,
    },
    monthlyTrend,
    departmentBreakdown,
    topEarners,
    efficiency: {
      coachingCostPerHour: coachingHours > 0 ? coachingWages / coachingHours : 0,
      opsCostPerHour: opsHours > 0 ? opsWages / opsHours : 0,
      coachingHoursPct: snapshot.summary.totalHours > 0 ? coachingHours / snapshot.summary.totalHours : 0,
      opsHoursPct: snapshot.summary.totalHours > 0 ? opsHours / snapshot.summary.totalHours : 0,
      averageSessionsPerEmployeePerWeek: uniqueEmployeesWithEntries > 0 && weeksCovered > 0
        ? snapshot.timeEntries.length / uniqueEmployeesWithEntries / weeksCovered
        : 0,
    },
  };
}

export function getPayrollDigest() {
  const snapshot = getPayrollSnapshot();
  const employeesOwed = snapshot.employeeSummaries.filter((employee) => employee.balance > 0);
  const approvedEmployees = employeesOwed.filter((employee) => employee.status === "approved");
  const highBalances = employeesOwed.filter((employee) => employee.balance > 500);
  const totalPending = employeesOwed.reduce((sum, employee) => sum + employee.balance, 0);

  const hoursByEmployee = new Map<string, number>();
  for (const entry of snapshot.timeEntries) {
    hoursByEmployee.set(entry.employeeId, (hoursByEmployee.get(entry.employeeId) ?? 0) + entry.hours);
  }

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date());

  const markdown = [
    `**Weekly Payroll Digest — ${dateLabel}**`,
    "",
    `- Total pending: ${formatDigestMoney(totalPending)}`,
    `- Employees owed: ${employeesOwed.length}`,
    `- Approved but not yet paid: ${approvedEmployees.length}`,
    `- High balances (>$500): ${highBalances.length}`,
    "",
    "**Per-employee breakdown**",
    employeesOwed.length
      ? employeesOwed
          .map((employee) => `- ${employee.name} — ${formatDigestNumber(hoursByEmployee.get(employee.employeeId) ?? 0)} hrs — ${formatDigestMoney(employee.balance)} owed — ${employee.paymentMethod || "Manual"}${employee.paymentHandle ? ` (${employee.paymentHandle})` : ""}`)
          .join("\n")
      : "- No employees currently owed.",
    "",
    "**Approved to pay**",
    approvedEmployees.length
      ? approvedEmployees
          .map((employee) => `- ${employee.name} — ${formatDigestMoney(employee.approvedAmount ?? employee.balance)} approved${employee.approvedAt ? ` on ${formatDigestDate(employee.approvedAt)}` : ""}`)
          .join("\n")
      : "- None.",
    "",
    "**High balances**",
    highBalances.length
      ? highBalances.map((employee) => `- ${employee.name} — ${formatDigestMoney(employee.balance)}`).join("\n")
      : "- None.",
  ].join("\n");

  return {
    markdown,
    summary: {
      totalPending,
      employeesOwed: employeesOwed.length,
      employeesApproved: approvedEmployees.length,
      highBalanceCount: highBalances.length,
    },
  };
}

function formatDigestMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDigestNumber(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDigestDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { timeZone: "America/New_York" });
}
