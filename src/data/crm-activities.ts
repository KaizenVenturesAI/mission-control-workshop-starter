// ── Example Client Mission Control CRM Activity Timeline Data ──

export type ActivityType = "Call" | "Note" | "Email" | "Meeting" | "Inbound Lead" | "Task" | "Outreach" | "Follow-Up";
export type ActivitySource = "Manual" | "Import" | "Form Sync" | "Fireflies" | "Gmail Sync" | "System" | "Seeded";

export interface CRMActivity {
  id: string;
  contactId?: string;
  accountId?: string;
  type: ActivityType;
  occurredAt: string; // ISO date or datetime
  content: string;
  source: ActivitySource;
  provenance: "verified" | "seeded" | "manual" | "inferred" | "imported";
  externalRef?: string;
  // Email-specific fields (Gmail Sync)
  emailSubject?: string;
  emailFrom?: string;
  emailTo?: string[];
  emailBodyText?: string;
  // Fireflies-specific fields
  meetingTitle?: string;
  participants?: string[];
  durationMinutes?: number;
  summary?: string;
  recordingLink?: string;
  sourceSheet?: string;
  sourceUrl?: string;
  importBatchId?: string;
  sourceRecordTitle?: string;
  matchType?: "email" | "name+phone" | "name-only" | "new";
  createdAt: string;
  updatedAt: string;
}

/* ── SEEDED Activities ── */

export const CRM_ACTIVITIES: CRMActivity[] = [
  {
    id: "activity-example-client-discovery-kickoff",
    accountId: "acc-example-client-sample-customer",
    contactId: "contact-example-client-example-client",
    type: "Note",
    occurredAt: "2026-06-22T00:00:00.000Z",
    content: "Discovery kickoff placeholder. Replace this fictional note with Example Client's real workflow discovery notes.",
    source: "Seeded",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    provenance: "seeded"
  }
];
