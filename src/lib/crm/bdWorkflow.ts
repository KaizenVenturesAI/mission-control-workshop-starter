import type { Account } from "@/data/accounts";
import type { Contact } from "@/data/contacts";
import type { Opportunity, OpportunityLocation, OpportunityOwner, OpportunityType } from "@/data/opportunities";
import { readActionItems, writeActionItems, nextActionItemId } from "@/lib/action-items/store";
import {
  createAccount,
  createActivity,
  createContact,
  createOpportunity,
  getAccounts,
  getContacts,
  getOpportunities,
  updateAccount,
  updateContact,
} from "@/lib/crm/store";
import {
  appendMissionAgentSignatureHtml,
  appendMissionAgentSignatureText,
  BD_DEFAULT_CC,
  CLIENT_OPERATOR_EMAIL,
  plainTextToHtml,
} from "@/lib/crm/missionAgentSignature";
import { createBDEmailDraft, listBDEmailDrafts, markBDEmailDraftPosted, writeBDEmailDraft, type PendingBDEmailDraft } from "@/lib/crm/bdDrafts";
import { postBDDraftToSlack } from "@/lib/slack/bd";
import { newBrainId, normalizeMemoryText, nowIso, slugify, updateBrainStore } from "@/lib/brain/store";
import type { BrainEntity } from "@/lib/brain/types";
import type { ActionItem, Priority } from "@/types/action-item";

const FREE_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

export interface BDSlackSource {
  channelId?: string;
  channelName?: string;
  messageTs?: string;
  threadTs?: string;
  userId?: string;
  permalink?: string;
}

export interface BDIntakeInput {
  note: string;
  createOpportunity?: boolean;
  dryRun?: boolean;
  idempotencyKey?: string;
  slack?: BDSlackSource;
  baseUrl?: string;
}

export interface BDParsedIntake {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  company?: string;
  title?: string;
  domain?: string;
  opportunityType?: OpportunityType;
  opportunityRequested: boolean;
  location?: OpportunityLocation;
  businessMotion: BDBusinessMotion;
  assignedOwner: BDAssignedOwner;
  packageSuggestion: string;
  senderMode: BDSenderMode;
  strategicMemoryRequired: boolean;
}

export type BDBusinessMotion = "Install" | "Mission Control Build" | "Referral Partnership" | "Strategic Founder" | "General BD";
export type BDAssignedOwner = "Alex" | "Glenda" | "Mission Agent" | "Lorhan" | "Stephan";
export type BDSenderMode = "missionAgent_on_behalf_of_example-client" | "example-client_personal_draft" | "internal_only" | "route_to_owner";

export interface BDPromiseCapture {
  id: string;
  owner: string;
  action: string;
  dueDate: string;
  actionItemId?: string;
  confidence: number;
}

export interface BDSLA {
  firstFollowUpDueAt: string;
  approvalDueAt: string;
  bumpDueAt: string;
  nurtureDueAt: string;
}

export interface BDCompletionCheck {
  complete: boolean;
  missing: string[];
  contact: boolean;
  account: boolean;
  activity: boolean;
  draft: boolean;
  owner: boolean;
  nextAction: boolean;
  dueDate: boolean;
  opportunityDecision: "created" | "existing" | "skipped" | "needs_review";
}

export interface BDOperationalState {
  approvalQueue: {
    owner: "Alex";
    draftId: string;
    status: PendingBDEmailDraft["status"];
    approvalDueAt: string;
    slackMessageTs?: string;
  };
  promises: BDPromiseCapture[];
  sla: BDSLA;
  packageSuggestion: string;
  routing: {
    businessMotion: BDBusinessMotion;
    assignedOwner: BDAssignedOwner;
    note: string;
  };
  senderMode: BDSenderMode;
  completion: BDCompletionCheck;
  memoryWriteBack?: {
    required: boolean;
    written: boolean;
    ref?: string;
  };
}

export interface BDIntakeResult {
  intakeId: string;
  parsed: BDParsedIntake;
  contact: Contact;
  account?: Account;
  activityId: string;
  opportunity?: Opportunity;
  draft: PendingBDEmailDraft;
  created: {
    contact: boolean;
    account: boolean;
    opportunity: boolean;
  };
  enrichment: {
    attempted: boolean;
    ok: boolean;
    skipped?: boolean;
    error?: string;
  };
  slackPost: {
    attempted: boolean;
    ok: boolean;
    skipped?: boolean;
    error?: string;
  };
  warnings: string[];
  duplicate: boolean;
  operationalState?: BDOperationalState;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return now().slice(0, 10);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailDomain(email: string): string | undefined {
  return email.split("@")[1]?.trim().toLowerCase();
}

function domainToCompany(domain: string): string {
  const base = domain.split(".")[0] || domain;
  return base
    .split(/[-_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function accountKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/\b(inc|llc|corp|co|company)\b/g, "");
}

function extractEmail(note: string): string | null {
  return note.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? null;
}

function extractField(note: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:=-]\\s*([^\\n;|]+)`, "i");
    const match = note.match(pattern)?.[1]?.trim();
    if (match) return match.replace(/[.,]+$/, "");
  }
  return undefined;
}

function extractCompany(note: string, domain?: string): string | undefined {
  const explicit = extractField(note, ["company", "account", "brand", "organization", "org"]);
  if (explicit) return explicit;
  const fromPhrase = note.match(/\b(?:at|from|with)\s+([A-Z][A-Za-z0-9&'. -]{2,60})(?:[,.]|\s+(?:and|who|about|for|to)\b|$)/)?.[1]?.trim();
  if (fromPhrase && !/@/.test(fromPhrase)) return fromPhrase;
  return domain && !FREE_EMAIL_DOMAINS.has(domain) ? domainToCompany(domain) : undefined;
}

function extractName(note: string, email: string): string {
  const explicit = extractField(note, ["name", "contact", "person"]);
  if (explicit) return explicit;

  const beforeEmail = note.slice(0, note.toLowerCase().indexOf(email.toLowerCase()));
  const metMatch = beforeEmail.match(/\b(?:met|meet|meeting with|spoke with|talked to|introduced to)\s+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})/);
  if (metMatch?.[1]) return metMatch[1].trim();

  const lastLine = beforeEmail
    .split(/\n|[.;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .pop();
  const nameMatch = lastLine?.match(/([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})$/)?.[1];
  if (nameMatch) return nameMatch.trim();

  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  return local.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = normalizeWhitespace(name).split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "Unknown",
    lastName: parts.slice(1).join(" ") || "Contact",
  };
}

function inferOpportunityType(note: string): OpportunityType | undefined {
  const lower = note.toLowerCase();
  if (/\b(full.?day|full day|implementation day)\b/.test(lower)) return "Full-Day Install";
  if (/\b(install|openclaw|academy|lesson|clinic|membership|training)\b/.test(lower)) return "Half-Day Install";
  if (/\b(hourly|consulting hours|advisory hours)\b/.test(lower)) return "Hourly Consulting";
  if (/\b(vip ticket|vip seat|vip admission)\b/.test(lower)) return "Event - VIP";
  if (/\b(ticket|seat|general admission|event admission)\b/.test(lower)) return "Event - General Admission";
  if (/\b(mission control|dashboard|portal|build|implementation|corporate|offsite|team.?building|private event|company event|event)\b/.test(lower)) return "Mission Control Build";
  if (/\b(partnership|partner|referral|intro|sponsor|sponsorship|brand|activation|collab|collaboration)\b/.test(lower)) return "Referral Partnership";
  return undefined;
}

function inferOpportunityRequested(note: string, explicit?: boolean): boolean {
  if (explicit) return true;
  return /\b(create|open|add|make)\s+(an?\s+)?opportunit|\b(opportunity|deal|pipeline|proposal|quote|budget|sponsor|corporate event)\b/i.test(note);
}

function inferLocation(note: string): OpportunityLocation | undefined {
  const lower = note.toLowerCase();
  if (/\b(miami|south florida)\b/.test(lower)) return "Miami";
  if (/\b(fort lauderdale|ft lauderdale|ft\. lauderdale)\b/.test(lower)) return "Fort Lauderdale";
  if (/\b(los angeles|la|l\.a\.|venice|santa monica)\b/.test(lower)) return "Los Angeles";
  if (/\b(chicago)\b/.test(lower)) return "Chicago";
  if (/\b(rio|rio de janeiro)\b/.test(lower)) return "Rio de Janeiro";
  return undefined;
}

function inferBusinessMotion(note: string, opportunityType?: OpportunityType): BDBusinessMotion {
  const lower = note.toLowerCase();
  if (/\b(founder|co-?founder|investor|board|ceo|c-suite|c suite|strategic|capital|fundraise|vip|personal intro|high value)\b/.test(lower)) {
    return "Strategic Founder";
  }
  if (opportunityType === "Mission Control Build" || opportunityType === "Corporate Events") return "Mission Control Build";
  if (opportunityType === "Referral Partnership" || opportunityType === "Brand Partnerships") return "Referral Partnership";
  if (opportunityType === "Half-Day Install" || opportunityType === "Full-Day Install" || opportunityType === "OpenClaw Install Day" || opportunityType === "Install Program") return "Install";
  return "General BD";
}

function assignedOwnerForMotion(motion: BDBusinessMotion, location?: OpportunityLocation): BDAssignedOwner {
  if (motion === "Strategic Founder") return "Alex";
  if (motion === "Mission Control Build") return "Alex";
  if (motion === "Referral Partnership") return "Mission Agent";
  if (motion === "Install") return "Mission Agent";
  return "Mission Agent";
}

function suggestPackage(motion: BDBusinessMotion, location?: OpportunityLocation): string {
  if (motion === "Mission Control Build") return "Mission Control build discovery / scoped implementation ($5k-$25k+)";
  if (motion === "Referral Partnership") return "Referral partnership qualification; confirm partner fit, intro path, and revenue share";
  if (motion === "Install" && location === "Los Angeles") return "Half-day install discovery ($2,500)";
  if (motion === "Install" && (location === "Miami" || location === "Fort Lauderdale")) return "Full-day install discovery ($5,000)";
  if (motion === "Install") return "Install discovery; qualify half-day vs full-day scope";
  if (motion === "Strategic Founder") return "Founder-led strategic relationship; Alex personal follow-up recommended";
  return "Chief of Staff follow-up; qualify the business motion";
}

function inferSenderMode(note: string, motion: BDBusinessMotion, assignedOwner: BDAssignedOwner): BDSenderMode {
  const lower = note.toLowerCase();
  if (/\binternal only\b|\bdon't send\b|\bdo not send\b/.test(lower)) return "internal_only";
  if (motion === "Strategic Founder") return "example-client_personal_draft";
  if (assignedOwner !== "Alex" && assignedOwner !== "Mission Agent") return "route_to_owner";
  return "missionAgent_on_behalf_of_example-client";
}

function parseBDIntake(note: string, createOpportunity?: boolean): BDParsedIntake {
  const email = extractEmail(note);
  if (!email) throw new Error("EMAIL_REQUIRED");
  const normalizedEmail = normalizeEmail(email);
  const domain = emailDomain(normalizedEmail);
  const name = normalizeWhitespace(extractName(note, normalizedEmail));
  const { firstName, lastName } = splitName(name);
  const opportunityType = inferOpportunityType(note);
  const location = inferLocation(note);
  const businessMotion = inferBusinessMotion(note, opportunityType);
  const assignedOwner = assignedOwnerForMotion(businessMotion, location);
  return {
    email: normalizedEmail,
    name,
    firstName,
    lastName,
    company: extractCompany(note, domain),
    title: extractField(note, ["title", "role"]),
    domain,
    opportunityType,
    opportunityRequested: inferOpportunityRequested(note, createOpportunity),
    location,
    businessMotion,
    assignedOwner,
    packageSuggestion: suggestPackage(businessMotion, location),
    senderMode: inferSenderMode(note, businessMotion, assignedOwner),
    strategicMemoryRequired: businessMotion === "Strategic Founder",
  };
}

function buildIntakeId(input: BDIntakeInput, email: string): string {
  if (input.idempotencyKey) return `bd-${input.idempotencyKey}`;
  if (input.slack?.channelId && input.slack.messageTs) return `bd-slack-${input.slack.channelId}-${input.slack.messageTs}`;
  return `bd-${Date.now()}-${email.replace(/[^a-z0-9]+/gi, "-")}`;
}

function findDuplicateDraft(input: BDIntakeInput, intakeId: string): PendingBDEmailDraft | null {
  return listBDEmailDrafts(200).find((draft) =>
    draft.intakeId === intakeId ||
    Boolean(input.slack?.channelId && input.slack.messageTs &&
      draft.sourceSlack?.channelId === input.slack.channelId &&
      draft.sourceSlack?.messageTs === input.slack.messageTs)
  ) ?? null;
}

function findContactByEmail(email: string): Contact | undefined {
  return getContacts({ includeMerged: true }).find((contact) =>
    contact.emails.some((candidate) => normalizeEmail(candidate) === email)
  );
}

function findAccount(parsed: BDParsedIntake): Account | undefined {
  const accounts = getAccounts({ includeMerged: true });
  if (parsed.company) {
    const key = accountKey(parsed.company);
    const exact = accounts.find((account) => accountKey(account.name) === key || account.aliases?.some((alias) => accountKey(alias) === key));
    if (exact) return exact;
  }
  if (parsed.domain && !FREE_EMAIL_DOMAINS.has(parsed.domain)) {
    return accounts.find((account) => account.domain === parsed.domain || account.website?.toLowerCase().includes(parsed.domain!));
  }
  return undefined;
}

function ownerForOpportunity(type?: OpportunityType, motion?: BDBusinessMotion): OpportunityOwner {
  if (motion === "Strategic Founder") return "Alex";
  if (type === "Mission Control Build" || type === "Corporate Events") return "Alex";
  if (type === "Referral Partnership" || type === "Brand Partnerships") return "Mission Agent";
  return "Mission Agent";
}

function routingNote(parsed: BDParsedIntake): string {
  if (parsed.businessMotion === "Strategic Founder") return "Routing: Strategic Founder relationship -> Alex.";
  if (parsed.businessMotion === "Install") {
    if (parsed.location === "Los Angeles") return "Routing: Half-day install -> Mission Agent.";
    if (parsed.location === "Miami" || parsed.location === "Fort Lauderdale") return "Routing: Full-day install -> Mission Agent.";
    return "Routing: Install opportunity -> Mission Agent.";
  }
  if (parsed.opportunityType === "Mission Control Build" || parsed.opportunityType === "Corporate Events") return "Routing: Mission Control Build -> Alex.";
  if (parsed.opportunityType === "Referral Partnership" || parsed.opportunityType === "Brand Partnerships") return "Routing: Referral Partnership -> Mission Agent.";
  return "Routing: Chief of Staff / general BD -> Mission Agent.";
}

function buildWarnings(parsed: BDParsedIntake, account?: Account): string[] {
  const warnings: string[] = [];
  if (!parsed.title) warnings.push("Missing title/role.");
  if (!parsed.company) warnings.push("Missing company/account.");
  if (parsed.domain && FREE_EMAIL_DOMAINS.has(parsed.domain)) warnings.push(`Consumer email domain (${parsed.domain}); account match needs review.`);
  if (!account && parsed.company) warnings.push("No existing account matched; new account was created.");
  if (!parsed.opportunityRequested) warnings.push("Opportunity not created; note did not explicitly ask for one or include clear deal context.");
  if (parsed.senderMode === "example-client_personal_draft") warnings.push("Strategic Founder relationship mapped to Alex; review whether Alex should send personally.");
  if (parsed.senderMode === "route_to_owner") warnings.push(`Routed to ${parsed.assignedOwner}; Mission Agent draft is prepared for Alex approval before handoff.`);
  return warnings;
}

function emailSubject(parsed: BDParsedIntake): string {
  if (parsed.company) return `Great meeting you - Example Client x ${parsed.company}`;
  return "Great meeting you - Example Client";
}

function buildEmailBody(parsed: BDParsedIntake, note: string): { text: string; html: string } {
  const firstName = parsed.firstName || parsed.name;
  const context = normalizeWhitespace(note)
    .replace(parsed.email, "")
    .slice(0, 360)
    .trim();
  const opportunityLine = parsed.opportunityType === "Mission Control Build" || parsed.opportunityType === "Corporate Events"
    ? "I would be happy to help coordinate next steps around a potential Example Client Mission Control build."
    : parsed.opportunityType === "Referral Partnership" || parsed.opportunityType === "Brand Partnerships"
      ? "I would be happy to continue the conversation around where a referral partnership with Example Client could make sense."
      : parsed.opportunityType === "Half-Day Install" || parsed.opportunityType === "Full-Day Install" || parsed.opportunityType === "OpenClaw Install Day" || parsed.opportunityType === "Install Program"
        ? "I would be happy to help route you to the right Example Client install next step."
        : "I would be happy to continue the conversation and help route the right next step.";

  const text = [
    `Hi ${firstName},`,
    "",
    "Great meeting you. Alex asked me to follow up and make sure we keep the conversation moving.",
    "",
    context ? `Based on the conversation: ${context}` : undefined,
    opportunityLine,
    "",
    "Would you be open to sharing a few times that work for a quick follow-up conversation?",
  ].filter((line): line is string => line !== undefined).join("\n");

  const signedText = appendMissionAgentSignatureText(text);
  return {
    text: signedText,
    html: appendMissionAgentSignatureHtml(plainTextToHtml(text)),
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addBusinessDays(date: Date, days: number): Date {
  const next = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildSla(anchor = new Date()): BDSLA {
  return {
    firstFollowUpDueAt: anchor.toISOString(),
    approvalDueAt: addDays(anchor, 1).toISOString(),
    bumpDueAt: addBusinessDays(anchor, 3).toISOString(),
    nurtureDueAt: addDays(anchor, 10).toISOString(),
  };
}

function promiseOwner(sentence: string, fallback: string): string {
  if (/\bexample-client\b/i.test(sentence)) return "Alex";
  if (/\bmissionAgent\b/i.test(sentence)) return "Mission Agent";
  if (/\bglenda\b/i.test(sentence)) return "Glenda";
  if (/\bbrian\b/i.test(sentence)) return "Brian";
  if (/\blorhan\b/i.test(sentence)) return "Lorhan";
  if (/\bstephan\b/i.test(sentence)) return "Stephan";
  return fallback;
}

function promiseDueDate(sentence: string, sla: BDSLA): string {
  const lower = sentence.toLowerCase();
  const anchor = new Date();
  if (/\btoday\b/.test(lower)) return isoDate(anchor);
  if (/\btomorrow\b/.test(lower)) return isoDate(addDays(anchor, 1));
  if (/\bnext week\b/.test(lower)) return isoDate(addDays(anchor, 7));
  if (/\bthis week\b/.test(lower)) return isoDate(addBusinessDays(anchor, 3));
  return sla.firstFollowUpDueAt.slice(0, 10);
}

function extractPromises(note: string, parsed: BDParsedIntake, sla: BDSLA): BDPromiseCapture[] {
  const sentences = note
    .split(/(?<=[.!?])\s+|[;\n]+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  const captures = sentences
    .filter((sentence) => /\b(will|should|needs to|need to|follow up|send|share|introduce|schedule|confirm|create|draft|approve|proposal|quote|deck)\b/i.test(sentence))
    .slice(0, 6)
    .map((sentence, index) => ({
      id: `promise-${index + 1}`,
      owner: promiseOwner(sentence, parsed.assignedOwner),
      action: sentence.slice(0, 220),
      dueDate: promiseDueDate(sentence, sla),
      confidence: /\b(will|needs to|need to)\b/i.test(sentence) ? 0.82 : 0.68,
    }));

  if (!captures.some((promise) => /\bapprove|send|follow[- ]?up|follow up\b/i.test(promise.action))) {
    captures.unshift({
      id: "promise-send-follow-up",
      owner: "Alex",
      action: `Approve and send Example Client Mission Agent follow-up to ${parsed.name}`,
      dueDate: sla.approvalDueAt.slice(0, 10),
      confidence: 0.95,
    });
  }

  if (!captures.some((promise) => /\bbump|nurture|next step|follow[- ]?up again|follow up again\b/i.test(promise.action))) {
    captures.push({
      id: "promise-next-touch",
      owner: "Mission Agent",
      action: `Check for reply and prepare next BD touch for ${parsed.name}`,
      dueDate: sla.bumpDueAt.slice(0, 10),
      confidence: 0.9,
    });
  }

  return captures;
}

function createPromiseActionItems(input: {
  promises: BDPromiseCapture[];
  parsed: BDParsedIntake;
  intakeId: string;
  note: string;
  contact: Contact;
  account?: Account;
  opportunity?: Opportunity;
  draftId?: string;
  slack?: BDSlackSource;
}): BDPromiseCapture[] {
  const items = readActionItems();
  const created: ActionItem[] = [];
  const nowValue = now();
  let nextItems = [...items];

  for (const promise of input.promises) {
    const duplicate = nextItems.find((item) =>
      item.notes.includes(`BD intake ${input.intakeId}`) &&
      normalizeMemoryText(item.title) === normalizeMemoryText(promise.action)
    );
    if (duplicate) {
      promise.actionItemId = duplicate.id;
      continue;
    }

    const priority: Priority = input.parsed.businessMotion === "Strategic Founder" || promise.owner === "Alex" || /\bproposal|quote|deck\b/i.test(promise.action)
      ? "high"
      : "medium";
    const item: ActionItem = {
      id: nextActionItemId(nextItems),
      title: promise.action,
      owner: promise.owner,
      department: "Business Development",
      type: "Follow-up",
      deadline: promise.dueDate,
      status: "not_started",
      sourceMeeting: "BD Intake",
      sourceDate: today(),
      sourceChannelId: input.slack?.channelId || "crm",
      sourceMessageId: input.slack?.messageTs || input.intakeId,
      relatedAccount: input.account?.name || input.parsed.company || "",
      notes: [
        `BD intake ${input.intakeId}`,
        `Contact: ${input.contact.name} <${input.parsed.email}>`,
        input.account ? `Account: ${input.account.name}` : undefined,
        input.opportunity ? `Opportunity: ${input.opportunity.name}` : undefined,
        `Business motion: ${input.parsed.businessMotion}`,
        `Assigned owner: ${input.parsed.assignedOwner}`,
        `Package suggestion: ${input.parsed.packageSuggestion}`,
        "",
        `Original note: ${input.note}`,
      ].filter((line): line is string => line !== undefined).join("\n"),
      priority,
      createdAt: nowValue,
      updatedAt: nowValue,
      completedAt: null,
      createdBy: "Mission Agent",
      updatedBy: "Mission Agent",
      autoCompletable: /\bapprove and send|send chief of staff follow-up\b/i.test(promise.action),
      completionSignalType: /\bapprove and send|send chief of staff follow-up\b/i.test(promise.action) ? "email-sent" : "manual",
      completionSignalRef: input.draftId || input.intakeId,
      completionCheckHint: "Complete when the corresponding BD email is sent or the promised next step is manually confirmed.",
      relatedAccountId: input.account?.id,
      relatedContactId: input.contact.id,
    };
    nextItems = [...nextItems, item];
    created.push(item);
    promise.actionItemId = item.id;
  }

  if (created.length > 0) writeActionItems(nextItems);
  return input.promises;
}

function buildCompletionCheck(input: {
  contact?: Contact;
  account?: Account;
  activityId?: string;
  draftId?: string;
  parsed: BDParsedIntake;
  promises: BDPromiseCapture[];
  opportunity?: Opportunity;
  opportunityRequested: boolean;
  opportunityWasCreated?: boolean;
}): BDCompletionCheck {
  const accountNeeded = Boolean(input.parsed.company || (input.parsed.domain && !FREE_EMAIL_DOMAINS.has(input.parsed.domain)));
  const opportunityDecision: BDCompletionCheck["opportunityDecision"] = input.opportunity
    ? input.opportunityWasCreated ? "created" : "existing"
    : input.opportunityRequested
      ? "needs_review"
      : "skipped";
  const missing = [
    input.contact ? undefined : "contact",
    accountNeeded && !input.account ? "account" : undefined,
    input.activityId ? undefined : "activity",
    input.draftId ? undefined : "draft",
    input.parsed.assignedOwner ? undefined : "owner",
    input.promises.some((promise) => promise.actionItemId) ? undefined : "next action",
    input.promises.every((promise) => promise.dueDate) ? undefined : "due date",
    opportunityDecision === "needs_review" ? "opportunity decision" : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    complete: missing.length === 0,
    missing,
    contact: Boolean(input.contact),
    account: !accountNeeded || Boolean(input.account),
    activity: Boolean(input.activityId),
    draft: Boolean(input.draftId),
    owner: Boolean(input.parsed.assignedOwner),
    nextAction: input.promises.some((promise) => Boolean(promise.actionItemId)),
    dueDate: input.promises.every((promise) => Boolean(promise.dueDate)),
    opportunityDecision,
  };
}

function ensureBrainEntity(entities: BrainEntity[], name: string, entityType: BrainEntity["entity_type"], metadata: Record<string, unknown> = {}): BrainEntity {
  const normalizedName = normalizeMemoryText(name);
  const existing = entities.find((entity) => normalizeMemoryText(entity.name) === normalizedName && entity.entity_type === entityType);
  if (existing) {
    existing.updated_at = nowIso();
    existing.metadata_json = { ...existing.metadata_json, ...metadata };
    return existing;
  }
  const timestamp = nowIso();
  const entity: BrainEntity = {
    id: newBrainId(`ent-${slugify(name) || entityType}`),
    entity_type: entityType,
    name,
    canonical_name: name,
    description: null,
    status: "active",
    domain: typeof metadata.domain === "string" ? metadata.domain : null,
    owner_person_id: null,
    confidence: 0.82,
    last_confirmed_at: timestamp,
    metadata_json: metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };
  entities.push(entity);
  return entity;
}

function writeStrategicMemory(input: {
  parsed: BDParsedIntake;
  intakeId: string;
  note: string;
  contact: Contact;
  account?: Account;
  opportunity?: Opportunity;
}): BDOperationalState["memoryWriteBack"] {
  if (!input.parsed.strategicMemoryRequired) return { required: false, written: false };

  let ref: string | undefined;
  updateBrainStore((store) => {
    const person = ensureBrainEntity(store.entities, input.contact.name, "person", {
      domain: "business_development",
      email: input.parsed.email,
      contactId: input.contact.id,
      title: input.parsed.title,
      source: "BD intake",
    });
    const primary = ensureBrainEntity(store.entities, "Alex", "person", {
      domain: "leadership",
      role: "Founder",
    });
    const company = input.account
      ? ensureBrainEntity(store.entities, input.account.name, "company", {
        domain: input.account.domain,
        accountId: input.account.id,
        source: "BD intake",
      })
      : undefined;
    ref = newBrainId("claim-bd");
    store.claims.push({
      id: ref,
      claim_text: `${input.contact.name} is a Strategic Founder relationship mapped to Alex. Context: ${input.note}`,
      normalized_claim: normalizeMemoryText(`${input.contact.name} strategic founder relationship example operator ${input.intakeId}`),
      domain: "business_development",
      entity_id: person.id,
      claim_type: "instruction",
      status: "active",
      confidence: 0.86,
      valid_from: today(),
      valid_until: null,
      last_confirmed_at: nowIso(),
      source_document_id: null,
      supersedes_claim_id: null,
      sensitivity_level: "leadership",
      trust_status: "candidate",
      review_priority: "high",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    store.entityRelationships.push({
      id: newBrainId("rel-bd"),
      from_entity_id: primary.id,
      to_entity_id: person.id,
      relationship_type: "owns_strategic_founder_relationship",
      strength: "strong",
      confidence: 0.86,
      source_document_id: null,
      valid_from: today(),
      valid_until: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
    if (company) {
      store.entityRelationships.push({
        id: newBrainId("rel-bd"),
        from_entity_id: person.id,
        to_entity_id: company.id,
        relationship_type: "associated_with",
        strength: "medium",
        confidence: 0.78,
        source_document_id: null,
        valid_from: today(),
        valid_until: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
  });

  return { required: true, written: true, ref };
}

async function enrichAccount(accountId: string, baseUrl?: string): Promise<BDIntakeResult["enrichment"]> {
  if (!baseUrl) return { attempted: false, ok: false, skipped: true, error: "No base URL available for internal enrichment route" };
  try {
    const response = await fetch(`${baseUrl}/api/crm/accounts/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return { attempted: true, ok: false, error: body?.error || `Enrichment failed (${response.status})` };
    }
    return { attempted: true, ok: true };
  } catch (error) {
    return { attempted: true, ok: false, error: error instanceof Error ? error.message : "Enrichment failed" };
  }
}

export async function runBDIntake(input: BDIntakeInput): Promise<BDIntakeResult> {
  const note = normalizeWhitespace(input.note || "");
  if (!note) throw new Error("NOTE_REQUIRED");
  const parsed = parseBDIntake(note, input.createOpportunity);
  const sla = buildSla();
  const intakeId = buildIntakeId(input, parsed.email);
  const duplicateDraft = findDuplicateDraft(input, intakeId);
  if (duplicateDraft) {
    const contact = getContacts({ includeMerged: true }).find((item) => item.id === duplicateDraft.contactId);
    if (!contact) throw new Error("DUPLICATE_CONTACT_NOT_FOUND");
    const account = duplicateDraft.accountId ? getAccounts({ includeMerged: true }).find((item) => item.id === duplicateDraft.accountId) : undefined;
    const opportunity = duplicateDraft.opportunityId ? getOpportunities().find((item) => item.id === duplicateDraft.opportunityId) : undefined;
    return {
      intakeId,
      parsed,
      contact,
      account,
      activityId: duplicateDraft.activityId,
      opportunity,
      draft: duplicateDraft,
      created: { contact: false, account: false, opportunity: false },
      enrichment: { attempted: false, ok: false, skipped: true, error: "Duplicate intake" },
      slackPost: { attempted: false, ok: false, skipped: true, error: "Duplicate intake" },
      warnings: duplicateDraft.warnings,
      duplicate: true,
      operationalState: duplicateDraft.businessMotion && duplicateDraft.assignedOwner && duplicateDraft.approvalDueAt ? {
        approvalQueue: {
          owner: "Alex",
          draftId: duplicateDraft.id,
          status: duplicateDraft.status,
          approvalDueAt: duplicateDraft.approvalDueAt,
          slackMessageTs: duplicateDraft.sourceSlack?.postedDraftTs,
        },
        promises: [],
        sla: {
          firstFollowUpDueAt: duplicateDraft.followUpDueAt || duplicateDraft.createdAt,
          approvalDueAt: duplicateDraft.approvalDueAt,
          bumpDueAt: duplicateDraft.bumpDueAt || duplicateDraft.approvalDueAt,
          nurtureDueAt: duplicateDraft.nurtureDueAt || duplicateDraft.approvalDueAt,
        },
        packageSuggestion: duplicateDraft.packageSuggestion || parsed.packageSuggestion,
        routing: {
          businessMotion: duplicateDraft.businessMotion as BDBusinessMotion,
          assignedOwner: duplicateDraft.assignedOwner as BDAssignedOwner,
          note: routingNote(parsed),
        },
        senderMode: (duplicateDraft.senderMode as BDSenderMode | undefined) || parsed.senderMode,
        completion: duplicateDraft.completionStatus ? {
          complete: duplicateDraft.completionStatus.complete,
          missing: duplicateDraft.completionStatus.missing,
          contact: true,
          account: Boolean(duplicateDraft.accountId),
          activity: true,
          draft: true,
          owner: Boolean(duplicateDraft.assignedOwner),
          nextAction: Boolean(duplicateDraft.promiseActionItemIds?.length),
          dueDate: Boolean(duplicateDraft.nextActionDueAt),
          opportunityDecision: duplicateDraft.opportunityId ? "existing" : "skipped",
        } : buildCompletionCheck({
          contact,
          account,
          activityId: duplicateDraft.activityId,
          draftId: duplicateDraft.id,
          parsed,
          promises: [],
          opportunity,
          opportunityRequested: parsed.opportunityRequested,
        }),
        memoryWriteBack: duplicateDraft.memoryWriteBack,
      } : undefined,
    };
  }

  if (input.dryRun) throw new Error("DRY_RUN_NOT_IMPLEMENTED");

  let contact = findContactByEmail(parsed.email);
  const createdContact = !contact;
  let account = findAccount(parsed);
  let createdAccount = false;
  const warningsBeforeAccount = buildWarnings(parsed, account);

  if (!account && parsed.company) {
    account = createAccount({
      name: parsed.company,
      type: parsed.opportunityType === "Referral Partnership" || parsed.opportunityType === "Brand Partnerships" ? "Partner" : "Prospect",
      subType: parsed.opportunityType === "Referral Partnership" || parsed.opportunityType === "Brand Partnerships" ? "Referral Partner" : "Referral",
      operatingMarket: parsed.location === "Miami" || parsed.location === "Fort Lauderdale" || parsed.location === "Los Angeles" ? parsed.location : "Los Angeles",
      domain: parsed.domain && !FREE_EMAIL_DOMAINS.has(parsed.domain) ? parsed.domain : undefined,
      owner: parsed.businessMotion === "Strategic Founder" || parsed.opportunityType === "Mission Control Build" || parsed.opportunityType === "Corporate Events" ? "Alex" : "Mission Agent",
      notes: `Created from BD Slack intake.\n${routingNote(parsed)}\nPackage suggestion: ${parsed.packageSuggestion}\nSender mode: ${parsed.senderMode}\n\nOriginal note:\n${note}`,
      interests: Array.from(new Set([parsed.opportunityType, parsed.businessMotion, "Business Development"].filter((item): item is string => Boolean(item)))),
      relationshipStage: parsed.businessMotion === "Strategic Founder" ? "Strategic" : undefined,
      tier: parsed.businessMotion === "Strategic Founder" ? "strategic" : undefined,
      sourceRefs: input.slack?.messageTs ? [{
        system: "Slack",
        externalId: input.slack.messageTs,
        label: input.slack.channelName || input.slack.channelId || "BD Slack intake",
        url: input.slack.permalink,
        importedAt: now(),
      }] : undefined,
    });
    createdAccount = true;
  } else if (account) {
    const existingNotes = account.notes ?? "";
    updateAccount(account.id, {
      notes: existingNotes.includes(intakeId) ? existingNotes : [existingNotes, `BD intake ${intakeId}: ${routingNote(parsed)} Package suggestion: ${parsed.packageSuggestion}. Sender mode: ${parsed.senderMode}. ${note}`].filter(Boolean).join("\n\n"),
      domain: account.domain || (parsed.domain && !FREE_EMAIL_DOMAINS.has(parsed.domain) ? parsed.domain : undefined),
      owner: parsed.businessMotion === "Strategic Founder" ? "Alex" : account.owner,
      relationshipStage: parsed.businessMotion === "Strategic Founder" ? "Strategic" : account.relationshipStage,
      tier: parsed.businessMotion === "Strategic Founder" ? "strategic" : account.tier,
    });
    account = getAccounts({ includeMerged: true }).find((item) => item.id === account!.id) ?? account;
  }

  if (!contact) {
    contact = createContact({
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      accountId: account?.id,
      tags: Array.from(new Set(["BD Intake", parsed.opportunityType, parsed.businessMotion, `Owner: ${parsed.assignedOwner}`].filter((tag): tag is string => Boolean(tag)))),
      source: "Slack BD Intake",
      sourceRefs: input.slack?.messageTs ? [{
        system: "Slack",
        externalId: input.slack.messageTs,
        label: input.slack.channelName || input.slack.channelId || "BD Slack intake",
        url: input.slack.permalink,
        importedAt: now(),
      }] : undefined,
    });
  } else {
    const nextEmails = contact.emails.some((email) => normalizeEmail(email) === parsed.email) ? contact.emails : [...contact.emails, parsed.email];
    const nextTags = Array.from(new Set([...(contact.tags ?? []), "BD Intake", parsed.opportunityType, parsed.businessMotion, `Owner: ${parsed.assignedOwner}`].filter((tag): tag is string => Boolean(tag))));
    updateContact(contact.id, {
      emails: nextEmails,
      title: contact.title || parsed.title,
      company: contact.company || account?.name || parsed.company,
      accountId: contact.accountId || account?.id,
      notes: contact.notes ? `${contact.notes}\n\nBD intake ${intakeId}: ${note}` : `BD intake ${intakeId}: ${note}`,
      tags: nextTags,
      lastTouchAt: now(),
    });
    contact = getContacts({ includeMerged: true }).find((item) => item.id === contact!.id) ?? contact;
  }

  if (parsed.title && !contact.title) {
    updateContact(contact.id, { title: parsed.title });
    contact = getContacts({ includeMerged: true }).find((item) => item.id === contact!.id) ?? contact;
  }

  const activity = createActivity({
    contactId: contact.id,
    accountId: account?.id ?? contact.accountId,
    type: "Meeting",
    content: [
      "BD intake from Alex/Slack.",
      routingNote(parsed),
      `Package suggestion: ${parsed.packageSuggestion}`,
      `Sender mode: ${parsed.senderMode}`,
      "",
      note,
    ].join("\n"),
    source: "Manual",
    provenance: "manual",
    externalRef: input.slack?.messageTs || intakeId,
  });

  let opportunity: Opportunity | undefined;
  let createdOpportunity = false;
  if (parsed.opportunityRequested && account) {
    const type = parsed.opportunityType ?? "AI Consulting";
    const existing = getOpportunities(account.id, contact.id).find((item) =>
      item.opportunityType === type && ["Discovery", "Propose", "Contracting"].includes(item.stage)
    );
    if (existing) {
      opportunity = existing;
    } else {
      opportunity = createOpportunity({
        accountId: account.id,
        contactId: contact.id,
        name: `${account.name} ${type}`,
        opportunityType: type,
        location: parsed.location ?? (account.operatingMarket === "Miami" || account.operatingMarket === "Fort Lauderdale" || account.operatingMarket === "Los Angeles" ? account.operatingMarket : "Los Angeles"),
        stage: "Discovery",
        openDate: today(),
        forecastConfidence: "Low",
        valueType: type === "Hourly Consulting" ? "Hourly" : "Project",
        value: 0,
        source: "In Person",
        owner: ownerForOpportunity(type, parsed.businessMotion),
        nextStep: "Send Mission Agent follow-up and confirm next conversation",
        nextStepDueDate: sla.firstFollowUpDueAt.slice(0, 10),
        notes: `Created from BD intake.\n${routingNote(parsed)}\nPackage suggestion: ${parsed.packageSuggestion}\nSender mode: ${parsed.senderMode}\n\n${note}`,
      });
      createdOpportunity = true;
    }
  }

  let warnings = Array.from(new Set([...warningsBeforeAccount, ...buildWarnings(parsed, account)]));
  const email = buildEmailBody(parsed, note);
  const draft = createBDEmailDraft({
    to: [parsed.email],
    cc: [BD_DEFAULT_CC],
    subject: emailSubject(parsed),
    bodyText: email.text,
    bodyHtml: email.html,
    contactId: contact.id,
    accountId: account?.id ?? contact.accountId,
    opportunityId: opportunity?.id,
    activityId: activity.id,
    intakeId,
    sourceNote: note,
    sourceSlack: input.slack ? {
      channelId: input.slack.channelId,
      channelName: input.slack.channelName,
      messageTs: input.slack.messageTs,
      threadTs: input.slack.threadTs || input.slack.messageTs,
    } : undefined,
    approvalOwner: "Alex",
    assignedOwner: parsed.assignedOwner,
    businessMotion: parsed.businessMotion,
    packageSuggestion: parsed.packageSuggestion,
    senderMode: parsed.senderMode,
    nextActionDueAt: sla.firstFollowUpDueAt,
    approvalDueAt: sla.approvalDueAt,
    followUpDueAt: sla.firstFollowUpDueAt,
    bumpDueAt: sla.bumpDueAt,
    nurtureDueAt: sla.nurtureDueAt,
    warnings,
  });

  const promises = createPromiseActionItems({
    promises: extractPromises(note, parsed, sla),
    parsed,
    intakeId,
    note,
    contact,
    account,
    opportunity,
    draftId: draft.id,
    slack: input.slack,
  });
  const completion = buildCompletionCheck({
    contact,
    account,
    activityId: activity.id,
    draftId: draft.id,
    parsed,
    promises,
    opportunity,
    opportunityRequested: parsed.opportunityRequested,
    opportunityWasCreated: createdOpportunity,
  });
  const memoryWriteBack = writeStrategicMemory({ parsed, intakeId, note, contact, account, opportunity });
  if (!completion.complete) warnings = Array.from(new Set([...warnings, `Loose thread check needs review: ${completion.missing.join(", ")}.`]));
  draft.promiseActionItemIds = promises.map((promise) => promise.actionItemId).filter((id): id is string => Boolean(id));
  draft.completionStatus = { complete: completion.complete, missing: completion.missing };
  draft.memoryWriteBack = memoryWriteBack;
  draft.warnings = warnings;
  writeBDEmailDraft(draft);

  const enrichment = account?.id ? await enrichAccount(account.id, input.baseUrl) : { attempted: false, ok: false, skipped: true, error: "No account available for enrichment" };
  const slack = await postBDDraftToSlack({
    channelId: input.slack?.channelId,
    threadTs: input.slack?.threadTs || input.slack?.messageTs,
    contactName: contact.name,
    accountName: account?.name,
    opportunityName: opportunity?.name,
    draft,
    warnings,
  });
  if (slack.ok && slack.ts) {
    const postedDraft = markBDEmailDraftPosted(draft.id, slack.ts);
    if (postedDraft?.sourceSlack) draft.sourceSlack = postedDraft.sourceSlack;
  }

  const operationalState: BDOperationalState = {
    approvalQueue: {
      owner: "Alex",
      draftId: draft.id,
      status: draft.status,
      approvalDueAt: sla.approvalDueAt,
      slackMessageTs: draft.sourceSlack?.postedDraftTs,
    },
    promises,
    sla,
    packageSuggestion: parsed.packageSuggestion,
    routing: {
      businessMotion: parsed.businessMotion,
      assignedOwner: parsed.assignedOwner,
      note: routingNote(parsed),
    },
    senderMode: parsed.senderMode,
    completion,
    memoryWriteBack,
  };

  return {
    intakeId,
    parsed,
    contact,
    account,
    activityId: activity.id,
    opportunity,
    draft,
    created: { contact: createdContact, account: createdAccount, opportunity: createdOpportunity },
    enrichment,
    slackPost: { attempted: true, ok: slack.ok, skipped: slack.skipped, error: slack.error },
    warnings,
    duplicate: false,
    operationalState,
  };
}
