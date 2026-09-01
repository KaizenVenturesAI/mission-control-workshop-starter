import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { createActivity, getContacts } from "@/lib/crm/store";
import { gmailOutbox } from "@/lib/googleWorkspace/gmailOutbox";
import { BD_DEFAULT_CC, CLIENT_OPERATOR_EMAIL, CLIENT_SIGNATURE_VERSION } from "@/lib/crm/missionAgentSignature";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const DRAFTS_DIR = path.join(DATA_DIR, "pending-bd-email-drafts");

try { mkdirSync(DRAFTS_DIR, { recursive: true }); } catch { /* already exists */ }

export type BDDraftStatus = "pending_approval" | "approved" | "sent" | "send_failed" | "cancelled";

export interface BDDraftSlackRef {
  channelId?: string;
  channelName?: string;
  messageTs?: string;
  threadTs?: string;
  approvalReaction?: string;
  approvalUserId?: string;
  approvedAt?: string;
  postedDraftTs?: string;
}

export interface PendingBDEmailDraft {
  id: string;
  status: BDDraftStatus;
  from: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  signatureVersion: string;
  contactId: string;
  accountId?: string;
  opportunityId?: string;
  activityId: string;
  intakeId: string;
  sourceNote: string;
  sourceSlack?: BDDraftSlackRef;
  warnings: string[];
  approvalOwner?: string;
  assignedOwner?: string;
  businessMotion?: string;
  packageSuggestion?: string;
  senderMode?: string;
  nextActionDueAt?: string;
  approvalDueAt?: string;
  followUpDueAt?: string;
  bumpDueAt?: string;
  nurtureDueAt?: string;
  promiseActionItemIds?: string[];
  completionStatus?: {
    complete: boolean;
    missing: string[];
  };
  memoryWriteBack?: {
    required: boolean;
    written: boolean;
    ref?: string;
  };
  createdAt: string;
  updatedAt: string;
  gmailDraftId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  sendError?: string;
}

export interface CreateBDEmailDraftInput {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  contactId: string;
  accountId?: string;
  opportunityId?: string;
  activityId: string;
  intakeId: string;
  sourceNote: string;
  sourceSlack?: BDDraftSlackRef;
  warnings?: string[];
  approvalOwner?: string;
  assignedOwner?: string;
  businessMotion?: string;
  packageSuggestion?: string;
  senderMode?: string;
  nextActionDueAt?: string;
  approvalDueAt?: string;
  followUpDueAt?: string;
  bumpDueAt?: string;
  nurtureDueAt?: string;
  promiseActionItemIds?: string[];
  completionStatus?: PendingBDEmailDraft["completionStatus"];
  memoryWriteBack?: PendingBDEmailDraft["memoryWriteBack"];
  createGmailDraft?: boolean;
}

function now(): string {
  return new Date().toISOString();
}

function draftPath(id: string): string {
  return path.join(DRAFTS_DIR, `${id}.json`);
}

function safeSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "draft";
}

function generateDraftId(contactId: string): string {
  return `bd-draft-${Date.now()}-${safeSegment(contactId)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function writeBDEmailDraft(draft: PendingBDEmailDraft): PendingBDEmailDraft {
  writeFileSync(draftPath(draft.id), JSON.stringify(draft, null, 2), "utf-8");
  return draft;
}

export function readBDEmailDraft(id: string): PendingBDEmailDraft | null {
  try {
    return JSON.parse(readFileSync(draftPath(id), "utf-8")) as PendingBDEmailDraft;
  } catch {
    return null;
  }
}

export function listBDEmailDrafts(limit = 50): PendingBDEmailDraft[] {
  try {
    return readdirSync(DRAFTS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        try {
          return JSON.parse(readFileSync(path.join(DRAFTS_DIR, name), "utf-8")) as PendingBDEmailDraft;
        } catch {
          return null;
        }
      })
      .filter((draft): draft is PendingBDEmailDraft => Boolean(draft))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function createBDEmailDraft(input: CreateBDEmailDraftInput): PendingBDEmailDraft {
  const timestamp = now();
  const draft: PendingBDEmailDraft = {
    id: generateDraftId(input.contactId),
    status: "pending_approval",
    from: CLIENT_OPERATOR_EMAIL,
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : [BD_DEFAULT_CC],
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    signatureVersion: CLIENT_SIGNATURE_VERSION,
    contactId: input.contactId,
    accountId: input.accountId,
    opportunityId: input.opportunityId,
    activityId: input.activityId,
    intakeId: input.intakeId,
    sourceNote: input.sourceNote,
    sourceSlack: input.sourceSlack,
    warnings: input.warnings ?? [],
    approvalOwner: input.approvalOwner,
    assignedOwner: input.assignedOwner,
    businessMotion: input.businessMotion,
    packageSuggestion: input.packageSuggestion,
    senderMode: input.senderMode,
    nextActionDueAt: input.nextActionDueAt,
    approvalDueAt: input.approvalDueAt,
    followUpDueAt: input.followUpDueAt,
    bumpDueAt: input.bumpDueAt,
    nurtureDueAt: input.nurtureDueAt,
    promiseActionItemIds: input.promiseActionItemIds,
    completionStatus: input.completionStatus,
    memoryWriteBack: input.memoryWriteBack,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (input.createGmailDraft !== false) {
    const result = gmailOutbox({
      action: "draft",
      from: draft.from,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      textBody: draft.bodyText,
      htmlBody: draft.bodyHtml,
    });
    if (result.ok) {
      draft.gmailDraftId = result.id;
      draft.gmailThreadId = result.threadId;
    } else {
      draft.warnings = [...draft.warnings, `Gmail draft not created: ${result.error ?? "unknown error"}`];
    }
  }

  return writeBDEmailDraft(draft);
}

export function markBDEmailDraftPosted(id: string, postedDraftTs: string): PendingBDEmailDraft | null {
  const draft = readBDEmailDraft(id);
  if (!draft) return null;
  draft.sourceSlack = { ...(draft.sourceSlack ?? {}), postedDraftTs };
  draft.updatedAt = now();
  return writeBDEmailDraft(draft);
}

export function sendApprovedBDEmailDraft(id: string, approval: { approvedBy?: string; approvalReaction?: string } = {}): PendingBDEmailDraft {
  const draft = readBDEmailDraft(id);
  if (!draft) throw new Error("DRAFT_NOT_FOUND");

  if (draft.status === "sent") return draft;
  if (draft.status === "cancelled") throw new Error("DRAFT_CANCELLED");

  const approvedAt = now();
  draft.status = "approved";
  draft.sourceSlack = {
    ...(draft.sourceSlack ?? {}),
    approvalReaction: approval.approvalReaction ?? "white_check_mark",
    approvalUserId: approval.approvedBy,
    approvedAt,
  };
  draft.updatedAt = approvedAt;
  writeBDEmailDraft(draft);

  const result = gmailOutbox({
    action: "send",
    from: draft.from,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    textBody: draft.bodyText,
    htmlBody: draft.bodyHtml,
    threadId: draft.gmailThreadId,
  });

  if (!result.ok) {
    draft.status = "send_failed";
    draft.sendError = result.error || "Gmail send failed";
    draft.updatedAt = now();
    writeBDEmailDraft(draft);
    return draft;
  }

  draft.status = "sent";
  draft.gmailMessageId = result.id;
  draft.gmailThreadId = result.threadId ?? draft.gmailThreadId;
  draft.updatedAt = now();
  writeBDEmailDraft(draft);

  const contact = getContacts({ includeMerged: true }).find((item) => item.id === draft.contactId);
  createActivity({
    contactId: draft.contactId,
    accountId: draft.accountId ?? contact?.accountId,
    type: "Email",
    content: [
      `BD follow-up sent: ${draft.subject}`,
      `From: ${draft.from}`,
      `To: ${draft.to.join(", ")}`,
      draft.cc.length ? `CC: ${draft.cc.join(", ")}` : undefined,
      draft.businessMotion ? `Business motion: ${draft.businessMotion}` : undefined,
      draft.assignedOwner ? `Assigned owner: ${draft.assignedOwner}` : undefined,
      draft.senderMode ? `Sender mode: ${draft.senderMode}` : undefined,
      draft.packageSuggestion ? `Package suggestion: ${draft.packageSuggestion}` : undefined,
      draft.promiseActionItemIds?.length ? `Promise action items: ${draft.promiseActionItemIds.join(", ")}` : undefined,
      draft.sourceSlack?.approvalUserId ? `Approved by Slack user: ${draft.sourceSlack.approvalUserId}` : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n"),
    source: "Manual",
    provenance: "verified",
    externalRef: draft.gmailMessageId || draft.id,
  });

  return draft;
}
