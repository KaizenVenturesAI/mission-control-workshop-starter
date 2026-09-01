// ── Global Search Index ──
// Client-side search across all Mission Control data sources.
// Fetches from API routes for JSON-backed data, imports static TS data directly.

import { agents } from "@/data/agents";
import { PROJECTS } from "@/data/devlog";

// ── Types ──

export type SearchCategory =
  | "Contacts"
  | "Accounts"
  | "Activities"
  | "Board Meetings"
  | "Dev Log"
  | "Agents"
  | "Action Items"
  | "Pages";

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  href: string;
  icon: string;
  score: number;
}

// ── Pages (hardcoded) ──

const PAGES: { title: string; subtitle: string; href: string; icon: string; keywords: string }[] = [
  { title: "Dashboard", subtitle: "Overview & metrics", href: "/", icon: "◈", keywords: "dashboard home overview metrics" },
  { title: "CRM / Contacts", subtitle: "Contact & account management", href: "/contacts", icon: "☷", keywords: "crm contacts accounts relationships" },
  { title: "Agentic Board Meetings", subtitle: "Strategy runs & memos", href: "/strategy", icon: "◆", keywords: "board meetings strategy memos" },
  { title: "Development Log", subtitle: "Projects & sprints", href: "/activity", icon: "◉", keywords: "dev log activity projects sprints" },
  { title: "Agentic Org Chart", subtitle: "Unified agent directory & hierarchy", href: "/people/agentic-org-chart", icon: "⊞", keywords: "agents directory status agent map network topology org chart hierarchy" },
  { title: "Permissions", subtitle: "Access matrix", href: "/permissions", icon: "⛨", keywords: "permissions access matrix" },
  { title: "Usage & Spend", subtitle: "Token costs & provider usage", href: "/usage", icon: "◎", keywords: "usage spend tokens cost" },
  { title: "Calendar", subtitle: "Schedule & events", href: "/calendar", icon: "▦", keywords: "calendar schedule events" },
  { title: "Action Board", subtitle: "Action items & tasks from meetings", href: "/action-board", icon: "☰", keywords: "action board items tasks kanban deadlines owners" },
  { title: "Search", subtitle: "Global search", href: "/search", icon: "⌕", keywords: "search find" },
];

// ── Scoring ──

// Field weight tiers for search relevance
const WEIGHT_PRIMARY = 1.2;   // name, title, meetingTitle
const WEIGHT_SECONDARY = 1.0; // company, stage, type, theme, summary
const WEIGHT_BODY = 0.8;      // content, memo, emails, tags, keywords

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function fieldScore(query: string, field: string | undefined): number {
  if (!query || !field) return 0;
  const q = query.toLowerCase();
  const f = field.toLowerCase();
  if (f === q) return 100;
  if (f.startsWith(q)) return 80;
  let best = 0;
  if (f.includes(q)) best = 50;
  const words = f.split(/\s+/);
  for (const w of words) {
    if (w === q) best = Math.max(best, 90);
    else if (w.startsWith(q)) best = Math.max(best, 70);
  }
  return best;
}

/** Score a query against weighted fields. Each entry is [weight, ...fieldValues]. */
function weightedScore(query: string, fields: [number, ...(string | undefined)[]][]): number {
  if (!query) return 1; // show everything when no query
  let best = 0;
  for (const [weight, ...values] of fields) {
    for (const v of values) {
      const s = fieldScore(query, v);
      if (s > 0) best = Math.max(best, s * weight);
    }
  }
  return best;
}

/** Legacy helper — all fields equally weighted (1.0). Used by Pages search. */
function matchScore(query: string, ...fields: (string | undefined)[]): number {
  if (!query) return 1;
  return weightedScore(query, fields.map((f) => [1.0, f]));
}

// ── Data Fetching ──

interface CRMContact {
  id: string;
  name: string;
  company?: string;
  emails: string[];
  tags: string[];
  stage: string;
  title?: string;
}

interface CRMAccount {
  id: string;
  name: string;
  type: string;
  subType: string;
}

interface CRMActivity {
  id: string;
  contactId: string;
  type: string;
  content: string;
  summary?: string;
  meetingTitle?: string;
  occurredAt: string;
}

interface StrategyRun {
  id: string;
  date: string;
  theme: string;
  status: string;
  memo: string;
}

interface ActionItemSearch {
  id: string;
  title: string;
  owner: string;
  department: string;
  type: string;
  status: string;
  sourceMeeting: string;
  relatedAccount: string;
  priority: string;
  deadline: string | null;
}

let cachedContacts: CRMContact[] | null = null;
let cachedAccounts: CRMAccount[] | null = null;
let cachedActivities: CRMActivity[] | null = null;
let cachedRuns: StrategyRun[] | null = null;
let cachedActionItems: ActionItemSearch[] | null = null;

async function fetchJsonArray<T>(url: string): Promise<T[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    return asArray<T>(await response.json());
  } catch {
    return [];
  }
}

export async function loadSearchData() {
  const [contactsRes, accountsRes, activitiesRes, runsRes, actionItemsRes] = await Promise.all([
    cachedContacts ? Promise.resolve(null) : fetchJsonArray<CRMContact>("/api/crm/contacts"),
    cachedAccounts ? Promise.resolve(null) : fetchJsonArray<CRMAccount>("/api/crm/accounts"),
    cachedActivities ? Promise.resolve(null) : fetchJsonArray<CRMActivity>("/api/crm/activities"),
    cachedRuns ? Promise.resolve(null) : fetchJsonArray<StrategyRun>("/api/strategy-runs"),
    cachedActionItems ? Promise.resolve(null) : fetchJsonArray<ActionItemSearch>("/api/action-items"),
  ]);
  if (contactsRes) cachedContacts = contactsRes;
  if (accountsRes) cachedAccounts = accountsRes;
  if (activitiesRes) cachedActivities = activitiesRes;
  if (runsRes) cachedRuns = runsRes;
  if (actionItemsRes) cachedActionItems = actionItemsRes;
}

export function isDataLoaded(): boolean {
  return !!(cachedContacts && cachedAccounts && cachedActivities && cachedRuns && cachedActionItems);
}

// ── Search Functions ──

function searchContacts(query: string): SearchResult[] {
  if (!cachedContacts) return [];
  const results: SearchResult[] = [];
  for (const c of cachedContacts) {
    const emails = asStringArray(c.emails);
    const tags = asStringArray(c.tags);
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(c.name), asString(c.title)],
      [WEIGHT_SECONDARY, asString(c.company), asString(c.stage)],
      [WEIGHT_BODY, ...emails, ...tags],
    ]);
    if (score > 0) {
      results.push({
        id: `contact-${c.id}`,
        category: "Contacts",
        title: asString(c.name) ?? "Unnamed contact",
        subtitle: [asString(c.title), asString(c.company)].filter(Boolean).join(" · ") || asString(c.stage) || emails[0] || "",
        href: `/contacts?select=${c.id}`,
        icon: "☷",
        score,
      });
    }
  }
  return results;
}

function searchAccounts(query: string): SearchResult[] {
  if (!cachedAccounts) return [];
  const results: SearchResult[] = [];
  for (const a of cachedAccounts) {
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(a.name)],
      [WEIGHT_SECONDARY, asString(a.type), asString(a.subType)],
    ]);
    if (score > 0) {
      results.push({
        id: `account-${a.id}`,
        category: "Accounts",
        title: asString(a.name) ?? "Unnamed account",
        subtitle: [asString(a.type), asString(a.subType)].filter(Boolean).join(" · "),
        href: `/contacts?account=${a.id}`,
        icon: "⊞",
        score,
      });
    }
  }
  return results;
}

function searchActivities(query: string): SearchResult[] {
  if (!cachedActivities) return [];
  const results: SearchResult[] = [];
  const dateById = new Map<string, string>();
  for (const a of cachedActivities) {
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(a.meetingTitle)],
      [WEIGHT_SECONDARY, asString(a.summary), asString(a.type)],
      [WEIGHT_BODY, asString(a.content)],
    ]);
    if (score > 0) {
      const id = `activity-${a.id}`;
      dateById.set(id, asString(a.occurredAt) ?? "");
      const preview = asString(a.meetingTitle) || asString(a.summary) || asString(a.content) || "Activity";
      results.push({
        id,
        category: "Activities",
        title: preview.length > 80 ? preview.slice(0, 80) + "…" : preview,
        subtitle: [asString(a.type), asString(a.occurredAt)].filter(Boolean).join(" · "),
        href: `/contacts?activity=${a.id}`,
        icon: "◉",
        score,
      });
    }
  }
  // Recency tie-break: same-score results sorted by occurredAt descending
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(dateById.get(b.id) ?? 0).getTime() - new Date(dateById.get(a.id) ?? 0).getTime();
  });
  return results;
}

function searchBoardMeetings(query: string): SearchResult[] {
  if (!cachedRuns) return [];
  const results: SearchResult[] = [];
  const dateById = new Map<string, string>();
  for (const r of cachedRuns) {
    const memoPreview = asString(r.memo)?.slice(0, 200);
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(r.theme)],
      [WEIGHT_SECONDARY, asString(r.date), asString(r.status)],
      [WEIGHT_BODY, memoPreview],
    ]);
    if (score > 0) {
      const id = `run-${r.id}`;
      dateById.set(id, asString(r.date) ?? "");
      results.push({
        id,
        category: "Board Meetings",
        title: asString(r.theme) ?? "Board meeting",
        subtitle: [asString(r.date), asString(r.status)].filter(Boolean).join(" · "),
        href: `/strategy?run=${r.id}`,
        icon: "◆",
        score,
      });
    }
  }
  // Recency tie-break: same-score results sorted by date descending
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(dateById.get(b.id) ?? 0).getTime() - new Date(dateById.get(a.id) ?? 0).getTime();
  });
  return results;
}

function searchDevLog(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const p of PROJECTS) {
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(p.name)],
      [WEIGHT_SECONDARY, asString(p.goal), asString(p.status)],
    ]);
    if (score > 0) {
      results.push({
        id: `project-${p.id}`,
        category: "Dev Log",
        title: p.name,
        subtitle: `${p.status} · ${p.sprints.length} sprints`,
        href: `/activity?project=${p.id}`,
        icon: "◉",
        score,
      });
    }
    for (const s of asArray<(typeof p.sprints)[number]>(p.sprints)) {
      const sScore = weightedScore(query, [
        [WEIGHT_PRIMARY, asString(s.name)],
        [WEIGHT_SECONDARY, asString(s.summary), asString(s.status)],
      ]);
      if (sScore > 0) {
        results.push({
          id: `sprint-${s.id}`,
          category: "Dev Log",
          title: s.name,
          subtitle: `${p.name} · ${s.status}`,
          href: `/activity?project=${p.id}`,
          icon: "◉",
          score: sScore,
        });
      }
    }
  }
  return results;
}

function searchAgents(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const a of agents) {
    const capabilities = asStringArray(a.capabilities);
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(a.name)],
      [WEIGHT_SECONDARY, asString(a.role), asString(a.owner), asString(a.model)],
      [WEIGHT_BODY, ...capabilities],
    ]);
    if (score > 0) {
      results.push({
        id: `agent-${a.id}`,
        category: "Agents",
        title: a.name,
        subtitle: `${a.role} · ${a.status}`,
        href: `/people/agentic-org-chart?agent=${a.id}`,
        icon: "⊞",
        score,
      });
    }
  }
  return results;
}

function searchActionItems(query: string): SearchResult[] {
  if (!cachedActionItems) return [];
  const results: SearchResult[] = [];
  for (const item of cachedActionItems) {
    const score = weightedScore(query, [
      [WEIGHT_PRIMARY, asString(item.title)],
      [WEIGHT_SECONDARY, asString(item.owner), asString(item.department), asString(item.type), asString(item.sourceMeeting)],
      [WEIGHT_BODY, asString(item.relatedAccount), asString(item.priority), asString(item.status)],
    ]);
    if (score > 0) {
      results.push({
        id: `action-${item.id}`,
        category: "Action Items",
        title: asString(item.title) ?? "Action item",
        subtitle: [asString(item.owner), asString(item.department), asString(item.status)?.replace(/_/g, " ")].filter(Boolean).join(" · "),
        href: `/action-board?item=${item.id}`,
        icon: "☰",
        score,
      });
    }
  }
  return results;
}

function searchPages(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const p of PAGES) {
    const score = matchScore(query, p.title, p.subtitle, p.keywords);
    if (score > 0) {
      results.push({
        id: `page-${p.href}`,
        category: "Pages",
        title: p.title,
        subtitle: p.subtitle,
        href: p.href,
        icon: p.icon,
        score,
      });
    }
  }
  return results;
}

// ── Main Search ──

export interface GroupedResults {
  category: SearchCategory;
  results: SearchResult[];
  total: number;
}

export function search(query: string, limit?: number): GroupedResults[] {
  const allSearchers = [
    searchPages,
    searchAgents,
    searchContacts,
    searchAccounts,
    searchActivities,
    searchBoardMeetings,
    searchDevLog,
    searchActionItems,
  ];

  const groups: GroupedResults[] = [];

  for (const searcher of allSearchers) {
    const results = searcher(query);
    if (results.length > 0) {
      results.sort((a, b) => b.score - a.score);
      groups.push({
        category: results[0].category,
        results: limit ? results.slice(0, limit) : results,
        total: results.length,
      });
    }
  }

  return groups;
}

export function totalResultCount(groups: GroupedResults[]): number {
  return groups.reduce((sum, g) => sum + g.total, 0);
}
