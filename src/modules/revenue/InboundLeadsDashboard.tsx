"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import { CopyableField } from "@/components/CopyableField";
import { InlineEditText } from "@/components/InlineEdit";
import { CRMFilterDropdown, CRMPicker, EnumPicker } from "@/components/CRMPicker";
import { SearchableAccountSelect, type AccountOption } from "@/components/SearchableAccountSelect";
import { scoreLead } from "@/lib/inbound/leadScoring";
import { getValidLeadTransitions } from "@/lib/crm/lifecycle";
import { toDisplayId } from "@/lib/crm/displayId";
import { useCRMBulkBar } from "@/components/CRMShell";
import { BulkConvertLeadModal, ConvertLeadModal } from "@/components/crm/ConvertLeadModal";
import { BulkActionBar, BulkInterestPrompt, BulkOwnerPrompt, BulkPicklistPrompt, bulkButtonStyle, LensToggleRow, LineageChips, OwnerBadge, OwnerSelect } from "@/components/crm/FunnelPhase2";
import { CrmActionBar, CrmDrawerSection, CrmLinkedRecordAction, CrmRecordFooter, CrmRecordHeader, crmActionButtonStyle, crmDangerActionButtonStyle } from "@/components/crm/CrmRecordLayout";
import { CRM_OWNERS } from "@/lib/crm/owners";
import { CRM_INTERESTS, normalizeInterests } from "@/lib/crm/interests";
import {
  INBOUND_LEAD_SOURCES,
  INBOUND_LEAD_STATUSES,
  type InboundLeadEvent,
  type InboundLeadMarket,
  type InboundLeadRecord,
  type InboundLeadSource,
  type InboundLeadStatus,
  type InboundLeadType,
} from "./inboundLeadsTypes";

interface StatsData {
  volumeTrend: Array<{
    date: string;
    total: number;
    corporate: number;
    partnership: number;
    academyLa: number;
    academyMiami: number;
  }>;
  funnel: Array<{
    status: InboundLeadStatus;
    label: string;
    count: number;
  }>;
  responseTime: {
    trackedCount: number;
    avgResponseTimeMs: number | null;
    medianResponseTimeMs: number | null;
    p90ResponseTimeMs: number | null;
    buckets: Array<{
      key: string;
      label: string;
      count: number;
    }>;
  };
}

const TYPE_CONFIG: Record<InboundLeadType, { label: string; emoji: string; color: string; market: string }> = {
  corporate: { label: "Mission Control Builds", emoji: "🏢", color: "#60A5FA", market: "Cross-market" },
  partnership: { label: "Referral Partnerships", emoji: "🤝", color: "#A78BFA", market: "Cross-market" },
  "academy-la": { label: "Half-Day Installs", emoji: "⚙", color: "#34D399", market: "Remote / onsite" },
  "academy-miami": { label: "Full-Day Installs", emoji: "◆", color: "#FB923C", market: "Remote / onsite" },
};

const STATUS_CONFIG: Record<InboundLeadStatus, { label: string; color: string }> = {
  new: { label: "New", color: "#F59E0B" },
  contacted: { label: "Contacted", color: "#60A5FA" },
  qualified: { label: "Qualified", color: "#A78BFA" },
  scheduled: { label: "Scheduled", color: "#818CF8" },
  confirmed: { label: "Confirmed", color: "#34D399" },
  paid: { label: "Paid", color: "#22C55E" },
  active: { label: "Active", color: "#14B8A6" },
  closed: { label: "Closed", color: "#6B7280" },
  lost: { label: "Lost", color: "#EF4444" },
};

const VIEW_OPTIONS = [
  { key: "ops", label: "Lead Ops" },
  { key: "day", label: "Day View" },
] as const;

const MARKET_OPTIONS: Array<{ value: InboundLeadMarket | "all"; label: string }> = [
  { value: "all", label: "All markets" },
  { value: "la", label: "Los Angeles" },
  { value: "miami", label: "Miami" },
  { value: "other", label: "Other" },
];
const SOURCE_LABEL: Record<InboundLeadSource, string> = {
  website: "Website",
  referral: "Referral",
  dm: "DM",
  partner: "Partner",
  event: "Event",
  other: "Other",
};
const ASSIGNEE_OPTIONS = CRM_OWNERS;
const TYPE_OPTIONS: Array<InboundLeadType | "all"> = ["all", "corporate", "partnership", "academy-la", "academy-miami"];
const STATUS_OPTIONS: Array<InboundLeadStatus | "all"> = ["all", ...INBOUND_LEAD_STATUSES];
const STATUS_ORDER = new Map(INBOUND_LEAD_STATUSES.map((status, index) => [status, index]));

type DashboardView = (typeof VIEW_OPTIONS)[number]["key"];
type MarketFilter = InboundLeadMarket | "all";
type SourceFilter = InboundLeadSource | "all";
type AssigneeFilter = (typeof ASSIGNEE_OPTIONS)[number] | "all";

function normalizeFilterValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item !== "all");
  if (typeof value === "string" && value && value !== "all") return [value];
  return [];
}

interface FilterState {
  typeFilter: string[];
  statusFilter: string[];
  assigneeFilter: string[];
  marketFilter: string[];
  sourceFilter: string[];
  search: string;
}

interface LeadView {
  id: string;
  name: string;
  filters: FilterState;
}

const LEAD_VIEWS_KEY = "inbound-lead-views";

const DEFAULT_VIEWS: LeadView[] = [
  {
    id: "default-open",
    name: "My open leads",
    filters: { typeFilter: [], statusFilter: ["new"], assigneeFilter: [], marketFilter: [], sourceFilter: [], search: "" },
  },
  {
    id: "default-new-week",
    name: "New this week",
    filters: { typeFilter: [], statusFilter: ["new"], assigneeFilter: [], marketFilter: [], sourceFilter: [], search: "" },
  },
  {
    id: "default-la-academy",
    name: "Half-Day Installs",
    filters: { typeFilter: ["academy-la"], statusFilter: [], assigneeFilter: [], marketFilter: [], sourceFilter: [], search: "" },
  },
];

function useLeadViews() {
  const [views, setViews] = useState<LeadView[]>(() => {
    if (typeof window === "undefined") return DEFAULT_VIEWS;
    try {
      const stored = window.localStorage.getItem(LEAD_VIEWS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LeadView[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((view) => ({
            ...view,
            filters: {
              typeFilter: normalizeFilterValues(view?.filters?.typeFilter),
              statusFilter: normalizeFilterValues(view?.filters?.statusFilter),
              assigneeFilter: normalizeFilterValues(view?.filters?.assigneeFilter),
              marketFilter: normalizeFilterValues(view?.filters?.marketFilter),
              sourceFilter: normalizeFilterValues(view?.filters?.sourceFilter),
              search: typeof view?.filters?.search === "string" ? view.filters.search : "",
            },
          }));
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_VIEWS;
  });

  const persist = (updated: LeadView[]) => {
    setViews(updated);
    try { window.localStorage.setItem(LEAD_VIEWS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const saveView = (name: string, filters: FilterState) => {
    const newView: LeadView = { id: `view-${Date.now()}`, name: name.trim(), filters };
    persist([...views, newView]);
  };

  const deleteView = (id: string) => persist(views.filter((v) => v.id !== id));

  return { views, saveView, deleteView };
}

function getPrimaryName(lead: InboundLeadRecord): string {
  return lead.name || lead.companyName || lead.contactName || "Unknown lead";
}

function getMarketLocation(lead: InboundLeadRecord): string {
  if (lead.market === "la") return "Los Angeles";
  if (lead.market === "miami") return "Miami";
  if (lead.market === "other") return "Other";
  // Legacy fallback for older records without first-class market
  if (lead.type === "academy-miami") {
    const location = typeof lead.metadata?.location === "string" ? lead.metadata.location.trim() : "";
    return location || TYPE_CONFIG[lead.type].market;
  }
  return TYPE_CONFIG[lead.type].market;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function getUrgencyHours(lead: InboundLeadRecord): number {
  const received = new Date(lead.receivedAt).getTime();
  if (Number.isNaN(received)) return 0;
  return (Date.now() - received) / (1000 * 60 * 60);
}

type SLATier = "watch" | "warning" | "critical";

const SLA_TIER_CONFIG: Record<SLATier, { label: string; bg: string; color: string; minHours: number }> = {
  watch:    { label: "1h+",  bg: "rgba(251,191,36,0.15)",  color: "#FCD34D", minHours: 1 },
  warning:  { label: "4h+",  bg: "rgba(251,146,60,0.15)",  color: "#FB923C", minHours: 4 },
  critical: { label: "24h+", bg: "rgba(239,68,68,0.16)",   color: "#FCA5A5", minHours: 24 },
};

function getSLATier(lead: InboundLeadRecord): SLATier | null {
  if (lead.status !== "new") return null;
  const hours = getUrgencyHours(lead);
  if (hours >= 24) return "critical";
  if (hours >= 4)  return "warning";
  if (hours >= 1)  return "watch";
  return null;
}

function isUrgentLead(lead: InboundLeadRecord): boolean {
  return getSLATier(lead) !== null;
}

function getResponseTimeMs(lead: InboundLeadRecord): number | null {
  if (typeof lead.responseTimeMs === "number" && lead.responseTimeMs >= 0) return lead.responseTimeMs;
  if (lead.contactedAt) {
    const diff = new Date(lead.contactedAt).getTime() - new Date(lead.receivedAt).getTime();
    return Number.isFinite(diff) && diff >= 0 ? diff : null;
  }
  return null;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const diffMs = Date.now() - parsed.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatResponseTime(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "Awaiting first touch";
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function formatAverageDuration(ms: number | null): string {
  return ms ? `${formatResponseTime(ms)} avg` : "Not tracked yet";
}

function formatDateLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMiniDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metaString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getWebsiteLeadMetadata(lead: InboundLeadRecord) {
  const metadata = isRecord(lead.metadata) ? lead.metadata : {};
  const workflow = isRecord(metadata.websiteWorkflow) ? metadata.websiteWorkflow : {};
  const slack = isRecord(workflow.slack) ? workflow.slack : null;
  const research = isRecord(workflow.research) ? workflow.research : null;
  const duplicateCandidates = research && Array.isArray(research.duplicateCandidates) ? research.duplicateCandidates.filter(isRecord) : [];
  const rawForm = isRecord(metadata.rawForm) ? metadata.rawForm : {};
  const isWebsiteLead = lead.source === "website" || isRecord(metadata.rawForm) || isRecord(metadata.websiteWorkflow);
  return { metadata, workflow, slack, research, duplicateCandidates, rawForm, isWebsiteLead };
}

function getLeadSummary(lead: InboundLeadRecord): string {
  const bits: string[] = [];
  const meta = lead.metadata ?? {};

  if (lead.companyName && lead.companyName !== lead.name) bits.push(lead.companyName);
  if (typeof meta.people === "string" && meta.people) bits.push(`${meta.people} people`);
  if (typeof meta.budget === "string" && meta.budget) bits.push(`Budget ${meta.budget}`);
  if (typeof meta.category === "string" && meta.category) bits.push(meta.category);
  if (typeof meta.level === "string" && meta.level) bits.push(meta.level);
  if (typeof meta.location === "string" && meta.location && lead.type !== "academy-miami") bits.push(meta.location);
  if (bits.length === 0) bits.push(lead.email || lead.phone || "No extra detail yet");

  return bits.join(" • ");
}

function getSheetUrl(lead: InboundLeadRecord): string | null {
  if (!lead.sourceSheet) return null;
  return `https://docs.google.com/spreadsheets/d/${lead.sourceSheet}/edit`;
}

function groupLeadsByDay(leads: InboundLeadRecord[]) {
  const grouped = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    const key = lead.date ?? lead.receivedAt.slice(0, 10) ?? "Unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), lead]);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      groups: Array.from(
        items.reduce((map, lead) => {
          const current = map.get(lead.type) ?? [];
          map.set(lead.type, [...current, lead]);
          return map;
        }, new Map<InboundLeadType, InboundLeadRecord[]>()),
      )
        .sort(([a], [b]) => TYPE_CONFIG[a].label.localeCompare(TYPE_CONFIG[b].label))
        .map(([type, typeLeads]) => ({
          type,
          leads: [...typeLeads].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
        })),
    }));
}

function patchErrorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  return `API returned ${status}`;
}

function linkedContactHref(id: string): string {
  return `/contacts?select=${toDisplayId(id, "contact")}`;
}

function linkedAccountHref(id: string): string {
  return `/contacts?object=accounts&select=${toDisplayId(id, "account")}`;
}

function linkedOpportunityHref(id: string): string {
  return `/contacts?object=opportunities&select=${toDisplayId(id, "opportunity")}`;
}

export function InboundLeadsDashboard() {
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<InboundLeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<DashboardView>("ops");
  const [marketFilter, setMarketFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [savingExpectedValueId, setSavingExpectedValueId] = useState<string | null>(null);
  const [editingExpectedValue, setEditingExpectedValue] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const { views: savedViews, saveView, deleteView } = useLeadViews();
  const [showViewsPanel, setShowViewsPanel] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [leadEvents, setLeadEvents] = useState<InboundLeadEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [crmLinkageResult, setCrmLinkageResult] = useState<CrmLinkageResult | null>(null);
  const [crmLinkageLoading, setCrmLinkageLoading] = useState(false);
  const [crmLinkageError, setCrmLinkageError] = useState<string | null>(null);
  const [crmLinkageApplied, setCrmLinkageApplied] = useState(false);
  const [lifecycleToast, setLifecycleToast] = useState<string | null>(null);

  // ─── Source Attribution / Trends / Duplicates ───
  // ─── Bulk Selection ───
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [bulkConvertOpen, setBulkConvertOpen] = useState(false);
  const [bulkConvertError, setBulkConvertError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const leadsRes = await fetch("/api/inbound", { cache: "no-store" });

      if (!leadsRes.ok) {
        throw new Error(`Leads API returned ${leadsRes.status}`);
      }

      const leadsData = await leadsRes.json();
      setLeads(Array.isArray(leadsData) ? (leadsData as InboundLeadRecord[]) : []);

    } catch (err) {
      setLeads([]);
      setError(err instanceof Error ? err.message : "Unable to load CRM leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedLeadId) return;
    if (!leads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(null);
    }
  }, [leads, selectedLeadId]);

  useEffect(() => {
    setCrmLinkageResult(null);
    setCrmLinkageError(null);
    setCrmLinkageApplied(false);
  }, [selectedLeadId]);

  useEffect(() => {
    if (!selectedLeadId) {
      setLeadEvents([]);
      return;
    }
    setLoadingEvents(true);
    fetch(`/api/inbound/${selectedLeadId}/events`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLeadEvents(Array.isArray(data) ? (data as InboundLeadEvent[]) : []))
      .catch(() => setLeadEvents([]))
      .finally(() => setLoadingEvents(false));
  }, [selectedLeadId]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/inbound/sync", { method: "POST" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(patchErrorMessage(response.status, payload));
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  const handleLeadPatch = useCallback(async (leadId: string, updates: Partial<InboundLeadRecord>) => {
    const response = await fetch(`/api/inbound/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(patchErrorMessage(response.status, payload));
    }

    const updatedLead = (await response.json()) as InboundLeadRecord;
    setLeads((current) => current.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)));
    return updatedLead;
  }, []);

  const handleStatusChange = useCallback(
    async (lead: InboundLeadRecord, nextStatus: InboundLeadStatus) => {
      const previousLeads = leads;
      const inferredContactedAt = !lead.contactedAt && nextStatus !== "new" ? new Date().toISOString() : lead.contactedAt;
      const optimisticLead: InboundLeadRecord = {
        ...lead,
        status: nextStatus,
        contactedAt: inferredContactedAt,
        responseTimeMs:
          inferredContactedAt && !lead.responseTimeMs
            ? Math.max(new Date(inferredContactedAt).getTime() - new Date(lead.receivedAt).getTime(), 0)
            : lead.responseTimeMs ?? getResponseTimeMs({ ...lead, contactedAt: inferredContactedAt }),
        lastUpdated: new Date().toISOString(),
      };

      setSavingStatusId(lead.id);
      setError(null);
      setLeads((current) => current.map((item) => (item.id === lead.id ? optimisticLead : item)));

      try {
        const res = await fetch("/api/crm/lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "transition-lead", leadId: lead.id, targetStatus: nextStatus }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(patchErrorMessage(res.status, payload));
        }
        const data = await res.json();
        // Show toast for linked CRM updates
        const parts: string[] = [`Lead → ${STATUS_CONFIG[nextStatus].label}`];
        if (data.updates?.contact) parts.push(`Contact → ${String(data.updates.contact.stage)}`);
        if (data.updates?.opportunity) parts.push(`Opp → ${String(data.updates.opportunity.stage)}`);
        if (parts.length > 1) {
          setLifecycleToast(parts.join(", "));
          setTimeout(() => setLifecycleToast(null), 4000);
        }
        await fetchData();
      } catch (err) {
        setLeads(previousLeads);
        setError(err instanceof Error ? err.message : "Status update failed.");
      } finally {
        setSavingStatusId(null);
      }
    },
    [fetchData, leads],
  );

  const handleAssignmentChange = useCallback(
    async (lead: InboundLeadRecord, nextAssignment: string) => {
      const previousLeads = leads;
      const assignedTo = nextAssignment || undefined;
      const optimisticLead: InboundLeadRecord = {
        ...lead,
        assignedTo,
        lastUpdated: new Date().toISOString(),
      };

      setSavingAssignmentId(lead.id);
      setError(null);
      setLeads((current) => current.map((item) => (item.id === lead.id ? optimisticLead : item)));

      try {
        await handleLeadPatch(lead.id, { assignedTo: assignedTo ?? "" });
      } catch (err) {
        setLeads(previousLeads);
        setError(err instanceof Error ? err.message : "Assignment update failed.");
      } finally {
        setSavingAssignmentId(null);
      }
    },
    [handleLeadPatch, leads],
  );

  const handleBulkApply = useCallback(
    async (field: "status" | "assignedTo", value: string) => {
      const ids = Array.from(selectedLeadIds);
      if (!ids.length || !value) return;
      setBulkApplying(true);
      setBulkResult(null);
      let successCount = 0;
      for (const id of ids) {
        try {
          const updates = field === "status" ? { status: value as InboundLeadStatus } : { assignedTo: value };
          const response = await fetch(`/api/inbound/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          if (response.ok) {
            const updatedLead = (await response.json()) as InboundLeadRecord;
            setLeads((current) => current.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)));
            successCount++;
          }
        } catch {
          // continue on error
        }
      }
      setBulkApplying(false);
      setSelectedLeadIds(new Set());
      setBulkResult(`${successCount} lead${successCount !== 1 ? "s" : ""} updated`);
      setTimeout(() => setBulkResult(null), 3000);
    },
    [selectedLeadIds],
  );

  const convertSelected = useCallback(async (path: "A" | "B") => {
    const ids = Array.from(selectedLeadIds);
    if (!ids.length) return;
    setBulkApplying(true);
    setBulkConvertError(null);
    const res = await fetch("/api/crm/leads/convert-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: ids, path }),
    });
    if (res.ok) {
      const data = await res.json();
      setBulkResult(`${data.success ?? 0} succeeded · ${data.failed ?? ids.length} failed`);
    } else {
      setBulkResult(`0 succeeded · ${ids.length} failed`);
      setBulkConvertError(`Convert failed with HTTP ${res.status}`);
    }
    setSelectedLeadIds(new Set());
    setBulkApplying(false);
    setBulkConvertOpen(false);
    await fetchData();
  }, [fetchData, selectedLeadIds]);

  const addBulkTag = useCallback(async (tag: string) => {
    const ids = Array.from(selectedLeadIds);
    if (!ids.length || !(CRM_INTERESTS as readonly string[]).includes(tag)) return;
    setBulkApplying(true);
    let success = 0;
    await Promise.all(ids.map(async (id) => {
      const lead = leads.find((item) => item.id === id);
      if (!lead) return;
      try {
        const tags = normalizeInterests([...(lead.tags ?? []), tag]);
        await handleLeadPatch(id, { tags });
        success++;
      } catch {
        // continue on error
      }
    }));
    setBulkApplying(false);
    setBulkResult(`${success} succeeded · ${ids.length - success} failed`);
    await fetchData();
  }, [fetchData, handleLeadPatch, leads, selectedLeadIds]);

  const deleteSelectedLeads = useCallback(async () => {
    const ids = Array.from(selectedLeadIds);
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(`/api/inbound/${id}`, { method: "DELETE" });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedLeadIds(new Set());
    await fetchData();
  }, [fetchData, selectedLeadIds]);

  const handleExpectedValueSave = useCallback(
    async (lead: InboundLeadRecord, rawValue: string) => {
      const trimmed = rawValue.trim();
      const parsed = trimmed === "" ? undefined : Number(trimmed);
      if (parsed !== undefined && (Number.isNaN(parsed) || parsed < 0)) return;
      setSavingExpectedValueId(lead.id);
      setError(null);
      try {
        await handleLeadPatch(lead.id, { expectedValue: parsed });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Expected value update failed.");
      } finally {
        setSavingExpectedValueId(null);
      }
    },
    [handleLeadPatch],
  );

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return leads.filter((lead) => {
      if (typeFilter.length > 0 && !typeFilter.includes(lead.type)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(lead.status)) return false;
      if (marketFilter.length > 0 && !marketFilter.includes(lead.market ?? "")) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(lead.source ?? "")) return false;

      const normalizedAssignee = lead.assignedTo?.trim() || "Unassigned";
      if (assigneeFilter.length > 0 && !assigneeFilter.includes(normalizedAssignee)) return false;

      if (!query) return true;
      const haystack = [
        getPrimaryName(lead),
        lead.contactName ?? "",
        lead.email ?? "",
        lead.companyName ?? "",
        getLeadSummary(lead),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [assigneeFilter, leads, marketFilter, search, sourceFilter, statusFilter, typeFilter]);
  const lens = searchParams.get("lens") || "all";
  const lensedLeads = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (lens === "hot") return filteredLeads.filter((lead) => scoreLead(lead) >= 70);
    if (lens === "active") return filteredLeads.filter((lead) => !["closed", "lost"].includes(lead.status));
    if (lens === "unassigned") return filteredLeads.filter((lead) => !lead.assignedTo);
    if (lens === "new") return filteredLeads.filter((lead) => lead.receivedAt.slice(0, 10) === today);
    if (lens === "stale") return filteredLeads.filter((lead) => lead.status === "new" && getUrgencyHours(lead) > 4);
    if (lens === "mine") return filteredLeads.filter((lead) => lead.assignedTo === "Alex");
    return filteredLeads;
  }, [filteredLeads, lens]);

  const bulkBarNode = useMemo(() => selectedLeadIds.size > 0 ? (
    <BulkActionBar count={selectedLeadIds.size} result={bulkResult} onClear={() => setSelectedLeadIds(new Set())}>
      <button type="button" disabled={bulkApplying} onClick={() => { setBulkConvertError(null); setBulkConvertOpen(true); }} style={bulkButtonStyle}>Convert...</button>
      <BulkOwnerPrompt onPick={(owner) => void handleBulkApply("assignedTo", owner)} />
      <BulkInterestPrompt onPick={(tag) => void addBulkTag(tag)} />
      <button type="button" disabled={bulkApplying} onClick={() => void handleBulkApply("status", "lost")} style={bulkButtonStyle}>Mark Disqualified</button>
      <button type="button" disabled={bulkApplying} onClick={() => void deleteSelectedLeads()} style={{ ...bulkButtonStyle, color: "#F87171" }}>Delete</button>
    </BulkActionBar>
  ) : null, [addBulkTag, bulkApplying, bulkResult, deleteSelectedLeads, handleBulkApply, selectedLeadIds]);
  useCRMBulkBar(bulkBarNode);

  // Escape key clears bulk selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedLeadIds(new Set());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const groupedLeads = useMemo(() => groupLeadsByDay(lensedLeads), [lensedLeads]);
  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) ?? null, [leads, selectedLeadId]);
  const openLeadCount = useMemo(
    () => lensedLeads.filter((lead) => !["closed", "lost"].includes(lead.status)).length,
    [lensedLeads],
  );
  const urgentLeadCount = useMemo(() => lensedLeads.filter(isUrgentLead).length, [lensedLeads]);
  const assignmentOptions = useMemo(() => {
    return [...ASSIGNEE_OPTIONS].sort((a, b) => a.localeCompare(b));
  }, []);

  const opsColumns = useMemo<StandardTableColumn<InboundLeadRecord>[]>(
    () => [
      {
        key: "_select",
        label: "",
        sortable: false,
        filterable: false,
        minWidth: 36,
        maxWidth: 36,
        thStyle: { padding: "0 8px", textAlign: "center" },
        tdStyle: { padding: "0 8px", textAlign: "center" },
        getValue: () => "",
        render: (lead) => (
          <input
            type="checkbox"
            aria-label="Select lead"
            checked={selectedLeadIds.has(lead.id)}
            onChange={(e) => {
              e.stopPropagation();
              setSelectedLeadIds((prev) => {
                const next = new Set(prev);
                if (e.target.checked) next.add(lead.id);
                else next.delete(lead.id);
                return next;
              });
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: "pointer", accentColor: "var(--color-client-accent, #22D3EE)" }}
          />
        ),
      },
      {
        key: "name",
        label: "Name",
        minWidth: 250,
        getValue: (lead) => getPrimaryName(lead),
        render: (lead) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-client-text)" }}>{getPrimaryName(lead)}</span>
              {(() => { const tier = getSLATier(lead); return tier ? <UrgencyBadge tier={tier} label={`${SLA_TIER_CONFIG[tier].label} — respond`} /> : null; })()}
            </div>
            <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>{lead.email || lead.phone || "No contact info"}</span>
          </div>
        ),
      },
      {
        key: "type",
        label: "Type",
        minWidth: 170,
        getValue: (lead) => TYPE_CONFIG[lead.type].label,
        render: (lead) => <TypeBadge type={lead.type} />,
      },
      {
        key: "marketLocation",
        label: "Market / Location",
        minWidth: 160,
        getValue: (lead) => `${TYPE_CONFIG[lead.type].market} ${getMarketLocation(lead)}`,
        render: (lead) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>{TYPE_CONFIG[lead.type].market}</span>
            {getMarketLocation(lead) !== TYPE_CONFIG[lead.type].market ? (
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{getMarketLocation(lead)}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        minWidth: 170,
        getValue: (lead) => `${String(STATUS_ORDER.get(lead.status) ?? 99).padStart(2, "0")}-${lead.status}`,
        render: (lead) => (
          <div onClick={(event) => event.stopPropagation()}>
            <CRMPicker
              options={[lead.status, ...getValidLeadTransitions(lead.status)].map((status) => ({ value: status, label: STATUS_CONFIG[status].label }))}
              value={lead.status}
              disabled={savingStatusId === lead.id}
              onChange={(value) => {
                if (value) void handleStatusChange(lead, value as InboundLeadStatus);
              }}
              getKey={(option) => option.value}
              getLabel={(option) => option.label}
              size="sm"
              searchable={false}
            />
          </div>
        ),
      },
      {
        key: "assignedTo",
        label: "Assigned To",
        minWidth: 160,
        getValue: (lead) => lead.assignedTo || "Unassigned",
        render: (lead) => (
          <div onClick={(event) => event.stopPropagation()}>
            {savingAssignmentId === lead.id ? <OwnerBadge owner={lead.assignedTo} compact /> : <OwnerSelect value={lead.assignedTo} onChange={(owner) => void handleAssignmentChange(lead, owner)} compact />}
          </div>
        ),
      },
      {
        key: "receivedAt",
        label: "Received",
        minWidth: 155,
        getValue: (lead) => lead.receivedAt,
        render: (lead) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span>{formatTimestamp(lead.receivedAt)}</span>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{formatRelativeTime(lead.receivedAt)}</span>
          </div>
        ),
      },
      {
        key: "responseTime",
        label: "Response Time",
        minWidth: 150,
        getValue: (lead) => {
          const responseMs = getResponseTimeMs(lead);
          return responseMs === null ? "999999999" : String(responseMs).padStart(12, "0");
        },
        render: (lead) => {
          const responseMs = getResponseTimeMs(lead);
          return (
            <span style={{ color: responseMs === null ? "#FBBF24" : "var(--color-client-text)" }}>
              {formatResponseTime(responseMs)}
            </span>
          );
        },
      },
      {
        key: "priorityScore",
        label: "Score",
        minWidth: 80,
        maxWidth: 90,
        align: "right",
        getValue: (lead) => String(scoreLead(lead)).padStart(3, "0"),
        render: (lead) => {
          const score = scoreLead(lead);
          const color = score >= 70 ? "#4ADE80" : score >= 40 ? "#FBBF24" : "#F87171";
          return (
            <span
              style={{
                display: "inline-block",
                minWidth: 36,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 13,
                padding: "2px 8px",
                borderRadius: 6,
                background: `${color}22`,
                color,
                border: `1px solid ${color}55`,
              }}
            >
              {score}
            </span>
          );
        },
      },
      {
        key: "actions",
        label: "Actions",
        sortable: false,
        filterable: false,
        minWidth: 170,
        align: "right",
        render: (lead) => {
          const sheetUrl = getSheetUrl(lead);
          return (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }} onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => setSelectedLeadId(lead.id)} style={actionButtonStyle}>
                View
              </button>
              {sheetUrl ? (
                <a href={sheetUrl} target="_blank" rel="noreferrer" style={secondaryActionStyle}>
                  Sheet
                </a>
              ) : null}
            </div>
          );
        },
      },
    ],
    [assignmentOptions, handleAssignmentChange, handleStatusChange, savingAssignmentId, savingStatusId, selectedLeadIds],
  );

  const dayColumns = useMemo<StandardTableColumn<InboundLeadRecord>[]>(
    () => [
      {
        key: "name",
        label: "Lead",
        minWidth: 220,
        getValue: (lead) => getPrimaryName(lead),
        render: (lead) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{getPrimaryName(lead)}</span>
            <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>{getLeadSummary(lead)}</span>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        minWidth: 120,
        getValue: (lead) => `${String(STATUS_ORDER.get(lead.status) ?? 99).padStart(2, "0")}-${lead.status}`,
        render: (lead) => <StatusChip status={lead.status} />,
      },
      {
        key: "assignedTo",
        label: "Assigned",
        minWidth: 120,
        getValue: (lead) => lead.assignedTo || "Unassigned",
        render: (lead) => <OwnerBadge owner={lead.assignedTo} compact />,
      },
      {
        key: "receivedAt",
        label: "Received",
        minWidth: 150,
        getValue: (lead) => lead.receivedAt,
        render: (lead) => formatTimestamp(lead.receivedAt),
      },
    ],
    [],
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 320, color: "var(--color-client-text-muted)" }}>
        Loading CRM leads…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%", maxWidth: "none" }}>
      {bulkConvertOpen && (
        <BulkConvertLeadModal
          count={selectedLeadIds.size}
          submitting={bulkApplying}
          error={bulkConvertError}
          onClose={() => !bulkApplying && setBulkConvertOpen(false)}
          onSubmit={convertSelected}
        />
      )}
      {lifecycleToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: "10px 18px",
            borderRadius: 10,
            background: "rgba(52,211,153,0.15)",
            border: "1px solid rgba(52,211,153,0.4)",
            color: "#34D399",
            fontSize: 13,
            fontWeight: 600,
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          {lifecycleToast}
        </div>
      )}
      <section style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 860 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={pillStyle("rgba(96,165,250,0.16)", "#93C5FD")}>CRM Leads</span>
              <span style={pillStyle("rgba(52,211,153,0.12)", "#86EFAC")}>{openLeadCount} open</span>
              <span style={pillStyle(urgentLeadCount ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)", urgentLeadCount ? "#FCA5A5" : "var(--color-client-text-muted)")}>{urgentLeadCount} stale new</span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, lineHeight: 1.15, color: "var(--color-client-text)" }}>Lead operations</h2>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--color-client-text-muted)", lineHeight: 1.6 }}>
                Triage, assign, qualify, and convert inbound demand. Reporting panels have moved to the Reporting workflow.
              </p>
            </div>
          </div>

          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid rgba(96,165,250,0.25)",
              background: syncing ? "rgba(96,165,250,0.08)" : "rgba(96,165,250,0.14)",
              color: "#93C5FD",
              fontSize: 13,
              fontWeight: 700,
              cursor: syncing ? "not-allowed" : "pointer",
              minWidth: 122,
            }}
          >
            {syncing ? "Syncing…" : "Sync Sources"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {VIEW_OPTIONS.map((option) => {
            const active = view === option.key;
            return (
              <button key={option.key} type="button" onClick={() => setView(option.key)} style={viewToggleStyle(active)}>
                {option.label}
              </button>
            );
          })}
        </div>

        {/* Views (saved filter presets) */}
        <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setShowViewsPanel((v) => !v)}
            style={{ ...controlStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}
          >
            <span>⭐</span> Views {showViewsPanel ? "▲" : "▼"}
          </button>
          {showViewsPanel && (
            <div style={{
              position: "absolute", top: "110%", left: 0, zIndex: 50,
              background: "var(--color-client-surface, #1a1a2e)",
              border: "1px solid var(--color-client-border, #333)",
              borderRadius: 8, padding: "10px 12px", minWidth: 260,
              boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-client-text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Saved Views</div>
              {savedViews.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--color-client-text-dim)", padding: "4px 0" }}>No saved views yet</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {savedViews.map((v) => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setTypeFilter(v.filters.typeFilter);
                          setStatusFilter(v.filters.statusFilter);
                          setAssigneeFilter(v.filters.assigneeFilter);
                          setMarketFilter(v.filters.marketFilter);
                          setSourceFilter(v.filters.sourceFilter);
                          setSearch(v.filters.search);
                          setShowViewsPanel(false);
                        }}
                        style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: "var(--color-client-text, #e5e7eb)", cursor: "pointer", fontSize: 13, padding: "4px 0" }}
                      >
                        {v.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteView(v.id)}
                        title="Delete view"
                        style={{ background: "transparent", border: "none", color: "var(--color-client-text-dim)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, borderTop: "1px solid var(--color-client-border, #333)", paddingTop: 10, display: "flex", gap: 6 }}>
                <input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="View name…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newViewName.trim()) {
                      saveView(newViewName, { typeFilter, statusFilter, assigneeFilter, marketFilter, sourceFilter, search });
                      setNewViewName("");
                    }
                  }}
                  style={{ ...controlStyle, flex: 1, fontSize: 12 }}
                />
                <button
                  type="button"
                  disabled={!newViewName.trim()}
                  onClick={() => {
                    if (newViewName.trim()) {
                      saveView(newViewName, { typeFilter, statusFilter, assigneeFilter, marketFilter, sourceFilter, search });
                      setNewViewName("");
                    }
                  }}
                  style={{ ...controlStyle, cursor: newViewName.trim() ? "pointer" : "not-allowed", opacity: newViewName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}
                >
                  Save current view
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <CRMFilterDropdown
            options={TYPE_OPTIONS.filter((type): type is InboundLeadType => type !== "all").map((type) => ({ value: type, label: TYPE_CONFIG[type].label }))}
            selectedValues={typeFilter}
            onChange={setTypeFilter}
            allLabel="All types"
            minWidth={150}
          />

          <CRMFilterDropdown
            options={STATUS_OPTIONS.filter((status): status is InboundLeadStatus => status !== "all").map((status) => ({ value: status, label: STATUS_CONFIG[status].label }))}
            selectedValues={statusFilter}
            onChange={setStatusFilter}
            allLabel="All statuses"
            minWidth={160}
          />

          <CRMFilterDropdown
            options={[{ value: "Unassigned", label: "Unassigned" }, ...assignmentOptions.map((name) => ({ value: name, label: name }))]}
            selectedValues={assigneeFilter}
            onChange={setAssigneeFilter}
            allLabel="All assignees"
            minWidth={170}
          />

          <CRMFilterDropdown
            options={MARKET_OPTIONS.filter((opt) => opt.value !== "all").map((opt) => ({ value: opt.value, label: opt.label }))}
            selectedValues={marketFilter}
            onChange={setMarketFilter}
            allLabel="All markets"
            minWidth={155}
          />

          <CRMFilterDropdown
            options={INBOUND_LEAD_SOURCES.map((src) => ({ value: src, label: SOURCE_LABEL[src] }))}
            selectedValues={sourceFilter}
            onChange={setSourceFilter}
            allLabel="All sources"
            minWidth={155}
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            style={{ ...controlStyle, minWidth: 260, flex: "1 1 260px" }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--color-client-text-dim)" }}>
          <span>{lensedLeads.length} visible lead{lensedLeads.length === 1 ? "" : "s"}</span>
          <span>{urgentLeadCount} urgent</span>
          <span>Reporting owns trend and source analytics</span>
        </div>

        {error ? <div style={errorStyle}>{error}</div> : null}
      </section>
      <LensToggleRow object="leads" lenses={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "unassigned", label: "Unassigned" }, { key: "hot", label: "Hot" }, { key: "new", label: "New today" }, { key: "stale", label: "Stale" }, { key: "mine", label: "My leads" }]} />

      {view === "ops" ? (
        <section>
          <div style={panelStyle}>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-client-text)" }}>Lead Ops table</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-client-text-muted)" }}>
                StandardTable triage view with inline qualification and assignment. Click a row to open the detail drawer.
              </p>
            </div>
            <StandardTable<InboundLeadRecord>
              tableKey="inbound-lead-ops-table"
              columns={opsColumns}
              data={lensedLeads}
              toolbar={
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Select-all row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-client-text-muted)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        aria-label="Select all leads"
                        checked={selectedLeadIds.size > 0 && selectedLeadIds.size === lensedLeads.length}
                        ref={(el) => { if (el) el.indeterminate = selectedLeadIds.size > 0 && selectedLeadIds.size < lensedLeads.length; }}
                        onChange={(e) => setSelectedLeadIds(e.target.checked ? new Set(lensedLeads.map((l) => l.id)) : new Set())}
                        style={{ cursor: "pointer", accentColor: "var(--color-client-accent, #22D3EE)" }}
                      />
                      Select all
                    </label>
                    {bulkResult ? <span style={{ fontSize: 12, color: "#4ADE80" }}>{bulkResult}</span> : null}
                  </div>
                  {/* Bulk action bar */}
                  {selectedLeadIds.size > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(34,211,238,0.08)", borderRadius: 8, border: "1px solid rgba(34,211,238,0.2)", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)" }}>{selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? "s" : ""} selected</span>
                      <BulkPicklistPrompt
                        label={bulkApplying ? "Applying..." : "Set status..."}
                        options={INBOUND_LEAD_STATUSES.map((status) => ({ value: status, label: STATUS_CONFIG[status].label }))}
                        onPick={(status) => void handleBulkApply("status", status)}
                      />
                      <BulkPicklistPrompt
                        label={bulkApplying ? "Applying..." : "Assign to..."}
                        options={assignmentOptions.map((name) => ({ value: name }))}
                        onPick={(assignee) => void handleBulkApply("assignedTo", assignee)}
                      />
                      <button
                        type="button"
                        disabled={bulkApplying}
                        onClick={() => setSelectedLeadIds(new Set())}
                        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: "transparent", color: "var(--color-client-text-muted)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", marginLeft: "auto" }}
                      >
                        Clear selection
                      </button>
                    </div>
                  ) : null}
                </div>
              }
              getRowKey={(lead) => lead.id}
              defaultSortKey="priorityScore"
              defaultSortDir="desc"
              onRowClick={(lead) => setSelectedLeadId(lead.id)}
              selectedRowKey={selectedLeadId}
              emptyMessage="No leads match the current filters"
              getRowStyle={(lead) => {
                const tier = getSLATier(lead);
                if (!tier) return {};
                const rowColors: Record<SLATier, { bg: string; shadow: string }> = {
                  watch:    { bg: "rgba(251,191,36,0.04)",  shadow: "inset 3px 0 0 #FCD34D" },
                  warning:  { bg: "rgba(251,146,60,0.05)",  shadow: "inset 3px 0 0 #FB923C" },
                  critical: { bg: "rgba(239,68,68,0.05)",   shadow: "inset 3px 0 0 #EF4444" },
                };
                return { background: rowColors[tier].bg, boxShadow: rowColors[tier].shadow };
              }}
            />
          </div>

          {selectedLead && typeof document !== "undefined" && createPortal(
            <LeadDrawer
              key={selectedLeadId}
              lead={selectedLead}
              leadEvents={leadEvents}
              loadingEvents={loadingEvents}
              savingStatusId={savingStatusId}
              savingExpectedValueId={savingExpectedValueId}
              crmLinkageResult={crmLinkageResult}
              crmLinkageLoading={crmLinkageLoading}
              crmLinkageError={crmLinkageError}
              crmLinkageApplied={crmLinkageApplied}
              onClose={() => setSelectedLeadId(null)}
              onStatusChange={handleStatusChange}
              onLeadPatch={handleLeadPatch}
              onExpectedValueSave={handleExpectedValueSave}
              onDelete={(leadId) => { setLeads((prev) => prev.filter((l) => l.id !== leadId)); setSelectedLeadId(null); }}
              onRefreshLeads={fetchData}
              setCrmLinkageResult={setCrmLinkageResult}
              setCrmLinkageLoading={setCrmLinkageLoading}
              setCrmLinkageError={setCrmLinkageError}
              setCrmLinkageApplied={setCrmLinkageApplied}
              setLeads={setLeads}
            />,
            document.body,
          )}
        </section>
      ) : (
        <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-client-text)" }}>Chronological intake</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-client-text-muted)" }}>
              The original day-grouped review remains available for volume scans and historical intake review.
            </p>
          </div>

          {groupedLeads.length === 0 ? (
            <div style={panelStyle}>No leads match the current filters.</div>
          ) : (
            groupedLeads.map((day) => (
              <section key={day.date} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-client-text)" }}>{formatDateLabel(day.date)}</div>
                  <div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>
                    {day.groups.reduce((sum, group) => sum + group.leads.length, 0)} lead{day.groups.reduce((sum, group) => sum + group.leads.length, 0) === 1 ? "" : "s"}
                  </div>
                </div>

                {day.groups.map((group) => (
                  <div key={`${day.date}-${group.type}`} style={panelStyle}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <TypeBadge type={group.type} />
                        <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>{TYPE_CONFIG[group.type].market}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>{group.leads.length} lead{group.leads.length === 1 ? "" : "s"}</span>
                    </div>

                    <StandardTable<InboundLeadRecord>
                      tableKey={`inbound-day-view-${day.date}-${group.type}`}
                      columns={dayColumns}
                      data={group.leads}
                      getRowKey={(lead) => lead.id}
                      defaultSortKey="receivedAt"
                      defaultSortDir="desc"
                      onRowClick={(lead) => {
                        setSelectedLeadId(lead.id);
                        setView("ops");
                      }}
                      emptyMessage="No leads in this slice yet"
                    />
                  </div>
                ))}
              </section>
            ))
          )}
        </section>
      )}
    </div>
  );
}

// ─── Lead Drawer (full-screen, portal-rendered) ────────────────────────────

function LeadDrawerSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <CrmDrawerSection title={title} action={action}>{children}</CrmDrawerSection>;
}

const LEAD_DRAWER_WIDTH_KEY = "client-lead-drawer-width";
const LEAD_DRAWER_DEFAULT_WIDTH = 560;
const LEAD_DRAWER_MIN_WIDTH = 380;
const LEAD_DRAWER_MAX_WIDTH_RATIO = 0.82;

const AVATAR_GRADIENTS: string[] = [
  "linear-gradient(135deg, #60A5FA, #818CF8)",
  "linear-gradient(135deg, #34D399, #22D3EE)",
  "linear-gradient(135deg, #FB923C, #F59E0B)",
  "linear-gradient(135deg, #A78BFA, #EC4899)",
  "linear-gradient(135deg, #14B8A6, #34D399)",
];

function LeadDrawer({
  lead,
  leadEvents,
  loadingEvents,
  savingStatusId,
  savingExpectedValueId,
  crmLinkageResult,
  crmLinkageLoading,
  crmLinkageError,
  crmLinkageApplied,
  onClose,
  onStatusChange,
  onLeadPatch,
  onExpectedValueSave,
  onDelete,
  onRefreshLeads,
  setCrmLinkageResult,
  setCrmLinkageLoading,
  setCrmLinkageError,
  setCrmLinkageApplied,
  setLeads,
}: {
  lead: InboundLeadRecord;
  leadEvents: InboundLeadEvent[];
  loadingEvents: boolean;
  savingStatusId: string | null;
  savingExpectedValueId: string | null;
  crmLinkageResult: CrmLinkageResult | null;
  crmLinkageLoading: boolean;
  crmLinkageError: string | null;
  crmLinkageApplied: boolean;
  onClose: () => void;
  onStatusChange: (lead: InboundLeadRecord, next: InboundLeadStatus) => Promise<void>;
  onLeadPatch: (leadId: string, updates: Partial<InboundLeadRecord>) => Promise<InboundLeadRecord>;
  onExpectedValueSave: (lead: InboundLeadRecord, rawValue: string) => Promise<void>;
  onDelete: (leadId: string) => void;
  onRefreshLeads: () => Promise<void>;
  setCrmLinkageResult: (r: CrmLinkageResult | null) => void;
  setCrmLinkageLoading: (v: boolean) => void;
  setCrmLinkageError: (v: string | null) => void;
  setCrmLinkageApplied: (v: boolean) => void;
  setLeads: React.Dispatch<React.SetStateAction<InboundLeadRecord[]>>;
}) {
  const drawerElRef = useRef<HTMLDivElement | null>(null);
  const isResizing = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(true);
  const [editingExpectedValue, setEditingExpectedValue] = useState<string>("");
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [promoteCreateOpp, setPromoteCreateOpp] = useState(true);
  const [promoteOppName, setPromoteOppName] = useState("");
  const [promoteOppValue, setPromoteOppValue] = useState("");
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [promoteAccountId, setPromoteAccountId] = useState("");
  const [promoteAccountName, setPromoteAccountName] = useState("");
  const [promoteNewAccountName, setPromoteNewAccountName] = useState("");
  const [promoteAccounts, setPromoteAccounts] = useState<AccountOption[]>([]);
  const [promoteAccountsLoading, setPromoteAccountsLoading] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (typeof window === "undefined") return LEAD_DRAWER_DEFAULT_WIDTH;
    try {
      const stored = window.localStorage.getItem(LEAD_DRAWER_WIDTH_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (!isNaN(w) && w >= LEAD_DRAWER_MIN_WIDTH) return w;
      }
    } catch { /* ignore */ }
    return LEAD_DRAWER_DEFAULT_WIDTH;
  });

  // Callback ref for scroll-to-top
  const drawerRef = useCallback((node: HTMLDivElement | null) => {
    drawerElRef.current = node;
    if (node) {
      node.scrollTop = 0;
      requestAnimationFrame(() => { node.scrollTop = 0; });
      setTimeout(() => { node.scrollTop = 0; }, 50);
      setTimeout(() => { node.scrollTop = 0; }, 300);
    }
  }, []);

  // Body scroll lock
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    window.scrollTo(0, 0);

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [lead.id]);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Escape to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Persist drawer width
  useEffect(() => {
    try { window.localStorage.setItem(LEAD_DRAWER_WIDTH_KEY, String(drawerWidth)); } catch { /* ignore */ }
  }, [drawerWidth]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const maxW = window.innerWidth * LEAD_DRAWER_MAX_WIDTH_RATIO;
      const delta = startX - ev.clientX;
      const newWidth = Math.min(maxW, Math.max(LEAD_DRAWER_MIN_WIDTH, startWidth + delta));
      setDrawerWidth(newWidth);
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [isMobile, drawerWidth]);

  // Inline field save helpers
  const handleSourceChange = useCallback(async (value: string | null) => {
    try {
      await onLeadPatch(lead.id, { source: (value ?? undefined) as InboundLeadSource | undefined });
    } catch { /* toast handled upstream */ }
  }, [lead.id, onLeadPatch]);

  const handleMarketChange = useCallback(async (value: string | null) => {
    try {
      await onLeadPatch(lead.id, { market: (value ?? undefined) as InboundLeadMarket | undefined });
    } catch { /* toast handled upstream */ }
  }, [lead.id, onLeadPatch]);

  // CRM linkage handlers
  const handleCrmPrepare = useCallback(async () => {
    setCrmLinkageLoading(true);
    setCrmLinkageError(null);
    setCrmLinkageApplied(false);
    try {
      const res = await fetch(`/api/inbound/${lead.id}/crm-linkage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "prepare" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `API ${res.status}`);
      setCrmLinkageResult(data as CrmLinkageResult);
    } catch (err) {
      setCrmLinkageError(err instanceof Error ? err.message : "CRM linkage failed");
    } finally {
      setCrmLinkageLoading(false);
    }
  }, [lead.id, setCrmLinkageApplied, setCrmLinkageError, setCrmLinkageLoading, setCrmLinkageResult]);

  const handleCrmApply = useCallback(async () => {
    setCrmLinkageLoading(true);
    setCrmLinkageError(null);
    try {
      const res = await fetch(`/api/inbound/${lead.id}/crm-linkage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply-existing" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `API ${res.status}`);
      setCrmLinkageResult(data as CrmLinkageResult);
      setCrmLinkageApplied(true);
      const leadRes = await fetch(`/api/inbound/${lead.id}`, { cache: "no-store" });
      if (leadRes.ok) {
        const updated = await leadRes.json() as InboundLeadRecord;
        setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
      }
    } catch (err) {
      setCrmLinkageError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setCrmLinkageLoading(false);
    }
  }, [lead.id, setCrmLinkageApplied, setCrmLinkageError, setCrmLinkageLoading, setCrmLinkageResult, setLeads]);

  const handleCrmPromote = useCallback(async (mergeContactId?: string, mergeAccountId?: string) => {
    setCrmLinkageLoading(true);
    setCrmLinkageError(null);
    try {
      const res = await fetch(`/api/inbound/${lead.id}/crm-linkage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "promote", mergeContactId, mergeAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `API ${res.status}`);
      setCrmLinkageResult(data as CrmLinkageResult);
      setCrmLinkageApplied(true);
      const leadRes = await fetch(`/api/inbound/${lead.id}`, { cache: "no-store" });
      if (leadRes.ok) {
        const updated = await leadRes.json() as InboundLeadRecord;
        setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
      }
    } catch (err) {
      setCrmLinkageError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setCrmLinkageLoading(false);
    }
  }, [lead.id, setCrmLinkageApplied, setCrmLinkageError, setCrmLinkageLoading, setCrmLinkageResult, setLeads]);

  const openPromoteDialog = useCallback(() => {
    const isInstallProgram = lead.type === "academy-la" || lead.type === "academy-miami";
    const defaultName = isInstallProgram
      ? `${lead.contactName || lead.name} - ${lead.type === "academy-la" ? "Half-Day Install" : "Full-Day Install"}`
      : `${lead.companyName || lead.name} ${lead.type}`;
    setPromoteOppName(defaultName);
    setPromoteOppValue(String(lead.expectedValue ?? ""));
    setPromoteCreateOpp(true);
    setPromoteAccountId("");
    setPromoteAccountName("");
    setPromoteNewAccountName("");
    setShowPromoteDialog(true);
    // Fetch accounts for the dropdown
    setPromoteAccountsLoading(true);
    fetch("/api/crm/accounts")
      .then((res) => res.ok ? res.json() : [])
      .then((data: AccountOption[]) => setPromoteAccounts(data))
      .catch(() => setPromoteAccounts([]))
      .finally(() => setPromoteAccountsLoading(false));
  }, [lead.companyName, lead.contactName, lead.name, lead.type, lead.expectedValue]);

  const handleLifecyclePromote = useCallback(async () => {
    setPromoteLoading(true);
    try {
      const res = await fetch("/api/crm/lifecycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promote-lead",
          leadId: lead.id,
          createOpportunity: promoteCreateOpp,
          opportunityName: promoteOppName.trim() || undefined,
          opportunityValue: promoteOppValue.trim() ? Number(promoteOppValue) : undefined,
          ...(promoteAccountId ? { accountId: promoteAccountId } : {}),
          ...(promoteNewAccountName ? { newAccountName: promoteNewAccountName } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `API returned ${res.status}`);
      }
      // Refresh lead data
      const leadRes = await fetch(`/api/inbound/${lead.id}`, { cache: "no-store" });
      if (leadRes.ok) {
        const updated = await leadRes.json() as InboundLeadRecord;
        setLeads((prev) => prev.map((l) => l.id === updated.id ? updated : l));
      }
      setShowPromoteDialog(false);
    } catch (err) {
      setCrmLinkageError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setPromoteLoading(false);
    }
  }, [lead.id, promoteCreateOpp, promoteOppName, promoteOppValue, promoteAccountId, promoteNewAccountName, setCrmLinkageError, setLeads]);

  const openConvertDialog = useCallback(() => {
    setConvertError(null);
    setShowConvertDialog(true);
    setPromoteAccountsLoading(true);
    fetch("/api/crm/accounts")
      .then((res) => res.ok ? res.json() : [])
      .then((data: AccountOption[]) => setPromoteAccounts(data))
      .catch(() => setPromoteAccounts([]))
      .finally(() => setPromoteAccountsLoading(false));
  }, []);

  const handleConvertLead = useCallback(async (payload: { path: "A" | "B" | "C"; existingAccountId?: string; accountName?: string; contactName: string; contactEmail: string }) => {
    setPromoteLoading(true);
    setCrmLinkageError(null);
    setConvertError(null);
    try {
      const res = await fetch(`/api/crm/leads/${lead.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: payload.path,
          existingAccountId: payload.existingAccountId,
          accountOverrides: payload.path === "A" && !payload.existingAccountId && payload.accountName ? { name: payload.accountName } : undefined,
          contactOverrides: {
            name: payload.contactName,
            emails: payload.contactEmail ? [payload.contactEmail.toLowerCase()] : [],
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `API returned ${res.status}`);
      }
      const data = await res.json();
      setLeads((prev) => prev.map((l) => l.id === data.lead.id ? data.lead : l));
      await onRefreshLeads();
      setShowConvertDialog(false);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Convert failed";
      setConvertError(message);
      setCrmLinkageError(message);
    } finally {
      setPromoteLoading(false);
    }
  }, [lead.id, onClose, onRefreshLeads, setCrmLinkageError, setLeads]);

  const name = getPrimaryName(lead);
  const avatarLetter = name.charAt(0).toUpperCase();
  const avatarGradient = AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
  const score = scoreLead(lead);
  const scoreColor = score >= 70 ? "#4ADE80" : score >= 40 ? "#FBBF24" : "#F87171";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 90,
        }}
      />
      {/* Drawer */}
      <div
        ref={drawerRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? "100%" : isFullScreen ? "100%" : `min(${drawerWidth}px, 92vw)`,
          background: "#0c0c12",
          borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.06)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
          zIndex: 100,
          overflowY: "auto",
          padding: isMobile ? "16px" : "28px 24px",
        }}
      >
        {/* Resize handle */}
        {!isMobile && !isFullScreen && (
          <div
            onMouseDown={handleResizeStart}
            style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div style={{ width: 3, height: 40, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
          </div>
        )}

        {/* Top bar: full-screen toggle + close */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 20 }}>
          {!isMobile && (
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? "Exit full-screen" : "Full-screen"}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                color: isFullScreen ? "#60A5FA" : "var(--color-client-text-secondary)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 15 }}>{isFullScreen ? "↙" : "↔"}</span>
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              width: isMobile ? 44 : 32, height: isMobile ? 44 : 32, borderRadius: 8,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--color-client-text-secondary)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}
          >
            {isMobile ? "←" : "✕"}
          </button>
        </div>

        {/* Content wrapper — max-width for readability in full-screen */}
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <CrmRecordHeader
            eyebrow="Lead"
            avatarLabel={avatarLetter}
            avatarGradient={avatarGradient}
            title={name}
            badges={(
              <>
                <TypeBadge type={lead.type} />
                <StatusChip status={lead.status} />
              </>
            )}
          />

          <CrmActionBar>
            {lead.email && (
              <a href={`mailto:${lead.email}`} style={crmActionButtonStyle}>
                <span>📧</span> Email
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} style={crmActionButtonStyle}>
                <span>📞</span> Call
              </a>
            )}
            {!lead.crmContactId && !lead.crmAccountId && (
              <button
                onClick={openConvertDialog}
                disabled={promoteLoading}
                style={{ ...crmActionButtonStyle, opacity: promoteLoading ? 0.5 : 1, cursor: promoteLoading ? "not-allowed" : "pointer" }}
              >
                <span>⬆️</span> Convert
              </button>
            )}
            <LeadDeleteButton leadId={lead.id} onDeleted={() => onDelete(lead.id)} styleOverride={crmDangerActionButtonStyle} />
          </CrmActionBar>

          <LineageChips
            chips={[
              { label: "Lead", active: true },
              ...(lead.convertedToContactId || lead.crmContactId ? [{ label: `Contact: ${toDisplayId((lead.convertedToContactId || lead.crmContactId)!, "contact")}`, href: linkedContactHref((lead.convertedToContactId || lead.crmContactId)!) }] : []),
              ...(lead.convertedToAccountId || lead.crmAccountId ? [{ label: `Account: ${toDisplayId((lead.convertedToAccountId || lead.crmAccountId)!, "account")}`, href: linkedAccountHref((lead.convertedToAccountId || lead.crmAccountId)!) }] : []),
              ...(lead.crmOpportunityId ? [{ label: `Opportunity: ${toDisplayId(lead.crmOpportunityId, "opportunity")}`, href: linkedOpportunityHref(lead.crmOpportunityId) }] : []),
            ]}
          />

          {/* ── Identity ── */}
          <LeadDrawerSection title="Identity">
            <div style={{ display: "grid", gap: 6 }}>
              <InlineEditText
                label="Name"
                value={lead.name ?? ""}
                onSave={async (v) => { await onLeadPatch(lead.id, { name: v }); }}
                placeholder="—"
                fontSize={13}
              />
              <InlineEditText
                label="Company"
                value={lead.companyName ?? ""}
                onSave={async (v) => { await onLeadPatch(lead.id, { companyName: v }); }}
                placeholder="—"
                fontSize={13}
              />
              <CopyableField label="Email" value={lead.email} />
              <CopyableField label="Phone" value={lead.phone} />
              <InlineEditText
                label="Contact"
                value={lead.contactName ?? ""}
                onSave={async (v) => { await onLeadPatch(lead.id, { contactName: v }); }}
                placeholder="—"
                fontSize={13}
              />
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Tags</span>
                {lead.tags && lead.tags.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {lead.tags.map((tag) => (
                      <span key={tag} style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(52,211,153,0.28)", background: "rgba(52,211,153,0.10)", color: "#86efac", fontSize: 11, fontWeight: 600 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>—</span>
                )}
              </div>
            </div>
          </LeadDrawerSection>

          {/* ── Lead Details ── */}
          <LeadDrawerSection title="Lead Details">
            <div style={{ display: "grid", gap: 14 }}>
              {/* Type */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", minWidth: 100 }}>Type</span>
                <TypeBadge type={lead.type} />
              </div>

              {/* Status + transitions */}
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Status</span>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <StatusChip status={lead.status} />
                  {getValidLeadTransitions(lead.status).map((next) => (
                    <button
                      key={next}
                      type="button"
                      disabled={savingStatusId === lead.id}
                      onClick={() => void onStatusChange(lead, next)}
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: `1px solid ${STATUS_CONFIG[next].color}55`,
                        background: `${STATUS_CONFIG[next].color}12`,
                        color: STATUS_CONFIG[next].color,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: savingStatusId === lead.id ? "not-allowed" : "pointer",
                        opacity: savingStatusId === lead.id ? 0.5 : 1,
                      }}
                    >
                      → {STATUS_CONFIG[next].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source — EnumPicker inline */}
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Source</span>
                <EnumPicker
                  picklistKey="leadSource"
                  value={lead.source ?? null}
                  onChange={(v) => void handleSourceChange(v)}
                  placeholder="Select source…"
                  size="sm"
                  clearable
                />
              </div>

              {/* Market — EnumPicker inline */}
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Market</span>
                <EnumPicker
                  picklistKey="leadMarket"
                  value={lead.market ?? null}
                  onChange={(v) => void handleMarketChange(v)}
                  placeholder="Select market…"
                  size="sm"
                  clearable
                />
              </div>

              {/* Assigned To */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", minWidth: 100 }}>Owner</span>
                <OwnerSelect value={lead.assignedTo} onChange={(owner) => void onLeadPatch(lead.id, { assignedTo: owner })} compact />
              </div>

              {/* Lead Score */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", minWidth: 100 }}>Lead Score</span>
                <span style={{
                  display: "inline-block", minWidth: 36, textAlign: "center", fontWeight: 700, fontSize: 13,
                  padding: "2px 8px", borderRadius: 6, background: `${scoreColor}22`, color: scoreColor, border: `1px solid ${scoreColor}55`,
                }}>
                  {score}
                </span>
              </div>

              {/* Expected Value — inline editable */}
              <div style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Expected Value</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={editingExpectedValue !== "" ? editingExpectedValue : (lead.expectedValue ?? "")}
                    onChange={(e) => setEditingExpectedValue(e.target.value)}
                    onBlur={() => {
                      if (editingExpectedValue !== "") {
                        void onExpectedValueSave(lead, editingExpectedValue);
                        setEditingExpectedValue("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editingExpectedValue !== "") {
                        void onExpectedValueSave(lead, editingExpectedValue);
                        setEditingExpectedValue("");
                      }
                    }}
                    placeholder="—"
                    style={{
                      width: 140, padding: "5px 8px", borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
                      color: "var(--color-client-text)", fontSize: 13, outline: "none",
                    }}
                    disabled={savingExpectedValueId === lead.id}
                  />
                  {savingExpectedValueId === lead.id ? (
                    <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Saving…</span>
                  ) : lead.expectedValue !== undefined ? (
                    <span style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>{formatCurrency(lead.expectedValue)}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </LeadDrawerSection>

          <WebsiteLeadWorkflowSections lead={lead} />

          {/* ── Timeline ── */}
          <LeadDrawerSection title="Timeline">
            <div style={{ display: "grid", gap: 8 }}>
              <DetailItem label="Received" value={
                <span>{formatTimestamp(lead.receivedAt)} <span style={{ color: "var(--color-client-text-dim)", fontSize: 11 }}>({formatRelativeTime(lead.receivedAt)})</span></span>
              } />
              <DetailItem label="Contacted" value={lead.contactedAt ? formatTimestamp(lead.contactedAt) : "—"} />
              <DetailItem label="Response time" value={formatResponseTime(getResponseTimeMs(lead))} />
              <DetailItem label="Last updated" value={formatTimestamp(lead.lastUpdated)} />
            </div>
          </LeadDrawerSection>

          {/* ── Notes ── */}
          <LeadDrawerSection title="Notes">
            <div style={{ display: "grid", gap: 10 }}>
              <InlineEditText
                label="Notes"
                value={lead.notes ?? ""}
                onSave={async (v) => { await onLeadPatch(lead.id, { notes: v }); }}
                placeholder="Add notes…"
                fontSize={13}
                multiline
              />
              {/* Content from form submission */}
              {lead.content && (
                <div style={{ fontSize: 12, color: "var(--color-client-text-muted)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-client-text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Form Submission</div>
                  {lead.content}
                </div>
              )}
              {/* Summary */}
              <DetailItem label="Summary" value={getLeadSummary(lead)} />
            </div>
          </LeadDrawerSection>

          {/* ── CRM Linkage ── */}
          <LeadDrawerSection title="CRM Linkage">
            {/* Clickable CRM links */}
            {(lead.crmContactId || lead.crmAccountId || lead.crmOpportunityId) && (
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {lead.crmContactId && (
                  <CrmLinkedRecordAction
                    label="Contact"
                    displayId={toDisplayId(lead.crmContactId, "contact")}
                    href={linkedContactHref(lead.crmContactId)}
                    detail="Open converted contact"
                    tone="green"
                  />
                )}
                {lead.crmAccountId && (
                  <CrmLinkedRecordAction
                    label="Account"
                    displayId={toDisplayId(lead.crmAccountId, "account")}
                    href={linkedAccountHref(lead.crmAccountId)}
                    detail="Open linked account"
                    tone="blue"
                  />
                )}
                {lead.crmOpportunityId && (
                  <CrmLinkedRecordAction
                    label="Opportunity"
                    displayId={toDisplayId(lead.crmOpportunityId, "opportunity")}
                    href={linkedOpportunityHref(lead.crmOpportunityId)}
                    detail="Open linked opportunity"
                    tone="purple"
                  />
                )}
              </div>
            )}
            <CrmLinkageSection
              lead={lead}
              result={crmLinkageResult}
              loading={crmLinkageLoading}
              error={crmLinkageError}
              applied={crmLinkageApplied}
              onPrepare={handleCrmPrepare}
              onApply={handleCrmApply}
              onPromote={handleCrmPromote}
            />
          </LeadDrawerSection>

          {/* ── Activity Log ── */}
          <LeadDrawerSection title="Activity Log">
            <LeadEventTimeline events={leadEvents} loading={loadingEvents} />
          </LeadDrawerSection>

          <CrmRecordFooter rawId={lead.id} entityType="lead" />
        </div>
      </div>

      {showConvertDialog && (
        <ConvertLeadModal
          lead={lead}
          accounts={promoteAccounts}
          accountsLoading={promoteAccountsLoading}
          submitting={promoteLoading}
          error={convertError}
          onClose={() => !promoteLoading && setShowConvertDialog(false)}
          onSubmit={handleConvertLead}
        />
      )}

      {/* ── Promote Dialog ── */}
      {showPromoteDialog && createPortal(
        <>
          <div
            onClick={() => !promoteLoading && setShowPromoteDialog(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200 }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: 480, maxWidth: "90vw", background: "#0c0c12", borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.1)", padding: 28, zIndex: 201,
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--color-client-text)" }}>
              Promote Lead to CRM
            </h3>
            <p style={{ margin: "8px 0 20px", fontSize: 13, color: "var(--color-client-text-dim)" }}>
              This will create a Contact and link to an Account in the CRM.
            </p>

            {/* Account Selection */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 6, display: "block" }}>Account</label>
              <SearchableAccountSelect
                accounts={promoteAccounts}
                value={promoteAccountId}
                loading={promoteAccountsLoading}
                onChange={(id, name) => {
                  setPromoteAccountId(id);
                  setPromoteAccountName(name);
                  setPromoteNewAccountName("");
                }}
                onCreateNew={(name) => {
                  setPromoteNewAccountName(name);
                  setPromoteAccountId("");
                  setPromoteAccountName(name);
                }}
                placeholder={lead.companyName || "Search or select an account…"}
              />
              {promoteNewAccountName && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#34D399" }}>
                  Will create new account: <strong>{promoteNewAccountName}</strong>
                </div>
              )}
              {!promoteAccountId && !promoteNewAccountName && lead.companyName && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-client-text-dim)" }}>
                  Default: will use &ldquo;{lead.companyName}&rdquo;
                </div>
              )}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--color-client-text)" }}>
              <input
                type="checkbox"
                checked={promoteCreateOpp}
                onChange={(e) => setPromoteCreateOpp(e.target.checked)}
                style={{ accentColor: "#34D399" }}
              />
              Also create an Opportunity
            </label>

            {promoteCreateOpp && (
              <div style={{ display: "grid", gap: 12, marginTop: 16, paddingLeft: 4 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 4, display: "block" }}>Opportunity Name</label>
                  <input
                    value={promoteOppName}
                    onChange={(e) => setPromoteOppName(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text)", fontSize: 13, outline: "none" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 4, display: "block" }}>Expected Value</label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--color-client-text-dim)" }}>$</span>
                    <input
                      type="number"
                      value={promoteOppValue}
                      onChange={(e) => setPromoteOppValue(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px 8px 24px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text)", fontSize: 13, outline: "none" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {crmLinkageError && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#F87171" }}>{crmLinkageError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setShowPromoteDialog(false)}
                disabled={promoteLoading}
                style={{ padding: "8px 16px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text-dim)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleLifecyclePromote}
                disabled={promoteLoading}
                style={{ padding: "8px 16px", borderRadius: 8, background: promoteLoading ? "rgba(255,255,255,0.06)" : "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", color: "#86efac", fontSize: 13, fontWeight: 700, cursor: promoteLoading ? "not-allowed" : "pointer" }}
              >
                {promoteLoading ? "Promoting\u2026" : "Promote"}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function RevenuePipelineCard({
  totalValue,
  leadCount,
  breakdown,
}: {
  totalValue: number;
  leadCount: number;
  breakdown: Array<{ status: InboundLeadStatus; label: string; count: number; value: number }>;
}) {
  const activeBuckets = breakdown.filter((b) => b.value > 0 || b.count > 0);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#34D399", letterSpacing: "-0.03em" }}>
          {formatCurrency(totalValue)}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>
          {leadCount} lead{leadCount === 1 ? "" : "s"} · pipeline estimate
        </div>
      </div>
      {activeBuckets.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {activeBuckets.map((bucket) => (
            <div
              key={bucket.status}
              style={{
                display: "grid",
                gridTemplateColumns: "100px minmax(0,1fr) auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_CONFIG[bucket.status].color }}>
                {bucket.label}
              </span>
              <div
                style={{
                  height: 10,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.max((bucket.value / totalValue) * 100, bucket.value > 0 ? 6 : 0)}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: STATUS_CONFIG[bucket.status].color,
                  }}
                />
              </div>
              <div style={{ textAlign: "right", minWidth: 140 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)" }}>
                  {formatCurrency(bucket.value)}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginLeft: 6 }}>
                  {bucket.count} lead{bucket.count === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SourceAttributionTable({
  sourceAttribution,
}: {
  sourceAttribution: Record<string, { leads: number; converted: number; rate: number }>;
}) {
  const rows = Object.entries(sourceAttribution)
    .map(([source, data]) => ({ source, ...data }))
    .filter((row) => row.leads > 0)
    .sort((a, b) => b.leads - a.leads);

  if (rows.length === 0) return null;

  const SOURCE_LABEL_MAP: Record<string, string> = {
    website: "Website",
    referral: "Referral",
    dm: "DM",
    partner: "Partner",
    event: "Event",
    other: "Other",
  };

  type SourceRow = { source: string; leads: number; converted: number; rate: number };
  const columns: StandardTableColumn<SourceRow>[] = [
    { key: "source", label: "Source", getValue: (r) => SOURCE_LABEL_MAP[r.source] ?? r.source },
    { key: "leads", label: "Leads", getValue: (r) => String(r.leads) },
    { key: "converted", label: "Converted", getValue: (r) => String(r.converted) },
    {
      key: "rate",
      label: "Rate",
      getValue: (r) => (r.leads > 0 ? String(r.rate) : "-1"),
      render: (r) => (
        <span style={{ color: r.leads > 0 ? "var(--color-client-text)" : "var(--color-client-text-dim)" }}>
          {r.leads > 0 ? `${r.rate}%` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 12 }}>
        Source Attribution
      </div>
      <StandardTable
        tableKey="source-attribution"
        columns={columns}
        data={rows}
        getRowKey={(r) => r.source}
        defaultSortKey="leads"
        emptyMessage="No sources with leads"
      />
    </div>
  );
}

function AnalyticsCard({
  title,
  subtitle,
  helper,
  span = 1,
  children,
}: {
  title: string;
  subtitle: string;
  helper: string;
  span?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div style={{ ...analyticsCardStyle, gridColumn: span === 2 ? "span 2" : undefined }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-client-text)" }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--color-client-text-muted)", lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      <div>{children}</div>
      <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", lineHeight: 1.5 }}>{helper}</div>
    </div>
  );
}

function EmptyAnalyticsState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ display: "grid", gap: 6, minHeight: 152, alignContent: "center", color: "var(--color-client-text-muted)" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-client-text)" }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function VolumeTrendChart({ data }: { data: StatsData["volumeTrend"] }) {
  const nonZero = data.filter((item) => item.total > 0);
  if (data.length === 0 || nonZero.length === 0) {
    return <EmptyAnalyticsState title="No volume history yet" body="Daily trend cards populate once real lead rows are synced into the unified store." />;
  }

  const width = 520;
  const height = 132;
  const maxValue = Math.max(...data.map((item) => item.total), 1);
  const points = data
    .map((item, index) => {
      const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
      const y = height - (item.total / maxValue) * (height - 22) - 8;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: 148, overflow: "visible" }} role="img" aria-label="Lead volume trend">
        <defs>
          <linearGradient id="leadTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(96,165,250,0.35)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0.02)" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((tick) => {
          const y = 8 + ((height - 22) / 3) * tick;
          return <line key={tick} x1="0" y1={y} x2={width} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />;
        })}
        <polyline points={`0,${height - 8} ${points} ${width},${height - 8}`} fill="url(#leadTrendFill)" stroke="none" />
        <polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((item, index) => {
          const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
          const y = height - (item.total / maxValue) * (height - 22) - 8;
          return <circle key={item.date} cx={x} cy={y} r="4" fill="#93C5FD" stroke="#0F172A" strokeWidth="2" />;
        })}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.length, 7)}, minmax(0, 1fr))`, gap: 8 }}>
        {data.slice(-7).map((item) => (
          <div key={item.date} style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{formatMiniDate(item.date)}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--color-client-text)" }}>{item.total}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownBars({
  items,
}: {
  items: Array<{ key: string; label: string; value: number; share: number; color: string; detail: string }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => (
        <div key={item.key} style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
            <span style={{ color: "var(--color-client-text)", fontWeight: 600 }}>{item.label}</span>
            <span style={{ color: "var(--color-client-text-muted)" }}>{item.value} • {formatShare(item.share)}</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0)}%`, height: "100%", borderRadius: 999, background: item.color }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{item.detail}</div>
        </div>
      ))}
    </div>
  );
}

function FunnelSnapshot({ items }: { items: StatsData["funnel"] }) {
  const maxValue = Math.max(...items.map((item) => item.count), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <div key={item.status} style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr) 40px", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: STATUS_CONFIG[item.status].color, fontWeight: 700 }}>{item.label}</span>
          <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ width: `${Math.max((item.count / maxValue) * 100, item.count > 0 ? 6 : 0)}%`, height: "100%", borderRadius: 999, background: STATUS_CONFIG[item.status].color }} />
          </div>
          <span style={{ fontSize: 12, color: "var(--color-client-text-muted)", textAlign: "right" }}>{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function ResponseTimeSnapshot({ responseTime }: { responseTime: StatsData["responseTime"] }) {
  const maxBucket = Math.max(...responseTime.buckets.map((item) => item.count), 1);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <MiniMetric label="Average" value={formatResponseTime(responseTime.avgResponseTimeMs)} />
        <MiniMetric label="Median" value={formatResponseTime(responseTime.medianResponseTimeMs)} />
        <MiniMetric label="P90" value={formatResponseTime(responseTime.p90ResponseTimeMs)} />
        <MiniMetric label="Tracked" value={String(responseTime.trackedCount)} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {responseTime.buckets.map((bucket) => (
          <div key={bucket.key} style={{ display: "grid", gridTemplateColumns: "80px minmax(0, 1fr) 36px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-client-text)" }}>{bucket.label}</span>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${Math.max((bucket.count / maxBucket) * 100, bucket.count > 0 ? 6 : 0)}%`, height: "100%", borderRadius: 999, background: "#A78BFA" }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--color-client-text-muted)", textAlign: "right" }}>{bucket.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-client-text)" }}>{value}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

function TypeBadge({ type }: { type: InboundLeadType }) {
  const config = TYPE_CONFIG[type];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "5px 12px",
        background: `${config.color}16`,
        color: config.color,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}

function StatusChip({ status }: { status: InboundLeadStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.02em",
        background: `${config.color}18`,
        color: config.color,
        textTransform: "uppercase",
      }}
    >
      {config.label}
    </span>
  );
}

function UrgencyBadge({ label, tier }: { label: string; tier?: SLATier }) {
  const config = tier ? SLA_TIER_CONFIG[tier] : SLA_TIER_CONFIG.critical;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: config.bg,
        color: config.color,
      }}
    >
      {label}
    </span>
  );
}

const EVENT_TYPE_CONFIG: Record<
  InboundLeadEvent["type"],
  { icon: string; label: (meta: Record<string, unknown>) => string }
> = {
  status_change: {
    icon: "⇄",
    label: (meta) =>
      `Status changed: ${String(meta.from ?? "?").toUpperCase()} → ${String(meta.to ?? "?").toUpperCase()}`,
  },
  assignment_change: {
    icon: "👤",
    label: (meta) => {
      const from = meta.from ? String(meta.from) : "Unassigned";
      const to = meta.to ? String(meta.to) : "Unassigned";
      return `Assigned: ${from} → ${to}`;
    },
  },
  note_save: {
    icon: "📝",
    label: () => "Notes updated",
  },
  crm_link: {
    icon: "🔗",
    label: () => "CRM linkage updated",
  },
  sync_created: {
    icon: "🔄",
    label: (meta) => `Synced from ${String(meta.source ?? meta.type ?? "source")}`,
  },
  manual_created: {
    icon: "✏️",
    label: () => "Lead manually created",
  },
};

function LeadEventTimeline({
  events,
  loading,
}: {
  events: InboundLeadEvent[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={{ fontSize: 12, color: "var(--color-client-text-dim)", padding: "8px 0" }}>Loading activity…</div>
    );
  }

  if (events.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--color-client-text-dim)",
          padding: "10px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        No activity recorded yet. Events are written when status, assignment, or notes change.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((event) => {
        const config = EVENT_TYPE_CONFIG[event.type];
        const description = config ? config.label(event.metadata) : event.type;
        const icon = config ? config.icon : "•";
        return (
          <div
            key={event.id}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr",
              gap: 8,
              alignItems: "start",
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1.4 }}>{icon}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, color: "var(--color-client-text)", fontWeight: 600 }}>{description}</span>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
                {formatTimestamp(event.timestamp)} · {event.actor}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── CRM Linkage Section ────────────────────────────────────────────────────

interface CrmLinkageResult {
  leadId: string;
  mode: "prepare" | "apply-existing" | "promote";
  status: "already-linked" | "linked-existing" | "promoted" | "review-needed" | "skipped";
  linked: { contactId?: string; accountId?: string; opportunityId?: string };
  matchedBy: { contact?: string; account?: string; opportunity?: string };
  recommendations: { createContact: boolean; createAccount: boolean; createOpportunity: boolean };
  notes: string[];
}

interface DuplicateCheckResult {
  hasDuplicates: boolean;
  matchingContacts: { id: string; name: string; email: string; matchField: string }[];
  matchingAccounts: { id: string; name: string; matchField: string }[];
}

function CrmLinkageSection({
  lead,
  result,
  loading,
  error,
  applied,
  onPrepare,
  onApply,
  onPromote,
}: {
  lead: InboundLeadRecord;
  result: CrmLinkageResult | null;
  loading: boolean;
  error: string | null;
  applied: boolean;
  onPrepare: () => void;
  onApply: () => void;
  onPromote: (mergeContactId?: string, mergeAccountId?: string) => void;
}) {
  const [mergeContact, setMergeContact] = useState(true);
  const [mergeAccount, setMergeAccount] = useState(true);
  const [dupCheck, setDupCheck] = useState<DuplicateCheckResult | null>(null);
  const [dupLoading, setDupLoading] = useState(false);

  // Run duplicate check when promotion panel appears
  useEffect(() => {
    if (result && result.mode === "prepare" && !applied && !dupCheck) {
      setDupLoading(true);
      fetch("/api/crm/duplicate-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: lead.email,
          phone: lead.phone,
          contactName: lead.contactName || lead.name,
          companyName: lead.companyName,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => { if (data) setDupCheck(data as DuplicateCheckResult); })
        .finally(() => setDupLoading(false));
    }
  }, [result, applied, dupCheck, lead]);

  const hasContact = Boolean(lead.crmContactId ?? result?.linked.contactId);
  const hasAccount = Boolean(lead.crmAccountId ?? result?.linked.accountId);
  const fullyLinked = hasContact && hasAccount && Boolean(lead.crmContactId) && Boolean(lead.crmAccountId);
  const hasExistingMatches =
    result && (
      Boolean(result.linked.contactId) ||
      Boolean(result.linked.accountId)
    );

  const isInstallProgram = lead.type === "academy-la" || lead.type === "academy-miami";
  const academyLabel = lead.type === "academy-la" ? "Half-Day Install" : "Full-Day Install";
  const contactName = lead.contactName || lead.name || "Unknown";
  const companyName = lead.companyName || lead.name || "Unknown";

  const dimStyle: CSSProperties = { fontSize: 11, color: "var(--color-client-text-dim)" };
  const linkStyle: CSSProperties = { fontSize: 12, color: "#86efac", fontFamily: "monospace" };
  const missingStyle: CSSProperties = { fontSize: 12, color: "var(--color-client-text-dim)", fontStyle: "italic" };

  const pillStyle: CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 10px", borderRadius: 12,
    fontSize: 12, fontWeight: 600,
    background: "rgba(34,197,94,0.12)", color: "#86efac",
  };

  // Extract Sprint 5 auto-linkage metadata if available
  const crmMeta = lead.metadata && typeof lead.metadata === "object" && "crmLinkage" in lead.metadata
    ? (lead.metadata.crmLinkage as { status?: string; notes?: string[] } | null)
    : null;

  const showPromotionPanel = result && result.mode === "prepare" && !applied;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
        CRM Linkage
      </div>

      {/* Field status rows */}
      <div style={{ display: "grid", gap: 6 }}>
        {/* Contact */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{lead.crmContactId || result?.linked.contactId ? "✅" : "○"}</span>
          <span style={dimStyle}>Contact</span>
          {lead.crmContactId ? (
            <span style={linkStyle}>{lead.crmContactId}</span>
          ) : result?.linked.contactId ? (
            <span style={{ ...linkStyle, color: "#fbbf24" }}>{result.linked.contactId} {result.matchedBy.contact ? `(via ${result.matchedBy.contact})` : ""}</span>
          ) : (
            <span style={missingStyle}>Not linked</span>
          )}
        </div>
        {/* Account */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>{lead.crmAccountId || result?.linked.accountId ? "✅" : "○"}</span>
          <span style={dimStyle}>Account</span>
          {lead.crmAccountId ? (
            <span style={linkStyle}>{lead.crmAccountId}</span>
          ) : result?.linked.accountId ? (
            <span style={{ ...linkStyle, color: "#fbbf24" }}>{result.linked.accountId} {result.matchedBy.account ? `(via ${result.matchedBy.account})` : ""}</span>
          ) : (
            <span style={missingStyle}>Not linked</span>
          )}
        </div>
      </div>

      {/* Sprint 5 auto-linkage metadata */}
      {crmMeta && (
        <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 10px" }}>
          Auto-linkage: <span style={{ color: "var(--color-client-text-muted)" }}>{String(crmMeta.status ?? "unknown")}</span>
          {Array.isArray(crmMeta.notes) && crmMeta.notes.length > 0 && (
            <ul style={{ margin: "4px 0 0", padding: "0 0 0 16px" }}>
              {crmMeta.notes.map((note, i) => <li key={i} style={{ marginBottom: 2 }}>{note}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Analysis result notes (only when not showing promotion panel) */}
      {result && result.notes.length > 0 && !showPromotionPanel && (
        <div style={{ fontSize: 11, color: "var(--color-client-text-muted)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
          {result.notes.map((note, i) => <div key={i} style={{ marginBottom: 2 }}>{note}</div>)}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "#f87171" }}>{error}</div>
      )}

      {/* ── Promotion panel (shown after prepare) ── */}
      {showPromotionPanel && (
        <div style={{ display: "grid", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Contact section */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-client-text-dim)", marginBottom: 4 }}>Contact</div>
            {result.linked.contactId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {isInstallProgram ? (
                  <span style={pillStyle}>Will merge into {result.linked.contactId}</span>
                ) : mergeContact ? (
                  <>
                    <span style={pillStyle}>Merge into {result.linked.contactId} ✓</span>
                    <button type="button" onClick={() => setMergeContact(false)} style={{ fontSize: 11, color: "#a5b4fc", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Create new instead</button>
                  </>
                ) : (
                  <>
                    <span style={{ ...pillStyle, background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}>Will create: {contactName}</span>
                    <button type="button" onClick={() => setMergeContact(true)} style={{ fontSize: 11, color: "#86efac", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Merge instead</button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>Will create new contact: {contactName}</div>
            )}
          </div>

          {/* Account section */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-client-text-dim)", marginBottom: 4 }}>Account</div>
            {isInstallProgram ? (
              <div style={{ fontSize: 12, color: "#86efac" }}>Auto-assigned to Example Client {academyLabel} workflow</div>
            ) : result.linked.accountId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {mergeAccount ? (
                  <>
                    <span style={pillStyle}>Merge into {result.linked.accountId} ✓</span>
                    <button type="button" onClick={() => setMergeAccount(false)} style={{ fontSize: 11, color: "#a5b4fc", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Create new instead</button>
                  </>
                ) : (
                  <>
                    <span style={{ ...pillStyle, background: "rgba(99,102,241,0.12)", color: "#a5b4fc" }}>Will create: {companyName}</span>
                    <button type="button" onClick={() => setMergeAccount(true)} style={{ fontSize: 11, color: "#86efac", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Merge instead</button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--color-client-text-muted)" }}>Will create new account: {companyName}</div>
            )}
          </div>

          {/* Duplicate check warning */}
          {dupLoading && (
            <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", padding: "8px 0" }}>Checking for duplicates…</div>
          )}
          {dupCheck && dupCheck.hasDuplicates && (
            <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#F59E0B", marginBottom: 8 }}>⚠️ Potential duplicates found</div>
              {dupCheck.matchingContacts.map((m) => (
                <div key={m.id} style={{ fontSize: 12, color: "var(--color-client-text)", marginBottom: 4, cursor: "pointer" }} onClick={() => window.open(`/contacts?select=${m.id}`, "_blank")}>
                  {m.name} {m.email ? `(${m.email})` : ""} <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>Matched on: {m.matchField}</span>
                </div>
              ))}
              {dupCheck.matchingAccounts.map((m) => (
                <div key={m.id} style={{ fontSize: 12, color: "var(--color-client-text)", marginBottom: 4, cursor: "pointer" }} onClick={() => window.open(`/contacts?object=accounts&select=${m.id}`, "_blank")}>
                  {m.name} <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>Matched on: {m.matchField}</span>
                </div>
              ))}
            </div>
          )}
          {dupCheck && !dupCheck.hasDuplicates && (
            <div style={{ fontSize: 12, color: "#4ADE80", marginBottom: 12 }}>✅ No duplicates found</div>
          )}

          {/* Promote button */}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              const chosenContactId = (result.linked.contactId && mergeContact && !isInstallProgram) || (result.linked.contactId && isInstallProgram)
                ? result.linked.contactId : undefined;
              const chosenAccountId = (!isInstallProgram && result.linked.accountId && mergeAccount)
                ? result.linked.accountId : undefined;
              onPromote(chosenContactId, chosenAccountId);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: loading ? "rgba(255,255,255,0.06)" : "rgba(34,197,94,0.2)",
              border: "1px solid rgba(34,197,94,0.4)",
              color: "#86efac",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Promoting…" : "Promote to CRM"}
          </button>
        </div>
      )}

      {/* Applied / promoted confirmation */}
      {applied && result?.status === "promoted" && (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 12, color: "#86efac", fontWeight: 600 }}>✓ Lead promoted — Contact and Account created/merged</div>
          {result.notes.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--color-client-text-muted)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
              {result.notes.map((note, i) => <div key={i} style={{ marginBottom: 2 }}>{note}</div>)}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", fontStyle: "italic" }}>Create an Opportunity from the CRM when this lead is ready for a deal.</div>
        </div>
      )}
      {applied && result?.status !== "promoted" && (
        <div style={{ fontSize: 12, color: "#86efac", fontWeight: 600 }}>✓ CRM linkage applied</div>
      )}

      {/* Actions — initial state (no result yet, not applied) */}
      {!result && !applied && !fullyLinked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            disabled={loading}
            onClick={onPrepare}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              background: loading ? "rgba(255,255,255,0.06)" : "rgba(99,102,241,0.2)",
              border: "1px solid rgba(99,102,241,0.4)",
              color: "#a5b4fc",
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analyzing…" : "Promote to CRM"}
          </button>
        </div>
      )}

      {/* Apply existing matches (when prepare found full matches, no creation needed) */}
      {result && !showPromotionPanel && !applied && hasExistingMatches && !result.recommendations.createContact && !result.recommendations.createAccount && (
        <button
          type="button"
          disabled={loading}
          onClick={onApply}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            background: loading ? "rgba(255,255,255,0.06)" : "rgba(34,197,94,0.15)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "#86efac",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Applying…" : "Apply existing matches"}
        </button>
      )}

      {fullyLinked && !result && !applied && (
        <div style={{ fontSize: 12, color: "#86efac" }}>Fully linked to CRM</div>
      )}
    </div>
  );
}

function LeadDeleteButton({ leadId, onDeleted, styleOverride }: { leadId: string; onDeleted: () => void; styleOverride?: CSSProperties }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div>
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          style={styleOverride ?? { padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(248,113,113,0.2)", color: "#F87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          🗑️ Delete
        </button>
      ) : (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#F87171", marginBottom: 8 }}>Delete this lead permanently?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowConfirm(false)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
            <button
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  const res = await fetch(`/api/inbound/${leadId}`, { method: "DELETE" });
                  if (!res.ok) throw new Error(`API returned ${res.status}`);
                  onDeleted();
                } catch {
                  setDeleting(false);
                }
              }}
              style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}
            >{deleting ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function statusPill(label: string, tone: "green" | "yellow" | "red" | "blue" | "muted" = "muted") {
  const colors = {
    green: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)", text: "#86efac" },
    yellow: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)", text: "#fbbf24" },
    red: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.28)", text: "#fca5a5" },
    blue: { bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.28)", text: "#93c5fd" },
    muted: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)", text: "var(--color-client-text-muted)" },
  }[tone];
  return (
    <span style={{ display: "inline-flex", width: "fit-content", padding: "3px 8px", borderRadius: 999, background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

function WebsiteLeadWorkflowSections({ lead }: { lead: InboundLeadRecord }) {
  const { metadata, slack, research, duplicateCandidates, rawForm, isWebsiteLead } = getWebsiteLeadMetadata(lead);
  if (!isWebsiteLead) return null;

  const offering = metaString(metadata, "offeringLabel") || metaString(metadata, "offering") || metaString(rawForm, "offering") || "—";
  const budget = metaString(metadata, "budgetLabel") || metaString(metadata, "budget") || metaString(rawForm, "budget") || "—";
  const timeline = metaString(metadata, "timelineLabel") || metaString(metadata, "timeline") || metaString(rawForm, "timeline") || "—";
  const team = metaString(metadata, "teamLabel") || metaString(metadata, "team") || metaString(rawForm, "team") || "—";
  const role = metaString(metadata, "role") || metaString(rawForm, "role") || "—";
  const stack = metaString(metadata, "stack") || metaString(rawForm, "stack") || "—";
  const successMetric = metaString(metadata, "successMetric") || metaString(rawForm, "successMetric") || "—";
  const pageUrl = metaString(metadata, "pageUrl") || metaString(rawForm, "pageUrl");
  const referrer = metaString(metadata, "referrer") || metaString(rawForm, "referrer");
  const fitScore = research && typeof research.fitScore === "number" ? research.fitScore : undefined;
  const recommendedOwner = research && typeof research.recommendedOwner === "string" ? research.recommendedOwner : undefined;
  const recommendedNextAction = research && typeof research.recommendedNextAction === "string" ? research.recommendedNextAction : undefined;
  const researchSummary = research && typeof research.researchSummary === "string" ? research.researchSummary : undefined;
  const slackStatus = slack
    ? slack.ok ? statusPill("Slack notified", "green") : slack.skipped ? statusPill("Slack skipped", "yellow") : statusPill("Slack failed", "red")
    : statusPill("Slack pending", "muted");
  const researchStatus = research
    ? research.ok ? statusPill("Research complete", "green") : statusPill("Research failed", "red")
    : statusPill("Research pending", "muted");

  return (
    <>
      <LeadDrawerSection title="Website Submission">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <DetailItem label="Interested in" value={offering} />
            <DetailItem label="Budget" value={budget} />
            <DetailItem label="Timeline" value={timeline} />
            <DetailItem label="Team size" value={team} />
            <DetailItem label="Role" value={role} />
            <DetailItem label="Current stack" value={stack} />
          </div>
          <DetailItem label="Success metric" value={successMetric} />
          <DetailItem label="Message" value={lead.content || "—"} />
          <DetailItem
            label="Page / referrer"
            value={(
              <div style={{ display: "grid", gap: 4 }}>
                {pageUrl ? <a href={pageUrl} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>{pageUrl}</a> : <span>—</span>}
                {referrer ? <span style={{ color: "var(--color-client-text-muted)" }}>Referrer: {referrer}</span> : null}
              </div>
            )}
          />
        </div>
      </LeadDrawerSection>

      <LeadDrawerSection title="Website Workflow">
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {slackStatus}
            {researchStatus}
            {typeof fitScore === "number" ? statusPill(`Fit score ${fitScore}`, fitScore >= 70 ? "green" : fitScore >= 45 ? "blue" : "yellow") : null}
          </div>
          {researchSummary ? <DetailItem label="Research summary" value={researchSummary} /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <DetailItem label="Recommended owner" value={recommendedOwner || lead.assignedTo || "—"} />
            <DetailItem label="Next action" value={recommendedNextAction || "Review and qualify lead"} />
          </div>
          {duplicateCandidates.length > 0 ? (
            <DetailItem
              label="Matches"
              value={(
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {duplicateCandidates.map((candidate, index) => (
                    <span key={`${String(candidate.kind)}-${String(candidate.id)}-${index}`} style={{ padding: "4px 8px", borderRadius: 999, border: "1px solid rgba(96,165,250,0.28)", background: "rgba(96,165,250,0.10)", color: "#93c5fd", fontSize: 11, fontWeight: 600 }}>
                      {String(candidate.kind)}: {String(candidate.label || candidate.id)}
                    </span>
                  ))}
                </div>
              )}
            />
          ) : (
            <DetailItem label="Matches" value="No duplicate candidates found" />
          )}
          {slack && typeof slack.error === "string" && slack.error ? (
            <DetailItem label="Slack detail" value={slack.error} />
          ) : null}
        </div>
      </LeadDrawerSection>
    </>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-client-text)", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

function KpiCard({ label, value, color, helper }: { label: string; value: number | string; color: string; helper: string }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>{helper}</div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: 20,
  borderRadius: 16,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
};

// ─── Source Attribution Chart ───
const SOURCE_ATTR_COLORS: Record<string, string> = {
  website: "#60A5FA",
  referral: "#86efac",
  dm: "#a78bfa",
  partner: "#f59e0b",
  event: "#ec4899",
  other: "#6b7280",
};

function SourceAttributionChart({
  data,
}: {
  data: Array<{ source: string; count: number; converted: number; conversionRate: number; totalValue: number }>;
}) {
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...sorted.map((d) => d.count), 1);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {sorted.map((item) => {
        const color = SOURCE_ATTR_COLORS[item.source] ?? "#6b7280";
        const pct = Math.max((item.count / maxCount) * 100, item.count > 0 ? 8 : 0);
        const rateLabel = `${Math.round(item.conversionRate * 100)}%`;
        return (
          <div key={item.source} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)", textTransform: "capitalize" }}>
                {SOURCE_LABEL[item.source as InboundLeadSource] ?? item.source}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--color-client-text-muted)", fontWeight: 600 }}>{item.count}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                  background: item.conversionRate >= 0.3 ? "rgba(52,211,153,0.18)" : item.conversionRate >= 0.1 ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.06)",
                  color: item.conversionRate >= 0.3 ? "#6EE7B7" : item.conversionRate >= 0.1 ? "#FCD34D" : "var(--color-client-text-dim)",
                }}>{rateLabel} cvr</span>
              </div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: color }} />
            </div>
            {item.totalValue > 0 && (
              <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
                Pipeline: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(item.totalValue)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Monthly Trend Chart ───
function MonthlyTrendChart({ data }: { data: Array<{ month: string; count: number; converted: number }> }) {
  if (data.length === 0) {
    return <EmptyAnalyticsState title="No monthly data yet" body="Monthly trends will appear once leads are synced." />;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  function formatMonth(ym: string): string {
    const [year, month] = ym.split("-");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mi = parseInt(month, 10) - 1;
    return `${monthNames[mi] ?? month} ${year}`;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {data.map((item) => {
        const brightness = 0.35 + 0.65 * (item.count / maxCount);
        const barPct = Math.max((item.count / maxCount) * 100, item.count > 0 ? 6 : 0);
        const convertedPct = item.count > 0 ? (item.converted / item.count) * barPct : 0;
        return (
          <div key={item.month} style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) 60px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-client-text-muted)", fontWeight: 500 }}>{formatMonth(item.month)}</span>
            <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
              <div style={{ width: `${barPct}%`, height: "100%", borderRadius: 999, background: `rgba(96,165,250,${brightness})`, position: "absolute", top: 0, left: 0 }} />
              {convertedPct > 0 && (
                <div style={{ width: `${convertedPct}%`, height: "100%", borderRadius: 999, background: `rgba(52,211,153,${brightness})`, position: "absolute", top: 0, left: 0 }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "baseline", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 12, color: "var(--color-client-text)", fontWeight: 700 }}>{item.count}</span>
              {item.converted > 0 && (
                <span style={{ fontSize: 10, color: "#6EE7B7" }}>({item.converted})</span>
              )}
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--color-client-text-dim)", paddingTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#60A5FA", marginRight: 4 }} />Total</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#34D399", marginRight: 4 }} />Converted</span>
      </div>
    </div>
  );
}

// ─── Duplicate Alerts Panel ───
function DuplicateAlertsPanel({
  data,
  expanded,
  onToggle,
}: {
  data: { duplicateGroups: Array<{ matchType: "email" | "phone" | "name+company"; matchValue: string; leads: Array<{ id: string; name: string; type: string; status: string; receivedAt: string }> }>; totalDuplicates: number };
  expanded: boolean;
  onToggle: () => void;
}) {
  const groups = data.duplicateGroups;
  if (groups.length === 0) return null;

  const matchTypeLabel: Record<string, string> = { email: "Email", phone: "Phone", "name+company": "Name + Company" };
  const matchTypeIcon: Record<string, string> = { email: "✉", phone: "☎", "name+company": "👤" };

  return (
    <div style={{
      padding: 16, borderRadius: 14,
      background: "rgba(251,191,36,0.06)",
      border: "1px solid rgba(251,191,36,0.18)",
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#FCD34D" }}>
            {groups.length} potential duplicate group{groups.length === 1 ? "" : "s"} detected
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {groups.map((group, gi) => (
            <div key={gi} style={{
              padding: 12, borderRadius: 10,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12 }}>{matchTypeIcon[group.matchType] ?? "?"}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#FCD34D", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {matchTypeLabel[group.matchType] ?? group.matchType}
                </span>
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>— {group.matchValue}</span>
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {group.leads.map((lead) => (
                  <div key={lead.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                    <span style={{ color: "var(--color-client-text)", fontWeight: 500 }}>{lead.name || "Unknown"}</span>
                    <span style={{ color: "var(--color-client-text-dim)" }}>{lead.status}</span>
                    <span style={{ color: "var(--color-client-text-dim)", fontSize: 11 }}>{new Date(lead.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const analyticsCardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 18,
  borderRadius: 16,
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,255,255,0.08)",
  minHeight: 240,
};

const controlStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--color-client-text)",
  fontSize: 13,
  outline: "none",
};

const errorStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.18)",
  color: "#FCA5A5",
  fontSize: 13,
};

const actionButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid rgba(96,165,250,0.2)",
  background: "rgba(96,165,250,0.12)",
  color: "#93C5FD",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--color-client-text-muted)",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
};

const ghostButtonStyle: CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--color-client-text-muted)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

function pillStyle(background: string, color: string): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "5px 10px",
    borderRadius: 999,
    background,
    color,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.02em",
  };
}

function viewToggleStyle(active: boolean): CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid rgba(96,165,250,0.3)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.04)",
    color: active ? "#93C5FD" : "var(--color-client-text-muted)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
