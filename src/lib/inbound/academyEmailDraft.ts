/**
 * Example Client install auto-response email scaffold.
 *
 * Generates first-response email drafts for academy-la and academy-miami
 * leads that are new and have not yet been contacted.
 *
 * IMPORTANT: This does NOT send any email. It writes a pending draft to
 * .data/pending-email-drafts/{leadId}.json marked as
 * "send_pending_human_approval".  Alex must review and approve before
 * any email goes out.
 *
 * Sprint 7 — speed-to-lead scaffolding.
 */

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const DRAFTS_DIR = path.join(DATA_DIR, "pending-email-drafts");

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

const ACADEMY_LA_TEMPLATE = {
  from: "primary@example.invalid",
  fromName: "Example Client Mission Agent — Example Client",
  cc: ["primary@example.invalid"],
  subjectTemplate: (name: string) => `Your Example Client Half-Day Install Inquiry - Next Steps`,
  bodyTemplate: (name: string) => `Hi ${name},

Thank you for reaching out about a Example Client half-day install. We're excited to connect with you.

We received your inquiry and want to move quickly. Here's what happens next:

1. **Scope Check** - We'll confirm the operating problem, systems involved, and what a half-day install should produce.

2. **Install Plan** - We'll recommend the right workflow, agents, dashboards, and handoff artifacts.

3. **Scheduling** - Once aligned, we'll lock the install window and prep checklist.

If you have any questions in the meantime, just reply to this email. I'm reviewing install inquiries closely.

Looking forward to helping you get this operating cleanly.

Example Client Mission Agent
Example Client | Install Operations
primary@example.invalid`,
};

const ACADEMY_MIAMI_TEMPLATE = {
  from: "primary@example.invalid",
  fromName: "Example Client Mission Agent — Example Client",
  cc: ["primary@example.invalid"],
  subjectTemplate: (name: string) => `Your Example Client Full-Day Install Inquiry - Next Steps`,
  bodyTemplate: (name: string) => `Hi ${name},

Thank you for reaching out about a Example Client full-day install. We're thrilled to hear from you.

We received your inquiry and we're moving fast to understand the right implementation path.

1. **Scope Check** - We'll confirm the business process, data sources, permissions, and success criteria.

2. **Install Plan** - We'll map the right Mission Control surface, agent workflow, and operator handoff.

3. **Scheduling** - You'll receive the prep checklist, session plan, and follow-up structure.

Questions? Hit reply anytime. I'm actively working through install inquiries and will get back to you quickly.

Talk soon.

Example Client Mission Agent
Example Client | Install Operations
primary@example.invalid`,
};

// ---------------------------------------------------------------------------
// Draft types
// ---------------------------------------------------------------------------

export interface InstallProgramEmailDraft {
  status: "send_pending_human_approval";
  leadId: string;
  leadType: "academy-la" | "academy-miami";
  leadName: string;
  leadEmail: string;
  generatedAt: string;
  draftFile: string;
  email: {
    from: string;
    fromName: string;
    to: string;
    cc: string[];
    subject: string;
    body: string;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a draft email for an academy lead.
 * Returns null if the lead is not academy-la or academy-miami,
 * or has no email address to send to.
 */
export function generateInstallProgramEmailDraft(lead: InboundLeadRecord): InstallProgramEmailDraft | null {
  if (lead.type !== "academy-la" && lead.type !== "academy-miami") return null;
  if (!lead.email?.trim()) return null;

  const template = lead.type === "academy-la" ? ACADEMY_LA_TEMPLATE : ACADEMY_MIAMI_TEMPLATE;
  const firstName = extractFirstName(lead.name);
  const draftFile = path.join(DRAFTS_DIR, `${lead.id}.json`);

  return {
    status: "send_pending_human_approval",
    leadId: lead.id,
    leadType: lead.type,
    leadName: lead.name,
    leadEmail: lead.email.trim(),
    generatedAt: new Date().toISOString(),
    draftFile,
    email: {
      from: template.from,
      fromName: template.fromName,
      to: lead.email.trim(),
      cc: template.cc,
      subject: template.subjectTemplate(firstName),
      body: template.bodyTemplate(firstName),
    },
  };
}

/**
 * Write a pending email draft to disk.
 * Safe to call multiple times — overwrites if the draft already exists.
 * Never throws; logs errors instead.
 */
export function writeInstallProgramEmailDraft(lead: InboundLeadRecord): InstallProgramEmailDraft | null {
  const draft = generateInstallProgramEmailDraft(lead);
  if (!draft) return null;

  try {
    mkdirSync(DRAFTS_DIR, { recursive: true });
    writeFileSync(draft.draftFile, JSON.stringify(draft, null, 2), "utf-8");
    console.log(`[inbound/academy-draft] Draft written → ${draft.draftFile} (status: send_pending_human_approval)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[inbound/academy-draft] Failed to write draft for ${lead.id}: ${message}`);
    return null;
  }

  return draft;
}

/**
 * Process a batch of new leads — write drafts for all eligible academy leads.
 * Skips leads that already have contactedAt set (already touched).
 */
export function processInstallProgramDraftsForNewLeads(leads: InboundLeadRecord[]): {
  drafted: number;
  skipped: number;
} {
  let drafted = 0;
  let skipped = 0;

  for (const lead of leads) {
    // Only academy types
    if (lead.type !== "academy-la" && lead.type !== "academy-miami") continue;
    // Only new status, no prior contact
    if (lead.status !== "new") { skipped += 1; continue; }
    if (lead.contactedAt) { skipped += 1; continue; }
    // Need an email to send to
    if (!lead.email?.trim()) { skipped += 1; continue; }

    const result = writeInstallProgramEmailDraft(lead);
    if (result) {
      drafted += 1;
    } else {
      skipped += 1;
    }
  }

  return { drafted, skipped };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
