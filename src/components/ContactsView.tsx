"use client";
import { StandardTable, type StandardTableColumn } from "@/components/StandardTable";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import RacketIcon from "@/components/RacketIcon";
import { InspectableValue, AsteriskNote } from "@/components/ProvenanceSystem";
import { CONTACTS, CONTACT_STAGES, FILTER_PRESETS, PRIORITY_CONFIG, type Contact, type ContactStage, type ContactPriority, type FilterPreset, type FollowUpState, type Provenance, type HealthStatus, type CRMNote, SEED_CRM_NOTES, computeTrustScore, computeTrustDeductions, computeHealthStatus, computeHealthReason, computeNextBestAction, computeStalenessFlags } from "@/data/contacts";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_SUBTYPES, normalizeAccountType, type Account, type AccountType, type AccountSubType, type OperatingMarket } from "@/data/accounts";
import { fromDisplayId, toDisplayId } from "@/lib/crm/displayId";
import { CopyableField, CopyableText } from "@/components/CopyableField";
import { InlineEditText, InlineEditEnum } from "@/components/InlineEdit";
import { type CRMActivity } from "@/data/crm-activities";
import { type Opportunity } from "@/data/opportunities";
import { useResponsive } from "@/lib/useMediaQuery";
import { renderInlineMarkdown } from "@/lib/renderMarkdown";
import EmailActivityTimeline from "@/components/crm/EmailActivityTimeline";
import { useCRMBulkBar } from "@/components/CRMShell";
import { BulkActionBar, BulkInterestPrompt, BulkOwnerPrompt, BulkPicklistPrompt, bulkButtonStyle, InterestChipPicker, LensToggleRow, LineageChips, OwnerBadge, OwnerSelect, SelectAllBox, SelectCell } from "@/components/crm/FunnelPhase2";
import { CrmActionBar, CrmDrawerSection, CrmNextBestActionPanel, CrmRecordFooter, CrmRecordHeader, CrmRecordPath, crmActionButtonStyle, crmDangerActionButtonStyle } from "@/components/crm/CrmRecordLayout";
import type { CRMConsolePayload } from "@/lib/crm/consoleTypes";
import { CRMFilterDropdown, CRMPicker } from "@/components/CRMPicker";
import { isCRMOwner } from "@/lib/crm/owners";


/* ── Error Boundary for Contact/Account Drawer ── */
/* ── Contact normalizer (defensive against missing fields from API) ── */
function normalizeContacts(raw: unknown[]): Contact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === "object" && !Array.isArray(c))
    .filter(c => typeof c.id === "string" && c.id && typeof c.name === "string" && c.name)
    .map(c => ({
      ...(c as unknown as Contact),
      name: String(c.name ?? "Unknown"),
      company: typeof c.company === "string" ? c.company : undefined,
      title: typeof c.title === "string" ? c.title : undefined,
      phone: typeof c.phone === "string" ? c.phone : undefined,
      owner: isCRMOwner(c.owner) ? c.owner : undefined,
      notes: typeof c.notes === "string" ? c.notes : undefined,
      accountId: typeof c.accountId === "string" ? c.accountId : undefined,
      emails: Array.isArray(c.emails) ? (c.emails as unknown[]).filter((e): e is string => typeof e === "string") : [],
      tags: Array.isArray(c.tags) ? (c.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
      interactions: Array.isArray(c.interactions) ? c.interactions as Contact["interactions"] : [],
      fieldProvenance: (c.fieldProvenance && typeof c.fieldProvenance === "object" && Object.keys(c.fieldProvenance as object).length > 0) ? c.fieldProvenance as Contact["fieldProvenance"] : undefined,
      followUpState: (typeof c.followUpState === "string" ? c.followUpState : "none") as FollowUpState,
      provenance: (typeof c.provenance === "string" ? c.provenance : "imported") as Provenance,
      source: (typeof c.source === "string" ? c.source : "Unknown"),
      stage: (typeof c.stage === "string" ? c.stage : "New") as ContactStage,
      priority: (typeof c.priority === "string" && ["low", "medium", "high", "critical"].includes(c.priority)) ? c.priority as ContactPriority : undefined,
    }));
}

class DrawerErrorBoundary extends React.Component<{ children: React.ReactNode; onClose: () => void }, { hasError: boolean; error: string }> {
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

/* ── Activity types & helpers ── */

interface Activity {
  id: string;
  text: string;
  mentions: string[]; // contact names mentioned
  timestamp: number;
  provenance: Provenance;
}

const ACTIVITY_STORAGE_KEY = "client-crm-activities";

function loadActivities(): Activity[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveActivities(activities: Activity[]) {
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(activities));
  } catch {
    /* Safari can deny storage access; local activity cache is non-critical. */
  }
}

function seedActivities(): Activity[] {
  const now = Date.now();
  const hour = 3600000;
  const day = 86400000;
  return [
    {
      id: "seed-1",
      text: "Called @Rafael Takasu about Season 4 timeline. He confirmed budget approval.",
      mentions: ["Rafael Takasu"],
      timestamp: now - 2 * hour,
      provenance: "seeded",
    },
    {
      id: "seed-2",
      text: "Sent partnership deck to @Example Client Operator for ITF tournament series review.",
      mentions: ["Example Client Operator"],
      timestamp: now - 4 * hour,
      provenance: "seeded",
    },
    {
      id: "seed-3",
      text: "@Melody Ezerzer confirmed Alo Yoga Q4 event date: November 15.",
      mentions: ["Melody Ezerzer"],
      timestamp: now - 1 * day,
      provenance: "seeded",
    },
    {
      id: "seed-4",
      text: "Met with @Example Client Admin to review corporate events pipeline and pricing strategy.",
      mentions: ["Example Client Admin"],
      timestamp: now - 2 * day,
      provenance: "seeded",
    },
    {
      id: "seed-5",
      text: "Introduced @Jeff Sperling to new rating algorithm requirements for Spring League.",
      mentions: ["Jeff Sperling"],
      timestamp: now - 3 * day,
      provenance: "seeded",
    },
  ];
}

function formatExactTimestamp(d: Date): string {
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = mins < 10 ? `0${mins}` : mins;
  return `${month} ${day}, ${year} · ${h}:${m} ${ampm}`;
}

function formatRelativeTime(ts: number): string {
  const d = new Date(ts);
  const exact = formatExactTimestamp(d);
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  let relative = "";
  if (mins < 1) relative = "just now";
  else if (mins < 60) relative = `${mins}m ago`;
  else {
    const hours = Math.floor(mins / 60);
    if (hours < 24) relative = `${hours}h ago`;
    else {
      const days = Math.floor(hours / 24);
      if (days === 1) relative = "yesterday";
      else if (days < 7) relative = `${days}d ago`;
    }
  }
  return relative ? `${exact} (${relative})` : exact;
}

function renderNoteWithMentions(text: string) {
  const parts = text.split(/(@[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} style={{ color: "#dadadb", fontWeight: 600 }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Render content with proper paragraph spacing, section headers, and bullet lists */
function renderFormattedContent(content: string): React.ReactElement {
  // Split into lines, preserving blank lines as paragraph separators
  const lines = content.split(/\n/);
  const elements: React.ReactElement[] = [];
  let bulletBuffer: string[] = [];
  let keyIdx = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={`bl-${keyIdx++}`} style={{ margin: "6px 0", paddingLeft: 20, listStyleType: "disc" }}>
        {bulletBuffer.map((b, i) => (
          <li key={i} style={{ fontSize: 13, color: "var(--color-client-text)", lineHeight: 1.6, marginBottom: 3 }}>{renderInlineMarkdown(b)}</li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank line — flush bullets, add spacing
    if (trimmed === "") {
      flushBullets();
      continue;
    }

    // Bullet line: starts with -, *, •, or numbered like "1."
    const bulletMatch = trimmed.match(/^(?:[-*•]|\d+[.)]\s)/);
    if (bulletMatch) {
      const text = trimmed.replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, "");
      bulletBuffer.push(text);
      continue;
    }

    // If we had bullets queued, flush them before the next non-bullet line
    flushBullets();

    // Section header: line that looks like a heading (all caps, ends with colon, starts with ##/**, or known sections)
    const isHeader =
      /^#{1,3}\s+/.test(trimmed) ||
      /^\*\*[^*]+\*\*:?\s*$/.test(trimmed) ||
      /^(Executive Summary|Strategic Note|What['']?s Handled|Next Steps|Action Items|Key Takeaways|Agenda|Discussion|Overview|Summary|Notes|Transcript|Follow[- ]?Up|Decisions|Attendees|Participants):?\s*$/i.test(trimmed);

    if (isHeader) {
      const headerText = trimmed.replace(/^#{1,3}\s+/, "").replace(/^\*\*|\*\*$/g, "").replace(/:$/, "");
      elements.push(
        <div
          key={`hd-${keyIdx++}`}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-client-text)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            marginTop: elements.length > 0 ? 14 : 0,
            marginBottom: 4,
            paddingBottom: 3,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {renderInlineMarkdown(headerText)}
        </div>
      );
      continue;
    }

    // Regular paragraph line
    elements.push(
      <p key={`p-${keyIdx++}`} style={{ fontSize: 13, color: "var(--color-client-text)", lineHeight: 1.6, marginTop: elements.length > 0 ? 6 : 0, marginBottom: 0 }}>
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushBullets();

  return <div style={{ display: "flex", flexDirection: "column" }}>{elements}</div>;
}

function extractMentions(text: string, contacts: Contact[]): string[] {
  const names: string[] = [];
  const regex = /@([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const mentioned = match[1];
    if (contacts.some((c) => c.name === mentioned)) {
      names.push(mentioned);
    }
  }
  return names;
}

/* ── CRM Notes helpers ── */

const NOTES_STORAGE_KEY = "client-crm-notes";

function loadNotes(): CRMNote[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(NOTES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: CRMNote[]) {
  try {
    window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    /* Safari can deny storage access; local notes cache is non-critical. */
  }
}

function noteSourceLabel(source: CRMNote["source"]): string {
  if (source === "meetings-channel") return "Meetings Channel";
  if (source === "imported") return "Imported";
  return "Manual";
}

const NOTE_SOURCE_COLORS: Record<CRMNote["source"], { bg: string; text: string }> = {
  manual: { bg: "rgba(196,201,209,0.12)", text: "#C4C9D1" },
  "meetings-channel": { bg: "rgba(218,218,219,0.12)", text: "#dadadb" },
  imported: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
};

/* ── Account lookup helper ── */

function getAccountName(accountId: string | undefined, accounts: Account[]): string {
  if (!accountId || !Array.isArray(accounts)) return "\u2014";
  const acc = accounts.find(a => a?.id === accountId);
  return acc?.name || "\u2014";
}

/* ── Source badge ── */

const SOURCE_BADGE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  "Brand Inquiry Form": { bg: "rgba(218,218,219,0.12)", text: "#dadadb", label: "Form" },
  "Mission Control Build Form": { bg: "rgba(218,218,219,0.12)", text: "#dadadb", label: "Form" },
  "Mission Control Form": { bg: "rgba(218,218,219,0.12)", text: "#dadadb", label: "Form" },
  "Internal": { bg: "rgba(218,218,219,0.12)", text: "#dadadb", label: "Internal" },
  "Direct": { bg: "rgba(196,201,209,0.12)", text: "#C4C9D1", label: "Manual" },
  "ops@ inbox": { bg: "rgba(218,218,219,0.12)", text: "#dadadb", label: "Inbox" },
};

function SourceBadge({ source, provenance }: { source: string; provenance: Provenance }) {
  if (provenance === "imported") {
    return (
      <span
        className="rounded"
        style={{
          display: "inline-block",
          padding: "2px 6px",
          fontSize: 9,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          background: "rgba(245,158,11,0.12)",
          color: "#F59E0B",
        }}
      >
        Import
      </span>
    );
  }
  const cfg = SOURCE_BADGE_CONFIG[source];
  if (!cfg) {
    return (
      <span
        className="rounded"
        style={{
          display: "inline-block",
          padding: "2px 6px",
          fontSize: 9,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.45)",
        }}
      >
        Manual
      </span>
    );
  }
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "2px 6px",
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: cfg.bg,
        color: cfg.text,
      }}
    >
      {cfg.label}
    </span>
  );
}

/* ── Activity type icons ── */

function activityTypeIcon(type: CRMActivity["type"]): string {
  switch (type) {
    case "Call": return "\u260E";
    case "Note": return "\u270E";
    case "Email": return "\u2709";
    case "Meeting": return "\u{1F4C5}";
    case "Inbound Lead": return "\u{1F4E5}";
    case "Task": return "\u2611";
    case "Outreach": return "\u27A1";
    case "Follow-Up": return "\u{1F552}";
    default: return "\u25CF";
  }
}

function activityTypeColor(type: CRMActivity["type"]): string {
  switch (type) {
    case "Call": return "#dadadb";
    case "Note": return "#C4C9D1";
    case "Email": return "#dadadb";
    case "Meeting": return "#dadadb";
    case "Inbound Lead": return "#F59E0B";
    case "Task": return "rgba(255,255,255,0.5)";
    case "Outreach": return "#F472B6";
    case "Follow-Up": return "#FBBF24";
    default: return "rgba(255,255,255,0.35)";
  }
}

/* ── Activity source badge config ── */

const ACTIVITY_SOURCE_BADGE: Record<string, { bg: string; text: string }> = {
  Manual: { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.4)" },
  Import: { bg: "rgba(218,218,219,0.12)", text: "#dadadb" },
  Fireflies: { bg: "rgba(196,201,209,0.12)", text: "#C4C9D1" },
  Seeded: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B" },
  System: { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.35)" },
  "Form Sync": { bg: "rgba(218,218,219,0.12)", text: "#dadadb" },
};

function ActivitySourceBadge({ source }: { source: string }) {
  const cfg = ACTIVITY_SOURCE_BADGE[source] ?? ACTIVITY_SOURCE_BADGE.Manual;
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

/* ── Exact + relative time helper for activity dates ── */

function formatActivityExactTime(dateStr: string): string {
  const d = new Date(dateStr);
  return formatExactTimestamp(d);
}

function formatActivityRelativeTime(dateStr: string): string {
  const exact = formatActivityExactTime(dateStr);
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  let relative = "";
  if (mins < 1) relative = "just now";
  else if (mins < 60) relative = `${mins}m ago`;
  else {
    const hours = Math.floor(mins / 60);
    if (hours < 24) relative = `${hours}h ago`;
    else {
      const days = Math.floor(hours / 24);
      if (days === 1) relative = "1 day ago";
      else if (days < 7) relative = `${days} days ago`;
      else if (days < 14) relative = "1 week ago";
      else if (days < 30) relative = `${Math.floor(days / 7)} weeks ago`;
    }
  }
  return relative ? `${exact} (${relative})` : exact;
}

/** Generate a concise subject line for a CRM activity */
function generateActivitySubjectLine(a: CRMActivity, contactName?: string): string {
  // Fireflies meetings: use meeting title
  if (a.source === "Fireflies" && a.meetingTitle) {
    return `Fireflies Meeting — ${a.meetingTitle}`;
  }
  // If there's a meetingTitle for any type
  if (a.meetingTitle) {
    return `${a.type} — ${a.meetingTitle}`;
  }
  // Build from content: extract first meaningful phrase
  const content = a.content.replace(/\bSEEDED\.?\s*/gi, "").trim();
  // Try to extract a short summary from the first sentence
  const firstSentence = content.split(/[.\n]/).filter(s => s.trim())[0]?.trim() || "";
  // Build subject from type + contact + first phrase
  const parts: string[] = [a.type];
  if (contactName) parts.push(`with ${contactName}`);
  if (firstSentence.length > 0) {
    // Truncate first sentence to keep subject concise
    const shortSummary = firstSentence.length > 60 ? firstSentence.slice(0, 57) + "…" : firstSentence;
    parts.push(`— ${shortSummary}`);
  }
  return parts.join(" ");
}

/** Determine if an activity should be collapsed by default (content > 200 chars) */
function shouldCollapseActivity(a: CRMActivity): boolean {
  return a.content.length > 200;
}

function lastActivityColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 3) return "#dadadb";
  if (days <= 14) return "#FBBF24";
  return "#EF4444";
}

/* ── Recent Inbound Queue Strip (Sprint 4) ── */

function InboundQueueStrip({ contacts: allContacts }: { contacts: Contact[] }) {
  const inboundContacts = useMemo(() => {
    return allContacts
      .filter(c => c.provenance === "imported")
      .sort((a, b) => {
        const da = a.interactions[0]?.date ?? "";
        const db = b.interactions[0]?.date ?? "";
        return db.localeCompare(da);
      })
      .slice(0, 5);
  }, [allContacts]);

  if (inboundContacts.length === 0) return null;

  const statusColor = (c: Contact) => {
    if (c.followUpState === "follow-up-this-week") return "#F59E0B";
    if (c.stage === "New") return "#dadadb";
    return "#dadadb";
  };

  const statusLabel = (c: Contact) => {
    if (c.followUpState === "follow-up-this-week") return "Contacted";
    if (c.stage === "New") return "New";
    return "Qualified";
  };

  return (
    <div
      className="rounded-xl"
      style={{
        marginBottom: 24,
        border: "1px solid rgba(245,158,11,0.15)",
        background: "rgba(245,158,11,0.03)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid rgba(245,158,11,0.1)",
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "#F59E0B", fontWeight: 600 }}>
            Recent Inbound
          </span>
          <span
            className="rounded"
            style={{
              padding: "1px 5px",
              fontSize: 8,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              background: "rgba(245,158,11,0.15)",
              color: "#F59E0B",
            }}
          >
            RECENT
          </span>
        </div>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
          {inboundContacts.length} leads
        </span>
      </div>
        <div style={{ overflowX: "auto" }}>
        <div className="crm-fluid-grid" style={{ padding: "14px 18px" }}>
          {inboundContacts.map((c) => (
            <div
              key={c.id}
              className="rounded-lg"
              style={{
                padding: "12px 16px",
                background: "var(--color-client-surface)",
                border: "1px solid var(--color-client-border)",
                minWidth: 0,
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-client-text)" }}>{c.name}</span>
                <span
                  className="rounded"
                  style={{
                    padding: "1px 6px",
                    fontSize: 9,
                    fontWeight: 600,
                    background: `${statusColor(c)}20`,
                    color: statusColor(c),
                  }}
                >
                  {statusLabel(c)}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 4 }}>{c.company}</div>
              <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
                  {c.source === "Brand Inquiry Form" ? "Brand Inquiry" : "Corporate Event"}
                </span>
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
                  {c.interactions[0]?.date ?? ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── CRM Activity Timeline for Drawer (Sprint 2b) ── */

type QuickEntryType = "Note" | "Call" | "Outreach" | "Follow-Up";

function CRMActivityTimeline({ contactId, contactName, allActivities, onLogActivity, onUpdateActivity, onDeleteActivity }: { contactId: string; contactName?: string; allActivities: CRMActivity[]; onLogActivity?: (type: QuickEntryType, content: string) => void; onUpdateActivity?: (id: string, content: string) => Promise<void>; onDeleteActivity?: (id: string) => Promise<void> }) {
  const timelineSearchParams = useSearchParams();
  const jumpActivityId = timelineSearchParams.get("activity");
  const [activeForm, setActiveForm] = useState<QuickEntryType | null>(null);
  const [formText, setFormText] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const activities = useMemo(() => {
    return allActivities
      .filter(a => a.contactId === contactId)
      .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  }, [contactId, allActivities]);
  const visibleActivities = useMemo(() => activities.slice(0, visibleCount), [activities, visibleCount]);

  // Deep-link: when ?activity=<id> matches an activity in this timeline, ensure
  // it's expanded into view, scroll to it, and flash a brief highlight.
  useEffect(() => {
    if (!jumpActivityId) return;
    const targetIdx = activities.findIndex(a => a.id === jumpActivityId);
    if (targetIdx < 0) return;
    if (targetIdx + 1 > visibleCount) {
      setVisibleCount(prev => Math.max(prev, targetIdx + 1));
    }
    setExpandedIds(prev => {
      if (prev.has(jumpActivityId)) return prev;
      const next = new Set(prev);
      next.add(jumpActivityId);
      return next;
    });
    const timer = window.setTimeout(() => {
      const node = document.querySelector<HTMLElement>(`[data-activity-id="${jumpActivityId}"]`);
      if (!node) return;
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      const prev = node.style.boxShadow;
      node.style.boxShadow = "0 0 0 2px rgba(218,218,219,0.6)";
      window.setTimeout(() => { node.style.boxShadow = prev; }, 1400);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [jumpActivityId, activities, visibleCount]);

  const toggleForm = (type: QuickEntryType) => {
    if (activeForm === type) { setActiveForm(null); setFormText(""); setFormError(""); }
    else { setActiveForm(type); setFormText(""); setFormError(""); }
  };

  const handleSubmitForm = async () => {
    if (!formText.trim()) { setFormError("Content must not be empty"); return; }
    if (!onLogActivity || !activeForm) return;
    setFormError("");
    setSubmitting(true);
    await onLogActivity(activeForm, formText.trim());
    setFormText("");
    setActiveForm(null);
    setSubmitting(false);
  };

  const formConfig: Record<QuickEntryType, { placeholder: string; color: string; colorBg: string; label: string }> = {
    Note: { placeholder: "Write a note...", color: "#C4C9D1", colorBg: "rgba(196,201,209,0.15)", label: "Save Note" },
    Call: { placeholder: "Call summary...", color: "#dadadb", colorBg: "rgba(218,218,219,0.15)", label: "Log Call" },
    Outreach: { placeholder: "Outreach details...", color: "#F472B6", colorBg: "rgba(244,114,182,0.15)", label: "Log Outreach" },
    "Follow-Up": { placeholder: "Follow-up note...", color: "#FBBF24", colorBg: "rgba(251,191,36,0.15)", label: "Log Follow-Up" },
  };

  const quickButtons: { type: QuickEntryType; icon: string; label: string }[] = [
    { type: "Note", icon: "\u270E", label: "Add Note" },
    { type: "Call", icon: "\u260E", label: "Log Call" },
    { type: "Outreach", icon: "\u27A1", label: "Log Outreach" },
    { type: "Follow-Up", icon: "\u{1F552}", label: "Log Follow-Up" },
  ];

  return (
    <div style={{ marginBottom: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-client-text-dim)", marginBottom: 12, fontWeight: 600 }}>
        Activity Timeline ({activities.length})
      </h3>

      {/* Quick Action Bar */}
      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 12 }}>
        {quickButtons.map((qb) => {
          const isActive = activeForm === qb.type;
          const cfg = formConfig[qb.type];
          return (
            <button
              key={qb.type}
              onClick={() => toggleForm(qb.type)}
              className="rounded-lg"
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 500,
                background: isActive ? cfg.colorBg : "rgba(255,255,255,0.03)",
                border: isActive ? `1px solid ${cfg.color}40` : "1px solid rgba(255,255,255,0.08)",
                color: isActive ? cfg.color : "var(--color-client-text-dim)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 12 }}>{qb.icon}</span>
              {isActive ? "Cancel" : qb.label}
            </button>
          );
        })}
      </div>

      {/* Inline Quick Entry Form */}
      {activeForm && (
        <div className="rounded-lg" style={{ marginBottom: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: `1px solid ${formConfig[activeForm].color}30` }}>
          <textarea
            placeholder={formConfig[activeForm].placeholder}
            value={formText}
            onChange={(e) => { setFormText(e.target.value); setFormError(""); }}
            rows={2}
            autoFocus
            style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--color-client-text)", fontSize: 13, lineHeight: 1.5, resize: "none", fontFamily: "inherit" }}
          />
          {formError && <p style={{ fontSize: 11, color: "#EF4444", marginTop: 4 }}>{formError}</p>}
          <div className="flex justify-end" style={{ marginTop: 6 }}>
            <button
              disabled={submitting}
              onClick={handleSubmitForm}
              className="rounded-lg"
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, background: formText.trim() ? formConfig[activeForm].colorBg : "rgba(255,255,255,0.03)", border: `1px solid ${formConfig[activeForm].color}40`, color: formText.trim() ? formConfig[activeForm].color : "var(--color-client-text-dim)", cursor: formText.trim() ? "pointer" : "default" }}
            >
              {submitting ? "Saving..." : formConfig[activeForm].label}
            </button>
          </div>
        </div>
      )}

      {/* Activity Cards */}
      {activities.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-client-text-dim)", fontStyle: "italic", padding: "16px 0" }}>
          No activity yet. Add a note to start tracking this relationship.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {activities.length > 10 && (
            <p style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 2 }}>
              Showing {Math.min(visibleCount, activities.length)} of {activities.length} activities
            </p>
          )}
          {visibleActivities.map((a) => {
            const isEdited = a.updatedAt !== a.createdAt;
            const collapsible = shouldCollapseActivity(a);
            const isExpanded = !collapsible || expandedIds.has(a.id);
            const subjectLine = generateActivitySubjectLine(a, contactName);
            return (
              <div
                key={a.id}
                data-activity-id={a.id}
                className="rounded-lg"
                style={{ padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-client-border-subtle)", transition: "box-shadow 200ms ease" }}
              >
                {/* ── Subject line header row ── */}
                <div
                  onClick={collapsible ? () => toggleExpand(a.id) : undefined}
                  style={{ cursor: collapsible ? "pointer" : "default", userSelect: "none" }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: isExpanded ? 4 : 0 }}>
                    <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                      {collapsible && (
                        <RacketIcon expanded={isExpanded} size={14} color="var(--color-client-text-dim)" />
                      )}
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{activityTypeIcon(a.type)}</span>
                      <span
                        className="rounded"
                        style={{ fontSize: 9, padding: "1px 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: `${activityTypeColor(a.type)}20`, color: activityTypeColor(a.type), flexShrink: 0 }}
                      >
                        {a.type}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-client-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                        {subjectLine}
                      </span>
                      {isEdited && (
                        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontStyle: "italic", opacity: 0.6, flexShrink: 0 }}>edited</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2" style={{ flexShrink: 0, marginLeft: 8 }}>
                      <ActivitySourceBadge source={a.source} />
                      <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", whiteSpace: "nowrap" }}>
                        {formatActivityRelativeTime(a.occurredAt)}
                      </span>
                    </div>
                  </div>
                </div>
                {a.sourceSheet && isExpanded && (
                  <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", opacity: 0.7, marginBottom: 2, marginLeft: collapsible ? 42 : 28 }}>
                    (from {a.sourceSheet})
                  </div>
                )}
                {/* ── Expanded body content ── */}
                {isExpanded && (
                  <>
                    {editingId === a.id ? (
                      <div style={{ marginTop: 4 }}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, outline: "none", color: "var(--color-client-text)", fontSize: 13, lineHeight: 1.5, resize: "none", fontFamily: "inherit", padding: "8px 10px" }}
                        />
                        <div className="flex gap-2 justify-end" style={{ marginTop: 6 }}>
                          <button onClick={() => setEditingId(null)} style={{ padding: "4px 10px", fontSize: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
                          <button
                            onClick={async () => {
                              if (!editText.trim() || !onUpdateActivity) return;
                              await onUpdateActivity(a.id, editText.trim());
                              setEditingId(null);
                            }}
                            style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: "rgba(218,218,219,0.15)", border: "1px solid rgba(218,218,219,0.25)", borderRadius: 6, color: "#dadadb", cursor: "pointer" }}
                          >Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2" style={{ marginTop: 4 }}>
                        <div style={{ flex: 1 }}>{renderFormattedContent(a.content)}</div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingId(a.id); setEditText(a.content); }}
                          title="Edit"
                          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--color-client-text-dim)", opacity: 0.5, padding: "2px 4px" }}
                        >&#9998;</button>
                        {onDeleteActivity && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete this ${a.type.toLowerCase()}?`)) onDeleteActivity(a.id);
                            }}
                            title="Delete"
                            style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(239,100,100,0.5)", padding: "2px 4px" }}
                          >×</button>
                        )}
                      </div>
                    )}
                    {a.source === "Fireflies" && a.meetingTitle && (
                      <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(196,201,209,0.04)", borderRadius: 6, border: "1px solid rgba(196,201,209,0.1)" }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#C4C9D1" }}>{a.meetingTitle}</span>
                          {a.recordingLink && (
                            <a href={a.recordingLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#C4C9D1", textDecoration: "underline", opacity: 0.7 }}>View in Fireflies ↗</a>
                          )}
                        </div>
                        <div style={{ marginTop: 2 }}>
                          {a.durationMinutes && <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>{a.durationMinutes}min</span>}
                          {a.participants && <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginLeft: 8 }}>{a.participants.join(", ")}</span>}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {visibleCount < activities.length && (
            <button
              onClick={() => setVisibleCount((prev) => prev + 10)}
              className="rounded-lg"
              style={{
                marginTop: 6,
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 500,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--color-client-text-dim)",
                cursor: "pointer",
                width: "100%",
                textAlign: "center",
              }}
            >
              Show More ({activities.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Account Activity Section (cross-contact activity for same account) ── */

function AccountActivitySection({ contact, accounts, allActivities, allContacts }: { contact: Contact; accounts: Account[]; allActivities: CRMActivity[]; allContacts: Contact[] }) {
  const accountId = contact.accountId;
  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);

  const otherAccountActivities = useMemo(() => {
    if (!accountId) return [];
    // Find all contacts linked to the same account (excluding current)
    const siblingContactIds = new Set(
      allContacts.filter((c) => c.accountId === accountId && c.id !== contact.id).map((c) => c.id),
    );
    if (siblingContactIds.size === 0) return [];
    return allActivities
      .filter((a) => (a.contactId ? siblingContactIds.has(a.contactId) : false))
      .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))
      .slice(0, 20);
  }, [accountId, contact.id, allContacts, allActivities]);

  if (!account || otherAccountActivities.length === 0) return null;

  // Build contactId → name lookup
  const contactNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of allContacts) { map[c.id] = c.name; }
    return map;
  }, [allContacts]);

  return (
    <div style={{ marginBottom: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-client-text-dim)", marginBottom: 12, fontWeight: 600 }}>
        Other {account.name} Activity ({otherAccountActivities.length})
      </h3>
      <div className="flex flex-col gap-2">
        {otherAccountActivities.map((a) => {
          const relatedContactName = a.contactId ? contactNameMap[a.contactId] : undefined;
          return (
            <div
              key={a.id}
              className="rounded-lg"
              style={{ padding: "8px 12px", background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", opacity: 0.8 }}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 3 }}>
                <span style={{ fontSize: 13, flexShrink: 0 }}>{activityTypeIcon(a.type)}</span>
                <span
                  className="rounded"
                  style={{ fontSize: 8, padding: "1px 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: `${activityTypeColor(a.type)}15`, color: activityTypeColor(a.type), flexShrink: 0 }}
                >
                  {a.type}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#dadadb", flexShrink: 0 }}>{relatedContactName || "Unknown"}</span>
                <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {generateActivitySubjectLine(a, relatedContactName)}
                </span>
                <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
                  {formatActivityRelativeTime(a.occurredAt)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Recent Fireflies Calls (Sprint 5b) ── */

function RecentFirefliesCalls({ contactId, allActivities }: { contactId: string; allActivities: CRMActivity[] }) {
  const calls = useMemo(() => {
    return allActivities
      .filter(a => a.contactId === contactId && a.source === "Fireflies")
      .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  }, [contactId, allActivities]);

  if (calls.length === 0) return null;

  return (
    <div style={{ marginBottom: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <h3
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--color-client-text-dim)",
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        Recent Calls — Fireflies ({calls.length})
      </h3>
      <div className="flex flex-col gap-2">
        {calls.map((call) => (
          <div
            key={call.id}
            className="rounded-lg"
            style={{
              padding: "12px 14px",
              background: "rgba(218,218,219,0.03)",
              border: "1px solid rgba(218,218,219,0.1)",
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#dadadb" }}>
                {call.meetingTitle}
              </span>
              <span style={{ fontSize: 10, color: "var(--color-client-text-dim)" }}>
                {new Date(call.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </div>
            {call.durationMinutes && (
              <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 4 }}>
                {call.durationMinutes} min
              </div>
            )}
            {call.participants && (
              <div style={{ fontSize: 11, color: "var(--color-client-text-secondary)", marginBottom: 6 }}>
                {call.participants.join(", ")}
              </div>
            )}
            {call.summary && (
              <p style={{ fontSize: 12, color: "var(--color-client-text)", lineHeight: 1.5, marginBottom: 6 }}>
                {call.summary}
              </p>
            )}
            {call.recordingLink && (
              <span
                className="rounded"
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  fontSize: 9,
                  fontWeight: 600,
                  background: "rgba(218,218,219,0.1)",
                  color: "#dadadb",
                  cursor: "default",
                }}
              >
                Recording Available
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stage pill ── */

const STAGE_COLORS: Record<ContactStage, { bg: string; text: string }> = {
  New: { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.5)" },
  Active: { bg: "rgba(218,218,219,0.15)", text: "#dadadb" },
  Warm: { bg: "rgba(218,218,219,0.15)", text: "#dadadb" },
  Strategic: { bg: "rgba(196,201,209,0.15)", text: "#C4C9D1" },
  Dormant: { bg: "rgba(255,255,255,0.05)", text: "rgba(255,255,255,0.35)" },
};

function StagePill({ stage }: { stage: ContactStage }) {
  const c = STAGE_COLORS[stage];
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: c.bg,
        color: c.text,
      }}
    >
      {stage}
    </span>
  );
}

function PriorityPill({ priority }: { priority?: ContactPriority }) {
  if (!priority) return null;
  const c = PRIORITY_CONFIG[priority];
  if (!c) return null;
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "2px 7px",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: c.bg,
        color: c.text,
      }}
    >
      {c.label}
    </span>
  );
}

/* ── Trust & Health display components ── */

const TRUST_COLORS = {
  green: "#34D399",
  amber: "#FBBF24",
  red: "#F87171",
} as const;

function trustColor(score: number): string {
  if (score > 70) return TRUST_COLORS.green;
  if (score >= 40) return TRUST_COLORS.amber;
  return TRUST_COLORS.red;
}

function trustLevel(score: number): string {
  if (score > 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function TrustDot({ contact, compact = true, crmActivityDates }: { contact: Contact; compact?: boolean; crmActivityDates?: string[] }) {
  const score = computeTrustScore(contact, crmActivityDates);
  const color = trustColor(score);
  const level = trustLevel(score);
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{level}</span>
      <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontWeight: 400 }}>({score})</span>
    </span>
  );
}

const HEALTH_COLORS: Record<HealthStatus, { bg: string; text: string }> = {
  Healthy:  { bg: "rgba(52,211,153,0.12)", text: "#34D399" },
  "At Risk": { bg: "rgba(245,158,11,0.10)", text: "rgba(245,158,11,0.85)" },
  Cold:     { bg: "rgba(239,100,100,0.10)", text: "rgba(239,100,100,0.7)" },
  Critical: { bg: "rgba(220,50,50,0.10)", text: "rgba(220,50,50,0.8)" },
  Unknown:  { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.35)" },
};

function HealthPill({ contact, crmActivityDates }: { contact: Contact; crmActivityDates?: string[] }) {
  const status = computeHealthStatus(contact, crmActivityDates);
  const c = HEALTH_COLORS[status];
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.04em",
        background: c.bg,
        color: c.text,
      }}
    >
      {status}
    </span>
  );
}

function StalenessTag({ flag }: { flag: string }) {
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "2px 7px",
        fontSize: 9,
        fontWeight: 500,
        background: "rgba(245,158,11,0.06)",
        color: "rgba(245,158,11,0.7)",
        border: "1px solid rgba(245,158,11,0.12)",
      }}
    >
      {flag}
    </span>
  );
}

/* ── Saved Views ── */

interface SavedView {
  key: string;
  label: string;
  filter: (c: Contact) => boolean;
}

const SAVED_VIEWS: SavedView[] = [
  { key: "all", label: "All", filter: () => true },
  { key: "strategic", label: "Strategic", filter: (c) => c.stage === "Strategic" },
  { key: "waiting", label: "Waiting", filter: (c) => c.followUpState === "waiting-on-reply" },
  { key: "dormant", label: "Dormant", filter: (c) => c.stage === "Dormant" },
  { key: "consulting", label: "Consulting", filter: (c) => c.tags.includes("AI Consulting") || c.tags.includes("Mission Control Build") },
  { key: "referral-partners", label: "Referral Partners", filter: (c) => c.tags.includes("Partners") || c.source.toLowerCase().includes("partnerships") },
];

/* ── Follow-up priority sort order ── */

const FOLLOWUP_PRIORITY_ORDER: Record<FollowUpState, number> = {
  "needs-founder-response": 0,
  "follow-up-this-week": 1,
  "waiting-on-reply": 2,
  "needs-agent-action": 3,
  "none": 4,
};

/* ── Sort order constants (still used by sortContacts) ── */

/* ── Activity Input with @mention ── */

function ActivityInput({ contacts, onSubmit }: { contacts: Contact[]; onSubmit: (text: string, mentions: string[]) => void }) {
  const [value, setValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const matchingContacts = useMemo(() => {
    if (!mentionQuery) return contacts.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQuery, contacts]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart ?? text.length;
    setValue(text);

    // detect @ trigger
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx >= 0 && (atIdx === 0 || before[atIdx - 1] === " ")) {
      const query = before.slice(atIdx + 1);
      if (!/\n/.test(query)) {
        setMentionStart(atIdx);
        setMentionQuery(query);
        setShowDropdown(true);
        setHighlightIndex(0);
        return;
      }
    }
    setShowDropdown(false);
  };

  const insertMention = useCallback((contact: Contact) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionStart + 1 + mentionQuery.length);
    const newValue = before + "@" + contact.name + " " + after;
    setValue(newValue);
    setShowDropdown(false);
    setMentionQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [value, mentionStart, mentionQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown && matchingContacts.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % matchingContacts.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + matchingContacts.length) % matchingContacts.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(matchingContacts[highlightIndex]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const mentions = extractMentions(trimmed, contacts);
    onSubmit(trimmed, mentions);
    setValue("");
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        className="rounded-xl"
        style={{
          background: "var(--color-client-surface)",
          border: "1px solid var(--color-client-border)",
          padding: "16px 18px",
        }}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-lg"
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, rgba(218,218,219,0.2), rgba(196,201,209,0.2))",
              color: "#dadadb",
              fontSize: 16,
              marginTop: 2,
            }}
          >
            +
          </div>
          <textarea
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Log a note, tag a contact with @..."
            rows={2}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-client-text)",
              fontSize: 14,
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleSubmit}
            className="rounded-lg flex-shrink-0"
            style={{
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(218,218,219,0.15)",
              border: "1px solid rgba(218,218,219,0.25)",
              color: "#dadadb",
              cursor: "pointer",
              marginTop: 2,
            }}
          >
            Log
          </button>
        </div>
      </div>

      {/* @mention dropdown */}
      {showDropdown && matchingContacts.length > 0 && (
        <div
          className="rounded-xl"
          style={{
            position: "absolute",
            top: "100%",
            left: 56,
            marginTop: 4,
            background: "#1a1a2e",
            border: "1px solid var(--color-client-border)",
            zIndex: 50,
            minWidth: 280,
            maxHeight: 280,
            overflowY: "auto",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {matchingContacts.map((c, i) => (
            <button
              key={c.id}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(c);
              }}
              className="w-full text-left flex items-center gap-3"
              style={{
                padding: "10px 14px",
                background: i === highlightIndex ? "rgba(218,218,219,0.1)" : "transparent",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
              }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-lg"
                style={{
                  width: 28,
                  height: 28,
                  background: "linear-gradient(135deg, rgba(218,218,219,0.5), rgba(218,218,219,0.5))",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {c.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--color-client-text)", fontWeight: 500 }}>{c.name}</div>
                {c.company && (
                  <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{c.company}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Activity Timeline ── */

function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return null;
  const shown = activities.slice(0, 5);
  return (
    <div
      className="rounded-xl"
      style={{
        background: "var(--color-client-surface)",
        border: "1px solid var(--color-client-border)",
        overflow: "hidden",
        marginTop: 12,
      }}
    >
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--color-client-border-subtle)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--color-client-text-dim)",
          fontWeight: 600,
        }}
      >
        Recent Activity ({shown.length} of {activities.length})
      </div>
      {shown.map((a, i) => (
        <div
          key={a.id}
          className="flex items-start justify-between gap-4"
          style={{
            padding: "14px 18px",
            borderBottom: i < shown.length - 1 ? "1px solid var(--color-client-border-subtle)" : "none",
          }}
        >
          <div style={{ flex: 1, fontSize: 13, color: "var(--color-client-text)", lineHeight: 1.55 }}>
            {renderNoteWithMentions(a.text)}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {provenanceBadge(a.provenance)}
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", whiteSpace: "nowrap" }}>
              {formatRelativeTime(a.timestamp)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── helpers ── */

function matchesFilter(contact: Contact, filter: FilterPreset | ContactStage): boolean {
  if (filter === "All") return true;
  // Check if it's a stage filter
  if (CONTACT_STAGES.includes(filter as ContactStage)) return contact.stage === filter;
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  if (filter === "Partners") return tags.includes("Leadership") || tags.includes("Co-Founder");
  if (filter === "Vendors") return tags.includes("Vendor");
  return tags.includes(filter);
}

function matchesSearch(contact: Contact, q: string): boolean {
  if (!q) return true;
  try {
    const lower = q.toLowerCase();
    return (
      (contact.name ?? "").toLowerCase().includes(lower) ||
      (contact.company ?? "").toLowerCase().includes(lower) ||
      (Array.isArray(contact.emails) ? contact.emails : []).some((e) => (e ?? "").toLowerCase().includes(lower)) ||
      (Array.isArray(contact.tags) ? contact.tags : []).some((t) => (t ?? "").toLowerCase().includes(lower)) ||
      (contact.notes ?? "").toLowerCase().includes(lower) ||
      (contact.title ?? "").toLowerCase().includes(lower) ||
      (contact.stage ?? "").toLowerCase().includes(lower)
    );
  } catch {
    return false;
  }
}

function lastInteractionLabel(c: Contact): string {
  if (!Array.isArray(c?.interactions) || c.interactions.length === 0) return "\u2014";
  return c.interactions[0]?.summary ?? "\u2014";
}

function lastInteractionDate(c: Contact): string {
  if (!Array.isArray(c?.interactions) || c.interactions.length === 0) return "";
  return c.interactions[0]?.date ?? "";
}

const SORT_OPTIONS = ["Recently added", "Recent Interaction", "Name A-Z", "Name Z-A", "Company", "Follow-up Priority"] as const;
type SortKey = (typeof SORT_OPTIONS)[number];

function getContactCreatedAt(contact: Contact): string {
  const createdAt = (contact as Contact & { createdAt?: string }).createdAt;
  return createdAt || (Array.isArray(contact?.interactions) ? contact.interactions[0]?.date : null) || "";
}

function sortContacts(contacts: Contact[], key: SortKey): Contact[] {
  const sorted = [...contacts];
  try {
    if (key === "Recently added") sorted.sort((a, b) => getContactCreatedAt(b).localeCompare(getContactCreatedAt(a)));
    else if (key === "Name A-Z") sorted.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    else if (key === "Name Z-A") sorted.sort((a, b) => (b.name ?? "").localeCompare(a.name ?? ""));
    else if (key === "Company") sorted.sort((a, b) => (a.company ?? "").localeCompare(b.company ?? ""));
    else if (key === "Follow-up Priority") {
      sorted.sort((a, b) => {
        const pa = FOLLOWUP_PRIORITY_ORDER[a.followUpState ?? "none"] ?? 99;
        const pb = FOLLOWUP_PRIORITY_ORDER[b.followUpState ?? "none"] ?? 99;
        if (pa !== pb) return pa - pb;
        const da = (Array.isArray(a.interactions) ? a.interactions[0]?.date : null) ?? "";
        const db = (Array.isArray(b.interactions) ? b.interactions[0]?.date : null) ?? "";
        return db.localeCompare(da);
      });
    } else sorted.sort((a, b) => {
      const da = (Array.isArray(a.interactions) ? a.interactions[0]?.date : null) ?? "";
      const db = (Array.isArray(b.interactions) ? b.interactions[0]?.date : null) ?? "";
      return db.localeCompare(da);
    });
  } catch {
    // If sort fails, return unsorted to avoid crash
  }
  return sorted;
}

function provenanceBadge(p: Provenance) {
  const colors: Record<Provenance, string> = {
    verified: "rgba(218,218,219,0.15)",
    seeded: "rgba(218,218,219,0.15)",
    manual: "rgba(196,201,209,0.15)",
    inferred: "rgba(240,160,48,0.15)",
    imported: "rgba(245,158,11,0.15)",
  };
  const text: Record<Provenance, string> = {
    verified: "#dadadb",
    seeded: "#dadadb",
    manual: "#C4C9D1",
    inferred: "#f0a030",
    imported: "#F59E0B",
  };
  return (
    <span
      className="rounded"
      style={{
        display: "inline-block",
        padding: "2px 6px",
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: colors[p],
        color: text[p],
      }}
    >
      {p}
    </span>
  );
}

/* ── Summary strip ── */

function SummaryStrip({ contacts }: { contacts: Contact[] }) {
  const total = contacts.length;
  const bySource = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const src = c.source;
      map[src] = (map[src] || 0) + 1;
    });
    return map;
  }, [contacts]);
  const recentlyActive = contacts.filter((c) => c.interactions.length > 0 && c.interactions[0].date >= "2026-03-01").length;
  const needsFollowUp = contacts.filter(
    (c) => c.interactions.length > 0 && c.interactions[0].date < "2026-03-01"
  ).length;

  const stats = [
    { label: "Total Records", value: total, color: "var(--color-client-blue)" },
    { label: "Sources", value: Object.keys(bySource).length, color: "var(--color-client-purple)" },
    { label: "Recently Active", value: recentlyActive, color: "#C4C9D1" },
    { label: "Needs Follow-up", value: needsFollowUp, color: "var(--color-client-pink)" },
  ];

  return (
    <div className="crm-fluid-grid-compact" style={{ marginBottom: 24 }}>
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl"
          style={{
            padding: "16px 18px",
            background: "var(--color-client-surface)",
            border: "1px solid var(--color-client-border)",
          }}
        >
          <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
            {s.label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.03em" }}>
            <InspectableValue value={String(s.value)} sourceClass="LOCAL" source="CRM data" method={`${s.label} count from CRM contacts`} inline>
              <span>{s.value}</span>
            </InspectableValue>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Drawer Section ── */

function DrawerSection({ title, children, compact }: { title: string; children: React.ReactNode; compact?: boolean }) {
  return <CrmDrawerSection title={title} compact={compact}>{children}</CrmDrawerSection>;
}

function InfoRow({ label, value, provenance }: { label: string; value: string; provenance?: Provenance }) {
  return (
    <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: "var(--color-client-text-dim)", minWidth: 56 }}>{label}</span>
      <span style={{ fontSize: 13, color: "var(--color-client-text)" }}>{value}</span>
      {provenance && provenanceBadge(provenance)}
    </div>
  );
}

/* ── Notes Section ── */

function NotesSection({ contactId, notes, onAddNote }: { contactId: string; notes: CRMNote[]; onAddNote: (note: CRMNote) => void }) {
  const [sortNewest, setSortNewest] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const sorted = useMemo(() => {
    const s = [...notes];
    s.sort((a, b) => sortNewest ? (b.date ?? "").localeCompare(a.date ?? "") : (a.date ?? "").localeCompare(b.date ?? ""));
    return s;
  }, [notes, sortNewest]);

  const handleSubmit = () => {
    const trimmed = noteContent.trim();
    if (!trimmed) return;
    const note: CRMNote = {
      id: `note-${Date.now()}`,
      contactId,
      date: new Date().toISOString().slice(0, 10),
      title: noteTitle.trim() || undefined,
      content: trimmed,
      source: "manual",
      provenance: "manual",
    };
    onAddNote(note);
    setNoteTitle("");
    setNoteContent("");
    setShowForm(false);
  };

  return (
    <div style={{ marginBottom: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            color: "var(--color-client-text-dim)",
            fontWeight: 600,
          }}
        >
          Notes
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortNewest((v) => !v)}
            style={{
              background: "none",
              border: "none",
              fontSize: 10,
              color: "var(--color-client-text-dim)",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            {sortNewest ? "Newest" : "Oldest"}
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg"
            style={{
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 600,
              background: showForm ? "rgba(218,218,219,0.15)" : "rgba(255,255,255,0.04)",
              border: showForm ? "1px solid rgba(218,218,219,0.25)" : "1px solid rgba(255,255,255,0.08)",
              color: showForm ? "#dadadb" : "var(--color-client-text-secondary)",
              cursor: "pointer",
            }}
          >
            {showForm ? "Cancel" : "Add Note"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontStyle: "italic", marginBottom: 10, marginTop: -6 }}>
        Local only · Not synced yet · Meetings channel import coming later
      </p>

      {/* Inline form */}
      {showForm && (
        <div
          className="rounded-lg"
          style={{
            padding: "12px 14px",
            marginBottom: 12,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--color-client-border)",
          }}
        >
          <input
            type="text"
            placeholder="Title (optional)"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              outline: "none",
              color: "var(--color-client-text)",
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 0",
              marginBottom: 8,
              fontFamily: "inherit",
            }}
          />
          <textarea
            placeholder="Write a note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-client-text)",
              fontSize: 13,
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "inherit",
              padding: 0,
            }}
          />
          <div className="flex justify-end" style={{ marginTop: 8 }}>
            <button
              onClick={handleSubmit}
              disabled={!noteContent.trim()}
              className="rounded-lg"
              style={{
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 600,
                background: noteContent.trim() ? "rgba(218,218,219,0.15)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(218,218,219,0.25)",
                color: noteContent.trim() ? "#dadadb" : "var(--color-client-text-dim)",
                cursor: noteContent.trim() ? "pointer" : "default",
              }}
            >
              Save Note
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {sorted.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No notes yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((n) => {
            const sc = NOTE_SOURCE_COLORS[n.source];
            return (
              <div
                key={n.id}
                className="rounded-lg"
                style={{
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid var(--color-client-border-subtle)",
                }}
              >
                {/* Date — prominent, first line */}
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-client-text)", marginBottom: 2 }}>
                  {(() => { const d = new Date(n.date + "T00:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); })()}
                </div>
                {n.title && (
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-client-text-secondary)", marginBottom: 2 }}>{n.title}</div>
                )}
                <div style={{ marginBottom: 6 }}>{renderFormattedContent(n.content)}</div>
                {n.creator && (
                  <p style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginBottom: 4 }}>by {n.creator}</p>
                )}
                {/* Source + Verification badges — side by side, visually distinct */}
                <div className="flex items-center gap-2">
                  <span
                    className="rounded"
                    style={{
                      display: "inline-block",
                      padding: "1px 5px",
                      fontSize: 8,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      background: sc.bg,
                      color: sc.text,
                    }}
                  >
                    {noteSourceLabel(n.source)}
                  </span>
                  <span
                    className="rounded"
                    style={{
                      display: "inline-block",
                      padding: "1px 5px",
                      fontSize: 8,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      background: n.provenance === "verified" ? "rgba(218,218,219,0.15)" : n.provenance === "seeded" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)",
                      color: n.provenance === "verified" ? "#dadadb" : n.provenance === "seeded" ? "#F59E0B" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    {n.provenance === "verified" ? "Verified" : n.provenance === "seeded" ? "Seeded" : "Unknown"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Quick Actions Bar (Contact Drawer) ── */

const STAGE_OPTIONS: { label: ContactStage; color: string }[] = [
  { label: "New", color: "#94A3B8" },
  { label: "Active", color: "#dadadb" },
  { label: "Warm", color: "#F59E0B" },
  { label: "Strategic", color: "#C4C9D1" },
  { label: "Dormant", color: "#F87171" },
];

function ContactQuickActions({ contact, router, onClose, onUpdateContact }: { contact: Contact; router: ReturnType<typeof useRouter>; onClose: () => void; onUpdateContact: (id: string, fields: Record<string, unknown>) => Promise<void> }) {
  const [showStagePicker, setShowStagePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleStageChange = async (stage: ContactStage) => {
    await onUpdateContact(contact.id, { stage });
    setShowStagePicker(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contact.id }),
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
        {contact.emails[0] && (
          <button
            onClick={() => window.open(`mailto:${contact.emails[0]}`, "_blank")}
            style={crmActionButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            📧 Email
          </button>
        )}
        {contact.phone && (
          <button
            onClick={() => window.open(`tel:${contact.phone}`, "_blank")}
            style={crmActionButtonStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          >
            📞 Call
          </button>
        )}
        <button
          onClick={() => router.push(`/contacts?object=opportunities&select=new&prefill_contact=${contact.id}&prefill_account=${contact.accountId || ""}`)}
          style={crmActionButtonStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        >
          ➕ Opportunity
        </button>
        <button
          onClick={() => setShowStagePicker((p) => !p)}
          style={{ ...crmActionButtonStyle, ...(showStagePicker ? { background: "rgba(255,255,255,0.08)" } : {}) }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={(e) => { if (!showStagePicker) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        >
          🔄 Change Stage
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
      {showStagePicker && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {STAGE_OPTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => void handleStageChange(s.label)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: contact.stage === s.label ? `${s.color}33` : "transparent",
                color: s.color,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${s.color}33`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = contact.stage === s.label ? `${s.color}33` : "transparent"; }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
      {showDeleteConfirm && (
        <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#F87171", marginBottom: 8 }}>Delete this contact and all related activities?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
            <button onClick={() => void handleDelete()} disabled={deleting} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}>{deleting ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Detail Drawer ── */

const CRM_PANEL_WIDTH_KEY = "crm-panel-width";
const CRM_PANEL_DEFAULT_WIDTH = 520;
const CRM_PANEL_MIN_WIDTH = 350;
const CRM_PANEL_MAX_WIDTH_RATIO = 0.8;

function ContactDrawer({ contact, onClose, activities, notes, onAddNote, accounts, crmActivities, allContacts, opportunities, onLogActivity, onUpdateContact, onUpdateAccount, onUpdateActivity, onDeleteActivity }: { contact: Contact; onClose: () => void; activities: Activity[]; notes: CRMNote[]; onAddNote: (note: CRMNote) => void; accounts: Account[]; crmActivities: CRMActivity[]; allContacts: Contact[]; opportunities: Opportunity[]; onLogActivity: (contactId: string, type: QuickEntryType, content: string) => Promise<void>; onUpdateContact: (id: string, fields: Record<string, unknown>) => Promise<void>; onUpdateAccount: (id: string, fields: Record<string, unknown>) => Promise<void>; onUpdateActivity: (id: string, content: string) => Promise<void>; onDeleteActivity: (id: string) => Promise<void> }) {
  const { isMobile } = useResponsive();
  const router = useRouter();
  const [editingContact, setEditingContact] = useState(false);

  // Resizable panel state
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return CRM_PANEL_DEFAULT_WIDTH;
    try {
      const stored = window.localStorage.getItem(CRM_PANEL_WIDTH_KEY);
      if (stored) {
        const w = parseInt(stored, 10);
        if (!isNaN(w) && w >= CRM_PANEL_MIN_WIDTH) return w;
      }
    } catch { /* ignore */ }
    return CRM_PANEL_DEFAULT_WIDTH;
  });
  const [isFullScreen, setIsFullScreen] = useState(true);

  useEffect(() => {
    if (!isFullScreen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFullScreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullScreen]);
  const isResizing = useRef(false);
  const drawerElRef = useRef<HTMLDivElement>(null);

  // Callback ref: fires the instant the DOM element is attached.
  // This is the ONLY reliable way to reset scroll on a freshly mounted element.
  const drawerRef = useCallback((node: HTMLDivElement | null) => {
    drawerElRef.current = node;
    if (node) {
      // Immediately reset scroll
      node.scrollTop = 0;
      // Also reset after a frame and after animation completes
      requestAnimationFrame(() => { node.scrollTop = 0; });
      setTimeout(() => { node.scrollTop = 0; }, 50);
      setTimeout(() => { node.scrollTop = 0; }, 300);
    }
  }, []);

  // Lock body scroll when drawer is open
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
  }, [contact.id]);

  // Persist width to localStorage
  useEffect(() => {
    if (!isMobile) {
      try { window.localStorage.setItem(CRM_PANEL_WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
    }
  }, [panelWidth, isMobile]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMobile) return;
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const maxW = window.innerWidth * CRM_PANEL_MAX_WIDTH_RATIO;
      // Panel is on the right, so dragging left = increasing width
      const delta = startX - ev.clientX;
      const newWidth = Math.min(maxW, Math.max(CRM_PANEL_MIN_WIDTH, startWidth + delta));
      setPanelWidth(newWidth);
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
  }, [isMobile, panelWidth]);
  const [editContactData, setEditContactData] = useState({
    firstName: contact.name.split(" ")[0] || "",
    lastName: contact.name.split(" ").slice(1).join(" ") || "",
    email: contact.emails[0] || "",
    phone: contact.phone || "",
    accountId: contact.accountId || "",
    stage: contact.stage as string,
    priority: (contact.priority || "") as string,
  });
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [editAccountData, setEditAccountData] = useState<Record<string, string>>({});
  const [relatedOpportunities, setRelatedOpportunities] = useState<Opportunity[]>(() => opportunities.filter((opportunity) => opportunity.contactId === contact.id && !opportunity.deletedAt));
  const [referredOpportunities, setReferredOpportunities] = useState<Opportunity[]>(() => opportunities.filter((opportunity) => opportunity.referralPartnerContactId === contact.id && !opportunity.deletedAt));

  // Email sync state
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [emailLastSyncedAt, setEmailLastSyncedAt] = useState<string | null>(null);

  const emailActivities = useMemo(
    () => crmActivities.filter((a) => a.type === "Email" && a.contactId === contact.id),
    [crmActivities, contact.id]
  );

  const handleEmailSync = useCallback(async () => {
    setEmailSyncing(true);
    try {
      await fetch(`/api/crm/contacts/${contact.id}/activities/sync`, { method: "POST" });
      setEmailLastSyncedAt(new Date().toISOString());
    } catch { /* ignore */ }
    setEmailSyncing(false);
  }, [contact.id]);

  useEffect(() => {
    setRelatedOpportunities(opportunities.filter((opportunity) => opportunity.contactId === contact.id && !opportunity.deletedAt));
    setReferredOpportunities(opportunities.filter((opportunity) => opportunity.referralPartnerContactId === contact.id && !opportunity.deletedAt));
  }, [contact.id, opportunities]);

  const contactActivities = useMemo(
    () => activities.filter((a) => a.mentions.includes(contact.name)),
    [activities, contact.name]
  );

  // Compute latest inbound/outbound from interactions
  const latestInbound = useMemo(() => {
    return contact.interactions.find((ix) => {
      const ch = (ix.channel ?? "").toLowerCase();
      return ch.includes("ops@") || ch.includes("partnerships@");
    });
  }, [contact.interactions]);

  const latestOutbound = useMemo(() => {
    return contact.interactions.find((ix) => {
      const ch = (ix.channel ?? "").toLowerCase();
      return ch.includes("ops@") || ix.summary.toLowerCase().includes("sent");
    });
  }, [contact.interactions]);

  const latestNote = contactActivities.length > 0 ? contactActivities[0] : null;

  // Most recent CRM activity date for this contact
  const mostRecentActivityDate = useMemo(() => {
    const contactCrmActivities = crmActivities.filter(a => a.contactId === contact.id);
    if (contactCrmActivities.length === 0) return null;
    const sorted = [...contactCrmActivities].sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
    return sorted[0].occurredAt;
  }, [crmActivities, contact.id]);

  // CRM activity dates for health/trust computation
  const drawerCrmDates = useMemo(() => {
    return crmActivities.filter(a => a.contactId === contact.id).map(a => a.occurredAt);
  }, [crmActivities, contact.id]);

  // Combined timeline: interactions + activities, reverse chronological
  const combinedTimeline = useMemo(() => {
    const items: { type: "interaction" | "activity"; date: string; ts: number; summary: string; channel?: string; provenance: Provenance }[] = [];
    contact.interactions.forEach((ix) => {
      items.push({ type: "interaction", date: ix.date, ts: new Date(ix.date).getTime(), summary: ix.summary, channel: ix.channel, provenance: ix.provenance });
    });
    contactActivities.forEach((a) => {
      items.push({ type: "activity", date: new Date(a.timestamp).toISOString().slice(0, 10), ts: a.timestamp, summary: a.text, provenance: a.provenance });
    });
    items.sort((a, b) => b.ts - a.ts);
    return items;
  }, [contact.interactions, contactActivities]);
  const contactAccount = contact.accountId ? accounts.find((account) => account.id === contact.accountId) : undefined;
  const contactInterestTags = contact.interests ?? [];
  const toggleInterest = async (tag: string) => {
    const next = contactInterestTags.includes(tag)
      ? contactInterestTags.filter((item) => item !== tag)
      : [...contactInterestTags, tag];
    await onUpdateContact(contact.id, { interests: next });
  };

  return (
    <>
      <div
        className="backdrop-enter"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 90,
        }}
      />
      <div
        ref={drawerRef}
        className="drawer-enter"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? "100%" : isFullScreen ? "100%" : `min(${panelWidth}px, 92vw)`,
          left: isMobile ? 0 : undefined,
          background: "#0c0c12",
          borderLeft: isMobile ? "none" : "1px solid rgba(255,255,255,0.06)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
          zIndex: 100,
          overflowY: "auto",
          padding: isMobile ? "16px 16px" : "28px 24px",
        }}
      >
        {/* Resize handle on left edge */}
        {!isMobile && !isFullScreen && (
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: 6,
              cursor: "col-resize",
              zIndex: 110,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{
              width: 3,
              height: 40,
              borderRadius: 2,
              background: "rgba(255,255,255,0.12)",
              transition: "background 0.15s",
            }} />
          </div>
        )}

        {/* Header bar: full-screen toggle + close */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {!isMobile && (
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? "Exit full-screen" : "Full-screen"}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isFullScreen ? "#dadadb" : "var(--color-client-text-secondary)",
                fontSize: 14,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 15 }}>{isFullScreen ? "↙" : "↔"}</span>
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              minWidth: 44,
              minHeight: 44,
              width: isMobile ? 44 : 32,
              height: isMobile ? 44 : 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-client-text-secondary)",
              fontSize: 14,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {isMobile ? (
              <span style={{ fontSize: 16 }}>←</span>
            ) : (
              <span style={{ fontSize: 16 }}>✕</span>
            )}
          </button>
        </div>

        <CrmRecordHeader
          eyebrow="Contact"
          avatarLabel={contact.name}
          title={contact.name}
          subtitle={(
            <>
              {contact.title ? <div>{contact.title}</div> : null}
              {contact.company ? <div>{contact.company}</div> : null}
              {contact.accountId ? (
                <button
                  onClick={() => router.push(`/contacts?object=accounts&select=${toDisplayId(contact.accountId!, "account")}`)}
                  style={{ background: "none", border: "none", padding: 0, marginTop: 2, fontSize: 11, color: "var(--color-client-blue)", cursor: "pointer" }}
                >
                  {getAccountName(contact.accountId, accounts)}
                </button>
              ) : null}
            </>
          )}
          actions={(
            <button
              onClick={() => setEditingContact(!editingContact)}
              style={{ ...crmActionButtonStyle, background: editingContact ? "rgba(218,218,219,0.15)" : crmActionButtonStyle.background, border: editingContact ? "1px solid rgba(218,218,219,0.25)" : crmActionButtonStyle.border, color: editingContact ? "#dadadb" : "var(--color-client-text-dim)" }}
            >
              {editingContact ? "Cancel" : "Edit"}
            </button>
          )}
        />

        <CrmRecordPath steps={[...CONTACT_STAGES]} current={contact.stage} />

        {/* Contact Summary Header */}
        <div style={{ marginBottom: 8 }}>
          <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 6 }}>
            {contact.emails.length > 0 && (
              <CopyableText value={contact.emails[0]} style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }} />
            )}
            {contact.phone && (
              <CopyableText value={contact.phone} style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }} />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
            <StagePill stage={contact.stage} />
            <PriorityPill priority={contact.priority} />
            <SourceBadge source={contact.source} provenance={contact.provenance} />
            {mostRecentActivityDate && (
              <span style={{ fontSize: 11, fontWeight: 500, color: lastActivityColor(mostRecentActivityDate) }}>
                Last Activity: {formatActivityRelativeTime(mostRecentActivityDate)}
              </span>
            )}
            {contact.lastEmailAt && (
              <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(218,218,219,0.8)" }}>
                Last emailed: {formatActivityRelativeTime(contact.lastEmailAt)}
              </span>
            )}
          </div>
          {!!(contact.followUpState && contact.followUpState !== "none") && (
            <div className="rounded-lg" style={{ display: "inline-block", padding: "4px 10px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#F59E0B" }}>
                {contact.followUpState === "follow-up-this-week" ? "Follow up this week" :
                 contact.followUpState === "waiting-on-reply" ? "Waiting on reply" :
                 contact.followUpState === "needs-founder-response" ? "Needs founder response" :
                 contact.followUpState === "needs-agent-action" ? "Needs agent action" : String(contact.followUpState ?? "")}
              </span>
            </div>
          )}
        </div>

        <LineageChips
          chips={[
            ...(contact.convertedFromLeadId ? [{ label: "Lead source ↑", href: `/contacts?object=leads&select=${contact.convertedFromLeadId}` }] : []),
            { label: "Contact", active: true },
            contactAccount
              ? { label: `Account ↗ ${contactAccount.name}`, href: `/contacts?object=accounts&select=${toDisplayId(contactAccount.id, "account")}` }
              : { label: "Create Account", href: "/contacts?object=accounts" },
          ]}
        />

        {/* Inline Contact Edit Form */}
        {editingContact && (
          <div className="rounded-lg" style={{ padding: "14px 16px", marginBottom: 12, background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-client-border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>First Name</label>
                <input value={editContactData.firstName} onChange={(e) => setEditContactData(p => ({ ...p, firstName: e.target.value }))} style={formInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>Last Name</label>
                <input value={editContactData.lastName} onChange={(e) => setEditContactData(p => ({ ...p, lastName: e.target.value }))} style={formInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>Email</label>
                <input value={editContactData.email} onChange={(e) => setEditContactData(p => ({ ...p, email: e.target.value }))} style={formInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>Phone</label>
                <input value={editContactData.phone} onChange={(e) => setEditContactData(p => ({ ...p, phone: e.target.value }))} style={formInputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>Account</label>
                <CRMPicker options={accounts} value={editContactData.accountId || null} onChange={(value) => setEditContactData(p => ({ ...p, accountId: value ?? "" }))} getKey={(account) => account.id} getLabel={(account) => account.name} placeholder="No Account" clearable />
              </div>
              <div>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>Stage</label>
                <CRMPicker options={CONTACT_STAGES.map((stage) => ({ value: stage }))} value={editContactData.stage} onChange={(value) => { if (value) setEditContactData(p => ({ ...p, stage: value })); }} getKey={(option) => option.value} getLabel={(option) => option.value} searchable={false} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 3 }}>Priority</label>
                <CRMPicker options={(["low", "medium", "high", "critical"] as const).map((priority) => ({ value: priority, label: PRIORITY_CONFIG[priority].label }))} value={editContactData.priority || null} onChange={(value) => setEditContactData(p => ({ ...p, priority: value ?? "" }))} getKey={(option) => option.value} getLabel={(option) => option.label} placeholder="None" clearable searchable={false} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingContact(false)} style={{ padding: "6px 12px", fontSize: 11, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
              <button
                onClick={async () => {
                  const name = `${editContactData.firstName.trim()} ${editContactData.lastName.trim()}`.trim();
                  await onUpdateContact(contact.id, {
                    name,
                    emails: editContactData.email ? [editContactData.email] : [],
                    phone: editContactData.phone || undefined,
                    accountId: editContactData.accountId || undefined,
                    stage: editContactData.stage,
                    priority: editContactData.priority || undefined,
                  });
                  setEditingContact(false);
                }}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: "rgba(218,218,219,0.15)", border: "1px solid rgba(218,218,219,0.25)", borderRadius: 6, color: "#dadadb", cursor: "pointer" }}
              >Save</button>
            </div>
          </div>
        )}

        {/* ── Quick Actions Bar ── */}
        <ContactQuickActions contact={contact} router={router} onClose={onClose} onUpdateContact={onUpdateContact} />

        {/* ── Next-Best-Action ── */}
        {computeNextBestAction(contact, drawerCrmDates) !== "No action needed" && (
          <CrmNextBestActionPanel
            action={computeNextBestAction(contact, drawerCrmDates)}
            detail="Deterministic rule from relationship priority, follow-up state, and recent CRM activity. Ready for future AI enrichment."
          />
        )}

        {/* ── Staleness flags ── */}
        {computeStalenessFlags(contact, drawerCrmDates).length > 0 && (
          <div className="flex flex-wrap gap-1" style={{ marginTop: 8 }}>
            {computeStalenessFlags(contact, drawerCrmDates).map((flag) => (
              <StalenessTag key={flag} flag={flag} />
            ))}
          </div>
        )}

        {/* ── IDENTITY ── */}
        <DrawerSection title="Identity">
          <InlineEditText label="Name" value={contact.name} onSave={async (v) => { await onUpdateContact(contact.id, { name: v }); }} />
          <InlineEditText label="Company" value={contact.company ?? ""} placeholder="Add company" onSave={async (v) => { await onUpdateContact(contact.id, { company: v || undefined }); }} />
          <InlineEditText label="Title" value={contact.title ?? ""} placeholder="Add title" onSave={async (v) => { await onUpdateContact(contact.id, { title: v || undefined }); }} />
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, color: "var(--color-client-text-dim)", marginBottom: 6 }}>Interests</div>
            <InterestChipPicker selected={contactInterestTags} onToggle={(tag) => void toggleInterest(tag)} />
          </div>
        </DrawerSection>

        {/* ── RELATIONSHIP ── */}
        <DrawerSection title="Relationship">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-client-text-dim)", minWidth: 56 }}>Owner</span>
            <OwnerSelect value={contact.owner} onChange={(owner) => void onUpdateContact(contact.id, { owner: owner || undefined })} />
          </div>
          <InlineEditEnum label="Stage" picklistKey="contactStage" value={contact.stage} onSave={async (v) => { await onUpdateContact(contact.id, { stage: v }); }} />
          <InlineEditEnum label="Priority" picklistKey="contactPriority" value={contact.priority ?? ""} onSave={async (v) => { await onUpdateContact(contact.id, { priority: v || undefined }); }} />
          <InlineEditEnum label="Follow-Up" picklistKey="contactFollowUp" value={contact.followUpState ?? "none"} onSave={async (v) => { await onUpdateContact(contact.id, { followUpState: v || "none" }); }} />
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-client-text-dim)", minWidth: 56 }}>Tags</span>
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-lg"
                  style={{
                    padding: "3px 8px",
                    fontSize: 10,
                    background: "rgba(218,218,219,0.08)",
                    border: "1px solid rgba(218,218,219,0.15)",
                    color: "var(--color-client-blue)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <InfoRow label="Source" value={contact.source} />
          {contact.rates && <InfoRow label="Rates" value={contact.rates} />}
          {contact.notes && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>Notes</span>
              <p style={{ fontSize: 13, color: "var(--color-client-text-secondary)", lineHeight: 1.5, marginTop: 4 }}>{contact.notes}</p>
            </div>
          )}
        </DrawerSection>

        {/* ── ACCOUNT DETAIL ── */}
        {contact.accountId && (() => {
          const acct = accounts.find(a => a.id === contact.accountId);
          if (!acct) return null;
          const isEditing = editingAccount === acct.id;
          return (
            <DrawerSection title="Account">
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <button
                  onClick={() => router.push(`/contacts?object=accounts&select=${acct.id}`)}
                  style={{ background: "none", border: "none", padding: 0, fontSize: 14, fontWeight: 600, color: "var(--color-client-blue)", cursor: "pointer" }}
                >
                  {acct.name}
                </button>
                <button
                  onClick={() => {
                    if (isEditing) { setEditingAccount(null); return; }
                    setEditingAccount(acct.id);
                    setEditAccountData({
                      name: acct.name, type: normalizeAccountType(acct.type), subType: acct.subType || "", category: acct.category || "",
                      operatingMarket: acct.operatingMarket || "", website: acct.website || "",
                      street: acct.address?.street || "", city: acct.address?.city || "", state: acct.address?.state || "",
                      zip: acct.address?.zip || "", venueName: acct.address?.venueName || "",
                    });
                  }}
                  style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, background: isEditing ? "rgba(218,218,219,0.15)" : "rgba(255,255,255,0.04)", border: isEditing ? "1px solid rgba(218,218,219,0.25)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: isEditing ? "#dadadb" : "var(--color-client-text-dim)", cursor: "pointer" }}
                >
                  {isEditing ? "Cancel" : "Edit"}
                </button>
              </div>
              {isEditing ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>Name</label>
                      <input value={editAccountData.name} onChange={(e) => setEditAccountData(p => ({ ...p, name: e.target.value }))} style={formInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>Type</label>
                      <CRMPicker options={ACCOUNT_TYPES.map((value) => ({ value }))} value={editAccountData.type} onChange={(value) => { if (value) setEditAccountData(p => ({ ...p, type: value as AccountType })); }} getKey={(option) => option.value} getLabel={(option) => option.value} searchable={false} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>Sub-Type</label>
                      <CRMPicker options={Object.values(ACCOUNT_TYPE_SUBTYPES).flat().map((value) => ({ value }))} value={editAccountData.subType || null} onChange={(value) => setEditAccountData(p => ({ ...p, subType: value ?? "" }))} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="None" clearable />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>Category</label>
                      <input value={editAccountData.category} onChange={(e) => setEditAccountData(p => ({ ...p, category: e.target.value }))} style={formInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>Market</label>
                      <CRMPicker options={["Los Angeles", "Miami", "Fort Lauderdale", "International", "Multi-Market"].map((value) => ({ value }))} value={editAccountData.operatingMarket} onChange={(value) => { if (value) setEditAccountData(p => ({ ...p, operatingMarket: value })); }} getKey={(option) => option.value} getLabel={(option) => option.value} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--color-client-text-dim)", display: "block", marginBottom: 2 }}>Website</label>
                      <input value={editAccountData.website} onChange={(e) => setEditAccountData(p => ({ ...p, website: e.target.value }))} style={formInputStyle} />
                    </div>
                  </div>
                  {/* Address fields */}
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Address</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                      <input value={editAccountData.street} onChange={(e) => setEditAccountData(p => ({ ...p, street: e.target.value }))} placeholder="Street" style={{ ...formInputStyle, gridColumn: "1 / -1" }} />
                      <input value={editAccountData.city} onChange={(e) => setEditAccountData(p => ({ ...p, city: e.target.value }))} placeholder="City" style={formInputStyle} />
                      <input value={editAccountData.state} onChange={(e) => setEditAccountData(p => ({ ...p, state: e.target.value }))} placeholder="State" style={formInputStyle} />
                      <input value={editAccountData.zip} onChange={(e) => setEditAccountData(p => ({ ...p, zip: e.target.value }))} placeholder="ZIP" style={formInputStyle} />
                      <input value={editAccountData.venueName} onChange={(e) => setEditAccountData(p => ({ ...p, venueName: e.target.value }))} placeholder="Venue Name" style={formInputStyle} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingAccount(null)} style={{ padding: "5px 10px", fontSize: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "var(--color-client-text-dim)", cursor: "pointer" }}>Cancel</button>
                    <button
                      onClick={async () => {
                        const addr = (editAccountData.street || editAccountData.city || editAccountData.state || editAccountData.zip || editAccountData.venueName)
                          ? { street: editAccountData.street || undefined, city: editAccountData.city || undefined, state: editAccountData.state || undefined, zip: editAccountData.zip || undefined, venueName: editAccountData.venueName || undefined }
                          : undefined;
                        await onUpdateAccount(acct.id, {
                          name: editAccountData.name, type: editAccountData.type, subType: editAccountData.subType || undefined,
                          category: editAccountData.category || undefined, operatingMarket: editAccountData.operatingMarket,
                          website: editAccountData.website || undefined, address: addr,
                        });
                        setEditingAccount(null);
                      }}
                      style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, background: "rgba(218,218,219,0.15)", border: "1px solid rgba(218,218,219,0.25)", borderRadius: 6, color: "#dadadb", cursor: "pointer" }}
                    >Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <InfoRow label="Type" value={`${acct.type}${acct.subType ? ` / ${acct.subType}` : ""}`} />
                  {acct.category && <InfoRow label="Category" value={acct.category} />}
                  <InfoRow label="Market" value={acct.operatingMarket} />
                  {acct.website && <InfoRow label="Website" value={acct.website} />}
                  {acct.address && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Address</span>
                      <p style={{ fontSize: 12, color: "var(--color-client-text-secondary)", marginTop: 2 }}>
                        {[acct.address.venueName, acct.address.street, [acct.address.city, acct.address.state, acct.address.zip].filter(Boolean).join(", ")].filter(Boolean).join("\n")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </DrawerSection>
          );
        })()}

        {/* ── CRM ACTIVITY TIMELINE (Sprint 2 — primary workspace) ── */}
        <CRMActivityTimeline contactId={contact.id} contactName={contact.name} allActivities={crmActivities} onLogActivity={async (type, content) => { await onLogActivity(contact.id, type, content); }} onUpdateActivity={onUpdateActivity} onDeleteActivity={onDeleteActivity} />

        {/* ── EMAIL ACTIVITY TIMELINE (Sprint 2) ── */}
        <div style={{ marginBottom: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <h3 style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-client-text-dim)", marginBottom: 12, fontWeight: 600 }}>
            Emails ({emailActivities.length})
          </h3>
          <EmailActivityTimeline
            activities={emailActivities}
            onSync={handleEmailSync}
            syncing={emailSyncing}
            lastSyncedAt={emailLastSyncedAt}
          />
        </div>

        <DrawerSection title={`Related Opportunities (${relatedOpportunities.length})`}>
          <div style={{ marginBottom: 10 }}>
            <button
              onClick={() => router.push(`/contacts?object=opportunities&select=new&prefill_contact=${contact.id}&prefill_account=${contact.accountId || ""}`)}
              style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(218,218,219,0.12)", border: "1px solid rgba(218,218,219,0.25)", color: "#dadadb", fontWeight: 600, fontSize: 11, cursor: "pointer" }}
            >
              + Create Opportunity
            </button>
          </div>
          {relatedOpportunities.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No linked opportunities yet.</p>
          ) : (
            <StandardTable<Opportunity>
              tableKey="contacts-related-opportunities"
              columns={[
                { key: "name", label: "Opportunity", getValue: (opportunity) => opportunity.name, render: (opportunity) => <span style={{ fontSize: 12, fontWeight: 500, color: "#f8fafc" }}>{opportunity.name}</span> },
                { key: "stage", label: "Stage", getValue: (opportunity) => opportunity.stage ?? "" },
                { key: "owner", label: "Owner", getValue: (opportunity) => opportunity.owner ?? "" },
                { key: "closeDate", label: "Close Date", getValue: (opportunity) => opportunity.closeDate ?? opportunity.nextStepDueDate ?? "" },
                { key: "value", label: "Value", getValue: (opportunity) => String(opportunity.value), render: (opportunity) => <span style={{ color: "#dadadb", fontWeight: 600 }}>${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(opportunity.value)}</span> },
              ]}
              data={relatedOpportunities}
              getRowKey={(opportunity) => opportunity.id}
              defaultSortKey="closeDate"
              defaultSortDir="asc"
              onRowClick={(opportunity) => router.push(`/contacts?object=opportunities&select=${opportunity.id}`)}
              emptyMessage="No opportunities found"
            />
          )}
        </DrawerSection>

        <DrawerSection title={`Referred Opportunities (${referredOpportunities.length})`}>
          {referredOpportunities.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>No referred opportunities yet.</p>
          ) : (
            <StandardTable<Opportunity>
              tableKey="contacts-referred-opportunities"
              columns={[
                { key: "name", label: "Opportunity", getValue: (opportunity) => opportunity.name, render: (opportunity) => <span style={{ fontSize: 12, fontWeight: 500, color: "#f8fafc" }}>{opportunity.name}</span> },
                { key: "stage", label: "Stage", getValue: (opportunity) => opportunity.stage ?? "" },
                { key: "owner", label: "Owner", getValue: (opportunity) => opportunity.owner ?? "" },
                { key: "closeDate", label: "Close Date", getValue: (opportunity) => opportunity.closeDate ?? "" },
                { key: "value", label: "Value", getValue: (opportunity) => String(opportunity.value), render: (opportunity) => <span style={{ color: "#dadadb", fontWeight: 600 }}>${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(opportunity.value)}</span> },
              ]}
              data={referredOpportunities}
              getRowKey={(opportunity) => opportunity.id}
              defaultSortKey="closeDate"
              defaultSortDir="desc"
              onRowClick={(opportunity) => router.push(`/contacts?object=opportunities&select=${opportunity.id}`)}
              emptyMessage="No opportunities found"
            />
          )}
        </DrawerSection>

        {/* ── LATEST ACTIVITY ── */}
        {(latestInbound || latestOutbound || latestNote) && (
        <DrawerSection title="Latest Activity" compact>
          {latestInbound && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Last inbound</span>
            <p style={{ fontSize: 13, color: "var(--color-client-text)", marginTop: 2 }}>
              {`${latestInbound.summary} (${latestInbound.date})`}
            </p>
          </div>
          )}
          {latestOutbound && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Last outbound</span>
            <p style={{ fontSize: 13, color: "var(--color-client-text)", marginTop: 2 }}>
              {`${latestOutbound.summary} (${latestOutbound.date})`}
            </p>
          </div>
          )}
          {latestNote && (
          <div>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Latest @ note</span>
            <p style={{ fontSize: 13, color: "var(--color-client-text)", marginTop: 2 }}>
              {renderNoteWithMentions(latestNote.text)}
            </p>
          </div>
          )}
        </DrawerSection>
        )}

        {/* ── RECENT FIREFLIES CALLS (Sprint 5b) ── */}
        <RecentFirefliesCalls contactId={contact.id} allActivities={crmActivities} />

        {/* ── NOTES ── */}
        {(() => {
          const contactNotes = notes.filter((n) => n.contactId === contact.id);
          return <NotesSection contactId={contact.id} notes={contactNotes} onAddNote={onAddNote} />;
        })()}

        {/* ── TIMELINE ── */}
        <DrawerSection title="Timeline" compact={combinedTimeline.length === 0}>
          {combinedTimeline.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--color-client-text-dim)", marginBottom: 0 }}>No recorded interactions.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {combinedTimeline.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg"
                  style={{
                    padding: "12px 14px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--color-client-border-subtle)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2" style={{ marginBottom: 4 }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>{item.date}</span>
                      <span
                        className="rounded"
                        style={{
                          fontSize: 8,
                          padding: "1px 5px",
                          background: item.type === "activity" ? "rgba(196,201,209,0.1)" : "rgba(218,218,219,0.1)",
                          color: item.type === "activity" ? "#C4C9D1" : "#dadadb",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {item.type === "activity" ? "note" : "interaction"}
                      </span>
                    </div>
                    {provenanceBadge(item.provenance)}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--color-client-text)", lineHeight: 1.5 }}>
                    {item.type === "activity" ? renderNoteWithMentions(item.summary) : item.summary}
                  </p>
                  {item.channel && (
                    <p style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginTop: 4 }}>via {item.channel}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DrawerSection>

        {/* ── TRUST & PROVENANCE ── */}
        <DrawerSection title="Trust & Provenance">
          {/* Source breakdown */}
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Source breakdown</span>
            <div className="flex items-center gap-3" style={{ marginTop: 4 }}>
              {(() => {
                const fp = contact.fieldProvenance ?? {};
                const counts: Record<string, number> = {};
                Object.values(fp).forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
                // always count the contact-level provenance
                counts[contact.provenance] = (counts[contact.provenance] || 0);
                return Object.entries(counts).map(([p, n]) => (
                  <span key={p} className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>
                    {provenanceBadge(p as Provenance)} <span>{n} field{n !== 1 ? "s" : ""}</span>
                  </span>
                ));
              })()}
            </div>
          </div>

          {/* Trust score with deductions */}
          <div style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Trust</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: trustColor(computeTrustScore(contact, drawerCrmDates)) }}>{trustLevel(computeTrustScore(contact, drawerCrmDates))}</span>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>— score {computeTrustScore(contact, drawerCrmDates)}/100</span>
            </div>
            <div
              className="rounded"
              style={{
                height: 6,
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                marginBottom: 6,
              }}
            >
              <div
                className="rounded"
                style={{
                  height: 6,
                  width: `${computeTrustScore(contact, drawerCrmDates)}%`,
                  background: trustColor(computeTrustScore(contact, drawerCrmDates)),
                  transition: "width 0.3s",
                }}
              />
            </div>
            {computeTrustDeductions(contact, drawerCrmDates).length > 0 ? (
              <div className="flex flex-col gap-1">
                {computeTrustDeductions(contact, drawerCrmDates).map((d, i) => (
                  <span key={i} style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{d}</span>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>No deductions — full trust</span>
            )}
          </div>

          {/* Health status with reason */}
          <div style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>Health</span>
              <HealthPill contact={contact} crmActivityDates={drawerCrmDates} />
            </div>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{computeHealthReason(contact, drawerCrmDates)}</span>
          </div>

          {/* Staleness flags */}
          {computeStalenessFlags(contact, drawerCrmDates).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)", display: "block", marginBottom: 4 }}>Staleness flags</span>
              <div className="flex flex-wrap gap-1">
                {computeStalenessFlags(contact, drawerCrmDates).map((flag) => (
                  <StalenessTag key={flag} flag={flag} />
                ))}
              </div>
            </div>
          )}

          {/* Field provenance */}
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>Data source:</span>
            {provenanceBadge(contact.provenance)}
          </div>
          {contact.fieldProvenance && (
            <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
              {Object.entries(contact.fieldProvenance).map(([field, prov]) => (
                <span key={field} className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
                  {field}: {provenanceBadge(prov)}
                </span>
              ))}
            </div>
          )}

          <p style={{ fontSize: 10, color: "var(--color-client-text-dim)", fontStyle: "italic", marginTop: 8, opacity: 0.7 }}>
            Derived fields are computed from source data and update automatically.
          </p>
        </DrawerSection>

        <CrmRecordFooter rawId={contact.id} entityType="contact" />
      </div>
    </>
  );
}

/* ── Shared form input style ── */

const formInputStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--color-client-text)", fontSize: 13, width: "100%" };
const formInputErrorStyle: React.CSSProperties = { ...formInputStyle, border: "1px solid rgba(239,68,68,0.5)" };
const errorTextStyle: React.CSSProperties = { fontSize: 11, color: "#EF4444", marginTop: 2 };

/* ── Create Contact Form with Validation ── */

function CreateContactForm({ accounts, onSubmit }: { accounts: Account[]; onSubmit: (data: { firstName: string; lastName: string; email?: string; phone?: string; accountId?: string }) => Promise<void> }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountId, setAccountId] = useState("");
  const [accountSort, setAccountSort] = useState<"az" | "za">("az");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => accountSort === "az" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  }, [accountSort, accounts]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    if (email && !email.includes("@")) e.email = "Email must contain @";
    if (phone && phone.length < 7) e.phone = "Phone must be at least 7 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(12,12,18,0.8)", border: "1px solid rgba(218,218,219,0.15)", marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#dadadb", marginBottom: 16 }}>Create Contact</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <input value={firstName} onChange={(e) => { setFirstName(e.target.value); setErrors(p => ({ ...p, firstName: "" })); }} placeholder="First Name *" style={errors.firstName ? formInputErrorStyle : formInputStyle} />
          {errors.firstName && <p style={errorTextStyle}>{errors.firstName}</p>}
        </div>
        <div>
          <input value={lastName} onChange={(e) => { setLastName(e.target.value); setErrors(p => ({ ...p, lastName: "" })); }} placeholder="Last Name *" style={errors.lastName ? formInputErrorStyle : formInputStyle} />
          {errors.lastName && <p style={errorTextStyle}>{errors.lastName}</p>}
        </div>
        <div>
          <input value={email} onChange={(e) => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }} placeholder="Email" style={errors.email ? formInputErrorStyle : formInputStyle} />
          {errors.email && <p style={errorTextStyle}>{errors.email}</p>}
        </div>
        <div>
          <input value={phone} onChange={(e) => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: "" })); }} placeholder="Phone" style={errors.phone ? formInputErrorStyle : formInputStyle} />
          {errors.phone && <p style={errorTextStyle}>{errors.phone}</p>}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Account</span>
          <div style={{ display: "inline-flex", gap: 4 }}>
            {(["az", "za"] as const).map((sortKey) => (
              <button
                key={sortKey}
                type="button"
                onClick={() => setAccountSort(sortKey)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 7,
                  border: accountSort === sortKey ? "1px solid rgba(218,218,219,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  background: accountSort === sortKey ? "rgba(218,218,219,0.13)" : "rgba(255,255,255,0.04)",
                  color: accountSort === sortKey ? "#FCA5A5" : "var(--color-client-text-dim)",
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {sortKey === "az" ? "A-Z" : "Z-A"}
              </button>
            ))}
          </div>
        </div>
        <CRMPicker options={sortedAccounts} value={accountId || null} onChange={(value) => setAccountId(value ?? "")} getKey={(account) => account.id} getLabel={(account) => account.name} getSecondaryLabel={(account) => account.type} placeholder="Search accounts..." searchPlaceholder="Search accounts..." searchable clearable />
      </div>
      <button
        disabled={submitting}
        onClick={async () => {
          if (!validate()) return;
          setSubmitting(true);
          await onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), email: email || undefined, phone: phone || undefined, accountId: accountId || undefined });
          setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setAccountId("");
          setSubmitting(false);
        }}
        style={{ padding: "10px 20px", borderRadius: 8, background: "rgba(218,218,219,0.2)", border: "1px solid rgba(218,218,219,0.3)", color: "#dadadb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        {submitting ? "Creating..." : "Create Contact"}
      </button>
    </div>
  );
}

/* ── Create Account Form with Validation + Address Fields ── */

function CreateAccountForm({ onSubmit }: { onSubmit: (data: { name: string; type: string; subType?: string; category?: string; operatingMarket?: string; website?: string; address?: { street?: string; city?: string; state?: string; zip?: string; venueName?: string } }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [subType, setSubType] = useState("");
  const [category, setCategory] = useState("");
  const [market, setMarket] = useState("");
  const [website, setWebsite] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [venueName, setVenueName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Account name is required";
    if (!type) e.type = "Type is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  return (
    <div style={{ padding: "20px 24px", borderRadius: 14, background: "rgba(12,12,18,0.8)", border: "1px solid rgba(218,218,219,0.15)", marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#dadadb", marginBottom: 16 }}>Create Account</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <input value={name} onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: "" })); }} placeholder="Account Name *" style={errors.name ? formInputErrorStyle : formInputStyle} />
          {errors.name && <p style={errorTextStyle}>{errors.name}</p>}
        </div>
        <div>
          <CRMPicker options={ACCOUNT_TYPES.map((value) => ({ value }))} value={type || null} onChange={(value) => { setType(value ?? ""); setErrors(p => ({ ...p, type: "" })); }} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="Select Type *" error={errors.type} searchable={false} />
          {errors.type && <p style={errorTextStyle}>{errors.type}</p>}
        </div>
        <CRMPicker options={Object.values(ACCOUNT_TYPE_SUBTYPES).flat().map((value) => ({ value }))} value={subType || null} onChange={(value) => setSubType(value ?? "")} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="Sub-Type (optional)" clearable />
        <CRMPicker options={["Los Angeles", "Miami", "Fort Lauderdale", "International", "Multi-Market"].map((value) => ({ value }))} value={market || null} onChange={(value) => setMarket(value ?? "")} getKey={(option) => option.value} getLabel={(option) => option.value} placeholder="Market (optional)" clearable />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" style={formInputStyle} />
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (optional)" style={formInputStyle} />
      </div>
      {/* Collapsible Address Section */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setShowAddress(v => !v)}
          type="button"
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--color-client-text-secondary)", padding: "4px 0", display: "flex", alignItems: "center", gap: 6 }}
        >
          <RacketIcon expanded={showAddress} size={14} color="var(--color-client-text-secondary)" />
          Address {showAddress ? "" : "(optional)"}
        </button>
        {showAddress && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street Address" style={{ ...formInputStyle, gridColumn: "1 / -1" }} />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={formInputStyle} />
            <input value={addrState} onChange={(e) => setAddrState(e.target.value)} placeholder="State" style={formInputStyle} />
            <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" style={formInputStyle} />
            <input value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="Venue Name (optional)" style={formInputStyle} />
          </div>
        )}
      </div>
      <button
        disabled={submitting}
        onClick={async () => {
          if (!validate()) return;
          setSubmitting(true);
          const address = (street || city || addrState || zip || venueName) ? { street: street || undefined, city: city || undefined, state: addrState || undefined, zip: zip || undefined, venueName: venueName || undefined } : undefined;
          await onSubmit({ name: name.trim(), type, subType: subType || undefined, category: category || undefined, operatingMarket: market || undefined, website: website || undefined, address });
          setName(""); setType(""); setSubType(""); setCategory(""); setMarket(""); setWebsite("");
          setStreet(""); setCity(""); setAddrState(""); setZip(""); setVenueName("");
          setShowAddress(false);
          setSubmitting(false);
        }}
        style={{ padding: "10px 20px", borderRadius: 8, background: "rgba(218,218,219,0.2)", border: "1px solid rgba(218,218,219,0.3)", color: "#dadadb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
      >
        {submitting ? "Creating..." : "Create Account"}
      </button>
    </div>
  );
}

/* ── Mobile Contact Card ── */

function MobileContactCard({ contact, onClick, accountName, lastActivityLabel, lastActivityColor: actColor }: {
  contact: Contact;
  onClick: () => void;
  accountName: string;
  lastActivityLabel: string;
  lastActivityColor: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--color-client-surface)",
        border: "1px solid var(--color-client-border)",
        cursor: "pointer",
        minHeight: 44,
        transition: "background 0.15s",
      }}
    >
      {/* Row 1: Name + Stage */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)" }}>{contact.name}</span>
        <StagePill stage={contact.stage} />
      </div>
      {/* Row 2: Company */}
      <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)", marginBottom: 6 }}>
        {accountName}
      </div>
      {/* Row 3: Last activity */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: actColor,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
          {lastActivityLabel}
        </span>
      </div>
    </button>
  );
}

/* ── Main View ── */

export function ContactsView({
  consoleData,
  consoleLoading = false,
  onConsoleRefresh,
}: {
  consoleData?: CRMConsolePayload;
  consoleLoading?: boolean;
  onConsoleRefresh?: () => Promise<CRMConsolePayload | null> | CRMConsolePayload | null | void;
}) {
  const { isMobile } = useResponsive();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterPreset | ContactStage>("All");
  const [sort, setSort] = useState<SortKey>("Recently added");
  const [view, setView] = useState<"table" | "grid">("table");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Saved view state
  const [activeView, setActiveView] = useState<string>("all");
  // Compound filter state
  const [filterOwner, setFilterOwner] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);

  // ── API-loaded state ──
  const [apiContacts, setApiContacts] = useState<Contact[]>([]);
  const [apiAccounts, setApiAccounts] = useState<Account[]>([]);
  const [apiCrmActivities, setApiCrmActivities] = useState<CRMActivity[]>([]);
  const [apiOpportunities, setApiOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  // Build a lookup of contactId → CRM activity dates for health/trust computations
  const crmDatesByContact = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const a of apiCrmActivities) {
      if (!a.contactId) continue;
      if (!map[a.contactId]) map[a.contactId] = [];
      map[a.contactId].push(a.occurredAt);
    }
    return map;
  }, [apiCrmActivities]);

  const applyConsoleData = useCallback((payload: CRMConsolePayload) => {
    setApiContacts(normalizeContacts(payload.contacts));
    setApiAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
    setApiCrmActivities(Array.isArray(payload.activities) ? payload.activities : []);
    setApiOpportunities(Array.isArray(payload.opportunities) ? payload.opportunities : []);
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
      const [cRes, aRes, actRes, oppRes] = await Promise.all([
        fetch("/api/crm/contacts"),
        fetch("/api/crm/accounts"),
        fetch("/api/crm/activities"),
        fetch("/api/crm/opportunities"),
      ]);
      if (cRes.ok) {
        const contactsData = await cRes.json();
        setApiContacts(normalizeContacts(Array.isArray(contactsData) ? contactsData : []));
      }
      if (aRes.ok) {
        const accountsData = await aRes.json();
        setApiAccounts(Array.isArray(accountsData) ? accountsData : []);
      }
      if (actRes.ok) {
        const activitiesData = await actRes.json();
        setApiCrmActivities(Array.isArray(activitiesData) ? activitiesData : []);
      }
      if (oppRes.ok) {
        const opportunitiesData = await oppRes.json();
        setApiOpportunities(Array.isArray(opportunitiesData) ? opportunitiesData : []);
      }
    } catch {
      // API unavailable — data stays empty or at current state
    } finally {
      setLoading(false);
    }
  }, [applyConsoleData, consoleData, onConsoleRefresh]);

  // Unique owners for dropdowns
  const uniqueOwners = useMemo(() => Array.from(new Set(apiContacts.map(c => c.owner ?? c.relationshipOwner).filter(Boolean) as string[])).sort(), [apiContacts]);

  // Activity timeline state
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);

  // CRM Notes state
  const [crmNotes, setCrmNotes] = useState<CRMNote[]>([]);

  // Create form state
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);

  // Email sync state (header button)
  const [headerSyncing, setHeaderSyncing] = useState(false);
  const [headerLastSynced, setHeaderLastSynced] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem("crm-email-last-synced"); } catch { return null; }
  });

  const handleHeaderEmailSync = useCallback(async () => {
    setHeaderSyncing(true);
    try {
      await fetch("/api/crm/sync-email", { method: "POST" });
      const ts = new Date().toISOString();
      setHeaderLastSynced(ts);
      try { window.localStorage.setItem("crm-email-last-synced", ts); } catch { /* ignore */ }
      // Refetch activities after sync
      const res = await fetch("/api/crm/activities");
      if (res.ok) setApiCrmActivities(await res.json());
    } catch { /* ignore */ }
    setHeaderSyncing(false);
  }, []);

  useEffect(() => {
    if (consoleData) {
      applyConsoleData(consoleData);
    } else if (!consoleLoading) {
      fetchData();
    }

    let stored = loadActivities();
    if (stored.length === 0) {
      stored = seedActivities();
      saveActivities(stored);
    }
    setActivities(stored);
    setActivitiesLoaded(true);

    // Load CRM notes, seed on first load
    let notes = loadNotes();
    if (notes.length === 0) {
      notes = [...SEED_CRM_NOTES];
      saveNotes(notes);
    }
    setCrmNotes(notes);
  }, [applyConsoleData, consoleData, consoleLoading, fetchData]);

  // Deep-link: auto-select contact/account/activity from URL params
  useEffect(() => {
    if (loading || apiContacts.length === 0) return;
    const selectId = searchParams.get("select");
    const accountId = searchParams.get("account");
    const activityId = searchParams.get("activity");
    if (selectId) {
      const rawContactId = fromDisplayId(selectId, apiContacts.map((c) => c.id), "contact");
      const contact = apiContacts.find((c) => c.id === rawContactId);
      if (contact) setSelected(contact);
    } else if (accountId) {
      const rawAccountId = fromDisplayId(accountId, apiAccounts.map((a) => a.id), "account");
      // Select first contact belonging to this account
      const contact = apiContacts.find((c) => c.accountId === rawAccountId);
      if (contact) setSelected(contact);
    } else if (activityId) {
      // Find the activity's contact and select it
      const activity = apiCrmActivities.find((a) => a.id === activityId);
      if (activity) {
        const contact = apiContacts.find((c) => c.id === activity.contactId);
        if (contact) setSelected(contact);
      }
    }
  }, [loading, apiContacts, apiCrmActivities, apiAccounts, searchParams]);

  const handleAddActivity = useCallback((text: string, mentions: string[]) => {
    const newActivity: Activity = {
      id: `act-${Date.now()}`,
      text,
      mentions,
      timestamp: Date.now(),
      provenance: "manual",
    };
    const updated = [newActivity, ...activities];
    setActivities(updated);
    saveActivities(updated);
  }, [activities]);

  const handleAddNote = useCallback((note: CRMNote) => {
    const updated = [note, ...crmNotes];
    setCrmNotes(updated);
    saveNotes(updated);
  }, [crmNotes]);

  const handleLogCrmActivity = useCallback(async (contactId: string, type: QuickEntryType, content: string) => {
    await fetch("/api/crm/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, type, content }),
    });
    // Re-fetch activities
    const res = await fetch("/api/crm/activities");
    if (res.ok) setApiCrmActivities(await res.json());
  }, []);

  const handleCreateContact = useCallback(async (data: { firstName: string; lastName: string; email?: string; phone?: string; accountId?: string; tags?: string[] }) => {
    const res = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const cRes = await fetch("/api/crm/contacts");
      if (cRes.ok) setApiContacts(normalizeContacts(await cRes.json()));
      setShowCreateContact(false);
    }
  }, []);

  const handleCreateAccount = useCallback(async (data: { name: string; type: string; subType?: string; category?: string; operatingMarket?: string; website?: string; address?: { street?: string; city?: string; state?: string; zip?: string; venueName?: string } }) => {
    const res = await fetch("/api/crm/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const aRes = await fetch("/api/crm/accounts");
      if (aRes.ok) setApiAccounts(await aRes.json());
      setShowCreateAccount(false);
    }
  }, []);

  const handleUpdateContact = useCallback(async (id: string, fields: Record<string, unknown>) => {
    const res = await fetch("/api/crm/contacts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (res.ok) {
      const cRes = await fetch("/api/crm/contacts");
      if (cRes.ok) setApiContacts(normalizeContacts(await cRes.json()));
    }
  }, []);

  const handleUpdateAccount = useCallback(async (id: string, fields: Record<string, unknown>) => {
    const res = await fetch("/api/crm/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (res.ok) {
      const aRes = await fetch("/api/crm/accounts");
      if (aRes.ok) setApiAccounts(await aRes.json());
    }
  }, []);

  const handleUpdateActivity = useCallback(async (id: string, content: string) => {
    const res = await fetch("/api/crm/activities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, content }),
    });
    if (res.ok) {
      const actRes = await fetch("/api/crm/activities");
      if (actRes.ok) setApiCrmActivities(await actRes.json());
    }
  }, []);

  const handleDeleteActivity = useCallback(async (id: string) => {
    const res = await fetch("/api/crm/activities", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      const actRes = await fetch("/api/crm/activities");
      if (actRes.ok) setApiCrmActivities(await actRes.json());
    }
  }, []);

  const handleSelectView = (key: string) => {
    setActiveView(key);
    if (key === "all") {
      setFilter("All");
    }
  };

  const clearAllFilters = () => {
    setActiveView("all");
    setFilter("All");
    setFilterOwner([]);
    setFilterPriority([]);
    setSearch("");
  };

  const activeViewDef = SAVED_VIEWS.find(v => v.key === activeView);

  const filtered = useMemo(() => {
    let base = apiContacts;
    // Apply saved view filter
    if (activeView !== "all" && activeViewDef) {
      base = base.filter(activeViewDef.filter);
    }
    // Apply legacy preset/stage filter (only when no saved view or "all" view)
    if (activeView === "all" && filter !== "All") {
      base = base.filter(c => matchesFilter(c, filter));
    }
    // Compound filters
    if (filterOwner.length > 0) base = base.filter(c => filterOwner.includes(c.owner ?? c.relationshipOwner ?? ""));
    if (filterPriority.length > 0) base = base.filter(c => filterPriority.includes(c.priority ?? ""));
    // Search
    base = base.filter(c => matchesSearch(c, search));
    // StandardTable handles column-level sort; apply base sort here
    return sortContacts(base, sort);
  }, [search, filter, sort, activeView, activeViewDef, filterOwner, filterPriority, apiContacts, apiAccounts]);

  const activeFilterCount = [filterOwner, filterPriority].filter((values) => values.length > 0).length + (activeView !== "all" ? 1 : 0) + (filter !== "All" && activeView === "all" ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || search;

  // All filter options: presets + stage divider
  const allFilters: (FilterPreset | ContactStage)[] = [...FILTER_PRESETS, ...CONTACT_STAGES];


  const toSortableString = useCallback((value: unknown): string => {
    if (value == null) return "";
    return String(value);
  }, []);

  const getContactCellValue = useCallback((c: Contact, key: string): string => {
    switch (key) {
      case "Contact": return toSortableString(c.name);
      case "Account": return toSortableString(getAccountName(c.accountId, apiAccounts));
      case "Trust": return toSortableString(trustLevel(computeTrustScore(c, crmDatesByContact[c.id])));
      case "Health": return toSortableString(computeHealthStatus(c, crmDatesByContact[c.id]));
      case "Action": return toSortableString(computeNextBestAction(c, crmDatesByContact[c.id]));
      case "Stage": return toSortableString(c.stage);
      case "Priority": return toSortableString(c.priority);
      case "Last Activity": {
        const acts = apiCrmActivities.filter(a => a.contactId === c.id);
        if (acts.length === 0) return "";
        const latest = acts.reduce((prev, cur) => cur.occurredAt > prev.occurredAt ? cur : prev);
        return toSortableString(formatActivityRelativeTime(latest.occurredAt));
      }
      case "Owner": return toSortableString(c.owner);
      default: return "";
    }
  }, [apiAccounts, apiCrmActivities, crmDatesByContact, toSortableString]);

  // StandardTable column definitions for CRM contacts — with custom cell renderers
  const contactStdCols: StandardTableColumn<Contact>[] = useMemo(() => [
    { key: "Contact", label: "Contact", getValue: (c: Contact) => toSortableString(c.name), render: (c: Contact) => (
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "linear-gradient(135deg, rgba(218,218,219,0.5), rgba(218,218,219,0.5))", color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.name.charAt(0)}</div>
        <div><div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-client-text)" }}>{c.name}</div>{c.title && <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{c.title}</div>}</div>
      </div>
    ) },
    { key: "Account", label: "Account", getValue: (c: Contact) => toSortableString(getAccountName(c.accountId, apiAccounts)), render: (c: Contact) => <span style={{ fontSize: 12, color: "var(--color-client-text-secondary)" }}>{getAccountName(c.accountId, apiAccounts)}</span> },
    { key: "Owner", label: "Owner", getValue: (c: Contact) => toSortableString(c.owner), render: (c: Contact) => <OwnerBadge owner={c.owner} compact /> },
    { key: "Trust", label: "Trust", getValue: (c: Contact) => toSortableString(trustLevel(computeTrustScore(c, crmDatesByContact[c.id]))), render: (c: Contact) => <InspectableValue value={`${trustLevel(computeTrustScore(c, crmDatesByContact[c.id]))} (${computeTrustScore(c, crmDatesByContact[c.id])})`} sourceClass="LOCAL" source="CRM data" method="Trust score computed from CRM contact fields and provenance" limitations="Based on CRM contact data, not verified sources" inline><TrustDot contact={c} crmActivityDates={crmDatesByContact[c.id]} /></InspectableValue> },
    { key: "Health", label: "Health", getValue: (c: Contact) => toSortableString(computeHealthStatus(c, crmDatesByContact[c.id])), render: (c: Contact) => <InspectableValue value={computeHealthStatus(c, crmDatesByContact[c.id])} sourceClass="LOCAL" source="CRM data" method="Health status computed from interaction recency and contact data" limitations="Based on CRM interaction history" inline><HealthPill contact={c} crmActivityDates={crmDatesByContact[c.id]} /></InspectableValue> },
    { key: "Action", label: "Action", getValue: (c: Contact) => toSortableString(computeNextBestAction(c, crmDatesByContact[c.id])), render: (c: Contact) => <span style={{ fontSize: 11, color: computeNextBestAction(c, crmDatesByContact[c.id]) === "No action needed" ? "var(--color-client-text-dim)" : "var(--color-client-text)", fontWeight: 500 }}>{computeNextBestAction(c, crmDatesByContact[c.id])}</span> },
    { key: "Stage", label: "Stage", getValue: (c: Contact) => toSortableString(c.stage), render: (c: Contact) => <InspectableValue value={c.stage} sourceClass="LOCAL" source="CRM data" method="Relationship stage from CRM contact data" inline><StagePill stage={c.stage} /></InspectableValue> },
    { key: "Priority", label: "Priority", getValue: (c: Contact) => toSortableString(c.priority), render: (c: Contact) => <PriorityPill priority={c.priority} /> },
    { key: "Last Activity", label: "Last Activity", getValue: (c: Contact) => getContactCellValue(c, "Last Activity"), render: (c: Contact) => { const acts = apiCrmActivities.filter(a => a.contactId === c.id); if (acts.length === 0) return <span style={{ fontSize: 12, color: "var(--color-client-text-dim)" }}>\u2014</span>; const latest = acts.reduce((prev, cur) => cur.occurredAt > prev.occurredAt ? cur : prev); return <span style={{ fontSize: 12, fontWeight: 500, color: lastActivityColor(latest.occurredAt) }}>{formatActivityRelativeTime(latest.occurredAt)}</span>; } },
  ], [apiAccounts, apiCrmActivities, crmDatesByContact, getContactCellValue, toSortableString]);

  // filteredByColFilters is now just filtered (StandardTable handles column filtering)
  const lens = searchParams.get("lens") || "all";
  const lensedFiltered = useMemo(() => {
    if (lens === "people") return filtered.filter((c) => !c.accountId || c.contactType === "person");
    if (lens === "business") return filtered.filter((c) => !!c.accountId || c.contactType === "employee");
    if (lens === "pro") return filtered.filter((c) => (c.interests ?? []).includes("Pro") || c.tags.some((t) => /pro/i.test(t)));
    if (lens === "mine") return filtered.filter((c) => c.owner === "Alex");
    if (lens === "missing-owner") return filtered.filter((c) => !c.owner);
    if (lens === "follow-up") return filtered.filter((c) => c.followUpState && c.followUpState !== "none");
    if (lens === "stale") return filtered.filter((c) => {
      const dates = crmDatesByContact[c.id];
      const lastActivity = dates?.length ? dates.reduce((latest, value) => value > latest ? value : latest, dates[0]) : undefined;
      const lastTouch = c.lastTouchAt ?? c.lastEmailAt ?? lastActivity;
      if (!lastTouch) return true;
      const days = Math.floor((Date.now() - new Date(lastTouch).getTime()) / 86400000);
      return Number.isFinite(days) && days >= 30;
    });
    return filtered;
  }, [crmDatesByContact, filtered, lens]);

  const allSelected = lensedFiltered.length > 0 && selectedIds.size === lensedFiltered.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < lensedFiltered.length;
  const patchSelected = useCallback(async (patchFor: (contact: Contact) => Partial<Contact>) => {
    const rows = Array.from(selectedIds).map((id) => apiContacts.find((c) => c.id === id)).filter((c): c is Contact => !!c);
    const results = await Promise.all(rows.map(async (contact) => {
      try {
        const res = await fetch("/api/crm/contacts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contact.id, ...patchFor(contact) }) });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedIds(new Set());
    await fetchData();
  }, [apiContacts, fetchData, selectedIds]);
  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch("/api/crm/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        return res.ok;
      } catch { return false; }
    }));
    const success = results.filter(Boolean).length;
    setBulkResult(`${success} succeeded · ${results.length - success} failed`);
    setSelectedIds(new Set());
    await fetchData();
  }, [fetchData, selectedIds]);

  const bulkBarNode = useMemo(() =>
    selectedIds.size > 0 ? (
      <BulkActionBar count={selectedIds.size} result={bulkResult} onClear={() => setSelectedIds(new Set())}>
        <BulkOwnerPrompt onPick={(owner) => void patchSelected(() => ({ owner: owner as Contact["owner"] }))} />
        <BulkInterestPrompt onPick={(tag) => void patchSelected((c) => ({ interests: Array.from(new Set([...(c.interests ?? []), tag])) }))} />
        <BulkPicklistPrompt label="Update stage..." options={CONTACT_STAGES.map((stage) => ({ value: stage }))} onPick={(stage) => void patchSelected(() => ({ stage: stage as Contact["stage"] }))} />
        <button type="button" onClick={() => void deleteSelected()} style={{ ...bulkButtonStyle, color: "#F87171" }}>Delete</button>
      </BulkActionBar>
    ) : null,
    [bulkResult, deleteSelected, patchSelected, selectedIds],
  );
  useCRMBulkBar(bulkBarNode);

  const contactColsWithSelect = useMemo<StandardTableColumn<Contact>[]>(() => [
    { key: "_select", label: "", sortable: false, filterable: false, minWidth: 36, maxWidth: 36, getValue: () => "", render: (c) => <SelectCell checked={selectedIds.has(c.id)} onChange={(checked) => setSelectedIds((prev) => { const next = new Set(prev); if (checked) next.add(c.id); else next.delete(c.id); return next; })} /> },
    ...contactStdCols,
  ], [contactStdCols, selectedIds]);

  const filteredByColFilters = lensedFiltered;

  return (
    <div className="fade-in-up" style={{ width: "100%", maxWidth: "none" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap" style={{ marginBottom: isMobile ? 14 : 18 }}>
        <div style={{ minWidth: 0, flex: "1 1 280px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <span style={{ width: 30, height: 30, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(218,218,219,0.12)", border: "1px solid rgba(218,218,219,0.28)", color: "#F4C7CA", fontSize: 13, fontWeight: 800 }}>
              C
            </span>
            <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 750 }}>
              Contacts list view
            </span>
          </div>
          <h2 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 750, color: "var(--color-client-text)", letterSpacing: "-0.01em", margin: 0 }}>
            Relationship workspace
          </h2>
          <p style={{ margin: "5px 0 0", fontSize: isMobile ? 12 : 13, color: "var(--color-client-text-secondary)", lineHeight: 1.45 }}>
            {apiContacts.length} contacts across Example Client operations, with relationship health, activity, ownership, and next actions in one list.
          </p>
        </div>
        <div
          className="flex gap-2"
          style={{
            flexWrap: "wrap",
            width: isMobile ? "100%" : undefined,
            padding: 4,
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.025)",
          }}
        >
          {/* Sync Emails */}
          <button
            onClick={handleHeaderEmailSync}
            disabled={headerSyncing}
            style={{
              padding: "0 11px",
              minHeight: isMobile ? 40 : 32,
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 6,
              background: headerSyncing ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: headerSyncing ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
              cursor: headerSyncing ? "default" : "pointer",
              transition: "background 0.15s",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: isMobile ? "1 1 140px" : undefined,
              justifyContent: "center",
            }}
            onMouseEnter={(e) => { if (!headerSyncing) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.12)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = headerSyncing ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"; }}
          >
            {headerSyncing ? (
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>↻</span>
            ) : (
              "Sync Emails ↻"
            )}
          </button>
          {headerLastSynced && !headerSyncing && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", alignSelf: "center", whiteSpace: "nowrap" }}>
              Synced {(() => {
                const mins = Math.floor((Date.now() - new Date(headerLastSynced).getTime()) / 60000);
                if (mins < 1) return "just now";
                if (mins === 1) return "1 min ago";
                return `${mins} min ago`;
              })()}
            </span>
          )}
          {/* Log Activity toggle */}
          <button
            onClick={() => setActivityExpanded((v) => !v)}
            style={{
              padding: "0 11px",
              minHeight: isMobile ? 40 : 32,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: activityExpanded ? "rgba(196,201,209,0.15)" : "rgba(255,255,255,0.04)",
              border: activityExpanded ? "1px solid rgba(196,201,209,0.3)" : "1px solid rgba(255,255,255,0.08)",
              color: activityExpanded ? "#C4C9D1" : "var(--color-client-text-secondary)",
              cursor: "pointer",
              transition: "all 0.2s",
              flex: isMobile ? "1 1 130px" : undefined,
            }}
          >
            {activityExpanded ? "Hide Activity Log" : "Log Activity"}
          </button>
          {/* View toggle */}
          {(["table", "grid"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "0 10px",
                minHeight: isMobile ? 40 : 32,
                borderRadius: 6,
                fontSize: isMobile ? 14 : 11,
                background: view === v ? "rgba(218,218,219,0.1)" : "rgba(255,255,255,0.03)",
                border: view === v ? "1px solid rgba(218,218,219,0.2)" : "1px solid rgba(255,255,255,0.06)",
                color: view === v ? "var(--color-client-text)" : "var(--color-client-text-secondary)",
                textTransform: "capitalize",
                flex: isMobile ? "1 1 76px" : undefined,
              }}
            >
              {v}
            </button>
          ))}
          {/* Create buttons */}
          <button
            onClick={() => { setShowCreateContact(!showCreateContact); setShowCreateAccount(false); }}
            style={{
              padding: "0 12px", minHeight: isMobile ? 40 : 32, borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: showCreateContact ? "rgba(218,218,219,0.15)" : "rgba(218,218,219,0.08)",
              border: showCreateContact ? "1px solid rgba(218,218,219,0.3)" : "1px solid rgba(218,218,219,0.15)",
              color: "#dadadb", cursor: "pointer", transition: "all 0.2s",
              flex: isMobile ? "1 1 120px" : undefined,
            }}
          >
            + Contact
          </button>
          <button
            onClick={() => { setShowCreateAccount(!showCreateAccount); setShowCreateContact(false); }}
            style={{
              padding: "0 12px", minHeight: isMobile ? 40 : 32, borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: showCreateAccount ? "rgba(218,218,219,0.15)" : "rgba(218,218,219,0.08)",
              border: showCreateAccount ? "1px solid rgba(218,218,219,0.3)" : "1px solid rgba(218,218,219,0.15)",
              color: "#dadadb", cursor: "pointer", transition: "all 0.2s",
              flex: isMobile ? "1 1 120px" : undefined,
            }}
          >
            + Account
          </button>
        </div>
      </div>

      {/* Create Contact Form */}
      {showCreateContact && (
        <CreateContactForm accounts={apiAccounts} onSubmit={handleCreateContact} />
      )}

      {/* Create Account Form */}
      {showCreateAccount && (
        <CreateAccountForm onSubmit={handleCreateAccount} />
      )}

      {/* Summary */}
      <SummaryStrip contacts={apiContacts} />

      {/* Recent Inbound Queue (Sprint 4) */}
      <InboundQueueStrip contacts={apiContacts} />

      {/* Collapsible Activity Log */}
      {activityExpanded && activitiesLoaded && (
        <div
          className="rounded-xl"
          style={{
            border: "1px solid var(--color-client-border)",
            background: "var(--color-client-surface)",
            marginBottom: 24,
            overflow: "hidden",
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--color-client-border-subtle)",
            }}
          >
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-client-text-dim)", fontWeight: 600 }}>
              Activity Log
            </span>
            <button
              onClick={() => setActivityExpanded(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-client-text-dim)",
                fontSize: isMobile ? 16 : 12,
                cursor: "pointer",
              }}
            >
              Collapse
            </button>
          </div>
          <div style={{ padding: "16px 18px" }}>
            <ActivityInput contacts={apiContacts} onSubmit={handleAddActivity} />
            <ActivityTimeline activities={activities} />
          </div>
        </div>
      )}

      {/* ── Controls Deck ── */}
      <LensToggleRow object="contacts" lenses={[{ key: "all", label: "All" }, { key: "people", label: "People" }, { key: "business", label: "Business contacts" }, { key: "follow-up", label: "Follow-up" }, { key: "stale", label: "Stale" }, { key: "missing-owner", label: "Missing owner" }, { key: "operators", label: "Operators" }, { key: "mine", label: "My contacts" }]} />
      <div
        style={{
          marginBottom: 12,
          padding: isMobile ? 12 : 14,
          borderRadius: 16,
          border: "1px solid rgba(218,218,219,0.12)",
          background: "linear-gradient(180deg, rgba(17,24,39,0.92) 0%, rgba(10,14,24,0.94) 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.22)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <div style={{ fontSize: 10, color: "#7DD3FC", textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, marginBottom: 6 }}>
              CRM workspace
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-client-text)" }}>
              Contacts command center
            </div>
          </div>

          <div
            className="flex items-center gap-2 flex-wrap"
            style={{
              padding: 4,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.03)",
              width: isMobile ? "100%" : undefined,
              overflowX: isMobile ? "auto" : undefined,
              flexWrap: isMobile ? "nowrap" : "wrap",
            }}
          >
            {SAVED_VIEWS.map((sv) => (
              <button
                key={sv.key}
                onClick={() => handleSelectView(sv.key)}
                className="rounded-lg"
                style={{
                  padding: "7px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: activeView === sv.key ? "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(34,197,94,0.12))" : "transparent",
                  border: activeView === sv.key ? "1px solid rgba(218,218,219,0.32)" : "1px solid transparent",
                  color: activeView === sv.key ? "#E0F2FE" : "var(--color-client-text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {sv.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search contacts, companies, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg"
            style={{
              padding: "10px 14px",
              fontSize: isMobile ? 16 : 13,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--color-client-text)",
              minWidth: 240,
              flex: "1 1 320px",
              width: isMobile ? "100%" : undefined,
              outline: "none",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          />

          <div
            className="flex flex-wrap items-center gap-2"
            style={{
              marginLeft: "auto",
              padding: 4,
              borderRadius: 14,
              border: "1px solid rgba(125,211,252,0.14)",
              background: "linear-gradient(135deg, rgba(14,116,144,0.16), rgba(30,41,59,0.42))",
              width: isMobile ? "100%" : undefined,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#7DD3FC", padding: "0 6px" }}>
              Sort
            </span>
            <CRMFilterDropdown
              options={SORT_OPTIONS.map((s) => ({ value: s, label: s }))}
              selectedValues={[sort]}
              onChange={(values) => setSort((values[0] as SortKey | undefined) ?? "Recently added")}
              allLabel="Recently added"
              minWidth={190}
              searchable={false}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-center gap-2" style={{ flex: "1 1 520px", width: "100%" }}>
            <div style={{ minWidth: 148, flex: isMobile ? "1 1 150px" : undefined }}>
              <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
                Focus filter
              </div>
              <CRMFilterDropdown
                options={CONTACT_STAGES.map((st) => ({ value: st, label: st }))}
                selectedValues={CONTACT_STAGES.includes(filter as ContactStage) ? [filter] : []}
                onChange={(values) => {
                  setFilter((values[0] as ContactStage | undefined) ?? "All");
                  setActiveView("all");
                }}
                allLabel="All stages"
                minWidth={148}
              />
            </div>

            <div style={{ minWidth: 148, flex: isMobile ? "1 1 150px" : undefined }}>
              <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
                Preset
              </div>
              <CRMFilterDropdown
                options={FILTER_PRESETS.filter((fp) => fp !== "All").map((fp) => ({ value: fp, label: fp }))}
                selectedValues={FILTER_PRESETS.includes(filter as FilterPreset) && filter !== "All" ? [filter] : []}
                onChange={(values) => {
                  const value = (values[0] as FilterPreset | undefined) ?? "All";
                  setFilter(value);
                  if (value !== "All") setActiveView("all");
                }}
                allLabel="All presets"
                minWidth={148}
              />
            </div>

            <div style={{ minWidth: 148, flex: isMobile ? "1 1 150px" : undefined }}>
              <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
                Owner
              </div>
              <CRMFilterDropdown options={uniqueOwners.map((o) => ({ value: o, label: o }))} selectedValues={filterOwner} onChange={setFilterOwner} allLabel="All owners" minWidth={148} />
            </div>

            <div style={{ minWidth: 148, flex: isMobile ? "1 1 150px" : undefined }}>
              <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
                Priority
              </div>
              <CRMFilterDropdown
                options={(["critical", "high", "medium", "low"] as const).map((p) => ({ value: p, label: PRIORITY_CONFIG[p].label }))}
                selectedValues={filterPriority}
                onChange={setFilterPriority}
                allLabel="All priorities"
                minWidth={148}
                searchable={false}
              />
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
              <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
                {activeFilterCount} active filter{activeFilterCount !== 1 ? "s" : ""}
              </span>
              <button
                onClick={clearAllFilters}
                className="rounded-lg"
                style={{
                  padding: "8px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--color-client-text-dim)",
                  cursor: "pointer",
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {activeView !== "all" && activeViewDef && (
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
              Viewing <span style={{ color: "#7DD3FC", fontWeight: 600 }}>{activeViewDef.label}</span>, {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setActiveView("all")}
              className="rounded-lg"
              style={{
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 600,
                background: "rgba(125,211,252,0.08)",
                border: "1px solid rgba(125,211,252,0.14)",
                color: "#7DD3FC",
                cursor: "pointer",
              }}
            >
              Exit view
            </button>
          </div>
        )}
      </div>

      {/* ── Active Query State Bar ── */}
      {hasAnyFilter ? (
        <div className="flex items-center gap-3" style={{ marginBottom: 12, padding: "6px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
          <span style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
            Showing {filteredByColFilters.length} of {apiContacts.length} contacts
            {activeView !== "all" && activeViewDef ? ` | View: ${activeViewDef.label}` : ""}
            {filter !== "All" && activeView === "all" ? ` | Filter: ${filter}` : ""}
            {filterPriority.length ? ` | Priority: ${filterPriority.map((priority) => PRIORITY_CONFIG[priority as ContactPriority]?.label ?? priority).join(", ")}` : ""}
            {filterOwner.length ? ` | Owner: ${filterOwner.join(", ")}` : ""}
            {search ? ` | Search: "${search}"` : ""}
          </span>
          <button
            onClick={clearAllFilters}
            className="rounded"
            style={{
              padding: "3px 8px",
              fontSize: 10,
              fontWeight: 600,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--color-client-text-dim)",
              cursor: "pointer",
              marginLeft: "auto",
            }}
          >
            Clear All
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "var(--color-client-text-dim)", marginBottom: 12 }}>
          {filtered.length} contact{filtered.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div
          className="rounded-xl flex items-center justify-center"
          style={{
            padding: "48px 24px",
            background: "var(--color-client-surface)",
            border: "1px solid var(--color-client-border)",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--color-client-text-dim)" }}>
            {activeView === "strategic"
              ? "No strategic contacts found"
              : filter === "Needs Attention"
              ? "All relationships are healthy"
              : "No contacts match these filters. Try adjusting your criteria."}
          </p>
        </div>
      ) : /* Mobile card view */
      isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((c, i) => {
            const contactActs = apiCrmActivities.filter(a => a.contactId === c.id);
            const latestAct = contactActs.length > 0
              ? contactActs.reduce((prev, cur) => cur.occurredAt > prev.occurredAt ? cur : prev)
              : null;
            const actLabel = latestAct ? formatActivityRelativeTime(latestAct.occurredAt) : "No activity";
            const actColor = latestAct ? lastActivityColor(latestAct.occurredAt) : "rgba(255,255,255,0.2)";
            return (
              <MobileContactCard
                key={c.id}
                contact={c}
                onClick={() => setSelected(c)}
                accountName={getAccountName(c.accountId, apiAccounts)}
                lastActivityLabel={actLabel}
                lastActivityColor={actColor}
              />
            );
          })}
        </div>
      ) : /* Table view */
      view === "table" ? (
        <StandardTable<Contact>
          tableKey="crm-contacts"
          columns={contactColsWithSelect}
          data={filteredByColFilters}
          toolbar={<label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--color-client-text-dim)" }}><SelectAllBox checked={allSelected} indeterminate={someSelected} onChange={(checked) => setSelectedIds(checked ? new Set(lensedFiltered.map((c) => c.id)) : new Set())} />Select all</label>}
          getRowKey={(c) => c.id}
          defaultSortKey="Contact"
          onRowClick={(c) => setSelected(c)}
          emptyMessage="No contacts match the current filters"
        />
      ) : (
        /* Grid view */
        <div className="crm-fluid-grid">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`text-left rounded-2xl transition-all duration-200 hover:scale-[1.01] fade-in-up stagger-${Math.min(i + 1, 6)}`}
              style={{
                padding: "20px",
                background: "var(--color-client-surface)",
                border: "1px solid var(--color-client-border)",
              }}
            >
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-xl"
                  style={{
                    width: 40,
                    height: 40,
                    background: "linear-gradient(135deg, rgba(218,218,219,0.5), rgba(218,218,219,0.5))",
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-client-text)" }}>{c.name}</div>
                  {c.title && <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>{c.title}</div>}
                </div>
                <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
                  <StagePill stage={c.stage} />
                  {provenanceBadge(c.provenance)}
                </div>
              </div>
              {c.company && (
                <div style={{ fontSize: 12, color: "var(--color-client-text-secondary)", marginBottom: 8 }}>{c.company}</div>
              )}
              {/* Trust / Health / Action row */}
              <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 8 }}>
                <TrustDot contact={c} crmActivityDates={crmDatesByContact[c.id]} />
                <HealthPill contact={c} crmActivityDates={crmDatesByContact[c.id]} />
              </div>
              {computeNextBestAction(c, crmDatesByContact[c.id]) !== "No action needed" && (
                <div style={{ fontSize: 11, color: "rgba(245,158,11,0.85)", fontWeight: 500, marginBottom: 8 }}>
                  {computeNextBestAction(c, crmDatesByContact[c.id])}
                </div>
              )}
              <div className="flex flex-wrap gap-1" style={{ marginBottom: 10 }}>
                {c.tags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded"
                    style={{
                      padding: "2px 6px",
                      fontSize: 9,
                      background: "rgba(218,218,219,0.08)",
                      color: "var(--color-client-blue)",
                      border: "1px solid rgba(218,218,219,0.12)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-client-text-dim)" }}>
                {lastInteractionLabel(c)}
              </div>
              {c.owner && (
                <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 6 }}>
                  Owner: {c.owner}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selected && typeof document !== "undefined" && createPortal(
        <DrawerErrorBoundary key={`boundary-${selected.id}`} onClose={() => setSelected(null)}><ContactDrawer key={selected.id} contact={selected} onClose={() => setSelected(null)} activities={activities} notes={crmNotes} onAddNote={handleAddNote} accounts={apiAccounts} crmActivities={apiCrmActivities} allContacts={apiContacts} opportunities={apiOpportunities} onLogActivity={handleLogCrmActivity} onUpdateContact={handleUpdateContact} onUpdateAccount={handleUpdateAccount} onUpdateActivity={handleUpdateActivity} onDeleteActivity={handleDeleteActivity} /></DrawerErrorBoundary>,
        document.body
      )}

      <AsteriskNote />
    </div>
  );
}
