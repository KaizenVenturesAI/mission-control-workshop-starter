import rawData from "./revenue-events.json";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RevenueEvent {
  date: string;
  location: "LA" | "Miami" | "Fort Lauderdale" | string;
  eventType: "open-play" | "corporate" | "off-sand" | string;
  quarter: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  revenueItems: Record<string, number>;
  expenseItems: Record<string, number>;
  sheetUrl?: string;
  subType?: string;
}

export interface QuarterAggregate {
  quarter: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  eventCount: number;
}

export interface LocationAggregate {
  location: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  eventCount: number;
  avgRevenue: number;
}

export interface EventTypeAggregate {
  eventType: string;
  revenue: number;
  expenses: number;
  netProfit: number;
  eventCount: number;
}

// ─── Raw Data ────────────────────────────────────────────────────────────────

export const revenueEvents: RevenueEvent[] = rawData as unknown as RevenueEvent[];

// ─── Quarter sort order ───────────────────────────────────────────────────────

function quarterSortKey(q: string): number {
  if (q === "Mixed") return 0;
  const match = q.match(/Q(\d) (\d{4})/);
  if (!match) return 0;
  return parseInt(match[2]) * 10 + parseInt(match[1]);
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

export function getSummaryStats(data: RevenueEvent[] = revenueEvents) {
  const totalRevenue = data.reduce((s, e) => s + e.totalRevenue, 0);
  const totalExpenses = data.reduce((s, e) => s + e.totalExpenses, 0);
  const netProfit = totalRevenue - totalExpenses;
  const totalEvents = data.length;
  const avgRevenuePerEvent = totalEvents > 0 ? totalRevenue / totalEvents : 0;
  const avgMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  return { totalRevenue, totalExpenses, netProfit, totalEvents, avgRevenuePerEvent, avgMarginPct };
}

// ─── Aggregate by Quarter ─────────────────────────────────────────────────────

export function aggregateByQuarter(data: RevenueEvent[] = revenueEvents): QuarterAggregate[] {
  const map: Record<string, QuarterAggregate> = {};
  for (const e of data) {
    if (!map[e.quarter]) {
      map[e.quarter] = { quarter: e.quarter, revenue: 0, expenses: 0, netProfit: 0, eventCount: 0 };
    }
    map[e.quarter].revenue += e.totalRevenue;
    map[e.quarter].expenses += e.totalExpenses;
    map[e.quarter].netProfit += e.totalRevenue - e.totalExpenses;
    map[e.quarter].eventCount += 1;
  }
  return Object.values(map).sort((a, b) => quarterSortKey(a.quarter) - quarterSortKey(b.quarter));
}

// ─── Aggregate by Location ────────────────────────────────────────────────────

export function aggregateByLocation(data: RevenueEvent[] = revenueEvents): LocationAggregate[] {
  const map: Record<string, LocationAggregate> = {};
  for (const e of data) {
    if (!map[e.location]) {
      map[e.location] = { location: e.location, revenue: 0, expenses: 0, netProfit: 0, eventCount: 0, avgRevenue: 0 };
    }
    map[e.location].revenue += e.totalRevenue;
    map[e.location].expenses += e.totalExpenses;
    map[e.location].netProfit += e.totalRevenue - e.totalExpenses;
    map[e.location].eventCount += 1;
  }
  return Object.values(map).map((loc) => ({
    ...loc,
    avgRevenue: loc.eventCount > 0 ? loc.revenue / loc.eventCount : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

// ─── Aggregate by Event Type ──────────────────────────────────────────────────

export function aggregateByEventType(data: RevenueEvent[] = revenueEvents): EventTypeAggregate[] {
  const map: Record<string, EventTypeAggregate> = {};
  for (const e of data) {
    if (!map[e.eventType]) {
      map[e.eventType] = { eventType: e.eventType, revenue: 0, expenses: 0, netProfit: 0, eventCount: 0 };
    }
    map[e.eventType].revenue += e.totalRevenue;
    map[e.eventType].expenses += e.totalExpenses;
    map[e.eventType].netProfit += e.totalRevenue - e.totalExpenses;
    map[e.eventType].eventCount += 1;
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue);
}

// ─── Quarterly Trend (revenue + expenses) ─────────────────────────────────────

export function getQuarterlyTrend(): QuarterAggregate[] {
  return aggregateByQuarter();
}

// ─── Date normalization ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const QUARTER_MONTHS: Record<string, number[]> = {
  Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12],
};

export function dateToSortable(dateStr: string, quarter: string): number {
  const normalized = normalizeDate(dateStr, quarter);
  const match = normalized.match(/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return 0;
  const [, m, d, y] = match;
  return parseInt(y) * 10000 + parseInt(m) * 100 + parseInt(d);
}

export function normalizeDate(dateStr: string, quarter: string): string {
  // Already in M/D/YYYY format?
  const numMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (numMatch) {
    const y = numMatch[3].length === 2 ? `20${numMatch[3]}` : numMatch[3];
    return `${parseInt(numMatch[1])}/${parseInt(numMatch[2])}/${y}`;
  }

  // Try to extract month + day from strings like "Sunday Oct 22", "Tuesday Feb 10", or "June 12th, 2025"
  const match = dateStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{2,4}))?/i);
  if (!match) return dateStr;
  const monthStr = match[1].toLowerCase();
  const day = parseInt(match[2]);
  const month = MONTH_MAP[monthStr];
  if (!month) return dateStr;

  // Prefer explicit year in the date string; otherwise derive from quarter
  const explicitYear = match[3] ? parseInt(match[3].length === 2 ? `20${match[3]}` : match[3]) : null;
  const qMatch = quarter.match(/(\d{4})/);
  if (!explicitYear && !qMatch) return `${month}/${day}`;
  let year = explicitYear ?? parseInt(qMatch![1]);

  // Validate month fits quarter (handles edge cases)
  const qLabel = quarter.match(/Q(\d)/)?.[1];
  if (qLabel) {
    const expectedMonths = QUARTER_MONTHS[`Q${qLabel}`];
    if (expectedMonths && !expectedMonths.includes(month)) {
      // Month doesn't match quarter — might be a mislabel, just use the year
    }
  }

  return `${month}/${day}/${year}`;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

export function fmtCurrency(n: number, compact = false): string {
  if (!Number.isFinite(n)) return "$0";
  if (compact) {
    if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "0.0%";
  return `${n.toFixed(1)}%`;
}

export function eventTypeLabel(t: string): string {
  const labels: Record<string, string> = {
    "open-play": "Pipeline",
    corporate: "Consulting",
    "off-sand": "Delivery",
  };
  return labels[t] ?? t;
}
