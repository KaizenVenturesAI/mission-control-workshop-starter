"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";
import { AccountPicker, ContactPicker, EnumPicker } from "@/components/CRMPicker";
import { InlineEditText, InlineEditEnum } from "@/components/InlineEdit";
import { CopyableField, CopyableText } from "@/components/CopyableField";
import { type CRMActivity } from "@/data/crm-activities";
import { type Account } from "@/data/accounts";
import { type Contact } from "@/data/contacts";
import {
  FORECAST_CONFIDENCE_OPTIONS,
  OPPORTUNITY_LOCATIONS,
  OPPORTUNITY_LOSS_REASON_OPTIONS,
  OPPORTUNITY_OWNER_OPTIONS,
  OPPORTUNITY_SOURCE_OPTIONS,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_VALUE_TYPES,
  normalizeOpportunityStage,
  type ForecastConfidence,
  type Opportunity,
  type OpportunityLocation,
  type OpportunityLossReason,
  type OpportunityOwner,
  type OpportunityPayoutAllocation,
  type OpportunitySource,
  type OpportunityStage,
  type OpportunityType,
  type OpportunityValueType,
} from "@/data/opportunities";
import { useResponsive } from "@/lib/useMediaQuery";
import { toDisplayId, fromDisplayId } from "@/lib/crm/displayId";
import { computeOpportunityHealth, opportunityHealthTone } from "@/lib/crm/opportunityHealth";
import { computeOpportunityValue, getPriceBookEntry, pricingDetail, type OpportunityPricingUnit } from "@/lib/crm/priceBook";
import { useCRMBulkBar } from "@/components/CRMShell";
import { BulkActionBar, BulkOwnerPrompt, BulkPicklistPrompt, bulkButtonStyle, LensToggleRow, LineageChips, OwnerSelect, SelectAllBox, SelectCell } from "@/components/crm/FunnelPhase2";
import { CrmBadge, CrmDrawerSection, CrmNextBestActionPanel, CrmRecordFooter, CrmRecordHeader, CrmRecordSignalPanel, crmDangerActionButtonStyle, type CrmRecordSignal } from "@/components/crm/CrmRecordLayout";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";

type ViewMode = "table" | "board";

type OpportunityEditState = {
  name: string;
  contactId: string;
  accountId: string;
  opportunityType: OpportunityType;
  location: OpportunityLocation;
  stage: OpportunityStage;
  openDate: string;
  closeDate: string;
  forecastConfidence: ForecastConfidence;
  valueType: OpportunityValueType;
  value: string;
  pricingUnit: OpportunityPricingUnit | "";
  quantity: string;
  unitPrice: string;
  computedValue: string;
  source: OpportunitySource;
  owner: OpportunityOwner;
  nextStep: string;
  nextStepDueDate: string;
  notes: string;
  lossReason: OpportunityLossReason | "";
  referralPartnerContactId: string;
  primaryPayoutPercent: string;
  secondaryPayoutPercent: string;
};

type OpportunityPrefill = {
  contactId?: string;
  accountId?: string;
  name?: string;
  opportunityType?: OpportunityType;
  location?: OpportunityLocation;
  owner?: OpportunityOwner;
  nextStep?: string;
};

function MiniSpinner() {
  return (
    <>
      <span
        aria-label="Saving"
        style={{
          display: "inline-block",
          width: 12,
          height: 12,
          borderRadius: 999,
          border: "2px solid rgba(255,255,255,0.18)",
          borderTopColor: "#F4C7CA",
          animation: "opportunity-spin 0.7s linear infinite",
          flexShrink: 0,
        }}
      />
      <style>{`@keyframes opportunity-spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--color-client-text)",
  fontSize: 13,
  outline: "none",
};

const panelStyle: React.CSSProperties = {
  background: "var(--color-client-bg-card)",
  border: "1px solid var(--color-client-border)",
  borderRadius: 12,
};

const stageColors: Record<OpportunityStage, { text: string; bg: string; border: string }> = {
  Discovery: { text: "#dadadb", bg: "rgba(218,218,219,0.12)", border: "rgba(218,218,219,0.25)" },
  Propose: { text: "#C4C9D1", bg: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.26)" },
  Contracting: { text: "#FBBF24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" },
  "Closed Won": { text: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" },
  "Closed Lost": { text: "#F87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)" },
};

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function clampPayoutPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizePayoutAllocations(allocations?: OpportunityPayoutAllocation[]): Pick<OpportunityEditState, "primaryPayoutPercent" | "secondaryPayoutPercent"> {
  const primary = allocations?.find((allocation) => allocation.owner === "Alex")?.percent;
  const secondary = allocations?.find((allocation) => allocation.owner === "Morgan")?.percent;
  const primaryPercent = clampPayoutPercent(typeof primary === "number"  ? primary : secondary === undefined ? 100 : 100 - secondary);
  return {
    primaryPayoutPercent: String(primaryPercent),
    secondaryPayoutPercent: String(100 - primaryPercent),
  };
}

function buildPayoutAllocations(primaryPercentInput: string): OpportunityPayoutAllocation[] {
  const primaryPercent = clampPayoutPercent(Number(primaryPercentInput));
  return [
    { owner: "Alex", percent: primaryPercent },
    { owner: "Morgan", percent: 100 - primaryPercent },
  ];
}

function applyPriceBookDefaults(form: OpportunityEditState, type: OpportunityType): OpportunityEditState {
  const entry = getPriceBookEntry(type);
  if (!entry) return { ...form, opportunityType: type };
  const existingQuantity = Number(form.quantity);
  const quantity = Number.isFinite(existingQuantity) && existingQuantity > 0 ? existingQuantity : entry.defaultQuantity;
  const computed = computeOpportunityValue(type, quantity) ?? Number(form.value || 0);
  return {
    ...form,
    opportunityType: type,
    valueType: entry.valueType,
    pricingUnit: entry.unit,
    quantity: String(quantity),
    unitPrice: String(entry.unitPrice),
    computedValue: String(computed),
    value: String(computed),
  };
}

function marketToOpportunityLocation(market?: Account["operatingMarket"]): OpportunityLocation {
  if (market === "Fort Lauderdale") return "Fort Lauderdale";
  if (market === "Los Angeles") return "Los Angeles";
  if (market === "New York") return "New York";
  if (market === "Chicago") return "Chicago";
  if (market === "Rio de Janeiro") return "Rio de Janeiro";
  if (market === "International") return "International";
  if (market === "Multi-Market") return "Multi-Market";
  return "Miami";
}

function cityToOpportunityLocation(city?: string): OpportunityLocation | null {
  if (!city) return null;
  const normalized = city.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("miami")) return "Miami";
  if (normalized.includes("fort lauderdale")) return "Fort Lauderdale";
  if (normalized.includes("los angeles")) return "Los Angeles";
  if (normalized.includes("new york")) return "New York";
  if (normalized.includes("chicago")) return "Chicago";
  if (normalized.includes("rio de janeiro")) return "Rio de Janeiro";
  return null;
}

function inferOpportunityLocationFromAccount(account?: Account | null): OpportunityLocation {
  if (!account) return OPPORTUNITY_LOCATIONS[0];
  return cityToOpportunityLocation(account.address?.city) ?? marketToOpportunityLocation(account.operatingMarket);
}

function accountToOpportunityDefaults(account?: Account): Pick<OpportunityPrefill, "opportunityType" | "location" | "owner" | "nextStep"> {
  if (!account) return {};
  if (account.subType === "Implementation Partner" || account.subType === "Technology / Services") {
    return {
      opportunityType: "Half-Day Install",
      location: marketToOpportunityLocation(account.operatingMarket),
      owner: "Mission Agent",
      nextStep: "Map install-day workflow and technical readiness",
    };
  }
  if (account.subType === "Referral Partner" || account.type === "Partner") {
    return {
      opportunityType: "Referral Partnership",
      location: marketToOpportunityLocation(account.operatingMarket),
      owner: "Alex",
      nextStep: "Review referral fit and draft partner follow-up",
    };
  }
  return {
    opportunityType: "Hourly Consulting",
    location: marketToOpportunityLocation(account.operatingMarket),
    owner: "Alex",
    nextStep: "Schedule AI operating-system discovery call",
  };
}

function StagePill({ stage }: { stage: OpportunityStage }) {
  const c = stageColors[stage];
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: c.text, background: c.bg, border: `1px solid ${c.border}` }}>{stage}</span>;
}

function OpportunityHealthPill({ opportunity }: { opportunity: Opportunity }) {
  const health = computeOpportunityHealth(opportunity);
  const tone = opportunityHealthTone(health.status);
  const colors = {
    green: { color: "#34D399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" },
    amber: { color: "#FBBF24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)" },
    red: { color: "#FCA5A5", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)" },
    neutral: { color: "var(--color-client-text-secondary)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.09)" },
  }[tone];
  return (
    <span title={health.reasons.join(" · ")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 650, color: colors.color, background: colors.bg, border: `1px solid ${colors.border}` }}>
      {health.status} {health.status !== "Closed" ? health.score : ""}
    </span>
  );
}

const OPPORTUNITY_STAGE_CRITERIA: Record<OpportunityStage, { definition: string; entry: string[]; exit: string[] }> = {
  Discovery: {
    definition: "Qualified initial fit is confirmed and discovery is actively underway.",
    entry: [
      "Account has a clear problem and agreed discovery call.",
      "Owner, next step, and target close date are set.",
    ],
    exit: [
      "Move to Propose when scope, outcomes, and pricing direction are clear.",
      "Move to Closed Lost if no fit, no budget path, or no response after follow-up.",
    ],
  },
  Propose: {
    definition: "A commercial proposal or solution recommendation is in progress or delivered.",
    entry: [
      "Discovery completed with enough context to propose.",
      "Stakeholders and buyer path are identified.",
    ],
    exit: [
      "Move to Contracting when proposal is accepted pending terms/signature.",
      "Move back to Discovery if requirements materially change.",
    ],
  },
  Contracting: {
    definition: "Commercial/legal terms are being finalized before close.",
    entry: [
      "Proposal accepted in principle.",
      "Contract, SOW, or procurement process has started.",
    ],
    exit: [
      "Move to Closed Won when agreement is signed/confirmed.",
      "Move to Closed Lost when terms fail or buying process stops.",
    ],
  },
  "Closed Won": {
    definition: "Deal is successfully closed and committed.",
    entry: [
      "Contract or formal commitment completed.",
      "Close date and final value are confirmed.",
    ],
    exit: [
      "No further stage transitions expected.",
    ],
  },
  "Closed Lost": {
    definition: "Deal is closed without conversion.",
    entry: [
      "Commercial process ended without commitment.",
      "Loss reason documented when known.",
    ],
    exit: [
      "No further stage transitions expected.",
    ],
  },
};

function CriteriaList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--color-client-text-dim)", fontWeight: 800, marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: "var(--color-client-text-secondary)" }}>
        {items.map((item) => (
          <li key={item} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 2 }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function OpportunityStagePath({
  activeStage,
  onStageChange,
}: {
  activeStage: OpportunityStage;
  onStageChange: (stage: OpportunityStage) => void;
}) {
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const criteria = OPPORTUNITY_STAGE_CRITERIA[activeStage];
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${OPPORTUNITY_STAGES.length}, minmax(0,1fr))`, gap: 4 }}>
        {OPPORTUNITY_STAGES.map((stage, index) => {
          const active = stage === activeStage;
          const isClosedWon = stage === "Closed Won";
          return (
            <button
              key={stage}
              type="button"
              onClick={() => {
                if (active) setCriteriaOpen((prev) => !prev);
                else {
                  onStageChange(stage);
                  setCriteriaOpen(true);
                }
              }}
              style={{
                minHeight: 30,
                borderRadius: index === 0 ? "8px 0 0 8px" : index === OPPORTUNITY_STAGES.length - 1 ? "0 8px 8px 0" : 0,
                clipPath: index === OPPORTUNITY_STAGES.length - 1 ? "polygon(0 0,100% 0,100% 100%,0 100%,10% 50%)" : "polygon(0 0,92% 0,100% 50%,92% 100%,0 100%,8% 50%)",
                border: active
                  ? isClosedWon
                    ? "1px solid rgba(96,165,250,0.52)"
                    : "1px solid rgba(218,218,219,0.45)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: active
                  ? isClosedWon
                    ? "linear-gradient(180deg, rgba(59,130,246,0.24), rgba(37,99,235,0.16))"
                    : "linear-gradient(180deg, rgba(218,218,219,0.22), rgba(218,218,219,0.14))"
                  : "rgba(255,255,255,0.03)",
                color: active
                  ? isClosedWon
                    ? "#DBEAFE"
                    : "#FFD5D7"
                  : "var(--color-client-text-secondary)",
                fontSize: 12,
                fontWeight: active ? 800 : 650,
                cursor: "pointer",
                letterSpacing: "0.03em",
                textTransform: "none",
              }}
            >
              {active ? <span style={{ marginRight: 6, display: "inline-block", transition: "transform 120ms ease" }}>{criteriaOpen ? "⌄" : "›"}</span> : null}
              {stage}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setCriteriaOpen((prev) => !prev)}
        style={{
          marginTop: 8,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.02)",
          color: "var(--color-client-text-secondary)",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        <span>{criteriaOpen ? "⌄" : "›"} Entry and exit criteria</span>
        <span style={{ fontSize: 10, color: "rgba(196,201,209,0.52)" }}>Click stage to switch</span>
      </button>
      {criteriaOpen ? (
        <div style={{ marginTop: 8, padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(218,218,219,0.26)", background: "linear-gradient(180deg, rgba(218,218,219,0.16), rgba(12,12,18,0.90))" }}>
          <div style={{ fontSize: 12, fontWeight: 850, color: "#F4C7CA", marginBottom: 6 }}>{activeStage} criteria</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-client-text-secondary)" }}>{criteria.definition}</div>
          <CriteriaList title="Entry" items={criteria.entry} />
          <CriteriaList title="Exit" items={criteria.exit} />
        </div>
      ) : null}
    </div>
  );
}

function buildEditState(opportunity: Opportunity | null, prefill?: OpportunityPrefill): OpportunityEditState {
  const payout = normalizePayoutAllocations(opportunity?.payoutAllocations);
  const state: OpportunityEditState = {
    name: opportunity?.name ?? prefill?.name ?? "",
    contactId: opportunity?.contactId ?? prefill?.contactId ?? "",
    accountId: opportunity?.accountId ?? prefill?.accountId ?? "",
    opportunityType: opportunity?.opportunityType ?? prefill?.opportunityType ?? OPPORTUNITY_TYPES[0],
    location: opportunity?.location ?? prefill?.location ?? OPPORTUNITY_LOCATIONS[0],
    stage: normalizeOpportunityStage(opportunity?.stage),
    openDate: toDateInputValue(opportunity?.openDate) || new Date().toISOString().slice(0, 10),
    closeDate: toDateInputValue(opportunity?.closeDate),
    forecastConfidence: opportunity?.forecastConfidence ?? FORECAST_CONFIDENCE_OPTIONS[1],
    valueType: opportunity?.valueType ?? OPPORTUNITY_VALUE_TYPES[0],
    value: opportunity ? String(opportunity.value) : "",
    pricingUnit: opportunity?.pricingUnit ?? "",
    quantity: opportunity?.quantity ? String(opportunity.quantity) : "",
    unitPrice: opportunity?.unitPrice ? String(opportunity.unitPrice) : "",
    computedValue: opportunity?.computedValue ? String(opportunity.computedValue) : "",
    source: opportunity?.source ?? OPPORTUNITY_SOURCE_OPTIONS[OPPORTUNITY_SOURCE_OPTIONS.length - 1],
    owner: opportunity?.owner ?? prefill?.owner ?? OPPORTUNITY_OWNER_OPTIONS[OPPORTUNITY_OWNER_OPTIONS.length - 1],
    nextStep: opportunity?.nextStep ?? prefill?.nextStep ?? "",
    nextStepDueDate: toDateInputValue(opportunity?.nextStepDueDate) || new Date().toISOString().slice(0, 10),
    notes: opportunity?.notes ?? "",
    lossReason: opportunity?.lossReason ?? "",
    referralPartnerContactId: opportunity?.referralPartnerContactId ?? "",
    primaryPayoutPercent: payout.primaryPayoutPercent,
    secondaryPayoutPercent: payout.secondaryPayoutPercent,
  };
  return opportunity ? state : applyPriceBookDefaults(state, state.opportunityType);
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-client-text-dim)",
  marginBottom: 4,
  display: "block",
};

const sectionDividerStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.06)",
  paddingTop: 14,
  marginTop: 14,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--color-client-text)",
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const fieldErrorStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#EF4444",
  marginTop: 4,
};

type ValidationErrors = {
  name?: string;
  accountId?: string;
  contactId?: string;
  value?: string;
};

const drawerLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--color-client-text-dim)",
  display: "block",
  marginBottom: 4,
};

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <CrmDrawerSection title={title}>{children}</CrmDrawerSection>;
}

/* ── Activity helpers ── */

function activityTypeIcon(type: CRMActivity["type"]): string {
  switch (type) {
    case "Call": return "☎";
    case "Note": return "✎";
    case "Email": return "✉";
    case "Meeting": return "📅";
    case "Inbound Lead": return "📥";
    case "Task": return "☑";
    case "Outreach": return "➡";
    case "Follow-Up": return "🕒";
    default: return "●";
  }
}

function activityTypeColor(type: CRMActivity["type"]): string {
  switch (type) {
    case "Call": return "#dadadb";
    case "Note": return "#C4C9D1";
    case "Email": return "#dadadb";
    case "Meeting": return "#E84393";
    case "Inbound Lead": return "#F59E0B";
    case "Task": return "rgba(255,255,255,0.5)";
    case "Outreach": return "#F472B6";
    case "Follow-Up": return "#FBBF24";
    default: return "rgba(255,255,255,0.35)";
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function OpportunityActivityTimeline({ contactId }: { contactId: string }) {
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    if (!contactId) { setLoading(false); return; }
    fetch(`/api/crm/activities?contactId=${contactId}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : [])
      .then((data: CRMActivity[]) => setActivities(data))
      .catch(() => setActivities([]))
      .finally(() => setLoading(false));
  }, [contactId]);

  if (loading) return <DrawerSection title="Activity Timeline"><div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>Loading activities…</div></DrawerSection>;
  if (activities.length === 0) return <DrawerSection title="Activity Timeline"><div style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No activities found for this contact.</div></DrawerSection>;

  const sorted = [...activities].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const visible = sorted.slice(0, visibleCount);

  return (
    <DrawerSection title={`Activity Timeline (${activities.length})`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.map((a) => (
          <div key={a.id} style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 14, flexShrink: 0 }}>{activityTypeIcon(a.type)}</span>
                <span style={{ fontSize: 9, padding: "1px 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 4, background: `${activityTypeColor(a.type)}20`, color: activityTypeColor(a.type), flexShrink: 0 }}>{a.type}</span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 8, padding: "1px 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>{a.source}</span>
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", whiteSpace: "nowrap" }}>{formatRelativeTime(a.occurredAt)}</span>
              </div>
            </div>
            {a.content && <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)", lineHeight: 1.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{a.content.length > 200 ? a.content.slice(0, 200) + "…" : a.content}</div>}
          </div>
        ))}
        {visibleCount < sorted.length && (
          <button
            onClick={() => setVisibleCount((p) => p + 10)}
            style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--color-client-text-secondary)", fontSize: 12, cursor: "pointer", textAlign: "center" }}
          >
            Show More ({sorted.length - visibleCount} remaining)
          </button>
        )}
      </div>
    </DrawerSection>
  );
}

function OpportunityDrawer({
  opportunity,
  accounts,
  contacts,
  onClose,
  onSave,
  onRefresh,
  prefill,
  router,
}: {
  opportunity: Opportunity | null;
  accounts: Account[];
  contacts: Contact[];
  onClose: () => void;
  onSave: (payload: OpportunityEditState) => Promise<void>;
  onRefresh?: () => Promise<void>;
  prefill?: OpportunityPrefill;
  router: ReturnType<typeof useRouter>;
}) {
  const isNew = opportunity === null;
  const [form, setForm] = useState<OpportunityEditState>(buildEditState(opportunity, prefill));
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [successFlash, setSuccessFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const drawerElRef = useRef<HTMLDivElement | null>(null);
  const selectableContacts = useMemo(() => contacts.filter((contact) => !contact.deletedAt), [contacts]);
  const selectedAccount = useMemo(() => accounts.find((account) => account.id === form.accountId), [accounts, form.accountId]);
  const inferredLocation = useMemo(() => inferOpportunityLocationFromAccount(selectedAccount), [selectedAccount]);

  useEffect(() => {
    setForm(buildEditState(opportunity, prefill));
    setErrors({});
  }, [opportunity, prefill]);

  // Auto-clear contactId when accountId changes
  const prevAccountId = useRef(form.accountId);
  useEffect(() => {
    if (prevAccountId.current !== form.accountId && form.contactId) {
      setForm((p) => ({ ...p, contactId: "" }));
    }
    prevAccountId.current = form.accountId;
  }, [form.accountId, form.contactId]);

  // Lock body scroll for full-screen drawer (both new and existing)
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
  }, [opportunity?.id]);

  // Callback ref to reset scrollTop for the full-screen overlay
  const drawerRef = useCallback((node: HTMLDivElement | null) => {
    drawerElRef.current = node;
    if (node) {
      node.scrollTop = 0;
      requestAnimationFrame(() => { node.scrollTop = 0; });
    }
  }, []);

  const validate = (): ValidationErrors => {
    const errs: ValidationErrors = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.accountId) errs.accountId = "Account is required";
    if (!form.contactId) errs.contactId = "Contact is required";
    const numVal = Number(form.value);
    if (form.value !== "" && (isNaN(numVal) || numVal < 0)) errs.value = "Value must be a number >= 0";
    if (form.value === "") errs.value = "Value is required";
    return errs;
  };

  const handleCreate = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await onSave({ ...form, location: inferredLocation });
      setSuccessFlash(true);
      setTimeout(() => {
        setSuccessFlash(false);
      }, 1500);
    } catch {
      setSaving(false);
    }
  };

  // ── Full-screen create overlay ──
  if (isNew) {
    const overlay = (
      <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", background: "#0c0c12" }}>
        {/* Backdrop */}
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: -1 }} />

        {/* Success flash */}
        {successFlash && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 110, padding: "12px 0", textAlign: "center", background: "rgba(218,218,219,0.15)", borderBottom: "1px solid rgba(218,218,219,0.25)", color: "#dadadb", fontWeight: 600, fontSize: 14 }}>
            Opportunity created
          </div>
        )}

        {/* Header bar */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 32px", background: "#0c0c12", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-client-text)" }}>New Opportunity</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--color-client-text-dim)", cursor: "pointer", fontSize: 13 }}>Cancel</button>
            <button disabled={saving} onClick={handleCreate} style={{ padding: "10px 18px", borderRadius: 8, background: "rgba(218,218,219,0.15)", border: "1px solid rgba(218,218,219,0.25)", color: "#dadadb", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Creating…" : "Create Opportunity"}
            </button>
          </div>
        </div>

        {/* Form body */}
        <div ref={drawerRef} style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ width: "100%", maxWidth: "none", margin: 0, padding: 24 }}>

            {/* Section: Deal Information */}
            <div style={{ marginBottom: 32 }}>
              <div style={sectionTitleStyle}>Deal Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Name</label>
                  <input value={form.name} onChange={(e) => { setForm((p) => ({ ...p, name: e.target.value })); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }} placeholder="Opportunity name" style={{ ...inputStyle, borderColor: errors.name ? "#EF4444" : "rgba(255,255,255,0.08)" }} />
                  {errors.name && <div style={fieldErrorStyle}>{errors.name}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Type</label>
                  <EnumPicker picklistKey="opportunityType" value={form.opportunityType} onChange={(v) => setForm((p) => applyPriceBookDefaults(p, (v ?? OPPORTUNITY_TYPES[0]) as OpportunityType))} />
                </div>
                <div>
                  <label style={labelStyle}>Stage</label>
                  <EnumPicker picklistKey="opportunityStage" value={form.stage} onChange={(v) => setForm((p) => ({ ...p, stage: (v ?? OPPORTUNITY_STAGES[0]) as OpportunityStage }))} />
                </div>
                <div>
                  <label style={labelStyle}>Forecast Confidence</label>
                  <EnumPicker picklistKey="forecastConfidence" value={form.forecastConfidence} onChange={(v) => setForm((p) => ({ ...p, forecastConfidence: (v ?? FORECAST_CONFIDENCE_OPTIONS[1]) as ForecastConfidence }))} />
                </div>
                <div>
                  <label style={labelStyle}>Location</label>
                  <div style={{ ...inputStyle, display: "flex", alignItems: "center", minHeight: 40, color: "var(--color-client-text-secondary)" }}>
                    {inferredLocation}
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Relationship */}
            <div style={{ marginBottom: 32 }}>
              <div style={sectionTitleStyle}>Relationship</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Account</label>
                  <AccountPicker options={accounts} value={form.accountId || null} onChange={(v) => {
                    const selectedAccount = accounts.find((account) => account.id === v);
                    const defaults = accountToOpportunityDefaults(selectedAccount);
                    setForm((p) => ({
                      ...p,
                      accountId: v ?? "",
                      contactId: "",
                      referralPartnerContactId: p.referralPartnerContactId || "",
                      ...defaults,
                      name: p.name || (selectedAccount?.name && defaults.opportunityType ? `${selectedAccount.name} - ${defaults.opportunityType}` : p.name),
                    }));
                    if (errors.accountId) setErrors((p) => ({ ...p, accountId: undefined }));
                  }} creatable onCreateNew={(name) => {
                    fetch("/api/crm/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, type: "Prospect", operatingMarket: "Miami" }) })
                      .then(r => r.ok ? r.json() : null)
                      .then(acct => { if (acct) { setForm((p) => ({ ...p, accountId: acct.id, contactId: "" })); if (errors.accountId) setErrors((p) => ({ ...p, accountId: undefined })); } });
                  }} label="" />
                  {errors.accountId && <div style={fieldErrorStyle}>{errors.accountId}</div>}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Contact</label>
                  <ContactPicker options={contacts} value={form.contactId || null} onChange={(v) => { setForm((p) => ({ ...p, contactId: v ?? "" })); if (errors.contactId) setErrors((p) => ({ ...p, contactId: undefined })); }} accountId={form.accountId || null} label="" />
                  {!form.contactId && (
                    <button
                      type="button"
                      onClick={() => {
                        const name = prompt("Contact name (First Last):");
                        if (!name?.trim()) return;
                        const [firstName, ...rest] = name.trim().split(" ");
                        const lastName = rest.join(" ") || "";
                        fetch("/api/crm/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName, lastName, accountId: form.accountId || undefined }) })
                          .then(r => r.ok ? r.json() : null)
                          .then(c => { if (c) { setForm((p) => ({ ...p, contactId: c.id })); if (errors.contactId) setErrors((p) => ({ ...p, contactId: undefined })); } });
                      }}
                      style={{ marginTop: 6, padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(218,218,219,0.08)", border: "1px solid rgba(218,218,219,0.2)", color: "#dadadb", cursor: "pointer" }}
                    >
                      + Quick Add Contact
                    </button>
                  )}
                  {errors.contactId && <div style={fieldErrorStyle}>{errors.contactId}</div>}
                </div>
                <div>
                  <label style={labelStyle}>Owner</label>
                  <EnumPicker picklistKey="opportunityOwner" value={form.owner} onChange={(v) => setForm((p) => ({ ...p, owner: (v ?? OPPORTUNITY_OWNER_OPTIONS[OPPORTUNITY_OWNER_OPTIONS.length - 1]) as OpportunityOwner }))} />
                </div>
                <div>
                  <label style={labelStyle}>Referral Partner</label>
                  <ContactPicker options={selectableContacts} value={form.referralPartnerContactId || null} onChange={(v) => setForm((p) => ({ ...p, referralPartnerContactId: v ?? "" }))} accountId={null} label="" placeholder="Search contacts..." />
                </div>
              </div>
            </div>

            {/* Section: Financials */}
            <div style={{ marginBottom: 32 }}>
              <div style={sectionTitleStyle}>Financials</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Value Type</label>
                  <EnumPicker picklistKey="valueType" value={form.valueType} onChange={(v) => setForm((p) => ({ ...p, valueType: (v ?? OPPORTUNITY_VALUE_TYPES[0]) as OpportunityValueType }))} />
                </div>
                {getPriceBookEntry(form.opportunityType) && (
                  <div>
                    <label style={labelStyle}>{getPriceBookEntry(form.opportunityType)?.unitLabel ?? "Quantity"}</label>
                    <input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(e) => {
                        const quantity = Number(e.target.value);
                        const computed = computeOpportunityValue(form.opportunityType, quantity);
                        setForm((p) => ({
                          ...p,
                          quantity: e.target.value,
                          computedValue: computed !== null ? String(computed) : p.computedValue,
                          value: computed !== null ? String(computed) : p.value,
                        }));
                        if (errors.value) setErrors((p) => ({ ...p, value: undefined }));
                      }}
                      placeholder={getPriceBookEntry(form.opportunityType)?.unitLabel ?? "Quantity"}
                      style={inputStyle}
                    />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Value</label>
                  <input type="number" min="0" value={form.value} onChange={(e) => { setForm((p) => ({ ...p, value: e.target.value })); if (errors.value) setErrors((p) => ({ ...p, value: undefined })); }} placeholder="Value" style={{ ...inputStyle, borderColor: errors.value ? "#EF4444" : "rgba(255,255,255,0.08)" }} />
                  {errors.value && <div style={fieldErrorStyle}>{errors.value}</div>}
                </div>
                {getPriceBookEntry(form.opportunityType) && (
                  <div>
                    <label style={labelStyle}>Price Book</label>
                    <div style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(218,218,219,0.24)", background: "rgba(218,218,219,0.08)", color: "var(--color-client-text-secondary)", fontSize: 12 }}>
                      {pricingDetail(form.opportunityType, Number(form.quantity))}
                      {getPriceBookEntry(form.opportunityType)?.unit !== "fixed" ? <> = <strong style={{ color: "#F8FAFC" }}>{formatMoney(Number(form.value || 0))}</strong></> : null}
                    </div>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Source</label>
                  <EnumPicker picklistKey="opportunitySource" value={form.source} onChange={(v) => setForm((p) => ({ ...p, source: (v ?? OPPORTUNITY_SOURCE_OPTIONS[OPPORTUNITY_SOURCE_OPTIONS.length - 1]) as OpportunitySource }))} />
                </div>
              </div>
            </div>

            {/* Section: Timeline */}
            <div style={{ marginBottom: 32 }}>
              <div style={sectionTitleStyle}>Timeline</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Open Date</label>
                  <input type="date" value={form.openDate} onChange={(e) => setForm((p) => ({ ...p, openDate: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Close Date</label>
                  <input type="date" value={form.closeDate} onChange={(e) => setForm((p) => ({ ...p, closeDate: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Next Step</label>
                  <input value={form.nextStep} onChange={(e) => setForm((p) => ({ ...p, nextStep: e.target.value }))} placeholder="Next step" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Next Step Due Date</label>
                  <input type="date" value={form.nextStepDueDate} onChange={(e) => setForm((p) => ({ ...p, nextStepDueDate: e.target.value }))} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Section: Notes */}
            <div style={{ marginBottom: 32 }}>
              <div style={sectionTitleStyle}>Notes</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
                </div>
                {form.stage === "Closed Lost" && (
                  <div>
                    <label style={labelStyle}>Loss Reason</label>
                    <EnumPicker picklistKey="lossReason" value={form.lossReason || null} onChange={(v) => setForm((p) => ({ ...p, lossReason: (v ?? "") as OpportunityLossReason | "" }))} placeholder="Select loss reason" clearable />
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );

    return typeof document !== "undefined" ? createPortal(overlay, document.body) : null;
  }

  // ── Full-screen drawer for viewing/editing existing opportunities ──
  const contact = contacts.find((c) => c.id === opportunity.contactId);
  const account = accounts.find((a) => a.id === opportunity.accountId);
  const isClosed = opportunity.stage === "Closed Won" || opportunity.stage === "Closed Lost";
  const isOverdue = Boolean(opportunity.nextStepDueDate) && new Date(opportunity.nextStepDueDate).getTime() < Date.now() && !isClosed;
  const health = computeOpportunityHealth(opportunity);
  const nextBestAction = isOverdue
    ? `Complete overdue next step: ${opportunity.nextStep || "Define the next step"}`
    : !opportunity.nextStep?.trim() && !isClosed
      ? "Add a next step before this opportunity can move cleanly."
      : !opportunity.owner || opportunity.owner === "Unassigned"
        ? "Assign an owner so follow-through is accountable."
        : "Next step is covered.";
  const opportunitySignals = useMemo<CrmRecordSignal[]>(() => [
    { label: "Owner", detail: opportunity.owner && opportunity.owner !== "Unassigned" ? opportunity.owner : "missing", tone: opportunity.owner && opportunity.owner !== "Unassigned" ? "green" : "amber" },
    { label: "Next step", detail: opportunity.nextStep?.trim() ? "present" : "missing", tone: opportunity.nextStep?.trim() ? "green" : "red" },
    { label: "Due", detail: opportunity.nextStepDueDate ? (isOverdue ? "overdue" : formatDate(opportunity.nextStepDueDate)) : "missing", tone: isOverdue ? "red" : opportunity.nextStepDueDate ? "green" : "amber" },
    { label: "Contact", detail: contact ? "linked" : "missing", tone: contact ? "green" : "amber" },
    { label: "Account", detail: account ? "linked" : "missing", tone: account ? "green" : "amber" },
  ], [account, contact, isOverdue, opportunity.nextStep, opportunity.nextStepDueDate, opportunity.owner]);

  const saveField = async (patch: Partial<Omit<Opportunity, "closeDate">> & { closeDate?: string | null }) => {
    const res = await fetch("/api/crm/opportunities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: opportunity.id, location: inferredLocation, ...patch }),
    });
    if (!res.ok) {
      let message = `Opportunity update failed (${res.status})`;
      try {
        const payload = await res.json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        /* keep status-based message */
      }
      setSaveError(message);
      throw new Error(message);
    }
    setSaveError(null);
    if (onRefresh) await onRefresh();
  };
  const [savingOwner, setSavingOwner] = useState(false);
  const [savingOpenDate, setSavingOpenDate] = useState(false);
  const [savingCloseDate, setSavingCloseDate] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const dealValue = Number(form.value || opportunity.value || 0);
  const primaryPayoutPercent = clampPayoutPercent(Number(form.primaryPayoutPercent));
  const secondaryPayoutPercent = 100 - primaryPayoutPercent;
  const payoutRows = [
    { owner: "Alex", percent: primaryPayoutPercent, amount: dealValue * (primaryPayoutPercent / 100) },
    { owner: "Morgan", percent: secondaryPayoutPercent, amount: dealValue * (secondaryPayoutPercent / 100) },
  ];
  const setPayoutDraft = (nextAlexPercent: number) => {
    const primaryPercent = clampPayoutPercent(nextAlexPercent);
    setForm((prev) => ({
      ...prev,
      primaryPayoutPercent: String(primaryPercent),
      secondaryPayoutPercent: String(100 - primaryPercent),
    }));
    return primaryPercent;
  };
  const savePayoutSplit = async (nextAlexPercent: number) => {
    const primaryPercent = setPayoutDraft(nextAlexPercent);
    setSavingPayout(true);
    try {
      await saveField({ payoutAllocations: buildPayoutAllocations(String(primaryPercent)) });
    } finally {
      setSavingPayout(false);
    }
  };

  const drawer = (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} />

      {/* Drawer */}
      <div
        key={opportunity.id}
        ref={drawerRef}
        style={{ position: "fixed", inset: 0, zIndex: 100, background: "#0c0c12", overflowY: "auto" }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{ position: "fixed", top: 20, right: 24, zIndex: 110, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-client-text-secondary)", fontSize: 16, cursor: "pointer" }}
        >
          ✕
        </button>

        <div style={{ width: "100%", maxWidth: "none", margin: 0, padding: "28px 24px 64px" }}>

          <CrmRecordHeader
            eyebrow="Opportunity"
            avatarLabel={opportunity.name}
            avatarGradient="linear-gradient(135deg, #dadadb 0%, #C4C9D1 100%)"
            title={<CopyableText value={opportunity.name} style={{ fontSize: 22, fontWeight: 700, color: "var(--color-client-text)" }} />}
            subtitle={(
              <>
                {account && (
                  <a onClick={(e) => { e.preventDefault(); router.push(`/contacts?object=accounts&select=${toDisplayId(account.id, "account")}`); onClose(); }} href="#" style={{ color: "#dadadb", textDecoration: "none", cursor: "pointer" }}>
                    {account.name}
                  </a>
                )}
                {account && contact ? <span style={{ color: "var(--color-client-text-dim)" }}> · </span> : null}
                {contact && (
                  <a onClick={(e) => { e.preventDefault(); router.push(`/contacts?select=${toDisplayId(contact.id, "contact")}`); onClose(); }} href="#" style={{ color: "#C4C9D1", textDecoration: "none", cursor: "pointer" }}>
                    {contact.name}
                  </a>
                )}
              </>
            )}
            badges={(
              <>
                <StagePill stage={opportunity.stage} />
                <OpportunityHealthPill opportunity={opportunity} />
                <CrmBadge tone="blue">{opportunity.opportunityType}</CrmBadge>
              </>
            )}
          />

          <OpportunityStagePath
            activeStage={form.stage}
            onStageChange={(stage) => {
              setForm((prev) => ({ ...prev, stage }));
              void saveField({ stage });
            }}
          />

          <LineageChips
            chips={[
              account ? { label: `Account: ${account.name} ↑`, href: `/contacts?object=accounts&select=${toDisplayId(account.id, "account")}` } : { label: "Account ↑" },
              { label: "Opportunity", active: true },
              contact ? { label: `Contact: ${contact.name} ↗`, href: `/contacts?select=${toDisplayId(contact.id, "contact")}` } : { label: "Contact" },
            ]}
            trailing={(
              <button
                onClick={() => setShowDeleteConfirm((p) => !p)}
                style={{
                  ...crmDangerActionButtonStyle,
                  minHeight: 24,
                  padding: "3px 7px",
                  borderRadius: 5,
                  fontFamily: "monospace",
                  fontSize: 11,
                  fontWeight: 650,
                  lineHeight: 1,
                  gap: 4,
                }}
              >
                🗑️ Delete
              </button>
            )}
          />

          <CrmNextBestActionPanel
            action={nextBestAction}
            detail="Rule-based guidance from stage, owner, due date, next step, and linked records. No AI-generated text is being persisted."
            tone={isOverdue || !opportunity.nextStep?.trim() ? "red" : nextBestAction === "Next step is covered." ? "green" : "amber"}
          />
          <CrmRecordSignalPanel title="Deal quality" signals={opportunitySignals} />
          <CrmRecordSignalPanel
            title={`Health score: ${health.status}${health.status !== "Closed" ? ` ${health.score}` : ""}`}
            signals={health.reasons.map((reason) => ({
              label: reason,
              detail: health.status,
              tone: opportunityHealthTone(health.status),
            }))}
          />
          {saveError ? (
            <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.24)", background: "rgba(248,113,113,0.08)", color: "#FCA5A5", fontSize: 12, fontWeight: 650 }}>
              {saveError}
            </div>
          ) : null}

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
                <p style={{ margin: 0, fontSize: 12, color: "#F87171", marginBottom: 8 }}>Delete this opportunity? This cannot be undone.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
                  <button
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        const res = await fetch("/api/crm/opportunities", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: opportunity.id }) });
                        if (!res.ok) throw new Error(`API returned ${res.status}`);
                        if (onRefresh) await onRefresh();
                        onClose();
                      } catch { setDeleting(false); }
                    }}
                    style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}
                  >{deleting ? "Deleting…" : "Delete"}</button>
                </div>
              </div>
            )}

          {/* ── Deal Details Section ── */}
          <DrawerSection title="Deal Details">
            <div
              style={{
                border: "1px solid rgba(148,163,184,0.20)",
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(15,23,42,0.45)",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <div style={{ padding: 12, borderRight: "1px solid rgba(148,163,184,0.16)", borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                <InlineEditEnum picklistKey="opportunityStage" value={form.stage} onSave={async (v) => { const next = (v || OPPORTUNITY_STAGES[0]) as OpportunityStage; setForm((p) => ({ ...p, stage: next })); await saveField({ stage: next }); }} label="Stage" />
                </div>
                <div style={{ padding: 12, borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                <InlineEditEnum picklistKey="forecastConfidence" value={form.forecastConfidence} onSave={async (v) => { const next = (v || FORECAST_CONFIDENCE_OPTIONS[1]) as ForecastConfidence; setForm((p) => ({ ...p, forecastConfidence: next })); await saveField({ forecastConfidence: next }); }} label="Forecast Confidence" />
                </div>
                <div style={{ padding: 12, borderRight: "1px solid rgba(148,163,184,0.16)", borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <span style={drawerLabelStyle}>Location</span>
                  <div style={{ fontSize: 13, color: "var(--color-client-text)" }}>{inferredLocation}</div>
                </div>
                <div style={{ padding: 12, borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <span style={drawerLabelStyle}>Owner</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <OwnerSelect
                      value={form.owner}
                      onChange={(owner) => {
                        const next = (owner || OPPORTUNITY_OWNER_OPTIONS[OPPORTUNITY_OWNER_OPTIONS.length - 1]) as OpportunityOwner;
                        if (next === form.owner) return;
                        setForm((p) => ({ ...p, owner: next }));
                        void (async () => {
                          setSavingOwner(true);
                          try {
                            await saveField({ owner: next });
                          } finally {
                            setSavingOwner(false);
                          }
                        })();
                      }}
                      compact
                    />
                    {savingOwner ? <MiniSpinner /> : null}
                  </div>
                </div>
                <div style={{ padding: 12, borderRight: "1px solid rgba(148,163,184,0.16)", borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <span style={drawerLabelStyle}>Source</span>
                  <span style={{ display: "inline-flex", padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "#F59E0B", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}>{opportunity.source}</span>
                </div>
                <div style={{ padding: 12, borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <span style={drawerLabelStyle}>Referral Partner</span>
                  <ContactPicker
                    options={selectableContacts}
                    value={form.referralPartnerContactId || null}
                    onChange={(value) => {
                      setForm((prev) => ({ ...prev, referralPartnerContactId: value ?? "" }));
                      void saveField({ referralPartnerContactId: value || undefined });
                    }}
                    accountId={null}
                    label=""
                    placeholder="Search contacts..."
                    size="sm"
                  />
                </div>
                <div style={{ padding: 12, borderRight: "1px solid rgba(148,163,184,0.16)", borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <InlineEditText
                    label="Revenue"
                    value={formatMoney(Number(form.value || 0))}
                    onSave={async (v) => {
                      const cleaned = v.replace(/[^0-9.-]/g, "");
                      const parsed = Number(cleaned);
                      const nextValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
                      setForm((p) => ({ ...p, value: String(nextValue) }));
                      await saveField({ value: nextValue });
                    }}
                    placeholder="$0"
                    color="var(--color-client-text)"
                  />
                </div>
                <div style={{ padding: 12, borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <span style={drawerLabelStyle}>Open Date</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="date"
                      value={form.openDate || ""}
                        onChange={(e) => {
                          const next = e.target.value;
                          const previous = form.openDate;
                          setForm((p) => ({ ...p, openDate: next }));
                          void (async () => {
                            setSavingOpenDate(true);
                            try {
                              if (!next) throw new Error("Open date cannot be empty");
                              await saveField({ openDate: next });
                            } catch (error) {
                              setForm((p) => ({ ...p, openDate: previous }));
                              setSaveError(error instanceof Error ? error.message : "Open date update failed");
                            } finally {
                              setSavingOpenDate(false);
                            }
                        })();
                      }}
                      style={{ ...inputStyle, minHeight: 32 }}
                    />
                    {savingOpenDate ? <MiniSpinner /> : null}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={drawerLabelStyle}>Close Date</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="date"
                        value={form.closeDate || ""}
                        onChange={(e) => {
                          const next = e.target.value;
                          const previous = form.closeDate;
                          setForm((p) => ({ ...p, closeDate: next }));
                          void (async () => {
                            setSavingCloseDate(true);
                            try {
                              await saveField({ closeDate: next || null });
                            } catch (error) {
                              setForm((p) => ({ ...p, closeDate: previous }));
                              setSaveError(error instanceof Error ? error.message : "Close date update failed");
                            } finally {
                              setSavingCloseDate(false);
                            }
                          })();
                        }}
                        style={{ ...inputStyle, minHeight: 32 }}
                      />
                      {form.closeDate ? (
                        <button
                          type="button"
                          onClick={() => {
                            const previous = form.closeDate;
                            setForm((p) => ({ ...p, closeDate: "" }));
                            void (async () => {
                              setSavingCloseDate(true);
                              try {
                                await saveField({ closeDate: null });
                              } catch (error) {
                                setForm((p) => ({ ...p, closeDate: previous }));
                                setSaveError(error instanceof Error ? error.message : "Close date update failed");
                              } finally {
                                setSavingCloseDate(false);
                              }
                            })();
                          }}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.04)",
                            color: "var(--color-client-text-dim)",
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          Clear
                        </button>
                      ) : null}
                      {savingCloseDate ? <MiniSpinner /> : null}
                    </div>
                  </div>
                </div>
                <div style={{ padding: 12, borderRight: "1px solid rgba(148,163,184,0.16)", borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <span style={drawerLabelStyle}>Payout Attribution</span>
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { label: "50/50", value: 50 },
                        { label: "80/20", value: 80 },
                        { label: "100/0", value: 100 },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => void savePayoutSplit(preset.value)}
                          style={{
                            minHeight: 26,
                            padding: "4px 9px",
                            borderRadius: 6,
                            border: primaryPayoutPercent === preset.value ? "1px solid rgba(218,218,219,0.42)" : "1px solid rgba(255,255,255,0.10)",
                            background: primaryPayoutPercent === preset.value ? "rgba(218,218,219,0.14)" : "rgba(255,255,255,0.035)",
                            color: primaryPayoutPercent === preset.value ? "#F4C7CA" : "var(--color-client-text-secondary)",
                            cursor: "pointer",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                      {savingPayout ? <MiniSpinner /> : null}
                    </div>
                    {payoutRows.map((row) => (
                      <div key={row.owner} style={{ display: "grid", gridTemplateColumns: "minmax(104px, 1fr) 86px minmax(82px, auto)", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--color-client-text-secondary)", fontWeight: 650 }}>{row.owner}</span>
                        <div style={{ position: "relative" }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={row.owner === "Alex" ? form.primaryPayoutPercent : form.secondaryPayoutPercent}
                            onChange={(event) => {
                              const raw = event.target.value;
                              if (raw === "") {
                                setForm((prev) => ({ ...prev, primaryPayoutPercent: "", secondaryPayoutPercent: "" }));
                                return;
                              }
                              const next = Number(raw);
                              setPayoutDraft(row.owner === "Alex" ? next : 100 - next);
                            }}
                            onBlur={() => void savePayoutSplit(Number(form.primaryPayoutPercent || 0))}
                            style={{ ...inputStyle, minHeight: 30, padding: "6px 22px 6px 8px", fontSize: 12 }}
                          />
                          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "var(--color-client-text-dim)" }}>%</span>
                        </div>
                        <span style={{ fontSize: 12, color: "#F4C7CA", fontWeight: 750, textAlign: "right" }}>{formatMoney(row.amount)}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", lineHeight: 1.45 }}>
                      Calculated from current deal value: {formatMoney(dealValue)}.
                    </div>
                  </div>
                </div>
                <div style={{ padding: 0, borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                  <div style={{ padding: 12, borderBottom: "1px solid rgba(148,163,184,0.16)" }}>
                    <span style={drawerLabelStyle}>Price Book</span>
                    <div style={{ fontSize: 13, color: "var(--color-client-text-secondary)" }}>
                      {pricingDetail(opportunity.opportunityType, opportunity.quantity) ?? `${opportunity.quantity ?? 1} x ${formatMoney(opportunity.unitPrice ?? opportunity.value)}`}
                    </div>
                  </div>
                  <div style={{ padding: 12 }}>
                    <span style={drawerLabelStyle}>Pricing Notes</span>
                    <div style={{ fontSize: 13, color: "var(--color-client-text-dim)" }}>Calculated from type, quantity, and unit settings.</div>
                  </div>
                </div>
              </div>
            </div>
          </DrawerSection>

          {/* ── Next Steps Section ── */}
          <DrawerSection title="Next Steps">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <InlineEditText
                value={form.nextStep}
                onSave={async (v) => { setForm((p) => ({ ...p, nextStep: v })); await saveField({ nextStep: v }); }}
                placeholder="Add next step..."
                label="Next Step"
              />
              <div>
                <span style={drawerLabelStyle}>Next Step Due Date</span>
                <span style={{ fontSize: 13, color: opportunity.nextStepDueDate && new Date(opportunity.nextStepDueDate).getTime() < Date.now() && !["Closed Won", "Closed Lost"].includes(opportunity.stage) ? "#F87171" : "var(--color-client-text)", fontWeight: opportunity.nextStepDueDate && new Date(opportunity.nextStepDueDate).getTime() < Date.now() ? 600 : 400 }}>
                  {formatDate(opportunity.nextStepDueDate)}
                  {opportunity.nextStepDueDate && new Date(opportunity.nextStepDueDate).getTime() < Date.now() && !["Closed Won", "Closed Lost"].includes(opportunity.stage) && " (Overdue)"}
                </span>
              </div>
              {form.stage === "Closed Lost" && (
                <InlineEditEnum picklistKey="lossReason" value={form.lossReason || ""} onSave={async (v) => { setForm((p) => ({ ...p, lossReason: v as OpportunityLossReason | "" })); await saveField({ lossReason: v as OpportunityLossReason }); }} label="Loss Reason" />
              )}
            </div>
          </DrawerSection>

          {/* ── Notes Section ── */}
          <DrawerSection title="Notes">
            <InlineEditText
              value={form.notes}
              onSave={async (v) => { setForm((p) => ({ ...p, notes: v })); await saveField({ notes: v || undefined }); }}
              placeholder="Add notes..."
              multiline
            />
          </DrawerSection>

          {/* ── Related Objects Section ── */}
          <DrawerSection title="Related Objects">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Contact card */}
              {contact && (
                <div
                  onClick={() => { router.push(`/contacts?select=${toDisplayId(contact.id, "contact")}`); onClose(); }}
                  style={{ padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-client-text-dim)", marginBottom: 6 }}>Contact</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 4 }}>{contact.name}</div>
                  {contact.title && <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 4 }}>{contact.title}</div>}
                  {contact.emails?.[0] && <CopyableText value={contact.emails[0]} style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }} />}
                  {contact.phone && <div style={{ marginTop: 2 }}><CopyableText value={contact.phone} style={{ fontSize: 11, color: "var(--color-client-text-secondary)" }} /></div>}
                </div>
              )}
              {/* Account card */}
              {account && (
                <div
                  onClick={() => { router.push(`/contacts?object=accounts&select=${toDisplayId(account.id, "account")}`); onClose(); }}
                  style={{ padding: 14, borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", cursor: "pointer" }}
                >
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-client-text-dim)", marginBottom: 6 }}>Account</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 4 }}>{account.name}</div>
                  <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 2 }}>{account.type}</div>
                  <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{account.operatingMarket}</div>
                </div>
              )}
            </div>
          </DrawerSection>

          {/* ── Activity Timeline Section ── */}
          <OpportunityActivityTimeline contactId={opportunity.contactId} />

          <CrmRecordFooter rawId={opportunity.id} entityType="opportunity" />

        </div>
      </div>
    </>
  );

  return typeof document !== "undefined" ? createPortal(drawer, document.body) : null;
}

export function OpportunitiesView({
  embedded = false,
  consoleData,
  consoleLoading = false,
  onConsoleRefresh,
}: {
  embedded?: boolean;
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
  onConsoleRefresh?: () => Promise<CRMConsolePayload | null> | CRMConsolePayload | null | void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useResponsive();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const applyConsoleData = useCallback((payload: CRMConsolePayload) => {
    setOpportunities(payload.opportunities.filter((opportunity) => !opportunity.deletedAt).map((opportunity) => ({ ...opportunity, stage: normalizeOpportunityStage(opportunity.stage) })));
    setAccounts(payload.accounts);
    setContacts(payload.contacts);
    setLoading(false);
  }, []);

  const fetchData = useCallback(async () => {
    if (consoleData) {
      const refreshed = await onConsoleRefresh?.();
      if (refreshed) applyConsoleData(refreshed);
      else applyConsoleData(consoleData);
      return;
    }

    try {
      const [oppsRes, accountsRes, contactsRes] = await Promise.all([
        fetch("/api/crm/opportunities", { cache: "no-store" }),
        fetch("/api/crm/accounts", { cache: "no-store" }),
        fetch("/api/crm/contacts", { cache: "no-store" }),
      ]);
      if (oppsRes.ok) {
        const data = await oppsRes.json();
        setOpportunities(Array.isArray(data) ? data.filter((opportunity: Opportunity) => !opportunity.deletedAt).map((opportunity: Opportunity) => ({ ...opportunity, stage: normalizeOpportunityStage(opportunity.stage) })) : []);
      }
      if (accountsRes.ok) setAccounts(await accountsRes.json());
      if (contactsRes.ok) setContacts(await contactsRes.json());
    } catch {
      // Keep the current view state if a secondary CRM API is temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, [applyConsoleData, consoleData, onConsoleRefresh]);

  useEffect(() => {
    if (consoleData) {
      applyConsoleData(consoleData);
      return;
    }
    if (consoleLoading) return;
    fetchData();
  }, [applyConsoleData, consoleData, consoleLoading, fetchData]);

  const prefill = useMemo(() => {
    const contactId = searchParams.get("prefill_contact") ?? undefined;
    const accountId = searchParams.get("prefill_account") ?? undefined;
    if (!contactId && !accountId) return undefined;
    const account = accounts.find((item) => item.id === accountId);
    const contact = contacts.find((item) => item.id === contactId);
    const defaults = accountToOpportunityDefaults(account);
    const contactName = contact?.name?.trim();
    const accountName = account?.name?.trim();
    return {
      contactId,
      accountId,
      ...defaults,
      name: contactName && defaults.opportunityType === "Half-Day Install"
        ? `${contactName} - Half-Day Install`
        : accountName && defaults.opportunityType
          ? `${accountName} - ${defaults.opportunityType}`
          : undefined,
    };
  }, [searchParams, accounts, contacts]);

  useEffect(() => {
    const selectId = searchParams.get("select");
    if (!selectId) return;
    if (selectId === "new") {
      setSelectedId(selectId);
      return;
    }
    setSelectedId(fromDisplayId(selectId, opportunities.map((o) => o.id), "opportunity"));
  }, [searchParams, opportunities]);

  const accountNameById = useMemo(() => Object.fromEntries(accounts.map((account) => [account.id, account.name])), [accounts]);
  const contactNameById = useMemo(() => Object.fromEntries(contacts.map((contact) => [contact.id, contact.name])), [contacts]);

  const filtered = opportunities;
  const lens = searchParams.get("lens") || "all";
  const lensed = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    if (lens === "open") return filtered.filter((opp) => !["Closed Won", "Closed Lost"].includes(opp.stage));
    if (lens === "needs-next-step") return filtered.filter((opp) => !["Closed Won", "Closed Lost"].includes(opp.stage) && !opp.nextStep?.trim());
    if (lens === "stale") return filtered.filter((opp) => !["Closed Won", "Closed Lost"].includes(opp.stage) && Boolean(opp.nextStepDueDate) && new Date(opp.nextStepDueDate).getTime() < Date.now());
    if (lens === "at-risk") return filtered.filter((opp) => ["At Risk", "Critical"].includes(computeOpportunityHealth(opp).status));
    if (lens === "closing") return filtered.filter((opp) => { if (!opp.closeDate) return false; const d = new Date(opp.closeDate); return d.getMonth() === month && d.getFullYear() === year; });
    if (lens === "won") return filtered.filter((opp) => opp.stage === "Closed Won");
    if (lens === "lost") return filtered.filter((opp) => opp.stage === "Closed Lost");
    if (lens === "mine") return filtered.filter((opp) => opp.owner === "Alex");
    return filtered;
  }, [filtered, lens]);

  const summary = useMemo(() => {
    const open = filtered.filter((opportunity) => !["Closed Won", "Closed Lost"].includes(opportunity.stage));
    const pipelineValue = open.reduce((sum, opportunity) => sum + opportunity.value, 0);
    const overdueCount = open.filter((opportunity) => new Date(opportunity.nextStepDueDate).getTime() < Date.now()).length;
    const atRiskCount = open.filter((opportunity) => ["At Risk", "Critical"].includes(computeOpportunityHealth(opportunity).status)).length;
    return [
      { label: "Open Opportunities", value: open.length, color: "#dadadb" },
      { label: "Pipeline Value", value: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pipelineValue), color: "#C4C9D1" },
      { label: "Overdue Next Steps", value: overdueCount, color: overdueCount > 0 ? "#F87171" : "#dadadb" },
      { label: "At-Risk Deals", value: atRiskCount, color: atRiskCount > 0 ? "#F87171" : "#dadadb" },
    ];
  }, [filtered]);

  const pipelineKpis = useMemo(() => {
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    const open = filtered.filter((o) => !["Closed Won", "Closed Lost"].includes(o.stage));
    const totalPipeline = open.reduce((s, o) => s + o.value, 0);
    const openCount = open.length;
    const avgDeal = openCount > 0 ? totalPipeline / openCount : 0;
    const closedWon = filtered.filter((o) => o.stage === "Closed Won");
    const closedLost = filtered.filter((o) => o.stage === "Closed Lost");
    const totalClosed = closedWon.length + closedLost.length;
    const winRate = totalClosed > 0 ? Math.round((closedWon.length / totalClosed) * 100) : 0;
    const avgDaysToClose = closedWon.length > 0
      ? Math.round(closedWon.reduce((s, o) => {
          const openD = new Date(o.openDate).getTime();
          const closeD = o.closeDate ? new Date(o.closeDate).getTime() : Date.now();
          return s + (closeD - openD) / (1000 * 60 * 60 * 24);
        }, 0) / closedWon.length)
      : 0;
    return { totalPipeline: fmt(totalPipeline), openCount, avgDeal: fmt(avgDeal), winRate: `${winRate}%`, avgDaysToClose: `${avgDaysToClose}d` };
  }, [filtered]);

  const stageBreakdown = useMemo(() => {
    const stages: { stage: OpportunityStage; color: string }[] = [
      { stage: "Discovery", color: "rgba(218,218,219,0.8)" },
      { stage: "Propose", color: "rgba(148,163,184,0.85)" },
      { stage: "Contracting", color: "rgba(251,191,36,0.85)" },
      { stage: "Closed Won", color: "rgba(34,197,94,0.8)" },
      { stage: "Closed Lost", color: "rgba(239,68,68,0.4)" },
    ];
    const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
    const totalCount = filtered.length || 1;
    return stages.map(({ stage, color }) => {
      const items = filtered.filter((o) => o.stage === stage);
      return { stage, color, count: items.length, value: fmt(items.reduce((s, o) => s + o.value, 0)), pct: (items.length / totalCount) * 100 };
    });
  }, [filtered]);

  const selected = useMemo(() => opportunities.find((opportunity) => opportunity.id === selectedId) ?? null, [opportunities, selectedId]);

  const persistOpportunity = useCallback(async (payload: OpportunityEditState, targetId?: string | null) => {
    const payloadAccount = accounts.find((account) => account.id === payload.accountId);
    const inferredPayloadLocation = inferOpportunityLocationFromAccount(payloadAccount);
    const body = {
      ...(targetId ? { id: targetId } : {}),
      ...payload,
      location: inferredPayloadLocation,
      closeDate: payload.closeDate || undefined,
      notes: payload.notes || undefined,
      lossReason: payload.lossReason || undefined,
      referralPartnerContactId: payload.referralPartnerContactId || undefined,
      value: Number(payload.value || 0),
      pricingUnit: payload.pricingUnit || undefined,
      quantity: payload.quantity ? Number(payload.quantity) : undefined,
      unitPrice: payload.unitPrice ? Number(payload.unitPrice) : undefined,
      computedValue: payload.computedValue ? Number(payload.computedValue) : undefined,
      payoutAllocations: buildPayoutAllocations(payload.primaryPayoutPercent),
    };
    const response = await fetch("/api/crm/opportunities", {
      method: targetId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Failed to save opportunity (${response.status})`);
    const saved = await response.json();
    setSelectedId(saved.id);
    await fetchData();
    const params = new URLSearchParams(searchParams.toString());
    params.set("select", toDisplayId(saved.id, "opportunity"));
    params.set("object", "opportunities");
    router.replace(`/contacts?${params.toString()}`);
  }, [accounts, fetchData, router, searchParams]);

  const updateStage = useCallback(async (id: string, stage: OpportunityStage) => {
    const opportunity = opportunities.find((item) => item.id === id);
    if (!opportunity || opportunity.stage === stage) return;
    setOpportunities((current) => current.map((item) => item.id === id ? { ...item, stage, updatedAt: new Date().toISOString() } : item));
    const response = await fetch("/api/crm/opportunities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stage }),
    });
    if (!response.ok) {
      await fetchData();
      throw new Error("Failed to update stage");
    }
  }, [opportunities, fetchData]);

  const updateOwner = useCallback(async (id: string, owner: OpportunityOwner) => {
    const opportunity = opportunities.find((item) => item.id === id);
    if (!opportunity || opportunity.owner === owner) return;
    setOpportunities((current) => current.map((item) => item.id === id ? { ...item, owner, updatedAt: new Date().toISOString() } : item));
    const response = await fetch("/api/crm/opportunities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, owner }),
    });
    if (!response.ok) {
      await fetchData();
      throw new Error("Failed to update owner");
    }
  }, [opportunities, fetchData]);

  const columns: StandardTableColumn<Opportunity>[] = useMemo(() => [
    { key: "_select", label: "", sortable: false, filterable: false, minWidth: 36, maxWidth: 36, getValue: () => "", render: (row) => <SelectCell checked={selectedIds.has(row.id)} onChange={(checked) => setSelectedIds((prev) => { const next = new Set(prev); if (checked) next.add(row.id); else next.delete(row.id); return next; })} /> },
    { key: "name", label: "Opportunity", getValue: (row) => row.name, render: (row) => <div><div style={{ fontWeight: 600, color: "#F8FAFC" }}>{row.name}</div><div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginTop: 2 }}>{accountNameById[row.accountId] ?? "—"} · {contactNameById[row.contactId] ?? "—"}</div></div> },
    { key: "stage", label: "Stage", getValue: (row) => row.stage, render: (row) => <StagePill stage={row.stage} /> },
    { key: "health", label: "Health", getValue: (row) => `${computeOpportunityHealth(row).status} ${computeOpportunityHealth(row).score}`, render: (row) => <OpportunityHealthPill opportunity={row} /> },
    {
      key: "owner",
      label: "Owner",
      getValue: (row) => row.owner,
      render: (row) => (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <OwnerSelect value={row.owner} onChange={(owner) => void updateOwner(row.id, owner as OpportunityOwner)} compact chromeless />
          <span
            aria-hidden
            title="Edit owner"
            style={{ color: "var(--color-client-text-dim)", fontSize: 12, lineHeight: 1 }}
          >
            ✎
          </span>
        </div>
      ),
    },
    { key: "nextStep", label: "Next Step", getValue: (row) => row.nextStep, render: (row) => <span style={{ color: "var(--color-client-text-secondary)" }}>{row.nextStep}</span> },
    { key: "nextStepDueDate", label: "Due", getValue: (row) => row.nextStepDueDate, render: (row) => <span style={{ color: new Date(row.nextStepDueDate).getTime() < Date.now() && !["Closed Won", "Closed Lost"].includes(row.stage) ? "#F87171" : "var(--color-client-text)" }}>{formatDate(row.nextStepDueDate)}</span> },
    { key: "value", label: "Value", getValue: (row) => String(row.value), render: (row) => <span style={{ fontWeight: 600, color: "#dadadb" }}>{formatMoney(row.value)}</span> },
    { key: "opportunityType", label: "Type", getValue: (row) => row.opportunityType },
    { key: "location", label: "Location", getValue: (row) => row.location },
    { key: "forecastConfidence", label: "Confidence", getValue: (row) => row.forecastConfidence },
    { key: "source", label: "Source", getValue: (row) => row.source },
  ], [accountNameById, contactNameById, selectedIds, updateOwner]);

  const patchSelected = useCallback(async (patchFor: (opp: Opportunity) => Partial<Opportunity>) => {
    const rows = Array.from(selectedIds).map((id) => opportunities.find((opp) => opp.id === id)).filter((opp): opp is Opportunity => !!opp);
    const results = await Promise.all(rows.map(async (opp) => {
      try {
        const res = await fetch("/api/crm/opportunities", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: opp.id, ...patchFor(opp) }) });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedIds(new Set());
    await fetchData();
  }, [fetchData, opportunities, selectedIds]);
  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch("/api/crm/opportunities", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedIds(new Set());
    await fetchData();
  }, [fetchData, selectedIds]);
  const allSelected = lensed.length > 0 && selectedIds.size === lensed.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < lensed.length;
  const bulkBarNode = useMemo(() => selectedIds.size > 0 ? (
    <BulkActionBar count={selectedIds.size} result={bulkResult} onClear={() => setSelectedIds(new Set())}>
      <BulkOwnerPrompt onPick={(owner) => void patchSelected(() => ({ owner: owner as OpportunityOwner }))} />
      <BulkPicklistPrompt label="Update stage..." options={OPPORTUNITY_STAGES.map((stage) => ({ value: stage }))} onPick={(stage) => void patchSelected(() => ({ stage: stage as OpportunityStage }))} />
      <button type="button" onClick={() => void deleteSelected()} style={{ ...bulkButtonStyle, color: "#F87171" }}>Delete</button>
    </BulkActionBar>
  ) : null, [bulkResult, deleteSelected, patchSelected, selectedIds]);
  useCRMBulkBar(bulkBarNode);

  const openOpportunity = useCallback((id: string) => {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("object", "opportunities");
    params.set("select", id === "new" ? id : toDisplayId(id, "opportunity"));
    router.replace(`/contacts?${params.toString()}`);
  }, [router, searchParams]);

  const closeOpportunity = useCallback(() => {
    setSelectedId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("select");
    params.set("object", "opportunities");
    router.replace(`/contacts?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="fade-in-up" style={{ width: "100%", maxWidth: embedded ? "none" : 1460 }}>
      {!embedded && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>CRM</div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.03em", marginBottom: 6 }}>Opportunities</h1>
          <p style={{ fontSize: 14, color: "var(--color-client-text-secondary)" }}>Revenue pipeline with StandardTable and kanban by stage, tied to contacts and accounts.</p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        <div style={{ display: "inline-flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 3, gap: 2 }}>
          {(["table", "board"] as ViewMode[]).map((mode) => {
            const active = viewMode === mode;
            return <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "7px 12px", borderRadius: 8, border: active ? "1px solid rgba(218,218,219,0.25)" : "1px solid transparent", background: active ? "rgba(218,218,219,0.15)" : "transparent", color: active ? "#dadadb" : "var(--color-client-text-secondary)", cursor: "pointer", textTransform: "capitalize", fontSize: 12 }}>{mode}</button>;
          })}
        </div>
        <button onClick={() => setSelectedId("new")} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(218,218,219,0.25)", background: "rgba(218,218,219,0.12)", color: "#dadadb", cursor: "pointer", fontWeight: 600 }}>+ Opportunity</button>
      </div>
      <LensToggleRow object="opportunities" lenses={[{ key: "all", label: "All" }, { key: "open", label: "Open" }, { key: "needs-next-step", label: "Needs next step" }, { key: "stale", label: "Overdue" }, { key: "closing", label: "Closing this month" }, { key: "won", label: "Won" }, { key: "lost", label: "Lost" }, { key: "mine", label: "My opps" }]} />

      {/* Pipeline KPI Strip */}
      <div className="crm-fluid-grid-compact" style={{ marginBottom: 16 }}>
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: "#C4C9D1" }}>{pipelineKpis.totalPipeline}</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>Total Pipeline</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>Sum of all open deals</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: "#dadadb" }}>{pipelineKpis.openCount}</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>Open Deals</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>Active opportunities</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: "rgba(247,248,248,0.94)" }}>{pipelineKpis.avgDeal}</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>Avg Deal Size</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>Per open opportunity</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: "#dadadb" }}>{pipelineKpis.winRate}</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>Win Rate</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>Closed Won vs total closed</div>
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 700, color: "#F87171" }}>{pipelineKpis.avgDaysToClose}</div>
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--color-client-text)" }}>Avg Time to Close</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>Days for closed-won deals</div>
        </div>
      </div>

      {/* Stage Pipeline Visualization */}
      <div style={{ padding: "18px 20px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 14 }}>Pipeline by Stage</div>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 32, marginBottom: 14 }}>
          {stageBreakdown.filter((s) => s.count > 0).map((s) => (
            <div key={s.stage} style={{ width: `${s.pct}%`, minWidth: s.pct > 0 ? 2 : 0, background: s.color, transition: "width 0.3s ease" }} title={`${s.stage}: ${s.count} deals`} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
          {stageBreakdown.map((s) => (
            <div key={s.stage} className="flex items-center gap-2" style={{ fontSize: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <div>
                <span style={{ color: "var(--color-client-text)", fontWeight: 600 }}>{s.stage}</span>
                <span style={{ color: "var(--color-client-text-dim)", marginLeft: 6 }}>{s.count} · {s.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewMode === "table" ? (
        <StandardTable
          tableKey="opportunities-main"
          columns={columns}
          data={lensed}
          toolbar={<label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--color-client-text-dim)" }}><SelectAllBox checked={allSelected} indeterminate={someSelected} onChange={(checked) => setSelectedIds(checked ? new Set(lensed.map((opp) => opp.id)) : new Set())} />Select all</label>}
          getRowKey={(row) => row.id}
          defaultSortKey="nextStepDueDate"
          defaultSortDir="asc"
          onRowClick={(row) => openOpportunity(row.id)}
          selectedRowKey={selectedId && selectedId !== "new" && selected ? selectedId : undefined}
          emptyMessage={loading ? "Loading opportunities..." : "No opportunities match the current filters"}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${OPPORTUNITY_STAGES.length}, minmax(0, 1fr))`, gap: 12 }}>
          {OPPORTUNITY_STAGES.map((stage) => {
            const stageItems = lensed.filter((opportunity) => opportunity.stage === stage);
            const colors = stageColors[stage];
            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={async (e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setDraggedId(null);
                  if (id) await updateStage(id, stage);
                }}
                style={{ ...panelStyle, minHeight: 420, background: draggedId ? colors.bg : panelStyle.background, border: draggedId ? `1px dashed ${colors.border}` : panelStyle.border, padding: 10 }}
              >
                <div className="flex items-center justify-between gap-2" style={{ marginBottom: 10, padding: "2px 2px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <StagePill stage={stage} />
                  <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{stageItems.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stageItems.map((opportunity) => (
                    <button
                      key={opportunity.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", opportunity.id); e.dataTransfer.effectAllowed = "move"; setDraggedId(opportunity.id); }}
                      onDragEnd={() => setDraggedId(null)}
                      onClick={() => openOpportunity(opportunity.id)}
                      style={{ textAlign: "left", padding: 12, borderRadius: 10, border: selectedId === opportunity.id ? "1px solid rgba(218,218,219,0.4)" : "1px solid rgba(255,255,255,0.06)", background: selectedId === opportunity.id ? "rgba(218,218,219,0.08)" : "var(--color-client-surface-raised)", cursor: "pointer", opacity: draggedId === opportunity.id ? 0.45 : 1 }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#F8FAFC", marginBottom: 4 }}>{opportunity.name}</div>
                      <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 3 }}>{accountNameById[opportunity.accountId] ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 8 }}>{contactNameById[opportunity.contactId] ?? "—"}</div>
                      <div className="flex items-center justify-between gap-2" style={{ fontSize: 11, marginBottom: 6 }}>
                        <span style={{ color: "var(--color-client-text-dim)" }}>{opportunity.opportunityType} · {opportunity.location}</span>
                        <span style={{ color: "#dadadb", fontWeight: 600 }}>{formatMoney(opportunity.value)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 4 }}>Owner: {opportunity.owner}</div>
                      <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 4 }}>{opportunity.nextStep}</div>
                      <div className="flex items-center justify-between gap-2" style={{ fontSize: 11 }}>
                        <span style={{ color: new Date(opportunity.nextStepDueDate).getTime() < Date.now() && !["Closed Won", "Closed Lost"].includes(opportunity.stage) ? "#F87171" : "var(--color-client-text-dim)" }}>{formatDate(opportunity.nextStepDueDate)}</span>
                        <span style={{ color: "#dadadb", fontWeight: 600 }}>{opportunity.forecastConfidence}</span>
                      </div>
                    </button>
                  ))}
                  {stageItems.length === 0 && <div style={{ padding: 16, textAlign: "center", color: "var(--color-client-text-dim)", fontSize: 12 }}>Drop opportunities here</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(selectedId === "new" || selected) && (
        <OpportunityDrawer
          opportunity={selectedId === "new" ? null : selected}
          accounts={accounts}
          contacts={contacts}
          onClose={closeOpportunity}
          onSave={async (payload) => persistOpportunity(payload, selectedId === "new" ? null : selected?.id)}
          onRefresh={fetchData}
          prefill={selectedId === "new" ? prefill : undefined}
          router={router}
        />
      )}
    </div>
  );
}
