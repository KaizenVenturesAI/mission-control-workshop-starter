// ── Example Client Mission Control CRM Contact Data ──

import { z } from "zod";

export type Provenance = "verified" | "seeded" | "manual" | "inferred" | "imported";

export interface CRMSourceRef {
  system: string;
  externalId?: string;
  url?: string;
  importBatchId?: string;
  label?: string;
  importedAt?: string;
}

export interface ContactInteraction {
  date: string;
  summary: string;
  channel?: string;
  provenance: Provenance;
}

export type ContactStage = "New" | "Active" | "Warm" | "Strategic" | "Dormant";
export type FollowUpState = "none" | "follow-up-this-week" | "waiting-on-reply" | "needs-founder-response" | "needs-agent-action";

export const CONTACT_STAGES: ContactStage[] = ["New", "Active", "Warm", "Strategic", "Dormant"];
export const FOLLOW_UP_STATES: { value: FollowUpState; label: string; color: string }[] = [
  { value: "none", label: "None", color: "transparent" },
  { value: "follow-up-this-week", label: "Follow Up", color: "rgb(251,191,36)" },
  { value: "waiting-on-reply", label: "Waiting", color: "rgb(96,165,250)" },
  { value: "needs-founder-response", label: "Needs Owner", color: "rgb(232,67,147)" },
  { value: "needs-agent-action", label: "Agent Action", color: "rgb(167,139,250)" },
];

export type ContactLocation = 'Los Angeles' | 'Miami' | 'Fort Lauderdale' | 'Chicago' | 'Rio de Janeiro' | 'Other';
export const CONTACT_LOCATIONS: ContactLocation[] = ['Los Angeles', 'Miami', 'Fort Lauderdale', 'Chicago', 'Rio de Janeiro', 'Other'];

export type ContactPriority = "low" | "medium" | "high" | "critical";

export const PRIORITY_CONFIG: Record<ContactPriority, { label: string; bg: string; text: string }> = {
  low:      { label: "Low",      bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.45)" },
  medium:   { label: "Medium",   bg: "rgba(96,165,250,0.12)",  text: "#60A5FA" },
  high:     { label: "High",     bg: "rgba(245,158,11,0.12)",  text: "#F59E0B" },
  critical: { label: "Critical", bg: "rgba(232,67,147,0.12)",  text: "#E84393" },
};

export interface Contact {
  id: string;
  name: string;
  title?: string;
  company?: string;
  accountId?: string;
  emails: string[];
  phone?: string;
  tags: string[];
  source: string;
  owner?: "Alex" | "Morgan" | "Mission Agent";
  interests?: string[];
  notes?: string;
  rates?: string;
  stage: ContactStage;
  priority?: ContactPriority;
  relationshipOwner?: string;
  supportingAgent?: string;
  primarySourceAccount?: string;
  linkedSourceAccounts?: string[];
  followUpState: FollowUpState;
  provenance: Provenance;
  interactions: ContactInteraction[];
  fieldProvenance?: Record<string, Provenance>;
  location?: ContactLocation;
  contactType?: "person" | "employee" | "vendor" | "partner";
  lastEmailAt?: string;
  employeeSourceId?: string; // org-chart person ID for employee dedup
  linkedinUrl?: string;
  lastTouchAt?: string;
  additionalEmails?: string[];
  deletedAt?: string;
  mergedInto?: string;
  convertedFromLeadId?: string;
  sourceRefs?: CRMSourceRef[];
}

export const contactSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  company: z.string().optional(),
  accountId: z.string().optional(),
  emails: z.array(z.string()),
  phone: z.string().optional(),
  tags: z.array(z.string()),
  source: z.string(),
  owner: z.enum(["Alex", "Morgan", "Mission Agent"]).optional(),
  interests: z.array(z.string()).optional(),
  notes: z.string().optional(),
  rates: z.string().optional(),
  stage: z.enum(["New", "Active", "Warm", "Strategic", "Dormant"]),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  relationshipOwner: z.string().optional(),
  supportingAgent: z.string().optional(),
  primarySourceAccount: z.string().optional(),
  linkedSourceAccounts: z.array(z.string()).optional(),
  followUpState: z.enum([
    "none",
    "follow-up-this-week",
    "waiting-on-reply",
    "needs-founder-response",
    "needs-agent-action",
  ]),
  provenance: z.enum(["verified", "seeded", "manual", "inferred", "imported"]),
  location: z
    .enum(["Los Angeles", "Miami", "Fort Lauderdale", "Chicago", "Rio de Janeiro", "Other"])
    .optional(),
  contactType: z.enum(["person", "employee", "vendor", "partner"]).optional(),
  lastEmailAt: z.string().optional(),
  employeeSourceId: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  lastTouchAt: z.string().datetime().optional(),
  additionalEmails: z.array(z.string()).optional(),
  deletedAt: z.string().optional(),
  mergedInto: z.string().optional(),
  convertedFromLeadId: z.string().optional(),
  sourceRefs: z
    .array(
      z.object({
        system: z.string(),
        externalId: z.string().optional(),
        url: z.string().optional(),
        importBatchId: z.string().optional(),
        label: z.string().optional(),
        importedAt: z.string().optional(),
      })
    )
    .optional(),
});

export const CONTACTS: Contact[] = [
  {
    id: "contact-example-client-example-client",
    name: "Alex",
    title: "Founder",
    company: "Example Client",
    accountId: "acc-example-client-sample-customer",
    emails: ["primary@example.invalid"],
    tags: ["Founder", "Mission Control", "Sample"],
    source: "Seed",
    owner: "Alex",
    stage: "Active",
    priority: "high",
    relationshipOwner: "Alex",
    supportingAgent: "Example Client Mission Agent",
    followUpState: "none",
    provenance: "seeded",
    interactions: [],
    notes: "Fictional starter contact. Replace with Example Client's real team, customers, partners, and vendors.",
    location: "Other",
    contactType: "person",
    lastTouchAt: "2026-06-22T00:00:00.000Z"
  },
  {
    id: "contact-example-client-operator",
    name: "Sample Operator",
    title: "Operations Lead",
    company: "Example Client Sample Customer",
    accountId: "acc-example-client-sample-customer",
    emails: ["operator@example.com"],
    tags: ["Operations", "Workflow", "Sample"],
    source: "Seed",
    owner: "Alex",
    stage: "New",
    priority: "medium",
    relationshipOwner: "Alex",
    supportingAgent: "Example Client Mission Agent",
    followUpState: "follow-up-this-week",
    provenance: "seeded",
    interactions: [],
    notes: "Fictional workflow stakeholder for testing CRM and action-board flows.",
    location: "Other",
    contactType: "person"
  }
];

/* ── Rules Engine: Trust, Health, Next-Best-Action, Staleness ── */

export type HealthStatus = "Healthy" | "At Risk" | "Cold" | "Critical" | "Unknown";

function getLastInteractionDate(contact: Contact, crmActivityDates?: string[]): Date | null {
  const dates: Date[] = [];
  // Check static interactions
  if (contact.interactions.length > 0) {
    dates.push(new Date(contact.interactions[0].date));
  }
  // Check CRM activity dates (from API)
  if (crmActivityDates) {
    for (const d of crmActivityDates) {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) dates.push(parsed);
    }
  }
  if (dates.length === 0) return null;
  // Return most recent
  dates.sort((a, b) => b.getTime() - a.getTime());
  return dates[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaysSince(daysSince: number): string {
  if (daysSince === 0) return "today";
  if (daysSince === 1) return "1d ago";
  if (daysSince < 7) return `${daysSince}d ago`;
  if (daysSince < 14) return "1 week ago";
  if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
  if (daysSince < 60) return `${Math.floor(daysSince / 30)} month ago`;
  return `${Math.floor(daysSince / 30)} months ago`;
}

export function computeTrustScore(contact: Contact, crmActivityDates?: string[]): number {
  let score = 100;
  const lastDate = getLastInteractionDate(contact, crmActivityDates);
  const daysSince = lastDate ? daysBetween(lastDate, new Date()) : null;

  if (daysSince === null) score -= 15; // no data, mild penalty
  else if (daysSince > 30) score -= 30;
  else if (daysSince > 14) score -= 20;

  if (contact.provenance === "manual" || contact.provenance === "seeded") score -= 25;
  if (!contact.emails.length && !contact.phone) score -= 10; // missing key fields

  return Math.max(0, Math.min(100, score));
}

export function computeTrustDeductions(contact: Contact, crmActivityDates?: string[]): string[] {
  const deductions: string[] = [];
  const lastDate = getLastInteractionDate(contact, crmActivityDates);
  const daysSince = lastDate ? daysBetween(lastDate, new Date()) : null;

  if (daysSince === null) deductions.push("-15: No interaction data available");
  else if (daysSince > 30) deductions.push(`-30: No interaction in ${daysSince}d (>30d threshold)`);
  else if (daysSince > 14) deductions.push(`-20: No interaction in ${daysSince}d (>14d threshold)`);

  if (contact.provenance === "manual" || contact.provenance === "seeded")
    deductions.push(`-25: Data provenance is "${contact.provenance}"`);
  if (!contact.emails.length && !contact.phone)
    deductions.push("-10: Missing email and phone");

  return deductions;
}

export function computeHealthStatus(contact: Contact, crmActivityDates?: string[]): HealthStatus {
  const lastDate = getLastInteractionDate(contact, crmActivityDates);
  if (!lastDate) return "Unknown";
  const daysSince = daysBetween(lastDate, new Date());
  if (daysSince < 14) return "Healthy";
  if (daysSince <= 30) return "At Risk";
  if (daysSince <= 60) return "Cold";
  return "Critical";
}

export function computeHealthReason(contact: Contact, crmActivityDates?: string[]): string {
  const lastDate = getLastInteractionDate(contact, crmActivityDates);
  if (!lastDate) return "No interactions yet";
  const daysSince = daysBetween(lastDate, new Date());
  const label = formatDaysSince(daysSince);
  if (daysSince < 14) return `Last contact ${label}`;
  if (daysSince <= 30) return `Last contact ${label} (approaching stale)`;
  if (daysSince <= 60) return `Last contact ${label} (cold)`;
  return `Last contact ${label} (critical)`;
}

export function computeNextBestAction(contact: Contact, crmActivityDates?: string[]): string {
  const lastDate = getLastInteractionDate(contact, crmActivityDates);
  const daysSince = lastDate ? daysBetween(lastDate, new Date()) : null;

  if (contact.followUpState === "waiting-on-reply") return "Follow up, pending response";
  if (contact.followUpState === "needs-founder-response") return "Needs owner action";
  if (contact.followUpState === "needs-agent-action") return "Agent action pending";
  if (daysSince === null) return "Log first interaction";
  if ((contact.priority === "critical" || contact.priority === "high") && daysSince > 21)
    return "Reconnect, high-value contact inactive";
  if (daysSince > 30) return `Follow up, last contact ${formatDaysSince(daysSince)}`;
  if (contact.followUpState === "follow-up-this-week") return "Follow up this week";
  return "No action needed";
}

export function computeStalenessFlags(contact: Contact, crmActivityDates?: string[]): string[] {
  const flags: string[] = [];
  const lastDate = getLastInteractionDate(contact, crmActivityDates);
  const daysSince = lastDate ? daysBetween(lastDate, new Date()) : null;

  if (daysSince === null || daysSince > 30) flags.push("Cold Contact");
  if (contact.followUpState !== "none" && (daysSince === null || daysSince > 7)) flags.push("Overdue Follow-Up");
  if (contact.stage === "Strategic" && (daysSince === null || daysSince > 21)) flags.push("Dormant Strategic");

  return flags;
}

/* ── Call Notes ── */

export interface CRMNote {
  id: string;
  contactId: string;
  date: string; // ISO date
  title?: string;
  content: string;
  source: "manual" | "meetings-channel" | "imported";
  provenance: Provenance;
  creator?: string;
}

export const SEED_CRM_NOTES: CRMNote[] = [];

export const ALL_TAGS = Array.from(new Set(CONTACTS.flatMap((c) => c.tags))).sort();

export const FILTER_PRESETS = [
  "All",
  "Needs Attention",
  "Partners",
  "Mission Control Build",
  "Team",
  "Vendors",
  "VIP",
  "Strategic",
  "Waiting",
] as const;

export type FilterPreset = (typeof FILTER_PRESETS)[number];

export function getFollowUpLabel(state: FollowUpState): string {
  return FOLLOW_UP_STATES.find(s => s.value === state)?.label ?? "";
}
export function getFollowUpColor(state: FollowUpState): string {
  return FOLLOW_UP_STATES.find(s => s.value === state)?.color ?? "transparent";
}
