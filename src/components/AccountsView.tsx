"use client";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { CopyableText, CopyableField } from "@/components/CopyableField";
import { InlineEditText } from "@/components/InlineEdit";
import { CRMPicker } from "@/components/CRMPicker";
import { ACCOUNT_LIFECYCLE_STAGES, ACCOUNT_TYPES, ACCOUNT_TYPE_SUBTYPES, normalizeAccountLifecycleStage, normalizeAccountType, type Account, type AccountLifecycleStage, type AccountType } from "@/data/accounts";
import { toDisplayId, fromDisplayId } from "@/lib/crm/displayId";
import { useCRMBulkBar } from "@/components/CRMShell";
import { BulkActionBar, BulkInterestPrompt, BulkOwnerPrompt, BulkPicklistPrompt, bulkButtonStyle, InterestChipPicker, LensToggleRow, OwnerBadge, OwnerSelect, SelectAllBox, SelectCell } from "@/components/crm/FunnelPhase2";
import { CrmActionBar, CrmDrawerSection, CrmHighlightsGrid, CrmRecordFooter, CrmRecordHeader, CrmRecordSignalPanel, crmActionButtonStyle, crmDangerActionButtonStyle, crmPrimaryActionButtonStyle, type CrmHighlightItem, type CrmRecordSignal } from "@/components/crm/CrmRecordLayout";
import { type Contact } from "@/data/contacts";
import { type CRMActivity } from "@/data/crm-activities";
import { type Opportunity } from "@/data/opportunities";
import { useResponsive } from "@/lib/useMediaQuery";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import RacketIcon from "@/components/RacketIcon";
import dynamic from "next/dynamic";
import MeetingBriefingDetail from "@/components/MeetingBriefingDetail";
import EmailThreadDetail from "@/components/EmailThreadDetail";
import InboundLeadDetail from "@/components/InboundLeadDetail";
import type { MeetingBriefing } from "@/data/meetings";
import type { EmailThread } from "@/data/emails";
import type { InboundLead } from "@/data/inbound-leads";
import type { ActionItem as MeetingActionItem } from "@/components/ClientMeetings";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";

const EmailActivityTimeline = dynamic(() => import("@/components/crm/EmailActivityTimeline"), { ssr: false });

/* ── Error Boundary for Account Drawer ── */
class AccountDrawerErrorBoundary extends React.Component<{ children: React.ReactNode; onClose: () => void }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode; onClose: () => void }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <>
          <div onClick={this.props.onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "100%", background: "#0c0c12", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#EF4444" }}>Something went wrong</div>
            <div style={{ fontSize: 13, color: "var(--color-client-text-dim)", maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>{this.state.error}</div>
            <button onClick={this.props.onClose} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, background: "rgba(218,218,219,0.15)", border: "1px solid rgba(218,218,219,0.25)", color: "#dadadb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Close</button>
          </div>
        </>
      );
    }
    return this.props.children;
  }
}

/* ── Account normalizer (defensive against malformed records) ── */
function normalizeAccounts(raw: unknown[]): Account[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).filter(a =>
    typeof a?.id === "string" && a.id &&
    typeof a?.name === "string" && a.name
  ).map(a => ({
    ...(a as unknown as Account),
    name: (a.name as string) || "Unknown Account",
    recordType: (a.recordType as Account["recordType"]) || "company",
    type: normalizeAccountType(a.type),
    lifecycleStage: normalizeAccountLifecycleStage(a.lifecycleStage),
    operatingMarket: (typeof a.operatingMarket === "string" && a.operatingMarket.trim() ? a.operatingMarket.trim() : "Miami"),
    createdAt: (a.createdAt as string) || new Date().toISOString(),
    updatedAt: (a.updatedAt as string) || new Date().toISOString(),
  }));
}


type RelationshipStage = NonNullable<Account["relationshipStage"]>;


type AccountEditState = {
  name: string;
  type: AccountType;
  subType: string;
  referralPartnerAccountId: string;
  category: string;
  operatingMarket: string;
  website: string;
  notes: string;
  industry: string;
  revenueTier: string;
  relationshipStage: RelationshipStage | "";
  geo: string;
  venueName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

type InlineContactFormState = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
};

const emptyInlineContactForm: InlineContactFormState = {
  firstName: "",
  lastName: "",
  title: "",
  email: "",
  phone: "",
};

const drawerWidthKey = "client-accounts-panel-width";
const defaultDrawerWidth = 560;
const minDrawerWidth = 380;
const maxDrawerWidthRatio = 0.82;

const relationshipStageOptions: RelationshipStage[] = ["Prospect", "Active", "Strategic", "Dormant"];
const usTopCityOptions: string[] = [
  "New York",
  "Los Angeles",
  "Chicago",
  "Houston",
  "Phoenix",
  "Philadelphia",
  "San Antonio",
  "San Diego",
  "Dallas",
  "Jacksonville",
  "Austin",
  "Fort Worth",
  "San Jose",
  "Columbus",
  "Charlotte",
  "Indianapolis",
  "San Francisco",
  "Seattle",
  "Denver",
  "Washington",
  "Boston",
  "El Paso",
  "Nashville",
  "Detroit",
  "Oklahoma City",
  "Portland",
  "Las Vegas",
  "Memphis",
  "Louisville",
  "Baltimore",
  "Milwaukee",
  "Albuquerque",
  "Tucson",
  "Fresno",
  "Sacramento",
  "Mesa",
  "Kansas City",
  "Atlanta",
  "Long Beach",
  "Colorado Springs",
  "Raleigh",
  "Miami",
  "Virginia Beach",
  "Omaha",
  "Oakland",
  "Minneapolis",
  "Tulsa",
  "Arlington",
  "Tampa",
  "New Orleans",
  "Wichita",
  "Bakersfield",
  "Cleveland",
  "Aurora",
  "Anaheim",
  "Honolulu",
  "Santa Ana",
  "Riverside",
  "Corpus Christi",
  "Lexington",
  "Henderson",
  "Stockton",
  "Saint Paul",
  "Cincinnati",
  "St. Louis",
  "Pittsburgh",
  "Greensboro",
  "Lincoln",
  "Anchorage",
  "Plano",
  "Orlando",
  "Irvine",
  "Newark",
  "Toledo",
  "Durham",
  "Chula Vista",
  "Fort Wayne",
  "Jersey City",
  "St. Petersburg",
  "Laredo",
  "Madison",
  "Chandler",
  "Buffalo",
  "Lubbock",
  "Scottsdale",
  "Reno",
  "Glendale",
  "Gilbert",
  "Winston-Salem",
  "North Las Vegas",
  "Norfolk",
  "Chesapeake",
  "Garland",
  "Irving",
  "Hialeah",
  "Fremont",
  "Boise",
  "Richmond",
  "Baton Rouge",
  "Spokane",
  "Des Moines",
  "Tacoma",
  "San Bernardino",
];
const accountTypeOptions: AccountType[] = [...ACCOUNT_TYPES];
const categoryOptions = [
  "Wellness / CPG",
  "Food & Beverage / CPG",
  "Sports / Recreation",
  "Apparel / Equipment",
  "Hospitality / Venue",
  "Corporate / Professional Services",
  "Media / Entertainment",
  "Technology",
  "Agency / Marketing",
  "Government / Civic",
  "Education / University",
  "Individual / Private Event",
  "Vendor / Operations",
  "Internal",
] as const;
const industryOptions = [
  "Wellness / Fitness",
  "Food & Beverage / CPG",
  "Sports / Recreation",
  "Apparel / Sporting Goods",
  "Hospitality",
  "Professional Services",
  "Media / Entertainment",
  "Technology",
  "Agency / Marketing",
  "Government",
  "Education",
  "Consumer Brand",
  "Operations Vendor",
  "Other",
] as const;

type LifecycleStage = AccountLifecycleStage;
type AccountTier = NonNullable<Account["tier"]>;

const LIFECYCLE_STAGES: LifecycleStage[] = [...ACCOUNT_LIFECYCLE_STAGES];
const ACCOUNT_TIERS: AccountTier[] = ["strategic", "enterprise", "growth", "smb", "community"];
function lifecycleStageLabel(stage: LifecycleStage): string {
  if (stage === "nurture") return "Nurture";
  return stage.slice(0, 1).toUpperCase() + stage.slice(1);
}

function websiteHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "#";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const ACCOUNT_STATUS_CRITERIA: Record<LifecycleStage, { definition: string; entry: string[]; exit: string[] }> = {
  new: {
    definition: "A newly created or imported account that has not yet been meaningfully worked.",
    entry: ["Manual creation, inbound lead, referral name, event contact, LinkedIn target, warm intro, existing relationship, or imported list."],
    exit: ["Enough information exists to intentionally pursue the account.", "A known or likely contact path exists.", "The account is not obviously junk or disqualified."],
  },
  outreach: {
    definition: "Example Client is actively trying to engage the account.",
    entry: ["A warm intro, email, LinkedIn message, call, text, event follow-up, or referral-partner intro is queued or in flight."],
    exit: ["Move to Engaged when the account replies positively, asks for more information, or agrees to discuss further.", "Move to Nurture when timing is not right or reasonable outreach stalls but future fit remains.", "Move to Disqualified when the account is clearly not a fit, spam, risky, or asks not to be contacted."],
  },
  engaged: {
    definition: "The account has responded or shown credible interest, but a discovery or sales meeting has not been completed.",
    entry: ["The prospect replies positively, receives an intro, asks about Example Client, OpenClaw, Mission Control, AI agents, or describes an operational bottleneck."],
    exit: ["Move to Meeting when a discovery call, sales call, demo, workflow mapping session, or in-person meeting is scheduled or confirmed.", "Move to Nurture when there is interest but no urgency or readiness.", "Move to Disqualified when the prospect declines, has no budget path, or is not worth pursuit."],
  },
  meeting: {
    definition: "Example Client is actively in a sales or discovery conversation with the account.",
    entry: ["A discovery call, sales call, demo, workflow mapping session, AI strategy discussion, Mission Control conversation, install-day discussion, or follow-up sales conversation is scheduled or happening."],
    exit: ["Move to Opportunity when a real commercial opportunity exists, at least 3 of Pain, Authority, Budget, Timing, and Fit are reasonably satisfied, and a next commercial step exists.", "Move to Nurture when timing, budget, buy-in, or education is not ready.", "Move to Disqualified when there is no real pain, budget path, decision-maker access, Example Client fit, or the prospect declines."],
  },
  opportunity: {
    definition: "The account has at least one real open opportunity in the pipeline.",
    entry: ["An opportunity is created from a qualified Meeting account and defaults to Discovery."],
    exit: ["When Closed Won, the opportunity closes and account type becomes Client while status can remain Opportunity until a future post-sale lifecycle exists.", "When Closed Lost, move the account to Nurture or Disqualified based on future fit."],
  },
  nurture: {
    definition: "The account is worth keeping warm, but there is no active sales motion right now.",
    entry: ["Timing is later, budget is not ready, more education or internal buy-in is needed, outreach stalled, or a lost opportunity still has future fit."],
    exit: ["Move back to Outreach, Engaged, or Meeting when the account replies, a referral re-opens the conversation, timing improves, budget appears, a new pain emerges, or pursuit restarts.", "Move to Disqualified when the account is no longer worth pursuit."],
  },
  disqualified: {
    definition: "The account should not receive further sales resources unless something materially changes.",
    entry: ["Junk, spam, no decision-maker access, no budget, poor fit, do-not-contact, reputational risk, duplicate, or another clear disqualification reason."],
    exit: ["Only move out if something materially changes, such as a new decision maker, referral, budget, use case, or an incorrect disqualification/merge is resolved."],
  },
};

function isCanonicalOwner(value?: string): value is NonNullable<Account["owner"]> {
  return value === "Alex" || value === "Morgan" || value === "Mission Agent";
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

function formatDate(value?: string, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", includeTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatRelativeTime(value?: string) {
  if (!value) return "—";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return formatDate(value);
}

function lastActivityColor(value?: string) {
  if (!value) return "var(--color-client-text-dim)";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days < 3) return "#dadadb";
  if (days <= 14) return "#FBBF24";
  return "#EF4444";
}

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

function activityTypeColor(type: CRMActivity["type"]) {
  switch (type) {
    case "Call": return "#dadadb";
    case "Note": return "#C4C9D1";
    case "Email": return "#dadadb";
    case "Meeting": return "#dadadb";
    case "Inbound Lead": return "#F59E0B";
    case "Task": return "rgba(255,255,255,0.55)";
    case "Outreach": return "#F472B6";
    case "Follow-Up": return "#FBBF24";
    default: return "rgba(255,255,255,0.4)";
  }
}

function activitySourceBadge(source: string) {
  const palette: Record<string, { bg: string; text: string }> = {
    Manual: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.45)" },
    Import: { bg: "rgba(218,218,219,0.12)", text: "#dadadb" },
    Fireflies: { bg: "rgba(196,201,209,0.12)", text: "#C4C9D1" },
    Seeded: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
    System: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.35)" },
    "Form Sync": { bg: "rgba(218,218,219,0.12)", text: "#dadadb" },
  };
  const cfg = palette[source] ?? palette.Manual;
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "1px 5px",
        fontSize: 8,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: cfg.bg,
        color: cfg.text,
      }}
    >
      {source}
    </span>
  );
}

function renderFormattedContent(content: string): React.ReactElement {
  const lines = content.split(/\n/);
  const elements: React.ReactElement[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    elements.push(
      <ul key={`bullets-${key++}`} style={{ margin: "6px 0", paddingLeft: 18, listStyleType: "disc" }}>
        {bullets.map((item, index) => (
          <li key={index} style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.55, marginBottom: 2 }}>
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      continue;
    }

    if (/^(?:[-*•]|\d+[.)])\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^(?:[-*•]|\d+[.)])\s+/, ""));
      continue;
    }

    flushBullets();
    elements.push(
      <p key={`p-${key++}`} style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.6, marginTop: elements.length ? 6 : 0 }}>
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushBullets();
  return <div>{elements}</div>;
}

function accountEditState(account: Account): AccountEditState {
  return {
    name: account?.name || "",
    type: normalizeAccountType(account?.type),
    subType: account?.subType ?? "",
    referralPartnerAccountId: account?.referralPartnerAccountId ?? "",
    category: account?.category ?? "",
    operatingMarket: account?.operatingMarket || "Miami",
    website: account?.website ?? "",
    notes: account?.notes ?? "",
    industry: account?.industry ?? "",
    revenueTier: account?.revenueTier ?? "",
    relationshipStage: account?.relationshipStage ?? "",
    geo: account?.geo ?? "",
    venueName: account?.address?.venueName ?? "",
    street: account?.address?.street ?? "",
    city: account?.address?.city ?? "",
    state: account?.address?.state ?? "",
    zip: account?.address?.zip ?? "",
  };
}

function getLinkedContacts(accountId: string, contacts: Contact[]) {
  if (!accountId || !Array.isArray(contacts)) return [];
  return contacts.filter((contact) => contact?.accountId === accountId);
}

function getAccountActivities(accountId: string, activities: CRMActivity[], contacts: Contact[]) {
  if (!accountId || !Array.isArray(activities)) return [];
  const linkedContactIds = new Set(getLinkedContacts(accountId, contacts).map((contact) => contact.id));
  return activities.filter(
    (activity) =>
      activity?.accountId === accountId ||
      (activity?.contactId ? linkedContactIds.has(activity.contactId) : false)
  );
}

function getAccountLastActivity(accountId: string, activities: CRMActivity[], contacts: Contact[]) {
  const relevant = getAccountActivities(accountId, activities, contacts);
  if (relevant.length === 0) return null;
  return relevant.reduce((latest, current) => (current?.occurredAt ?? "") > (latest?.occurredAt ?? "") ? current : latest);
}

function DrawerSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <CrmDrawerSection title={title} action={action}>{children}</CrmDrawerSection>;
}

function InfoRow({ label, value, isLink, onClick }: { label: string; value?: string; isLink?: boolean; onClick?: () => void }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2" style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", minWidth: 84, paddingTop: 1 }}>{label}</span>
      {isLink && onClick ? (
        <button
          onClick={onClick}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-client-blue)",
            fontSize: 12,
            padding: 0,
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          {value}
        </button>
      ) : (
        <span style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.5 }}>{value}</span>
      )}
    </div>
  );
}

const overviewSurfaceStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 12,
  background: "linear-gradient(180deg, rgba(20,31,48,0.94), rgba(13,18,29,0.92))",
  border: "1px solid rgba(148,163,184,0.28)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 48px rgba(0,0,0,0.24)",
};

const overviewFieldStyle: React.CSSProperties = {
  minHeight: 62,
  padding: "11px 12px",
  borderRadius: 10,
  background: "rgba(4,11,22,0.52)",
  border: "1px solid rgba(148,163,184,0.20)",
};

const overviewLabelStyle: React.CSSProperties = {
  marginBottom: 6,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "#CBD5E1",
  fontWeight: 750,
};

const overviewValueStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  color: "#F8FAFC",
  fontWeight: 600,
};

const overviewMutedStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.45,
  color: "#94A3B8",
  fontStyle: "italic",
};

function OverviewField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={overviewFieldStyle}>
      <div style={overviewLabelStyle}>{label}</div>
      {children}
    </div>
  );
}

function OverviewValue({ value, empty = "Not set" }: { value?: string; empty?: string }) {
  return value ? <div style={overviewValueStyle}>{value}</div> : <div style={overviewMutedStyle}>{empty}</div>;
}

function getAccountLogoAsset(account: Account) {
  const assets = account.assets ?? [];
  if (account.logoAssetId) {
    const logo = assets.find((asset) => asset.id === account.logoAssetId);
    if (logo) return logo;
  }
  return assets.find((asset) => asset.kind === "logo") ?? assets.find((asset) => asset.kind === "image");
}

function AccountLinkedInIntelSection({ account }: { account: Account }) {
  const hasIntel = Boolean(
    account.linkedinUrl ||
    account.linkedinDescription ||
    account.employeeRange ||
    account.associatedMembers ||
    account.linkedinIndustry ||
    account.linkedinHeadquarters ||
    account.linkedinCompanyType ||
    account.enrichmentSource ||
    account.enrichedAt
  );

  if (!hasIntel) return null;

  return (
    <DrawerSection title="LinkedIn / Public Intel">
      <div style={overviewSurfaceStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <OverviewField label="LinkedIn">
            {account.linkedinUrl ? (
              <a href={account.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ ...overviewValueStyle, color: "#dadadb", textDecoration: "none", wordBreak: "break-word" }}>
                {account.linkedinUrl}
              </a>
            ) : <OverviewValue value={undefined} />}
          </OverviewField>
          <OverviewField label="Industry">
            <OverviewValue value={account.linkedinIndustry ?? account.industry} />
          </OverviewField>
          <OverviewField label="Employees">
            <OverviewValue value={account.employeeRange} />
          </OverviewField>
          <OverviewField label="Associated Members">
            <OverviewValue value={account.associatedMembers !== undefined ? String(account.associatedMembers) : undefined} />
          </OverviewField>
          <OverviewField label="Headquarters">
            <OverviewValue value={account.linkedinHeadquarters} />
          </OverviewField>
          <OverviewField label="Company Type">
            <OverviewValue value={account.linkedinCompanyType} />
          </OverviewField>
          <OverviewField label="Confidence">
            <OverviewValue value={account.enrichmentConfidence ? account.enrichmentConfidence.toUpperCase() : undefined} />
          </OverviewField>
          <OverviewField label="Enriched">
            <OverviewValue value={account.enrichedAt ? formatDate(account.enrichedAt, true) : undefined} />
          </OverviewField>
          {account.linkedinDescription ? (
            <div style={{ ...overviewFieldStyle, gridColumn: "1 / -1" }}>
              <div style={overviewLabelStyle}>Company Description</div>
              <div style={{ ...overviewValueStyle, fontWeight: 500, lineHeight: 1.6 }}>{account.linkedinDescription}</div>
            </div>
          ) : null}
          {account.enrichmentSource ? (
            <div style={{ ...overviewFieldStyle, gridColumn: "1 / -1" }}>
              <div style={overviewLabelStyle}>Source / Provenance</div>
              <div style={{ ...overviewMutedStyle, fontStyle: "normal", wordBreak: "break-word" }}>{account.enrichmentSource}</div>
            </div>
          ) : null}
        </div>
      </div>
    </DrawerSection>
  );
}

function AccountAssetsSection({ account, onRefresh }: { account: Account; onRefresh: () => Promise<void> }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAsLogoRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const assets = account.assets ?? [];
  const logo = getAccountLogoAsset(account);

  const triggerUpload = (isLogo: boolean) => {
    uploadAsLogoRef.current = isLogo;
    fileInputRef.current?.click();
  };

  const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("accountId", account.id);
      form.set("file", file);
      form.set("isLogo", uploadAsLogoRef.current ? "true" : "false");
      form.set("label", file.name);
      const res = await fetch("/api/crm/assets", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const setPrimaryLogo = async (assetId: string) => {
    setBusyAssetId(assetId);
    setError("");
    try {
      const res = await fetch("/api/crm/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, logoAssetId: assetId }),
      });
      if (!res.ok) throw new Error(`Could not set logo (${res.status})`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set logo");
    } finally {
      setBusyAssetId(null);
    }
  };

  const removeAsset = async (assetId: string) => {
    if (!window.confirm("Remove this file from the CRM record?")) return;
    setBusyAssetId(assetId);
    setError("");
    try {
      const res = await fetch("/api/crm/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, assetId }),
      });
      if (!res.ok) throw new Error(`Could not remove file (${res.status})`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove file");
    } finally {
      setBusyAssetId(null);
    }
  };

  return (
    <DrawerSection
      title={`Files (${assets.length})`}
      action={(
        <div style={{ display: "flex", gap: 7 }}>
          <button type="button" onClick={() => triggerUpload(true)} disabled={uploading} style={crmPrimaryActionButtonStyle}>Upload Logo</button>
          <button type="button" onClick={() => triggerUpload(false)} disabled={uploading} style={crmActionButtonStyle}>Add File</button>
        </div>
      )}
    >
      <input ref={fileInputRef} type="file" onChange={onFileSelected} style={{ display: "none" }} />
      {error ? <div style={{ marginBottom: 10, fontSize: 12, color: "#F87171" }}>{error}</div> : null}
      {assets.length === 0 ? (
        <div style={{ ...overviewMutedStyle, fontStyle: "normal" }}>No files yet. Upload logos, decks, sell sheets, agreements, or product images here.</div>
      ) : (
        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.025)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "64px minmax(0, 1fr) 120px 110px 244px", gap: 10, alignItems: "center", padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.11em", fontWeight: 750 }}>
            <div>Preview</div>
            <div>Name</div>
            <div>Type</div>
            <div>Source</div>
            <div style={{ textAlign: "right" }}>Actions</div>
          </div>
          {assets.map((asset) => {
            const isImage = asset.kind === "logo" || asset.kind === "image";
            const isPrimary = logo?.id === asset.id;
            return (
              <div
                key={asset.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px minmax(0, 1fr) 120px 110px 244px",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderTop: "1px solid rgba(255,255,255,0.045)",
                  background: isPrimary ? "rgba(218,218,219,0.08)" : "transparent",
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 5 }} />
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", fontWeight: 800 }}>{asset.fileName.split(".").pop()?.toUpperCase() || "FILE"}</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asset.label || asset.fileName}</div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {asset.fileName}
                  </div>
                </div>
                <div>
                  <span style={{ display: "inline-flex", padding: "3px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, color: isPrimary ? "#F4C7CA" : "var(--color-client-text-secondary)", background: isPrimary ? "rgba(218,218,219,0.14)" : "rgba(255,255,255,0.05)", border: isPrimary ? "1px solid rgba(218,218,219,0.26)" : "1px solid rgba(255,255,255,0.08)" }}>
                    {isPrimary ? "Primary Logo" : asset.kind}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{asset.source ?? "Manual"}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <a href={asset.url} target="_blank" rel="noreferrer" style={{ ...crmActionButtonStyle, minHeight: 28, padding: "0 8px" }}>Open</a>
                  <a href={asset.url} download={asset.fileName} style={{ ...crmActionButtonStyle, minHeight: 28, padding: "0 8px" }}>Download</a>
                  {isImage && !isPrimary ? (
                    <button type="button" disabled={busyAssetId === asset.id} onClick={() => void setPrimaryLogo(asset.id)} style={{ ...crmActionButtonStyle, minHeight: 28, padding: "0 8px" }}>Logo</button>
                  ) : null}
                  <button type="button" disabled={busyAssetId === asset.id} onClick={() => void removeAsset(asset.id)} style={{ ...crmDangerActionButtonStyle, minHeight: 28, padding: "0 8px" }}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DrawerSection>
  );
}

function AccountAddressValue({ account }: { account: Account }) {
  const lines = account.address
    ? [
        account.address.venueName,
        account.address.street,
        [account.address.city, account.address.state, account.address.zip].filter(Boolean).join(", "),
      ].filter(Boolean)
    : [];
  if (lines.length === 0) return <div style={overviewMutedStyle}>No address on file</div>;
  return <div style={{ ...overviewValueStyle, whiteSpace: "pre-line" }}>{lines.join("\n")}</div>;
}

function OverviewSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  return (
    <CRMPicker
      options={options.map((option) => ({ value: option, label: option }))}
      value={value}
      onChange={(next) => { if (next) onChange(next as T); }}
      getKey={(option) => option.value}
      getLabel={(option) => option.label}
      size="sm"
      searchable={false}
    />
  );
}

function OptionalOverviewSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select...",
}: {
  value?: string;
  options: readonly T[];
  onChange: (value: T | undefined) => void;
  placeholder?: string;
}) {
  const hasCustomValue = Boolean(value) && !(options as readonly string[]).includes(value as string);
  const pickerOptions = [
    { value: "", label: placeholder },
    ...(hasCustomValue ? [{ value: value as string, label: `${value} (legacy)` }] : []),
    ...options.map((option) => ({ value: option, label: option })),
  ];
  return (
    <CRMPicker
      options={pickerOptions}
      value={value ?? ""}
      onChange={(next) => onChange(next ? (next as T) : undefined)}
      getKey={(option) => option.value}
      getLabel={(option) => option.label}
      size="sm"
      searchable={false}
    />
  );
}

function AccountAddressEditor({
  account,
  draft,
  editing,
  saving,
  onChange,
  onEdit,
  onCancel,
  onSave,
}: {
  account: Account;
  draft: Pick<AccountEditState, "venueName" | "street" | "city" | "state" | "zip">;
  editing: boolean;
  saving: boolean;
  onChange: (patch: Partial<Pick<AccountEditState, "venueName" | "street" | "city" | "state" | "zip">>) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [placesReady, setPlacesReady] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [predictions, setPredictions] = useState<Array<{ placeId: string; description: string }>>([]);
  const [searching, setSearching] = useState(false);
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const placesHostRef = useRef<HTMLDivElement | null>(null);

  const addressInputStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 36,
    background: "rgba(15,23,42,0.86)",
    border: "1px solid rgba(148,163,184,0.22)",
    color: "#F8FAFC",
  };
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onEdit}
        style={{
          width: "100%",
          padding: 0,
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <AccountAddressValue account={account} />
        <div style={{ marginTop: 8, fontSize: 11, color: "#dadadb", fontWeight: 700 }}>Edit address</div>
      </button>
    );
  }

  const loadGooglePlacesScript = useCallback(async () => {
    if (!mapsApiKey) return;
    if (typeof window === "undefined") return;
    const win = window as Window & { google?: any };
    if (win.google?.maps?.places) {
      setPlacesReady(true);
      return;
    }
    const existing = document.getElementById("google-maps-places-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setPlacesReady(true), { once: true });
      existing.addEventListener("error", () => setPlacesError("Google Places failed to load."), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-places-sdk";
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places`;
    script.onload = () => setPlacesReady(true);
    script.onerror = () => setPlacesError("Google Places failed to load.");
    document.head.appendChild(script);
  }, [mapsApiKey]);

  useEffect(() => {
    if (!editing) return;
    void loadGooglePlacesScript();
  }, [editing, loadGooglePlacesScript]);

  useEffect(() => {
    if (!editing || !placesReady) return;
    const win = window as Window & { google?: any };
    if (!win.google?.maps?.places) return;
    autocompleteServiceRef.current = new win.google.maps.places.AutocompleteService();
    if (placesHostRef.current) {
      placesServiceRef.current = new win.google.maps.places.PlacesService(placesHostRef.current);
    }
  }, [editing, placesReady]);

  useEffect(() => {
    if (!editing || !placesReady) return;
    const service = autocompleteServiceRef.current;
    if (!service) return;
    const query = addressQuery.trim();
    if (query.length < 3) {
      setPredictions([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      service.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "us" },
          types: ["address", "establishment"],
        },
        (results: any[] | null, status: string) => {
          if (cancelled) return;
          setSearching(false);
          const ok = status === "OK" || status === "ZERO_RESULTS";
          if (!ok) return;
          setPredictions((results ?? []).map((item) => ({ placeId: item.place_id, description: item.description })));
        }
      );
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addressQuery, editing, placesReady]);

  const applyPlaceDetails = useCallback((placeId: string) => {
    const service = placesServiceRef.current;
    if (!service) return;
    setSearching(true);
    service.getDetails(
      {
        placeId,
        fields: ["name", "formatted_address", "address_components"],
      },
      (place: any, status: string) => {
        setSearching(false);
        if (status !== "OK" || !place) return;
        const components = Array.isArray(place.address_components) ? place.address_components : [];
        const getComp = (type: string, key: "long_name" | "short_name" = "long_name") =>
          components.find((comp: any) => Array.isArray(comp.types) && comp.types.includes(type))?.[key] ?? "";
        const streetNumber = getComp("street_number");
        const route = getComp("route");
        const locality = getComp("locality") || getComp("sublocality") || getComp("postal_town");
        const state = getComp("administrative_area_level_1", "short_name");
        const zip = getComp("postal_code");
        const street = [streetNumber, route].filter(Boolean).join(" ").trim();
        onChange({
          venueName: (place.name || "").trim() || draft.venueName,
          street: street || draft.street,
          city: locality || draft.city,
          state: state || draft.state,
          zip: zip || draft.zip,
        });
        setAddressQuery(place.formatted_address || place.name || "");
        setPredictions([]);
      }
    );
  }, [draft.city, draft.state, draft.street, draft.venueName, draft.zip, onChange]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div ref={placesHostRef} style={{ display: "none" }} />
      <div style={{ position: "relative" }}>
        <input
          value={addressQuery}
          onChange={(event) => setAddressQuery(event.target.value)}
          placeholder={mapsApiKey ? "Search address with Google Places..." : "Address search requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"}
          style={addressInputStyle}
          disabled={!mapsApiKey || Boolean(placesError)}
        />
        {mapsApiKey && predictions.length > 0 ? (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 250,
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 8,
              overflow: "hidden",
              background: "#0c0c12",
              boxShadow: "0 16px 34px rgba(0,0,0,0.55)",
            }}
          >
            {predictions.slice(0, 6).map((item) => (
              <button
                key={item.placeId}
                type="button"
                onClick={() => applyPlaceDetails(item.placeId)}
                style={{
                  width: "100%",
                  border: "none",
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                  background: "transparent",
                  color: "#E2E8F0",
                  textAlign: "left",
                  padding: "9px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {item.description}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {placesError ? <div style={{ fontSize: 11, color: "#FCA5A5" }}>{placesError}</div> : null}
      {!mapsApiKey ? <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to enable Google address autofill.</div> : null}
      {searching ? <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Looking up address…</div> : null}
      <input value={draft.venueName} onChange={(event) => onChange({ venueName: event.target.value })} placeholder="Venue name" style={addressInputStyle} />
      <input value={draft.street} onChange={(event) => onChange({ street: event.target.value })} placeholder="Street" style={addressInputStyle} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px", gap: 8 }}>
        <input value={draft.city} onChange={(event) => onChange({ city: event.target.value })} placeholder="City" style={addressInputStyle} />
        <input value={draft.state} onChange={(event) => onChange({ state: event.target.value })} placeholder="State" style={addressInputStyle} />
        <input value={draft.zip} onChange={(event) => onChange({ zip: event.target.value })} placeholder="ZIP" style={addressInputStyle} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onCancel} disabled={saving} style={{ ...secondaryButtonStyle, borderRadius: 8 }}>Cancel</button>
        <button type="button" onClick={onSave} disabled={saving} style={{ ...primaryButtonStyle, borderRadius: 8, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save Address"}
        </button>
      </div>
    </div>
  );
}

function RelatedContactsSection({ contacts, router }: { contacts: Contact[]; router: ReturnType<typeof useRouter> }) {
  const [search, setSearch] = useState("");

  const relatedCols: StandardTableColumn<Contact>[] = useMemo(() => [
    {
      key: "name",
      label: "Name",
      render: (c) => (
        <div style={{ minWidth: 0 }}>
          <CopyableText value={c.name} style={{ fontSize: 12, fontWeight: 500, color: "#f8fafc" }} />
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      getValue: (c) => c?.emails?.[0] ?? "—",
      render: (c) => c?.emails?.[0] ? <CopyableText value={c.emails[0]} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }} /> : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>,
    },
    {
      key: "title",
      label: "Title",
      getValue: (c) => c.title ?? "",
      render: (c) => c.title ? <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{c.title}</span> : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>,
    },
    {
      key: "phone",
      label: "Phone",
      getValue: (c) => c.phone ?? "—",
      render: (c) => c.phone ? <CopyableText value={c.phone} style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }} /> : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>,
    },
    {
      key: "source",
      label: "Source",
      getValue: (c) => c.source,
      render: (c) => <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{c.source}</span>,
    },
  ], []);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.title ?? "").toLowerCase().includes(q) || c.emails.some((e) => e.toLowerCase().includes(q)));
  }, [contacts, search]);

  return (
    <DrawerSection title={`Related Contacts (${contacts.length})`}>
      {contacts.length > 3 && (
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(8,8,14,0.6)", color: "#f8fafc", fontSize: 12, outline: "none", marginBottom: 10 }} />
      )}
      {filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: 12 }}>{contacts.length === 0 ? "No linked contacts yet." : "No contacts match search."}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <StandardTable<Contact>
            tableKey="accounts-related-contacts"
            columns={relatedCols}
            data={filtered}
            getRowKey={(c) => c.id}
            defaultSortKey="name"
            onRowClick={(c) => router.push(`/contacts?select=${c.id}`)}
            emptyMessage="No contacts found"
            showTableManagement={false}
          />
        </div>
      )}
    </DrawerSection>
  );
}

function RelatedOpportunitiesSection({
  opportunities,
  router,
  onOwnerChange,
}: {
  opportunities: Opportunity[];
  router: ReturnType<typeof useRouter>;
  onOwnerChange?: (opportunityId: string, owner: string) => Promise<void> | void;
}) {
  const opportunityCols: StandardTableColumn<Opportunity>[] = useMemo(() => [
    { key: "name", label: "Opportunity", getValue: (opportunity) => opportunity.name, render: (opportunity) => <span style={{ fontSize: 12, fontWeight: 500, color: "#f8fafc" }}>{opportunity.name}</span> },
    { key: "stage", label: "Stage", getValue: (opportunity) => opportunity.stage },
    {
      key: "owner",
      label: "Owner",
      getValue: (opportunity) => opportunity.owner,
      render: (opportunity) => (
        <div onClick={(event) => event.stopPropagation()} style={{ display: "inline-flex" }}>
          {onOwnerChange ? (
            <OwnerSelect value={opportunity.owner} compact onChange={(owner) => void onOwnerChange(opportunity.id, owner)} />
          ) : (
            <OwnerBadge owner={opportunity.owner} compact />
          )}
        </div>
      ),
    },
    { key: "nextStepDueDate", label: "Close Date", getValue: (opportunity) => opportunity.nextStepDueDate },
    { key: "value", label: "Value", getValue: (opportunity) => String(opportunity.value), render: (opportunity) => <span style={{ color: "#dadadb", fontWeight: 600 }}>{formatCurrency(opportunity.value)}</span> },
  ], [onOwnerChange]);

  return (
    <DrawerSection title={`Related Opportunities (${opportunities.length})`}>
      {opportunities.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: 12 }}>No linked opportunities yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <StandardTable<Opportunity>
            tableKey="accounts-related-opportunities"
            columns={opportunityCols}
            data={opportunities}
            getRowKey={(opportunity) => opportunity.id}
            defaultSortKey="nextStepDueDate"
            defaultSortDir="asc"
            onRowClick={(opportunity) => router.push(`/contacts?object=opportunities&select=${opportunity.id}`)}
            emptyMessage="No opportunities found"
            showTableManagement={false}
          />
        </div>
      )}
    </DrawerSection>
  );
}

function RecordTypeMetricCard({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return (
    <div style={{ padding: "12px 14px", borderRadius: 8, background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-client-text-dim)", fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, color: "#F8FAFC", fontWeight: 800 }}>{value}</div>
      {helper ? <div style={{ marginTop: 4, fontSize: 11, color: "var(--color-client-text-dim)" }}>{helper}</div> : null}
    </div>
  );
}

function ClientSummarySection({
  opportunities,
  router,
  onOwnerChange,
}: {
  opportunities: Opportunity[];
  router: ReturnType<typeof useRouter>;
  onOwnerChange?: (opportunityId: string, owner: string) => Promise<void> | void;
}) {
  const closedWon = useMemo(() => opportunities.filter((opportunity) => opportunity.stage === "Closed Won" && !opportunity.deletedAt), [opportunities]);
  const openExpansion = useMemo(() => opportunities.filter(isOpenOpportunity), [opportunities]);
  const wonRevenue = useMemo(() => closedWon.reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0), [closedWon]);
  const expansionPipeline = useMemo(() => openExpansion.reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0), [openExpansion]);
  const lastWonDate = useMemo(() => closedWon.map((opportunity) => opportunity.closeDate ?? opportunity.updatedAt ?? opportunity.openDate).filter(Boolean).sort().at(-1), [closedWon]);

  return (
    <DrawerSection title="Client Summary">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
        <RecordTypeMetricCard label="Won Revenue" value={formatCurrency(wonRevenue)} helper="Closed-won total" />
        <RecordTypeMetricCard label="Won Opps" value={closedWon.length} helper="Closed-won count" />
        <RecordTypeMetricCard label="Last Won" value={formatDate(lastWonDate)} helper="Most recent close" />
        <RecordTypeMetricCard label="Expansion Pipeline" value={formatCurrency(expansionPipeline)} helper={`${openExpansion.length} open opp${openExpansion.length === 1 ? "" : "s"}`} />
      </div>
      <RelatedOpportunitiesSection opportunities={closedWon} router={router} onOwnerChange={onOwnerChange} />
    </DrawerSection>
  );
}

function PartnerSummarySection({ account, accounts, opportunities, router }: { account: Account; accounts: Account[]; opportunities: Opportunity[]; router: ReturnType<typeof useRouter> }) {
  const referredAccounts = useMemo(() => accounts.filter((item) => item.referralPartnerAccountId === account.id && !item.deletedAt), [account.id, accounts]);
  const referredOpportunities = useMemo(() => opportunities.filter((opportunity) => opportunity.referralPartnerAccountId === account.id && !opportunity.deletedAt), [account.id, opportunities]);
  const openReferred = useMemo(() => referredOpportunities.filter(isOpenOpportunity), [referredOpportunities]);
  const wonReferred = useMemo(() => referredOpportunities.filter((opportunity) => opportunity.stage === "Closed Won"), [referredOpportunities]);
  const openPipeline = useMemo(() => openReferred.reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0), [openReferred]);
  const wonRevenue = useMemo(() => wonReferred.reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0), [wonReferred]);
  const accountNameById = useMemo(() => Object.fromEntries(accounts.map((item) => [item.id, item.name])), [accounts]);
  const opportunityCols: StandardTableColumn<Opportunity>[] = useMemo(() => [
    { key: "name", label: "Opportunity", getValue: (opportunity) => opportunity.name, render: (opportunity) => <span style={{ fontSize: 12, fontWeight: 600, color: "#F8FAFC" }}>{opportunity.name}</span> },
    { key: "accountId", label: "Referred Account", getValue: (opportunity) => accountNameById[opportunity.accountId] ?? "—" },
    { key: "stage", label: "Stage", getValue: (opportunity) => opportunity.stage },
    { key: "value", label: "Value", getValue: (opportunity) => String(opportunity.value), render: (opportunity) => <span style={{ color: "#dadadb", fontWeight: 700 }}>{formatCurrency(opportunity.value)}</span> },
  ], [accountNameById]);

  return (
    <DrawerSection title="Partner Summary">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
        <RecordTypeMetricCard label="Referred Accounts" value={referredAccounts.length} helper="Explicit account links" />
        <RecordTypeMetricCard label="Open Referred" value={formatCurrency(openPipeline)} helper={`${openReferred.length} active deal${openReferred.length === 1 ? "" : "s"}`} />
        <RecordTypeMetricCard label="Won Referrals" value={formatCurrency(wonRevenue)} helper={`${wonReferred.length} closed-won deal${wonReferred.length === 1 ? "" : "s"}`} />
        <RecordTypeMetricCard label="Partner Subtype" value={account.subType ?? "Not set"} helper="Referral, strategic, implementation, or venue" />
      </div>
      {referredOpportunities.length === 0 ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: 12 }}>No referral-linked opportunities yet.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <StandardTable<Opportunity>
            tableKey="accounts-partner-referred-opportunities"
            columns={opportunityCols}
            data={referredOpportunities}
            getRowKey={(opportunity) => opportunity.id}
            defaultSortKey="stage"
            onRowClick={(opportunity) => router.push(`/contacts?object=opportunities&select=${opportunity.id}`)}
            emptyMessage="No referral opportunities found"
            showTableManagement={false}
          />
        </div>
      )}
    </DrawerSection>
  );
}

const acctQuickActionBtnStyle: React.CSSProperties = {
  ...crmActionButtonStyle,
};

const createOpportunityBtnStyle: React.CSSProperties = {
  ...crmPrimaryActionButtonStyle,
};

/* ── Structured Account Drawer Header (stage / tier / last touched + next action) ── */

function pickPrimaryContact(linked: Contact[]): Contact | undefined {
  if (linked.length === 0) return undefined;
  const priorityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return [...linked].sort((a, b) => {
    const ar = priorityRank[a.priority ?? ""] ?? 0;
    const br = priorityRank[b.priority ?? ""] ?? 0;
    if (ar !== br) return br - ar;
    return 0;
  })[0];
}

function getAccountLastTouched(accountId: string, activities: CRMActivity[], linked: Contact[]): string | undefined {
  if (!accountId) return undefined;
  const linkedIds = new Set(linked.map((c) => c.id));
  let latest: string | undefined;
  for (const a of activities) {
    if (a.accountId !== accountId && !(a.contactId ? linkedIds.has(a.contactId) : false)) continue;
    const ts = a.occurredAt;
    if (!ts) continue;
    if (!latest || ts > latest) latest = ts;
  }
  return latest;
}

function getNextAction(accountId: string, activities: CRMActivity[], linked: Contact[]): CRMActivity | undefined {
  if (!accountId) return undefined;
  const linkedIds = new Set(linked.map((c) => c.id));
  const now = Date.now();
  let best: { ts: number; activity: CRMActivity } | undefined;
  for (const a of activities) {
    if (a.type !== "Task" && a.type !== "Follow-Up") continue;
    if (a.accountId !== accountId && !(a.contactId ? linkedIds.has(a.contactId) : false)) continue;
    if (!a.occurredAt) continue;
    const ts = new Date(a.occurredAt).getTime();
    if (Number.isNaN(ts) || ts <= now) continue;
    if (!best || ts < best.ts) best = { ts, activity: a };
  }
  return best?.activity;
}

function isOpenOpportunity(opportunity: Opportunity): boolean {
  return opportunity.stage !== "Closed Won" && opportunity.stage !== "Closed Lost" && !opportunity.deletedAt;
}

function isOverdueOpportunity(opportunity: Opportunity): boolean {
  if (!isOpenOpportunity(opportunity) || !opportunity.nextStepDueDate) return false;
  const due = new Date(opportunity.nextStepDueDate).getTime();
  return Number.isFinite(due) && due < Date.now();
}

function getAccountQualitySignals({
  account,
  linkedContacts,
  activities,
  opportunities,
}: {
  account: Account;
  linkedContacts: Contact[];
  activities: CRMActivity[];
  opportunities: Opportunity[];
}): CrmRecordSignal[] {
  const openOpps = opportunities.filter(isOpenOpportunity);
  const lastTouched = getAccountLastTouched(account.id, activities, linkedContacts);
  const daysSinceTouched = lastTouched ? Math.floor((Date.now() - new Date(lastTouched).getTime()) / 86400000) : undefined;
  const overdueOpps = openOpps.filter(isOverdueOpportunity);
  const missing: CrmRecordSignal[] = [];

  if (!account.owner) missing.push({ label: "Owner", detail: "missing", tone: "red" });
  else missing.push({ label: "Owner", detail: account.owner, tone: "green" });

  if (!account.website && !account.domain) missing.push({ label: "Web", detail: "missing", tone: "amber" });
  else missing.push({ label: "Web", detail: "present", tone: "green" });

  if (linkedContacts.length === 0) missing.push({ label: "Contacts", detail: "none linked", tone: "amber" });
  else missing.push({ label: "Contacts", detail: linkedContacts.length, tone: "green" });

  if (!lastTouched) missing.push({ label: "Activity", detail: "none", tone: "red" });
  else if ((daysSinceTouched ?? 0) > 30) missing.push({ label: "Activity", detail: `${daysSinceTouched}d old`, tone: "amber" });
  else missing.push({ label: "Activity", detail: formatRelativeTime(lastTouched), tone: "green" });

  if (overdueOpps.length > 0) missing.push({ label: "Next step", detail: `${overdueOpps.length} overdue`, tone: "red" });
  else if (openOpps.some((opportunity) => !opportunity.nextStep?.trim())) missing.push({ label: "Next step", detail: "missing", tone: "amber" });
  else if (openOpps.length > 0) missing.push({ label: "Next step", detail: "covered", tone: "green" });
  else if (!getNextAction(account.id, activities, linkedContacts)) missing.push({ label: "Next action", detail: "none", tone: "amber" });
  else missing.push({ label: "Next action", detail: "scheduled", tone: "green" });

  return missing;
}

function formatRelativeFuture(value?: string): string {
  if (!value) return "—";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = ts - Date.now();
  if (diff < 0) return formatRelativeTime(value);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `in ${days}d`;
  return formatDate(value);
}

function PillPopover({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef, onClose]);
  if (!open) return null;
  return (
    <div
      ref={popRef}
      role="menu"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        zIndex: 200,
        minWidth: 168,
        padding: 4,
        borderRadius: 10,
        background: "#0c0c12",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 32px rgba(0,0,0,0.55)",
      }}
    >
      {children}
    </div>
  );
}

function popoverItemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    width: "100%",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 6,
    background: active ? "rgba(255,255,255,0.06)" : "transparent",
    border: "none",
    color: "var(--color-client-text)",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "left",
  };
}

function AccountWebsiteLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const href = websiteHref(value);

  const handleCopy = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <span className="account-website-link" style={{ display: "inline-flex", alignItems: "center", gap: 7, position: "relative" }}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--color-client-blue)",
          fontSize: 12,
          lineHeight: 1.3,
          textDecoration: "underline",
          textDecorationColor: "rgba(96,165,250,0.45)",
          textUnderlineOffset: 2,
        }}
      >
        {value}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={`Copy website ${value}`}
        title="Copy website"
        style={{
          width: 24,
          height: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          border: "1px solid rgba(96,165,250,0.28)",
          background: copied ? "rgba(52,211,153,0.13)" : "rgba(96,165,250,0.09)",
          color: copied ? "#6EE7B7" : "#93C5FD",
          fontSize: 16,
          fontWeight: 800,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        {copied ? "✓" : "⎘"}
      </button>
      {copied ? (
        <span style={{ position: "absolute", left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, color: "#6EE7B7", whiteSpace: "nowrap" }}>
          Copied
        </span>
      ) : null}
    </span>
  );
}

function LifecycleStagePath({
  value,
  onChange,
}: {
  value: LifecycleStage | undefined;
  onChange: (next: LifecycleStage) => void;
}) {
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const activeStage = normalizeAccountLifecycleStage(value) ?? "new";
  const criteria = ACCOUNT_STATUS_CRITERIA[activeStage];
  return (
    <div aria-label="Account lifecycle stage" style={{ width: "100%", marginBottom: 10 }}>
      <style>{`
        @keyframes account-status-breathe {
          0%, 100% { box-shadow: 0 0 0 rgba(215, 25, 32, 0); }
          45% { box-shadow: 0 0 18px rgba(215, 25, 32, 0.32), inset 0 0 14px rgba(215, 25, 32, 0.08); }
        }
        @keyframes account-status-lamp {
          0%, 64%, 100% { opacity: 0.28; transform: translateY(-50%) scale(0.86); }
          18%, 42% { opacity: 1; transform: translateY(-50%) scale(1); }
        }
      `}</style>
      <div style={{ marginBottom: 6, fontSize: 9, fontWeight: 800, color: "var(--color-client-text-dim)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        Status
      </div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 2, width: "100%", overflowX: "auto", paddingBottom: 2 }}>
        {LIFECYCLE_STAGES.map((stage, index) => {
          const active = stage === activeStage;
          const label = lifecycleStageLabel(stage);
          return (
            <button
              key={stage}
              type="button"
              aria-current={active ? "step" : undefined}
              aria-expanded={active ? criteriaOpen : undefined}
              aria-label={active ? `${label} status. ${criteriaOpen ? "Collapse" : "Expand"} entry and exit criteria.` : `Set account status to ${label}`}
              onClick={() => {
                if (active) {
                  setCriteriaOpen((open) => !open);
                  return;
                }
                onChange(stage);
                setCriteriaOpen(true);
              }}
              style={{
                position: "relative",
                minWidth: 112,
                flex: "1 0 112px",
                minHeight: 34,
                padding: active
                  ? index === 0 ? "8px 34px 8px 14px" : "8px 34px 8px 22px"
                  : index === 0 ? "8px 16px 8px 14px" : "8px 16px 8px 22px",
                border: active ? "1px solid rgba(218,218,219,0.72)" : "1px solid rgba(148,163,184,0.14)",
                borderRadius: index === 0 ? "8px 0 0 8px" : index === LIFECYCLE_STAGES.length - 1 ? "0 8px 8px 0" : 0,
                clipPath: index === LIFECYCLE_STAGES.length - 1
                  ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)"
                  : index === 0
                    ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                    : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
                background: active ? "linear-gradient(180deg, rgba(218,218,219,0.46), rgba(82,10,16,0.42))" : "rgba(255,255,255,0.045)",
                color: active ? "#F4C7CA" : "var(--color-client-text-secondary)",
                fontSize: 11,
                fontWeight: active ? 800 : 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                cursor: "pointer",
                outlineOffset: 2,
                fontFamily: "inherit",
                animation: active ? "account-status-breathe 6.5s ease-in-out infinite" : undefined,
              }}
              onMouseEnter={(event) => {
                if (!active) event.currentTarget.style.background = "rgba(255,255,255,0.075)";
              }}
              onMouseLeave={(event) => {
                if (!active) event.currentTarget.style.background = "rgba(255,255,255,0.045)";
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: active ? 6 : 0 }}>
                {active ? (
                  <span
                    aria-hidden
                    style={{
                      color: "#FFD5D7",
                      fontSize: 13,
                      fontWeight: 950,
                      lineHeight: 1,
                      transform: criteriaOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 140ms ease",
                    }}
                  >
                    ⌄
                  </span>
                ) : null}
                <span>{label}</span>
              </span>
              {active ? (
                <>
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      right: 24,
                      top: "50%",
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "#FF4D55",
                      transform: "translateY(-50%)",
                      animation: "account-status-lamp 5.8s ease-in-out infinite",
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      right: 16,
                      top: "50%",
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "#FF9095",
                      transform: "translateY(-50%)",
                      animation: "account-status-lamp 5.8s ease-in-out 1.4s infinite",
                    }}
                  />
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      {!criteriaOpen ? (
        <button
          type="button"
          onClick={() => setCriteriaOpen(true)}
          aria-expanded={false}
          style={{
            width: "100%",
            marginTop: 8,
            minHeight: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "7px 12px",
            border: "1px solid rgba(218,218,219,0.26)",
            borderRadius: 8,
            background: "linear-gradient(90deg, rgba(218,218,219,0.08), rgba(255,255,255,0.024))",
            color: "var(--color-client-text-secondary)",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span aria-hidden style={{ color: "#dadadb", fontSize: 12, fontWeight: 900 }}>⌄</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#F4C7CA" }}>Entry and exit criteria</span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 10, color: "var(--color-client-text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Click status to switch
          </span>
        </button>
      ) : null}
      {criteriaOpen ? (
        <div
          style={{
            marginTop: 8,
            border: "1px solid rgba(218,218,219,0.34)",
            borderRadius: 8,
            background: "linear-gradient(180deg, rgba(218,218,219,0.12), rgba(255,255,255,0.025))",
            overflow: "hidden",
            boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
          }}
        >
          <div style={{ padding: "10px 12px 12px", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "#dadadb", boxShadow: "0 0 12px rgba(218,218,219,0.6)" }} />
                <span style={{ fontSize: 12, fontWeight: 850, color: "#F4C7CA" }}>{lifecycleStageLabel(activeStage)} criteria</span>
              </div>
              <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Entry / Exit
              </span>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-client-text-secondary)" }}>{criteria.definition}</div>
            <CriteriaList title="Entry" items={criteria.entry} />
            <CriteriaList title="Exit" items={criteria.exit} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CriteriaList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ marginBottom: 4, fontSize: 9, fontWeight: 850, color: "var(--color-client-text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        {items.map((item) => (
          <li key={item} style={{ fontSize: 12, lineHeight: 1.45, color: "var(--color-client-text)" }}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function TierPill({
  value,
  onChange,
}: {
  value: AccountTier | undefined;
  onChange: (next: AccountTier) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((p) => !p)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: value ? "var(--color-client-text)" : "var(--color-client-text-dim)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 9, color: "var(--color-client-text-dim)", letterSpacing: "0.08em" }}>TIER</span>
        <span>{value ?? "—"}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>
      <PillPopover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
        {ACCOUNT_TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            onClick={() => { setOpen(false); onChange(tier); }}
            style={popoverItemStyle(tier === value)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = tier === value ? "rgba(255,255,255,0.06)" : "transparent"; }}
          >
            <span style={{ flex: 1, textTransform: "capitalize" }}>{tier}</span>
            {tier === value && <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>✓</span>}
          </button>
        ))}
      </PillPopover>
    </div>
  );
}

function LastTouchedPill({ iso }: { iso: string | undefined }) {
  const display = iso ? formatRelativeTime(iso) : "—";
  const tooltip = iso ? new Date(iso).toISOString() : "No activity recorded";
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        color: iso ? lastActivityColor(iso) : "var(--color-client-text-dim)",
        fontSize: 11,
        fontWeight: 600,
        cursor: "default",
      }}
    >
      <span style={{ fontSize: 9, color: "var(--color-client-text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>LAST TOUCHED</span>
      <span>{display}</span>
    </span>
  );
}

function PipelinePillsRow({
  account,
  linkedContacts,
  activities,
  onPatchAccount,
  onError,
}: {
  account: Account;
  linkedContacts: Contact[];
  activities: CRMActivity[];
  onPatchAccount: (patch: Partial<Account>) => Promise<void>;
  onError: (message: string) => void;
}) {
  const lastTouched = useMemo(() => getAccountLastTouched(account.id, activities, linkedContacts), [account.id, activities, linkedContacts]);

  const handleStage = useCallback(async (stage: LifecycleStage) => {
    try {
      await onPatchAccount({ lifecycleStage: stage });
    } catch {
      onError("Update failed");
    }
  }, [onPatchAccount, onError]);

  const handleTier = useCallback(async (tier: AccountTier) => {
    try {
      await onPatchAccount({ tier });
    } catch {
      onError("Update failed");
    }
  }, [onPatchAccount, onError]);

  const sep = (
    <span aria-hidden style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
  );

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
      <LifecycleStagePath value={normalizeAccountLifecycleStage(account.lifecycleStage)} onChange={handleStage} />
      <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
        <TierPill value={account.tier} onChange={handleTier} />
        {sep}
        <LastTouchedPill iso={lastTouched} />
      </div>
    </div>
  );
}

function NextActionChip({
  accountId,
  activities,
  linkedContacts,
  onJumpToActivity,
  onAddFollowUp,
}: {
  accountId: string;
  activities: CRMActivity[];
  linkedContacts: Contact[];
  onJumpToActivity: (activityId: string) => void;
  onAddFollowUp: () => void;
}) {
  const next = useMemo(() => getNextAction(accountId, activities, linkedContacts), [accountId, activities, linkedContacts]);
  if (!next) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.08)",
          fontSize: 12,
          color: "var(--color-client-text-dim)",
          fontStyle: "italic",
          marginBottom: 12,
        }}
      >
        <span style={{ flex: 1 }}>No upcoming actions</span>
        <button
          type="button"
          onClick={onAddFollowUp}
          style={{ background: "none", border: "none", color: "#dadadb", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0, fontStyle: "normal" }}
        >
          + Add follow-up
        </button>
      </div>
    );
  }
  const preview = next.content.length > 80 ? `${next.content.slice(0, 80)}…` : next.content;
  return (
    <button
      type="button"
      onClick={() => onJumpToActivity(next.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "8px 12px",
        borderRadius: 10,
        background: "rgba(251,191,36,0.06)",
        border: "1px solid rgba(251,191,36,0.18)",
        color: "var(--color-client-text)",
        fontSize: 12,
        cursor: "pointer",
        textAlign: "left",
        marginBottom: 12,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,191,36,0.10)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(251,191,36,0.06)"; }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>🎯</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {preview} <span style={{ color: "var(--color-client-text-dim)" }}>· due {formatRelativeFuture(next.occurredAt)}</span>
      </span>
      <span aria-hidden style={{ color: "var(--color-client-text-dim)", fontSize: 14 }}>›</span>
    </button>
  );
}

function AccountQuickActions({
  account,
  onClose,
  onCreateOpportunity,
  onAddContact,
  onEnrich,
  enriching,
}: {
  account: Account;
  onClose: () => void;
  onCreateOpportunity: () => void | Promise<void>;
  onAddContact: () => void;
  onEnrich: () => void | Promise<void>;
  enriching: boolean;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/crm/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <>
      <CrmActionBar>
        <button
          type="button"
          onClick={() => void onCreateOpportunity()}
          style={createOpportunityBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(218,218,219,0.20)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(218,218,219,0.14)"; }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>+</span>
          Create Opportunity
        </button>
        <button
          type="button"
          onClick={() => void onEnrich()}
          disabled={enriching}
          style={{
            ...crmPrimaryActionButtonStyle,
            background: enriching ? "rgba(218,218,219,0.09)" : "rgba(218,218,219,0.16)",
            border: "1px solid rgba(218,218,219,0.34)",
            color: "#F4C7CA",
            opacity: enriching ? 0.72 : 1,
          }}
        >
          {enriching ? "Enriching..." : "Enrich Account"}
        </button>
        {account?.website && (
          <button
            onClick={() => window.open(account.website?.startsWith("http") ? account.website : `https://${account.website}`, "_blank")}
            style={acctQuickActionBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            🌐 Website
          </button>
        )}
        {account?.linkedinUrl && (
          <button
            onClick={() => window.open(account.linkedinUrl, "_blank")}
            style={acctQuickActionBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            in LinkedIn
          </button>
        )}
        <button
          type="button"
          onClick={onAddContact}
          style={acctQuickActionBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>+</span>
          Add Contact
        </button>
        <button
          onClick={() => setShowDeleteConfirm((p) => !p)}
          style={crmDangerActionButtonStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        >
          🗑️ Delete
        </button>
      </CrmActionBar>
      {showDeleteConfirm && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#F87171", marginBottom: 8 }}>Delete this account and all related data?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
            <button onClick={() => void handleDelete()} disabled={deleting} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}>{deleting ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      )}
    </>
  );
}

function InlineContactCreatePanel({
  form,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: {
  form: InlineContactFormState;
  saving: boolean;
  error: string | null;
  onChange: (patch: Partial<InlineContactFormState>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const fieldStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: 38,
    background: "rgba(10,16,28,0.72)",
    border: "1px solid rgba(148,163,184,0.18)",
    color: "#F8FAFC",
  };
  return (
    <div style={{
      marginTop: -4,
      marginBottom: 18,
      padding: 16,
      borderRadius: 12,
      background: "linear-gradient(180deg, rgba(15,23,42,0.84), rgba(12,12,18,0.76))",
      border: "1px solid rgba(218,218,219,0.22)",
      boxShadow: "0 18px 48px rgba(0,0,0,0.24)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 750, color: "#F8FAFC" }}>Add Contact</div>
          <div style={{ marginTop: 3, fontSize: 11, color: "#94A3B8" }}>Create the contact directly on this account.</div>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} style={{ ...secondaryButtonStyle, borderRadius: 8 }}>Cancel</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <div>
          <label style={labelStyle}>First Name</label>
          <input value={form.firstName} onChange={(event) => onChange({ firstName: event.target.value })} style={fieldStyle} autoFocus />
        </div>
        <div>
          <label style={labelStyle}>Last Name</label>
          <input value={form.lastName} onChange={(event) => onChange({ lastName: event.target.value })} style={fieldStyle} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={labelStyle}>Title</label>
          <input value={form.title} onChange={(event) => onChange({ title: event.target.value })} style={fieldStyle} placeholder="Founder, Marketing Lead, Install Prospect..." />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input value={form.email} onChange={(event) => onChange({ email: event.target.value })} style={fieldStyle} inputMode="email" />
        </div>
        <div>
          <label style={labelStyle}>Phone</label>
          <input value={form.phone} onChange={(event) => onChange({ phone: event.target.value })} style={fieldStyle} inputMode="tel" />
        </div>
      </div>
      {error ? <div style={{ marginTop: 10, color: "#FCA5A5", fontSize: 12 }}>{error}</div> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onSave} disabled={saving} style={{ ...primaryButtonStyle, borderRadius: 8, minHeight: 34, opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save Contact"}
        </button>
      </div>
    </div>
  );
}

function AccountDrawer({
  account,
  contacts,
  accounts,
  activities,
  opportunities,
  onClose,
  onRefresh,
}: {
  account: Account;
  contacts: Contact[];
  accounts: Account[];
  activities: CRMActivity[];
  opportunities: Opportunity[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { isMobile } = useResponsive();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccountEditState>(() => accountEditState(account));
  const [accountActivities, setAccountActivities] = useState<CRMActivity[]>(() => getAccountActivities(account.id, activities, contacts));
  const [relatedOpportunities, setRelatedOpportunities] = useState<Opportunity[]>(() => opportunities.filter((opportunity) => opportunity.accountId === account.id && !opportunity.deletedAt));
  const [localAccount, setLocalAccount] = useState<Account>(account);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [showContactCreate, setShowContactCreate] = useState(false);
  const [contactCreateForm, setContactCreateForm] = useState<InlineContactFormState>(emptyInlineContactForm);
  const [contactCreateSaving, setContactCreateSaving] = useState(false);
  const [contactCreateError, setContactCreateError] = useState<string | null>(null);
  const [opportunitiesMenuOpen, setOpportunitiesMenuOpen] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const [addressEditing, setAddressEditing] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressDraft, setAddressDraft] = useState<Pick<AccountEditState, "venueName" | "street" | "city" | "state" | "zip">>(() => ({
    venueName: account.address?.venueName ?? "",
    street: account.address?.street ?? "",
    city: account.address?.city ?? "",
    state: account.address?.state ?? "",
    zip: account.address?.zip ?? "",
  }));
  useEffect(() => {
    setLocalAccount(account);
    setShowContactCreate(false);
    setContactCreateForm(emptyInlineContactForm);
    setContactCreateError(null);
    setEnrichMessage(null);
    setEnrichError(null);
    setAddressEditing(false);
    setAddressDraft({
      venueName: account.address?.venueName ?? "",
      street: account.address?.street ?? "",
      city: account.address?.city ?? "",
      state: account.address?.state ?? "",
      zip: account.address?.zip ?? "",
    });
    setOpportunitiesMenuOpen(false);
  }, [account]);
  useEffect(() => {
    if (!opportunitiesMenuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (opportunitiesMenuRef.current?.contains(target)) return;
      setOpportunitiesMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpportunitiesMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [opportunitiesMenuOpen]);
  useEffect(() => {
    if (!headerError) return;
    const t = window.setTimeout(() => setHeaderError(null), 3000);
    return () => window.clearTimeout(t);
  }, [headerError]);
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultDrawerWidth;
    try {
      const stored = window.localStorage.getItem(drawerWidthKey);
      if (!stored) return defaultDrawerWidth;
      const parsed = Number(stored);
      return Number.isFinite(parsed) ? parsed : defaultDrawerWidth;
    } catch {
      return defaultDrawerWidth;
    }
  });
  const [isFullScreen, setIsFullScreen] = useState(true);
  const [meetingBriefings, setMeetingBriefings] = useState<MeetingBriefing[]>([]);
  const [briefingsLoading, setBriefingsLoading] = useState(false);
  const [briefingActionItems, setBriefingActionItems] = useState<MeetingActionItem[]>([]);
  const briefingActionItemsFetched = useRef(false);
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [inboundLeads, setInboundLeads] = useState<InboundLead[]>([]);
  const emailFetchAttempted = useRef(false);
  const leadFetchAttempted = useRef(false);
  const emailEndpointWarned = useRef(false);
  const leadEndpointWarned = useRef(false);
  const resizingRef = useRef(false);
  const drawerElRef = useRef<HTMLDivElement>(null);
  const opportunitiesMenuRef = useRef<HTMLDivElement>(null);

  // Callback ref: fires the instant the DOM element is attached.
  const drawerRef = useCallback((node: HTMLDivElement | null) => {
    drawerElRef.current = node;
    if (node) {
      node.scrollTop = 0;
      requestAnimationFrame(() => { node.scrollTop = 0; });
      setTimeout(() => { node.scrollTop = 0; }, 50);
      setTimeout(() => { node.scrollTop = 0; }, 300);
    }
  }, []);

  // Lock body scroll when drawer is open + scroll drawer to top on account change
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
  }, [account.id]);

  useEffect(() => {
    setForm(accountEditState(account));
  }, [account]);

  useEffect(() => {
    setAccountActivities(getAccountActivities(account.id, activities, contacts));
    setRelatedOpportunities(opportunities.filter((opportunity) => opportunity.accountId === account.id && !opportunity.deletedAt));
  }, [account.id, activities, contacts, opportunities]);

  useEffect(() => {
    let cancelled = false;
    setMeetingBriefings([]);
    setBriefingsLoading(true);
    briefingActionItemsFetched.current = false;
    setBriefingActionItems([]);
    (async () => {
      try {
        const res = await fetch("/api/meetings", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setMeetingBriefings(Array.isArray(data) ? (data as MeetingBriefing[]) : []);
        }
      } catch {
        /* graceful degrade */
      } finally {
        if (!cancelled) setBriefingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account.id]);

  const fetchBriefingActionItems = useCallback(async () => {
    try {
      const res = await fetch("/api/action-items");
      if (res.ok) {
        const data = await res.json();
        setBriefingActionItems(Array.isArray(data) ? data : data.items ?? []);
      }
    } catch {
      /* graceful degrade */
    }
  }, []);

  const briefingsById = useMemo(() => {
    const map = new Map<string, MeetingBriefing>();
    meetingBriefings.forEach((m) => map.set(m.id, m));
    return map;
  }, [meetingBriefings]);

  const emailsById = useMemo(() => {
    const map = new Map<string, EmailThread>();
    emailThreads.forEach((e) => map.set(e.id, e));
    return map;
  }, [emailThreads]);

  const leadsById = useMemo(() => {
    const map = new Map<string, InboundLead>();
    inboundLeads.forEach((l) => map.set(l.id, l));
    return map;
  }, [inboundLeads]);

  const ensureEmailThreadsLoaded = useCallback(async () => {
    if (emailFetchAttempted.current) return;
    emailFetchAttempted.current = true;
    try {
      const res = await fetch("/api/emails", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items: EmailThread[] = Array.isArray(data)
          ? (data as EmailThread[])
          : Array.isArray((data as { items?: EmailThread[] })?.items)
            ? ((data as { items: EmailThread[] }).items)
            : [];
        setEmailThreads(items);
      } else if (!emailEndpointWarned.current) {
        emailEndpointWarned.current = true;
        console.warn("[CRM] EmailThread endpoint missing — using snapshot fallback");
      }
    } catch {
      if (!emailEndpointWarned.current) {
        emailEndpointWarned.current = true;
        console.warn("[CRM] EmailThread endpoint missing — using snapshot fallback");
      }
    }
  }, []);

  const ensureInboundLeadsLoaded = useCallback(async () => {
    if (leadFetchAttempted.current) return;
    leadFetchAttempted.current = true;
    try {
      const res = await fetch("/api/inbound-leads", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const items: InboundLead[] = Array.isArray(data)
          ? (data as InboundLead[])
          : Array.isArray((data as { items?: InboundLead[] })?.items)
            ? ((data as { items: InboundLead[] }).items)
            : [];
        setInboundLeads(items);
      } else if (!leadEndpointWarned.current) {
        leadEndpointWarned.current = true;
        console.warn("[CRM] InboundLead endpoint missing — using snapshot fallback");
      }
    } catch {
      if (!leadEndpointWarned.current) {
        leadEndpointWarned.current = true;
        console.warn("[CRM] InboundLead endpoint missing — using snapshot fallback");
      }
    }
  }, []);

  useEffect(() => {
    if (isMobile) return;
    try {
      window.localStorage.setItem(drawerWidthKey, String(drawerWidth));
    } catch {
      /* non-critical layout preference */
    }
  }, [drawerWidth, isMobile]);

  const linkedContacts = useMemo(() => {
    return getLinkedContacts(account.id, contacts);
  }, [account.id, contacts]);

  const patchAccountOptimistic = useCallback(async (patch: Partial<Account>) => {
    const previous = localAccount;
    setLocalAccount((prev) => ({ ...prev, ...patch }));
    try {
      const res = await fetch("/api/crm/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, ...patch }),
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      void onRefresh();
    } catch (err) {
      setLocalAccount(previous);
      throw err;
    }
  }, [account.id, localAccount, onRefresh]);

  const handleJumpToActivity = useCallback((activityId: string) => {
    const node = drawerElRef.current?.querySelector<HTMLElement>(`[data-activity-id="${activityId}"]`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const prevShadow = node.style.boxShadow;
    node.style.boxShadow = "0 0 0 2px rgba(251,191,36,0.5)";
    window.setTimeout(() => { node.style.boxShadow = prevShadow; }, 1400);
  }, []);

  const handleAddFollowUp = useCallback(() => {
    const primary = pickPrimaryContact(linkedContacts) ?? linkedContacts[0];
    if (primary) {
      router.push(`/contacts?select=${primary.id}`);
    } else {
      router.push(`/contacts?action=create&prefill_account=${account.id}`);
    }
  }, [linkedContacts, account.id, router]);

  const timeline = useMemo(() => {
    return [...accountActivities].sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  }, [accountActivities]);

  type TimelineGroup = {
    key: string;
    kind: "meeting" | "single";
    representative: CRMActivity;
    attendees: { id?: string; name: string }[];
    singleActivity?: CRMActivity;
  };

  const timelineGroups = useMemo<TimelineGroup[]>(() => {
    const meetingBuckets = new Map<string, CRMActivity[]>();
    const meetingOrder: string[] = [];
    const groups: TimelineGroup[] = [];

    for (const activity of timeline) {
      if (activity.type === "Meeting") {
        const key = activity.externalRef
          ? `ext:${activity.externalRef}`
          : `mt:${activity.meetingTitle ?? ""}|${activity.occurredAt ?? ""}`;
        const existing = meetingBuckets.get(key);
        if (existing) {
          existing.push(activity);
        } else {
          meetingBuckets.set(key, [activity]);
          meetingOrder.push(key);
          groups.push({
            key,
            kind: "meeting",
            representative: activity,
            attendees: [],
          });
        }
      } else {
        groups.push({
          key: `single:${activity.id}`,
          kind: "single",
          representative: activity,
          attendees: [],
          singleActivity: activity,
        });
      }
    }

    for (const group of groups) {
      if (group.kind !== "meeting") continue;
      const bucket = meetingBuckets.get(group.key) ?? [];
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const attendees: { id?: string; name: string }[] = [];
      for (const a of bucket) {
        if (!a.contactId || seenIds.has(a.contactId)) continue;
        seenIds.add(a.contactId);
        const linked = linkedContacts.find((c) => c.id === a.contactId);
        if (linked) {
          attendees.push({ id: linked.id, name: linked.name });
          seenNames.add(linked.name.toLowerCase());
          continue;
        }
        // No linked contact: only render if we have a real human name from the
        // activity itself. Skip orphan rows whose only identifier is an internal id.
        const stubName = (a as CRMActivity & { contactName?: string }).contactName;
        if (stubName && stubName.trim() && !/^c_[a-z0-9]+$/i.test(stubName)) {
          attendees.push({ id: undefined, name: stubName.trim() });
          seenNames.add(stubName.trim().toLowerCase());
        }
      }
      for (const participantName of group.representative.participants ?? []) {
        const norm = participantName.trim();
        if (!norm) continue;
        if (seenNames.has(norm.toLowerCase())) continue;
        const matchedContact = linkedContacts.find((c) => c.name.toLowerCase() === norm.toLowerCase());
        if (matchedContact) {
          if (seenIds.has(matchedContact.id)) continue;
          seenIds.add(matchedContact.id);
          attendees.push({ id: matchedContact.id, name: matchedContact.name });
        } else {
          attendees.push({ id: undefined, name: norm });
        }
        seenNames.add(norm.toLowerCase());
      }
      group.attendees = attendees;
    }

    return groups;
  }, [timeline, linkedContacts]);

  const [expandedMeetingKeys, setExpandedMeetingKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpandedMeetingKeys(new Set());
  }, [account.id]);
  const toggleMeetingExpanded = useCallback((key: string) => {
    setExpandedMeetingKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!briefingActionItemsFetched.current) {
      briefingActionItemsFetched.current = true;
      void fetchBriefingActionItems();
    }
  }, [fetchBriefingActionItems]);

  const emailActivities = useMemo(() => {
    return accountActivities.filter((a) => a.type === "Email");
  }, [accountActivities]);
  const openDeals = useMemo(() => relatedOpportunities.filter(isOpenOpportunity), [relatedOpportunities]);
  const partnerAccounts = useMemo(() => accounts.filter((item) => item.type === "Partner" && item.id !== account.id && !item.deletedAt), [account.id, accounts]);
  const cityOptions = useMemo(() => {
    const customValues = accounts
      .map((item) => (item.operatingMarket || "").trim())
      .filter(Boolean);
    return Array.from(new Set([...usTopCityOptions, ...customValues]));
  }, [accounts]);
  const pipelineValue = useMemo(() => openDeals.reduce((sum, o) => sum + (o.value ?? 0), 0), [openDeals]);
  const lastAccountActivity = useMemo(() => {
    return accountActivities.length > 0
      ? [...accountActivities].sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))[0]?.occurredAt
      : undefined;
  }, [accountActivities]);
  const accountHighlightItems = useMemo<CrmHighlightItem[]>(() => ([
    { label: "Contacts", value: linkedContacts.length, tone: linkedContacts.length > 0 ? "green" : "neutral", helper: "Linked people" },
    { label: "Open opps", value: openDeals.length, tone: openDeals.length > 0 ? "purple" : "neutral", helper: "Active pipeline" },
    { label: "Pipeline", value: `$${pipelineValue.toLocaleString()}`, tone: pipelineValue > 0 ? "green" : "neutral", helper: "Open value" },
    { label: "Last activity", value: lastAccountActivity ? formatRelativeTime(lastAccountActivity) : "None", tone: lastAccountActivity ? (lastActivityColor(lastAccountActivity) === "#EF4444" ? "red" : lastActivityColor(lastAccountActivity) === "#FBBF24" ? "amber" : "green") : "red", helper: "Account + contacts" },
  ]), [lastAccountActivity, linkedContacts.length, openDeals.length, pipelineValue]);
  const accountQualitySignals = useMemo(() => getAccountQualitySignals({
    account: localAccount,
    linkedContacts,
    activities: accountActivities,
    opportunities: relatedOpportunities,
  }), [accountActivities, linkedContacts, localAccount, relatedOpportunities]);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    if (isMobile || isFullScreen) return;
    event.preventDefault();
    resizingRef.current = true;
    const startX = event.clientX;
    const startWidth = drawerWidth;

    const onMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const maxWidth = window.innerWidth * maxDrawerWidthRatio;
      const delta = startX - moveEvent.clientX;
      setDrawerWidth(Math.min(maxWidth, Math.max(minDrawerWidth, startWidth + delta)));
    };

    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [drawerWidth, isFullScreen, isMobile]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const address = [form.venueName, form.street, form.city, form.state, form.zip].some(Boolean)
        ? {
            venueName: form.venueName || undefined,
            street: form.street || undefined,
            city: form.city || undefined,
            state: form.state || undefined,
            zip: form.zip || undefined,
          }
        : undefined;

      const response = await fetch("/api/crm/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: account.id,
          name: form.name,
          type: form.type,
          subType: form.subType || undefined,
          referralPartnerAccountId: form.type === "Partner" ? "" : form.referralPartnerAccountId || undefined,
          category: form.category || undefined,
          operatingMarket: form.operatingMarket,
          website: form.website || undefined,
          notes: form.notes || undefined,
          industry: form.industry || undefined,
          revenueTier: form.revenueTier || undefined,
          relationshipStage: form.relationshipStage || undefined,
          geo: form.geo || undefined,
          address,
        }),
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      await onRefresh();
      const refreshedActivities = await fetch(`/api/crm/activities?accountId=${account.id}`, { cache: "no-store" });
      if (refreshedActivities.ok) setAccountActivities(await refreshedActivities.json());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [account.id, form, onRefresh]);
  const accountInterestTags = account.interests ?? [];
  const accountLogo = getAccountLogoAsset(localAccount);
  const toggleInterest = async (tag: string) => {
    const next = accountInterestTags.includes(tag)
      ? accountInterestTags.filter((item) => item !== tag)
      : [...accountInterestTags, tag];
    const res = await fetch("/api/crm/accounts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, interests: next }) });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    await onRefresh();
  };
  const patchAccountOverview = useCallback(async (patch: Partial<Account>) => {
    const res = await fetch("/api/crm/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: account.id, ...patch }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    await onRefresh();
  }, [account.id, onRefresh]);
  const enrichAccount = useCallback(async () => {
    setEnriching(true);
    setEnrichMessage(null);
    setEnrichError(null);
    try {
      const res = await fetch("/api/crm/accounts/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      const body = await res.json().catch(() => null) as { error?: string; logosImported?: number; discoveredWebsite?: string; websiteSource?: string } | null;
      if (!res.ok) throw new Error(body?.error || `Enrichment failed (${res.status})`);
      const discovery = body?.websiteSource && body.websiteSource !== "existing" ? ` Website: ${body.discoveredWebsite}.` : "";
      setEnrichMessage(`Enrichment complete. Added ${body?.logosImported ?? 0} logo file${body?.logosImported === 1 ? "" : "s"}.${discovery}`);
      await onRefresh();
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }, [account.id, onRefresh]);
  const saveAddressOverview = useCallback(async () => {
    setAddressSaving(true);
    try {
      const nextAddress = [addressDraft.venueName, addressDraft.street, addressDraft.city, addressDraft.state, addressDraft.zip].some((value) => value.trim())
        ? {
            venueName: addressDraft.venueName.trim() || undefined,
            street: addressDraft.street.trim() || undefined,
            city: addressDraft.city.trim() || undefined,
            state: addressDraft.state.trim() || undefined,
            zip: addressDraft.zip.trim() || undefined,
          }
        : undefined;
      await patchAccountOverview({ address: nextAddress });
      setAddressEditing(false);
    } finally {
      setAddressSaving(false);
    }
  }, [addressDraft, patchAccountOverview]);
  const patchOpportunityOwner = useCallback(async (opportunityId: string, owner: string) => {
    const res = await fetch("/api/crm/opportunities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: opportunityId, owner }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    await onRefresh();
  }, [onRefresh]);
  const createOpportunityForAccount = useCallback(() => {
    const status = normalizeAccountLifecycleStage(account.lifecycleStage);
    if ((status === "new" || status === "outreach" || status === "engaged") && !window.confirm("Opportunities should usually be created after a qualified Meeting. Create anyway?")) {
      return;
    }
    const params = new URLSearchParams();
    params.set("object", "opportunities");
    params.set("select", "new");
    params.set("prefill_account", account.id);
    if (linkedContacts.length === 1) {
      params.set("prefill_contact", linkedContacts[0].id);
    }
    router.push(`/contacts?${params.toString()}`);
  }, [account.id, account.lifecycleStage, linkedContacts, router]);

  const createContactForAccount = useCallback(async () => {
    const firstName = contactCreateForm.firstName.trim();
    const lastName = contactCreateForm.lastName.trim();
    if (!firstName || !lastName) {
      setContactCreateError("First and last name are required.");
      return;
    }
    setContactCreateSaving(true);
    setContactCreateError(null);
    try {
      const response = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          title: contactCreateForm.title.trim() || undefined,
          email: contactCreateForm.email.trim() || undefined,
          phone: contactCreateForm.phone.trim() || undefined,
          accountId: account.id,
          tags: account.subType === "Install Program" ? ["Agentic Installs"] : [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? `API returned ${response.status}`);
      await onRefresh();
      setContactCreateForm(emptyInlineContactForm);
      setShowContactCreate(false);
    } catch (error) {
      setContactCreateError(error instanceof Error ? error.message : "Failed to create contact.");
    } finally {
      setContactCreateSaving(false);
    }
  }, [account.id, account.subType, contactCreateForm, onRefresh]);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }}
      />
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
          zIndex: 100,
          overflowY: "auto",
          padding: isMobile ? "16px" : "28px 24px",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
        }}
      >
        {!isMobile && !isFullScreen && (
          <div
            onMouseDown={handleResizeStart}
            style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 110 }}
          />
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
          {!isMobile && (
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: isFullScreen ? "#dadadb" : "var(--color-client-text-secondary)",
                cursor: "pointer",
              }}
            >
              {isFullScreen ? "↙" : "↔"}
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              width: isMobile ? 44 : 32,
              height: isMobile ? 44 : 32,
              borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--color-client-text-secondary)",
              cursor: "pointer",
            }}
          >
            {isMobile ? "←" : "✕"}
          </button>
        </div>

        <CrmRecordHeader
          eyebrow="Account"
          avatarLabel={account.name || "?"}
          avatarUrl={accountLogo?.url}
          title={<InlineEditText value={account.name || ""} fontSize={22} color="var(--color-client-text)" onSave={async (v) => { const res = await fetch("/api/crm/accounts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, name: v }) }); if (!res.ok) throw new Error(`API returned ${res.status}`); await onRefresh(); }} />}
          subtitle={(
            <>
              {account.aliases && account.aliases.length > 0 ? <span>Also known as: {account.aliases.join(", ")}</span> : null}
              {account.website ? <div style={{ marginTop: 3 }}><AccountWebsiteLink value={account.website} /></div> : null}
            </>
          )}
          badges={(
            <>
              <div style={{ minWidth: 160 }}>
                <span style={{ display: "block", marginBottom: 4, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>
                  Record Type
                </span>
                <CRMPicker
                  options={accountTypeOptions.map((option) => ({ value: option }))}
                  value={account.type}
                  onChange={(type) => {
                    if (!type) return;
                    void patchAccountOverview({ type: type as AccountType, subType: undefined, referralPartnerAccountId: type === "Partner" ? "" : account.referralPartnerAccountId });
                  }}
                  getKey={(option) => option.value}
                  getLabel={(option) => option.value}
                  size="sm"
                  searchable={false}
                />
              </div>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{linkedContacts.length} contact{linkedContacts.length !== 1 ? "s" : ""}</span>
            </>
          )}
          actions={(
            <button
              onClick={() => {
                setEditing((prev) => !prev);
                setForm(accountEditState(account));
              }}
              style={{ ...crmActionButtonStyle, color: editing ? "#dadadb" : "var(--color-client-text-dim)", border: editing ? "1px solid rgba(218,218,219,0.25)" : crmActionButtonStyle.border, background: editing ? "rgba(218,218,219,0.15)" : crmActionButtonStyle.background }}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", margin: "0 0 14px" }}>
          {account.convertedFromLeadId ? (
            <>
              <a
                href={`/contacts?object=leads&select=${account.convertedFromLeadId}`}
                style={{
                  padding: "3px 7px",
                  borderRadius: 5,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "var(--color-client-text-dim)",
                  fontFamily: "monospace",
                  fontSize: 11,
                  textDecoration: "none",
                }}
              >
                Lead source ↑
              </a>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", fontFamily: "monospace" }}>→</span>
            </>
          ) : null}
          <span
            style={{
              padding: "3px 7px",
              borderRadius: 5,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#fff",
              fontFamily: "monospace",
              fontSize: 11,
            }}
          >
            Account
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", fontFamily: "monospace" }}>→</span>
          {relatedOpportunities.length <= 1 ? (
            <a
              href={relatedOpportunities[0] ? `/contacts?object=opportunities&select=${relatedOpportunities[0].id}` : "/contacts?object=opportunities"}
              style={{
                padding: "3px 7px",
                borderRadius: 5,
                background: "rgba(218,218,219,0.16)",
                border: "1px solid rgba(218,218,219,0.34)",
                color: "#FFD5D7",
                fontFamily: "monospace",
                fontSize: 11,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Opportunities ({relatedOpportunities.length}) ↘
            </a>
          ) : (
            <div ref={opportunitiesMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setOpportunitiesMenuOpen((prev) => !prev)}
                style={{
                  padding: "3px 7px",
                  borderRadius: 5,
                  background: "rgba(218,218,219,0.16)",
                  border: "1px solid rgba(218,218,219,0.34)",
                  color: "#FFD5D7",
                  fontFamily: "monospace",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Opportunities ({relatedOpportunities.length}) ▾
              </button>
              {opportunitiesMenuOpen ? (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    minWidth: 280,
                    maxWidth: 420,
                    zIndex: 250,
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    background: "#0c0c12",
                    boxShadow: "0 16px 38px rgba(0,0,0,0.55)",
                    overflow: "hidden",
                  }}
                >
                  {relatedOpportunities.map((opportunity) => (
                    <button
                      key={opportunity.id}
                      type="button"
                      onClick={() => {
                        setOpportunitiesMenuOpen(false);
                        router.push(`/contacts?object=opportunities&select=${opportunity.id}`);
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        borderTop: "1px solid rgba(255,255,255,0.05)",
                        background: "transparent",
                        color: "#E2E8F0",
                        textAlign: "left",
                        padding: "8px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {opportunity.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ── Pipeline Pills (stage / tier / owner / last touched) ── */}
        <PipelinePillsRow
          account={localAccount}
          linkedContacts={linkedContacts}
          activities={accountActivities}
          onPatchAccount={patchAccountOptimistic}
          onError={setHeaderError}
        />

        {/* ── Next Action Chip ── */}
        <NextActionChip
          accountId={account.id}
          activities={accountActivities}
          linkedContacts={linkedContacts}
          onJumpToActivity={handleJumpToActivity}
          onAddFollowUp={handleAddFollowUp}
        />

        <CrmHighlightsGrid items={accountHighlightItems} />
        <CrmRecordSignalPanel title="Relationship health" signals={accountQualitySignals} />

        {account.type === "Client" && <ClientSummarySection opportunities={relatedOpportunities} router={router} onOwnerChange={patchOpportunityOwner} />}
        {account.type === "Partner" && <PartnerSummarySection account={account} accounts={accounts} opportunities={opportunities} router={router} />}

        {headerError && (
          <div role="alert" style={{ marginBottom: 10, padding: "6px 10px", borderRadius: 8, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#FCA5A5", fontSize: 11 }}>
            {headerError}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Created {formatDate(account.createdAt)}</span>
          <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Updated {formatRelativeTime(account.updatedAt)}</span>
        </div>

        {/* ── Quick Actions Bar ── */}
        <AccountQuickActions
          account={account}
          onClose={onClose}
          onCreateOpportunity={createOpportunityForAccount}
          onAddContact={() => {
            setShowContactCreate(true);
            setContactCreateError(null);
          }}
          onEnrich={enrichAccount}
          enriching={enriching}
        />

        {(enrichMessage || enrichError) && (
          <div
            role={enrichError ? "alert" : "status"}
            style={{
              margin: "-2px 0 12px",
              padding: "8px 10px",
              borderRadius: 10,
              background: enrichError ? "rgba(239,68,68,0.11)" : "rgba(218,218,219,0.10)",
              border: enrichError ? "1px solid rgba(239,68,68,0.32)" : "1px solid rgba(218,218,219,0.28)",
              color: enrichError ? "#FCA5A5" : "#A7F3D0",
              fontSize: 12,
              fontWeight: 650,
            }}
          >
            {enrichError ?? enrichMessage}
          </div>
        )}

        {showContactCreate && (
          <InlineContactCreatePanel
            form={contactCreateForm}
            saving={contactCreateSaving}
            error={contactCreateError}
            onChange={(patch) => setContactCreateForm((prev) => ({ ...prev, ...patch }))}
            onCancel={() => {
              setShowContactCreate(false);
              setContactCreateError(null);
              setContactCreateForm(emptyInlineContactForm);
            }}
            onSave={() => void createContactForAccount()}
          />
        )}

        {editing && (
          <div className="rounded-lg" style={{ padding: "14px 16px", marginBottom: 18, background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-client-border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Account Name</label>
                <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Record Type</label>
                <CRMPicker options={accountTypeOptions.map((option) => ({ value: option }))} value={form.type} onChange={(value) => { if (value) setForm((prev) => ({ ...prev, type: value as AccountType, subType: "", referralPartnerAccountId: value === "Partner" ? "" : prev.referralPartnerAccountId })); }} getKey={(option) => option.value} getLabel={(option) => option.value} />
              </div>
              <div>
                <label style={labelStyle}>Sub-Type</label>
                <CRMPicker options={(ACCOUNT_TYPE_SUBTYPES[form.type] ?? []).map((option) => ({ value: option }))} value={form.subType || null} onChange={(value) => setForm((prev) => ({ ...prev, subType: value ?? "" }))} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="None" clearable />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <CRMPicker options={categoryOptions.map((option) => ({ value: option }))} value={form.category || null} onChange={(value) => setForm((prev) => ({ ...prev, category: value ?? "" }))} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="None" clearable />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <CRMPicker
                  options={cityOptions.map((option) => ({ value: option }))}
                  value={form.operatingMarket}
                  onChange={(value) => {
                    if (value) setForm((prev) => ({ ...prev, operatingMarket: value }));
                  }}
                  getKey={(option) => option.value}
                  getLabel={(option) => option.value}
                  placeholder="Select city..."
                  searchPlaceholder="Search cities..."
                  creatable
                  onCreateNew={(searchText) => {
                    const next = searchText.trim();
                    if (!next) return;
                    setForm((prev) => ({ ...prev, operatingMarket: next }));
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Website</label>
                <input value={form.website} onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Industry / Sector</label>
                <CRMPicker options={industryOptions.map((option) => ({ value: option }))} value={form.industry || null} onChange={(value) => setForm((prev) => ({ ...prev, industry: value ?? "" }))} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="None" clearable />
              </div>
              <div>
                <label style={labelStyle}>Relationship Stage</label>
                <CRMPicker options={relationshipStageOptions.map((option) => ({ value: option }))} value={form.relationshipStage || null} onChange={(value) => setForm((prev) => ({ ...prev, relationshipStage: (value ?? "") as RelationshipStage | "" }))} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="None" clearable />
              </div>
              <div>
                <label style={labelStyle}>Venue Name</label>
                <input value={form.venueName} onChange={(event) => setForm((prev) => ({ ...prev, venueName: event.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Street</label>
                <input value={form.street} onChange={(event) => setForm((prev) => ({ ...prev, street: event.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input value={form.city} onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input value={form.state} onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ZIP</label>
                <input value={form.zip} onChange={(event) => setForm((prev) => ({ ...prev, zip: event.target.value }))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} rows={4} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              </div>
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 12 }}>
              <button onClick={() => { setEditing(false); setForm(accountEditState(account)); }} className="rounded-lg" style={secondaryButtonStyle}>Cancel</button>
              <button onClick={save} disabled={saving} className="rounded-lg" style={primaryButtonStyle}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        )}

        <DrawerSection title="Account Overview">
          <div style={overviewSurfaceStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <OverviewField label="Owner">
                <OwnerSelect value={account.owner} compact onChange={(owner) => void patchAccountOverview({ owner: (owner || undefined) as Account["owner"] | undefined })} />
              </OverviewField>
              <OverviewField label="Record Type">
                <OverviewSelect value={account.type} options={accountTypeOptions} onChange={(type) => void patchAccountOverview({ type, subType: undefined, referralPartnerAccountId: type === "Partner" ? "" : account.referralPartnerAccountId })} />
              </OverviewField>
              <OverviewField label="Sub-Type">
                <OptionalOverviewSelect value={account.subType} options={ACCOUNT_TYPE_SUBTYPES[account.type] ?? []} onChange={(subType) => void patchAccountOverview({ subType })} placeholder="Select subtype..." />
              </OverviewField>
              <OverviewField label="Category">
                <OptionalOverviewSelect value={account.category} options={categoryOptions} onChange={(category) => void patchAccountOverview({ category })} placeholder="Select category..." />
              </OverviewField>
              <OverviewField label="Industry">
                <OptionalOverviewSelect value={account.industry} options={industryOptions} onChange={(industry) => void patchAccountOverview({ industry })} placeholder="Select industry..." />
              </OverviewField>
              <OverviewField label="City">
                <CRMPicker
                  options={cityOptions.map((option) => ({ value: option }))}
                  value={account.operatingMarket}
                  onChange={(operatingMarket) => void patchAccountOverview({ operatingMarket: operatingMarket ?? account.operatingMarket })}
                  getKey={(option) => option.value}
                  getLabel={(option) => option.value}
                  size="sm"
                  placeholder="Select city..."
                  searchPlaceholder="Search cities..."
                  creatable
                  onCreateNew={(searchText) => {
                    const next = searchText.trim();
                    if (!next) return;
                    void patchAccountOverview({ operatingMarket: next });
                  }}
                />
              </OverviewField>
              <OverviewField label="Relationship">
                <OptionalOverviewSelect value={account.relationshipStage} options={relationshipStageOptions} onChange={(relationshipStage) => void patchAccountOverview({ relationshipStage })} placeholder="Select relationship..." />
              </OverviewField>
              <OverviewField label="Account Tier">
                <OptionalOverviewSelect value={account.tier} options={ACCOUNT_TIERS} onChange={(tier) => void patchAccountOverview({ tier })} placeholder="Select tier..." />
              </OverviewField>
              <div style={{ ...overviewFieldStyle, gridColumn: "1 / -1" }}>
                <div style={overviewLabelStyle}>Interests</div>
                <InterestChipPicker selected={accountInterestTags} onToggle={(tag) => void toggleInterest(tag)} hiddenCategories={["Player Level"]} />
                {accountInterestTags.length === 0 ? <div style={{ ...overviewMutedStyle, marginTop: 8 }}>Click a chip to tag this account.</div> : null}
              </div>
              <div style={{ ...overviewFieldStyle, gridColumn: "1 / -1" }}>
                <div style={overviewLabelStyle}>Description</div>
                <InlineEditText
                  label=""
                  value={account.notes ?? ""}
                  placeholder="Add description"
                  multiline
                  color="#F8FAFC"
                  onSave={(notes) => patchAccountOverview({ notes: notes || undefined })}
                />
              </div>
              <div style={{ ...overviewFieldStyle, gridColumn: "1 / -1" }}>
                <div style={overviewLabelStyle}>Address</div>
                <AccountAddressEditor
                  account={account}
                  draft={addressDraft}
                  editing={addressEditing}
                  saving={addressSaving}
                  onChange={(patch) => setAddressDraft((prev) => ({ ...prev, ...patch }))}
                  onEdit={() => setAddressEditing(true)}
                  onCancel={() => {
                    setAddressEditing(false);
                    setAddressDraft({
                      venueName: account.address?.venueName ?? "",
                      street: account.address?.street ?? "",
                      city: account.address?.city ?? "",
                      state: account.address?.state ?? "",
                      zip: account.address?.zip ?? "",
                    });
                  }}
                  onSave={() => void saveAddressOverview()}
                />
              </div>
            </div>
          </div>
        </DrawerSection>

        <AccountLinkedInIntelSection account={localAccount} />

        <RelatedContactsSection contacts={linkedContacts} router={router} />
        <RelatedOpportunitiesSection opportunities={relatedOpportunities} router={router} onOwnerChange={patchOpportunityOwner} />
        <AccountAssetsSection account={localAccount} onRefresh={onRefresh} />

        <DrawerSection title={`All Emails (${emailActivities.length})`}>
          {emailActivities.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No email activity for this account.</p>
          ) : (
            <>
              {(() => {
                // Group emails by contact
                const byContact: Record<string, typeof emailActivities> = {};
                for (const e of emailActivities) {
                  const key = e.contactId || "unknown";
                  if (!byContact[key]) byContact[key] = [];
                  byContact[key].push(e);
                }
                return Object.entries(byContact).map(([contactId, emails]) => {
                  const contact = contacts.find((c) => c.id === contactId);
                  return (
                    <div key={contactId} style={{ marginBottom: 12 }}>
                      {contact && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontWeight: 600 }}>
                          From contact: {contact.name}
                        </div>
                      )}
                      <EmailActivityTimeline activities={emails} />
                    </div>
                  );
                });
              })()}
            </>
          )}
        </DrawerSection>

        <DrawerSection title={`Activity Timeline (${timelineGroups.length})`}>
          {timelineGroups.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No account activity yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {timelineGroups.map((group) => {
                if (group.kind === "single") {
                  const activity = group.singleActivity!;
                  const relatedContact = contacts.find((contact) => contact.id === activity.contactId);
                  const isExpandable = activity.type === "Email" || activity.type === "Inbound Lead";
                  const expanded = expandedMeetingKeys.has(group.key);
                  const onHeaderClick = () => {
                    if (!isExpandable) return;
                    toggleMeetingExpanded(group.key);
                    if (activity.type === "Email") void ensureEmailThreadsLoaded();
                    if (activity.type === "Inbound Lead") void ensureInboundLeadsLoaded();
                  };
                  return (
                    <div key={group.key} data-activity-id={activity.id} className="rounded-lg" style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", transition: "box-shadow 200ms ease" }}>
                      <div
                        onClick={isExpandable ? onHeaderClick : undefined}
                        style={isExpandable ? { cursor: "pointer", borderRadius: 6, margin: "-4px -6px", padding: "4px 6px" } : undefined}
                        onMouseEnter={isExpandable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; } : undefined}
                        onMouseLeave={isExpandable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; } : undefined}
                      >
                        <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}>
                          <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                            {isExpandable ? (
                              <span
                                aria-label={expanded ? "Collapse activity" : "Expand activity"}
                                role="button"
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}
                              >
                                <RacketIcon expanded={expanded} size={12} color="var(--color-client-text-dim)" />
                              </span>
                            ) : null}
                            <span style={{ fontSize: 14 }}>{activityTypeIcon(activity.type)}</span>
                            <span className="rounded" style={{ padding: "1px 6px", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: `${activityTypeColor(activity.type)}20`, color: activityTypeColor(activity.type) }}>
                              {activity.type}
                            </span>
                            {relatedContact && (
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/contacts?select=${relatedContact.id}`); }}
                                style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#dadadb", cursor: "pointer", whiteSpace: "nowrap" }}
                              >
                                {relatedContact.name}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                            {activitySourceBadge(activity.source)}
                            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>{formatRelativeTime(activity.occurredAt)}</span>
                          </div>
                        </div>
                      </div>
                      {isExpandable && expanded ? (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          {(() => {
                            if (activity.type === "Email") {
                              const thread = activity.externalRef ? emailsById.get(activity.externalRef) : undefined;
                              if (thread) {
                                return (
                                  <EmailThreadDetail
                                    email={thread}
                                    contacts={contacts}
                                    accounts={accounts}
                                    compact
                                  />
                                );
                              }
                              return renderFormattedContent(activity.content);
                            }
                            if (activity.type === "Inbound Lead") {
                              const lead = activity.externalRef ? leadsById.get(activity.externalRef) : undefined;
                              if (lead) {
                                return (
                                  <InboundLeadDetail
                                    lead={lead}
                                    contacts={contacts}
                                    accounts={accounts}
                                    compact
                                  />
                                );
                              }
                              return renderFormattedContent(activity.content);
                            }
                            return renderFormattedContent(activity.content);
                          })()}
                        </div>
                      ) : (
                        <div>{renderFormattedContent(activity.content)}</div>
                      )}
                      {activity.meetingTitle && (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-client-text-dim)" }}>{activity.meetingTitle}</div>
                      )}
                    </div>
                  );
                }

                const rep = group.representative;
                const expanded = expandedMeetingKeys.has(group.key);
                const meetingTitle = rep.meetingTitle || "Untitled meeting";
                return (
                  <div
                    key={group.key}
                    className="rounded-lg"
                    style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div
                      onClick={() => toggleMeetingExpanded(group.key)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                      style={{ cursor: "pointer", borderRadius: 6, margin: "-4px -6px", padding: "4px 6px", background: "transparent", transition: "background 120ms ease" }}
                    >
                      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}>
                        <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                          <span
                            aria-label={expanded ? "Collapse meeting" : "Expand meeting"}
                            role="button"
                            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, flexShrink: 0 }}
                          >
                            <RacketIcon expanded={expanded} size={12} color="var(--color-client-text-dim)" />
                          </span>
                          <span style={{ fontSize: 14 }}>{activityTypeIcon("Meeting")}</span>
                          <span className="rounded" style={{ padding: "1px 6px", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: `${activityTypeColor("Meeting")}20`, color: activityTypeColor("Meeting") }}>
                            Meeting
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                            {meetingTitle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                          {activitySourceBadge(rep.source)}
                          <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>{formatRelativeTime(rep.occurredAt)}</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6, fontSize: 11 }}>
                        <span style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-client-text-dim)" }}>Attendees:</span>
                        {group.attendees.length === 0 ? (
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>—</span>
                        ) : (
                          group.attendees.map((attendee, idx) => {
                            const isLinked = !!attendee.id && linkedContacts.some((c) => c.id === attendee.id);
                            const isLast = idx === group.attendees.length - 1;
                            if (isLinked) {
                              return (
                                <span key={`${group.key}-att-${idx}`} style={{ fontSize: 11 }}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); router.push(`/contacts?select=${attendee.id}`); }}
                                    style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#dadadb", cursor: "pointer", textDecoration: "none" }}
                                  >
                                    {attendee.name}
                                  </button>
                                  {!isLast && <span style={{ color: "rgba(255,255,255,0.4)" }}>,</span>}
                                </span>
                              );
                            }
                            return (
                              <span key={`${group.key}-att-${idx}`} style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                                {attendee.name}{!isLast ? "," : ""}
                              </span>
                            );
                          })
                        )}
                      </div>
                      {(rep.durationMinutes || rep.recordingLink) && (
                        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--color-client-text-dim)" }}>
                          {rep.durationMinutes && <span>{rep.durationMinutes} min</span>}
                          {rep.recordingLink && (
                            <a
                              href={rep.recordingLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: "#dadadb", fontSize: 10, textDecoration: "none" }}
                            >
                              Recording
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    {expanded && (() => {
                      const briefing = rep.externalRef ? briefingsById.get(rep.externalRef) : undefined;
                      return (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          {briefing ? (
                            <MeetingBriefingDetail
                              meeting={briefing}
                              actionItems={briefingActionItems}
                              onSyncActionItems={fetchBriefingActionItems}
                              contacts={contacts}
                              accounts={accounts}
                              relatedAccountId={account.id}
                              relatedContactId={rep.contactId || undefined}
                              compact
                            />
                          ) : briefingsLoading ? (
                            <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Loading briefing…</div>
                          ) : (
                            renderFormattedContent(rep.content)
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </DrawerSection>

        <CrmRecordFooter rawId={account.id} entityType="account" />
      </div>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--color-client-text-dim)",
  display: "block",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(218,218,219,0.15)",
  border: "1px solid rgba(218,218,219,0.25)",
  color: "#dadadb",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 11,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "var(--color-client-text-dim)",
  cursor: "pointer",
};

interface AccountsViewProps {
  embedded?: boolean;
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
  onConsoleRefresh?: () => Promise<CRMConsolePayload | null> | CRMConsolePayload | null | void;
}

export function AccountsView({
  embedded = false,
  consoleData,
  consoleLoading = false,
  onConsoleRefresh,
}: AccountsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useResponsive();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  type AccountRow = { account: Account; linkedContacts: Contact[]; lastActivity: CRMActivity | null; openOpportunities: Opportunity[]; overdueOpportunities: Opportunity[] };
  const accountStdCols: StandardTableColumn<AccountRow>[] = useMemo(() => [
    { key: "_select", label: "", sortable: false, filterable: false, minWidth: 36, maxWidth: 36, getValue: () => "", render: (r) => <SelectCell checked={selectedIds.has(r.account.id)} onChange={(checked) => setSelectedIds((prev) => { const next = new Set(prev); if (checked) next.add(r.account.id); else next.delete(r.account.id); return next; })} /> },
    {
      key: "name",
      label: "Name",
      getValue: (r) => r.account?.name || "Unknown",
      render: (r) => {
        const logo = r.account ? getAccountLogoAsset(r.account) : undefined;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", display: "inline-flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 3 }} />
              ) : (
                <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8" }}>{(r.account?.name || "?").slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <span style={{ fontWeight: 600, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.account?.name || "Unknown"}</span>
          </span>
        );
      },
    },
    {
      key: "owner",
      label: "Owner",
      getValue: (r) => isCanonicalOwner(r.account?.owner) ? r.account.owner : "",
      render: (r) => <OwnerBadge owner={r.account?.owner} compact />,
    },
    { key: "type", label: "Type", getValue: (r) => r.account?.type || "\u2014", render: (r) => <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "rgba(218,218,219,0.12)", color: "#dadadb" }}>{r.account?.type || "\u2014"}</span> },
    { key: "subType", label: "Sub-Type", getValue: (r) => r.account?.subType || "\u2014" },
    { key: "market", label: "City", getValue: (r) => r.account?.operatingMarket || "\u2014" },
    { key: "website", label: "Website", getValue: (r) => r.account?.website || "\u2014", render: (r) => r.account?.website ? <a href={r.account.website.startsWith("http") ? r.account.website : `https://${r.account.website}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#60a5fa", textDecoration: "none", fontSize: 12 }}>{r.account.website}</a> : <span style={{ color: "rgba(255,255,255,0.3)" }}>\u2014</span> },
    { key: "linkedin", label: "LinkedIn", getValue: (r) => r.account?.linkedinUrl || "\u2014", render: (r) => r.account?.linkedinUrl ? <a href={r.account.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#60a5fa", textDecoration: "none", fontSize: 12 }}>Company page</a> : <span style={{ color: "rgba(255,255,255,0.3)" }}>\u2014</span> },
    { key: "employeeRange", label: "Employees", getValue: (r) => r.account?.employeeRange || "\u2014" },
    { key: "linkedinIndustry", label: "LinkedIn Industry", getValue: (r) => r.account?.linkedinIndustry || r.account?.industry || "\u2014" },
    { key: "contacts", label: "Contacts Count", getValue: (r) => String(r.linkedContacts?.length ?? 0).padStart(4, "0"), render: (r) => <span>{r.linkedContacts?.length ?? 0}</span> },
    { key: "openOpps", label: "Open Opps", getValue: (r) => String(r.openOpportunities.length).padStart(4, "0"), render: (r) => <span style={{ color: r.openOpportunities.length > 0 ? "#C4C9D1" : "var(--color-client-text-dim)", fontWeight: 650 }}>{r.openOpportunities.length}</span> },
    { key: "lastActivity", label: "Last Activity", getValue: (r) => r.lastActivity?.occurredAt ?? "", render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{r.lastActivity ? formatRelativeTime(r.lastActivity.occurredAt) : "\u2014"}</span> },
    { key: "nextStepHealth", label: "Next Step", getValue: (r) => String(r.overdueOpportunities.length).padStart(4, "0"), render: (r) => <span style={{ fontSize: 12, color: r.overdueOpportunities.length > 0 ? "#F87171" : r.openOpportunities.length > 0 ? "#34D399" : "var(--color-client-text-dim)" }}>{r.overdueOpportunities.length > 0 ? `${r.overdueOpportunities.length} overdue` : r.openOpportunities.length > 0 ? "Covered" : "\u2014"}</span> },
    { key: "createdAt", label: "Created", getValue: (r) => r.account?.createdAt ?? "", render: (r) => <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{formatDate(r.account?.createdAt)}</span> },
  ], [selectedIds]);

  const applyConsoleData = useCallback((payload: CRMConsolePayload) => {
    setAccounts(normalizeAccounts(payload.accounts));
    setContacts(payload.contacts);
    setActivities(payload.activities);
    setOpportunities(payload.opportunities);
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
      const [accountsRes, contactsRes, activitiesRes, opportunitiesRes] = await Promise.all([
        fetch("/api/crm/accounts", { cache: "no-store" }),
        fetch("/api/crm/contacts", { cache: "no-store" }),
        fetch("/api/crm/activities", { cache: "no-store" }),
        fetch("/api/crm/opportunities", { cache: "no-store" }),
      ]);

      if (accountsRes.ok) setAccounts(normalizeAccounts(await accountsRes.json()));
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (activitiesRes.ok) setActivities(await activitiesRes.json());
      if (opportunitiesRes.ok) setOpportunities(await opportunitiesRes.json());
    } catch {
      // API unavailable — data stays empty
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

  useEffect(() => {
    if (loading) return;
    const selectId = searchParams.get("select");
    if (selectId) {
      const rawId = fromDisplayId(selectId, accounts.map((a) => a.id), "account");
      const exists = accounts.some((account) => account.id === rawId);
      if (exists) setSelectedId(rawId);
    }
  }, [accounts, loading, searchParams]);

  const accountMetrics = useMemo(() => {
    return accounts.map((account) => {
      const linkedContacts = getLinkedContacts(account.id, contacts);
      const lastActivity = getAccountLastActivity(account.id, activities, contacts);
      const openOpportunities = opportunities.filter((opportunity) => opportunity.accountId === account.id && isOpenOpportunity(opportunity));
      return {
        account,
        linkedContacts,
        lastActivity,
        openOpportunities,
        overdueOpportunities: openOpportunities.filter(isOverdueOpportunity),
      };
    });
  }, [accounts, contacts, activities, opportunities]);

  const filteredAccounts = useMemo(() => {
    const lower = search.trim().toLowerCase();
    if (!lower) return accountMetrics;
    return accountMetrics.filter(({ account, linkedContacts }) =>
      (account?.name ?? "").toLowerCase().includes(lower) ||
      (account?.type ?? "").toLowerCase().includes(lower) ||
      (account?.subType ?? "").toLowerCase().includes(lower) ||
      (account?.operatingMarket ?? "").toLowerCase().includes(lower) ||
      (account?.website ?? "").toLowerCase().includes(lower) ||
      (account?.linkedinUrl ?? "").toLowerCase().includes(lower) ||
      (account?.linkedinIndustry ?? "").toLowerCase().includes(lower) ||
      (account?.employeeRange ?? "").toLowerCase().includes(lower) ||
      (account?.category ?? "").toLowerCase().includes(lower) ||
      (linkedContacts ?? []).some((contact) => (contact?.name ?? "").toLowerCase().includes(lower))
    );
  }, [accountMetrics, search]);
  const lens = searchParams.get("lens") || "all";
  const lensedAccounts = useMemo(() => {
    if (lens === "companies") return filteredAccounts.filter((r) => r.account.recordType === "company");
    if (lens === "person") return filteredAccounts.filter((r) => r.account.recordType === "person_account");
    if (lens === "strategic") return filteredAccounts.filter((r) => r.account.tier === "strategic" || r.account.tier === "enterprise" || r.account.relationshipStage === "Strategic");
    if (lens === "mine") return filteredAccounts.filter((r) => r.account.owner === "Alex");
    if (lens === "no-activity") return filteredAccounts.filter((r) => {
      if (!r.lastActivity?.occurredAt) return true;
      const days = Math.floor((Date.now() - new Date(r.lastActivity.occurredAt).getTime()) / 86400000);
      return Number.isFinite(days) && days > 30;
    });
    if (lens === "missing-owner") return filteredAccounts.filter((r) => !r.account.owner);
    if (lens === "missing-website") return filteredAccounts.filter((r) => !r.account.website && !r.account.domain);
    if (lens === "no-linked-contacts") return filteredAccounts.filter((r) => r.linkedContacts.length === 0);
    if (lens === "open-opportunities") return filteredAccounts.filter((r) => r.openOpportunities.length > 0);
    if (lens === "needs-next-step") return filteredAccounts.filter((r) => (
      r.overdueOpportunities.length > 0 ||
      r.openOpportunities.some((opportunity) => !opportunity.nextStep?.trim())
    ));
    return filteredAccounts;
  }, [filteredAccounts, lens]);

  const patchSelected = useCallback(async (patchFor: (account: Account) => Partial<Account>) => {
    const rows = Array.from(selectedIds).map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a);
    const results = await Promise.all(rows.map(async (account) => {
      try {
        const res = await fetch("/api/crm/accounts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: account.id, ...patchFor(account) }) });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedIds(new Set());
    await fetchData();
  }, [accounts, fetchData, selectedIds]);

  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch("/api/crm/accounts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedIds(new Set());
    await fetchData();
  }, [fetchData, selectedIds]);

  const createOpportunityForSelectedAccount = useCallback(() => {
    const id = Array.from(selectedIds)[0];
    const account = accounts.find((a) => a.id === id);
    if (!account || selectedIds.size !== 1) return;
    const status = normalizeAccountLifecycleStage(account.lifecycleStage);
    if ((status === "new" || status === "outreach" || status === "engaged") && !window.confirm("Opportunities should usually be created after a qualified Meeting. Create anyway?")) {
      return;
    }
    const linked = contacts.filter((contact) => contact.accountId === id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("object", "opportunities");
    params.set("select", "new");
    params.set("prefill_account", account.id);
    if (linked.length === 1) params.set("prefill_contact", linked[0].id);
    else params.delete("prefill_contact");
    setSelectedIds(new Set());
    router.push(`/contacts?${params.toString()}`);
  }, [accounts, contacts, router, searchParams, selectedIds]);

  const allSelected = lensedAccounts.length > 0 && selectedIds.size === lensedAccounts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < lensedAccounts.length;
  const bulkBarNode = useMemo(() => selectedIds.size > 0 ? (
    <BulkActionBar count={selectedIds.size} result={bulkResult} onClear={() => setSelectedIds(new Set())}>
      <BulkOwnerPrompt onPick={(owner) => void patchSelected(() => ({ owner: owner as Account["owner"] }))} />
      <BulkPicklistPrompt label="Update tier..." options={ACCOUNT_TIERS.map((tier) => ({ value: tier }))} onPick={(tier) => void patchSelected(() => ({ tier: tier as Account["tier"] }))} />
      <BulkPicklistPrompt label="Update status..." options={LIFECYCLE_STAGES.map((stage) => ({ value: stage, label: lifecycleStageLabel(stage) }))} onPick={(stage) => void patchSelected(() => ({ lifecycleStage: stage as Account["lifecycleStage"] }))} />
      <BulkInterestPrompt onPick={(tag) => void patchSelected((a) => ({ interests: Array.from(new Set([...(a.interests ?? []), tag])) }))} />
      <button type="button" disabled={selectedIds.size !== 1} onClick={() => createOpportunityForSelectedAccount()} style={{ ...bulkButtonStyle, opacity: selectedIds.size !== 1 ? 0.4 : 1 }}>Create Opportunity</button>
      <button type="button" onClick={() => void deleteSelected()} style={{ ...bulkButtonStyle, color: "#F87171" }}>Delete</button>
    </BulkActionBar>
  ) : null, [bulkResult, createOpportunityForSelectedAccount, deleteSelected, patchSelected, selectedIds]);
  useCRMBulkBar(bulkBarNode);

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === selectedId) ?? null, [accounts, selectedId]);
  const summary = useMemo(() => {
    const withActivity = accountMetrics.filter((item) => item.lastActivity).length;
    const totalContacts = accountMetrics.reduce((sum, item) => sum + item.linkedContacts.length, 0);
    return [
      { label: "Accounts", value: accounts.length, color: "#dadadb" },
      { label: "Linked Contacts", value: totalContacts, color: "#dadadb" },
      { label: "With Activity", value: withActivity, color: "#C4C9D1" },
      { label: "Cities", value: new Set(accounts.map((account) => account?.operatingMarket).filter(Boolean)).size, color: "#dadadb" },
    ];
  }, [accountMetrics, accounts]);

  const openAccount = useCallback((accountId: string) => {
    setSelectedId(accountId);
    const display = toDisplayId(accountId, "account");
    router.replace(embedded ? `/contacts?object=accounts&select=${display}` : `/accounts?select=${display}`);
  }, [router, embedded]);

  const closeAccount = useCallback(() => {
    setSelectedId(null);
    router.replace(embedded ? "/contacts?object=accounts" : "/accounts");
  }, [router, embedded]);

  return (
    <div className="fade-in-up" style={{ width: "100%", maxWidth: embedded ? "none" : 1320 }}>
      {!embedded && (
        <>
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
              CRM
            </span>
          </div>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.03em", marginBottom: 6 }}>
              Accounts
            </h1>
            <p style={{ fontSize: 14, color: "var(--color-client-text-secondary)" }}>
              Standalone account records with taxonomy, linked contacts, and relationship history.
            </p>
          </div>
        </>
      )}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 24 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search accounts, markets, websites..."
          className="rounded-lg"
          style={{
            width: isMobile ? "100%" : undefined,
            flex: "1 1 360px",
            maxWidth: embedded ? "none" : 420,
            padding: "9px 14px",
            fontSize: 13,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid var(--color-client-border)",
            color: "var(--color-client-text)",
            outline: "none",
          }}
        />
      </div>
      <LensToggleRow
        object="accounts"
        lenses={[
          { key: "all", label: "All" },
          { key: "mine", label: "My accounts" },
          { key: "strategic", label: "Strategic + Enterprise" },
          { key: "open-opportunities", label: "Open opportunities" },
          { key: "needs-next-step", label: "Needs next step" },
          { key: "no-activity", label: "No recent activity" },
          { key: "missing-owner", label: "Missing owner" },
          { key: "missing-website", label: "Missing website" },
          { key: "no-linked-contacts", label: "No contacts" },
          { key: "companies", label: "Companies" },
          { key: "person", label: "Person Accounts" },
        ]}
      />


      <div className={embedded ? "crm-fluid-grid-compact" : "grid grid-cols-2 md:grid-cols-4 gap-3"} style={{ marginBottom: 24 }}>
        {summary.map((item) => (
          <div key={item.label} className="rounded-xl" style={{ padding: "16px 18px", background: "var(--color-client-bg-card)", border: "1px solid var(--color-client-border)" }}>
            <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
              {item.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: item.color, letterSpacing: "-0.03em" }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 12 }}>
        {loading ? "Loading accounts..." : `${lensedAccounts.length} account${lensedAccounts.length !== 1 ? "s" : ""}`}
      </div>

      {lensedAccounts.length === 0 && !loading ? (
        <div className="rounded-xl flex items-center justify-center" style={{ padding: "48px 24px", background: "var(--color-client-bg-card)", border: "1px solid var(--color-client-border)", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--color-client-text-dim)" }}>No accounts match the current search.</p>
        </div>
      ) : isMobile ? (
        <div className="flex flex-col gap-3">
          {lensedAccounts.map(({ account, linkedContacts, lastActivity }) => (
            <button
              key={account.id}
              onClick={() => openAccount(account.id)}
              className="rounded-lg"
              style={{ width: "100%", textAlign: "left", padding: "14px 16px", background: "var(--color-client-bg-card)", border: "1px solid var(--color-client-border)", cursor: "pointer" }}
            >
              <div className="flex items-center justify-between gap-3" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)" }}>{account?.name || "Unknown"}</span>
                <span className="rounded" style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, background: "rgba(218,218,219,0.12)", color: "#dadadb" }}>{account?.type || "Unknown"}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)", marginBottom: 6 }}>
                {[account?.subType, account?.operatingMarket].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{linkedContacts.length} contacts</span>
                <span style={{ fontSize: 11, color: lastActivityColor(lastActivity?.occurredAt) }}>
                  {lastActivity ? formatRelativeTime(lastActivity.occurredAt) : "No activity"}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <StandardTable<AccountRow>
          tableKey="accounts-main"
          columns={accountStdCols}
          data={lensedAccounts}
          toolbar={<label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--color-client-text-dim)" }}><SelectAllBox checked={allSelected} indeterminate={someSelected} onChange={(checked) => setSelectedIds(checked ? new Set(lensedAccounts.map((r) => r.account.id)) : new Set())} />Select all</label>}
          getRowKey={(r) => r.account.id}
          defaultSortKey="lastActivity"
          defaultSortDir="desc"
          onRowClick={(r) => openAccount(r.account.id)}
          selectedRowKey={selectedId ?? undefined}
          emptyMessage="No accounts match the current filters"
        />
      )}

      {selectedAccount && typeof document !== "undefined" && createPortal(
        <AccountDrawerErrorBoundary key={`boundary-${selectedAccount.id}`} onClose={closeAccount}>
          <AccountDrawer
            key={selectedAccount.id}
            account={selectedAccount}
            contacts={contacts}
            accounts={accounts}
            activities={activities}
            opportunities={opportunities}
            onClose={closeAccount}
            onRefresh={fetchData}
          />
        </AccountDrawerErrorBoundary>,
        document.body
      )}

      <div style={{ marginTop: 12, fontSize: 10, color: "var(--color-client-text-dim)", opacity: 0.7 }}>
        Tip: open an account from a contact drawer to jump directly here.
      </div>
    </div>
  );
}
