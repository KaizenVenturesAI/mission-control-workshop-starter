import { createHash } from "crypto";
import { z } from "zod";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export const WEBSITE_OFFERING_LABELS = {
  "agentic-workforce": "Agentic Workforce Installation",
  "private-coaching": "AI Private Consulting 1:1",
  "openclaw-events": "OpenClaw ship & script events",
  consulting: "AI Consulting",
  other: "Custom project / something else",
} as const;

export const WEBSITE_BUDGET_LABELS = {
  "under-5k": "Under $5,000",
  "5k-15k": "$5,000 - $15,000",
  "15k-50k": "$15,000 - $50,000",
  "50k-plus": "$50,000+",
  "not-sure": "Not sure yet",
} as const;

export const WEBSITE_TIMELINE_LABELS = {
  "this-month": "This month",
  "this-quarter": "This quarter",
  "this-year": "This year",
  exploring: "Just exploring",
} as const;

export const WEBSITE_TEAM_LABELS = {
  solo: "Just me",
  "2-10": "2-10",
  "11-50": "11-50",
  "51-200": "51-200",
  "200-plus": "200+",
} as const;

export const websiteLeadSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  company: z.string().trim().max(120).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  offering: z.enum(["agentic-workforce", "private-coaching", "openclaw-events", "consulting", "other"]),
  message: z.string().trim().min(10).max(2_000),
  role: z.string().trim().max(80).optional().default(""),
  budget: z.enum(["under-5k", "5k-15k", "15k-50k", "50k-plus", "not-sure"]).optional().default("not-sure"),
  timeline: z.enum(["this-month", "this-quarter", "this-year", "exploring"]).optional().default("this-quarter"),
  team: z.enum(["solo", "2-10", "11-50", "51-200", "200-plus"]).optional().default("2-10"),
  stack: z.string().trim().max(280).optional().default(""),
  successMetric: z.string().trim().max(280).optional().default(""),
  pageUrl: z.string().trim().max(1_000).optional(),
  referrer: z.string().trim().max(1_000).optional(),
  utm: z.record(z.string(), z.unknown()).optional(),
  submittedAt: z.string().trim().optional(),
  sourceFormVersion: z.union([z.number(), z.string()]).optional(),
  userAgent: z.string().trim().max(1_000).optional(),
  website: z.string().trim().optional(),
  companyWebsiteHidden: z.string().trim().optional(),
});

export type WebsiteLeadPayload = z.infer<typeof websiteLeadSchema>;

export interface WebsiteWorkflowMetadata {
  source: "example-client-website-contact-form";
  version: 1;
  spam?: {
    honeypot: boolean;
    reason: string;
  };
  slack?: {
    attempted: boolean;
    ok: boolean;
    skipped?: boolean;
    channel?: string;
    ts?: string;
    error?: string;
  };
  research?: {
    attempted: boolean;
    ok: boolean;
    fitScore: number;
    researchSummary: string;
    duplicateCandidates: Array<{
      kind: "contact" | "account" | "lead";
      id: string;
      label: string;
      matchedBy: string;
    }>;
    recommendedOwner: "Alex" | "Mission Agent" | "Unassigned";
    recommendedNextAction: string;
    recommendedAccount?: {
      name: string;
      domain?: string;
      website?: string;
      source: "existing-crm-account" | "company-name" | "email-domain";
      crmAccountId?: string;
    };
    crmAccountId?: string;
    emailDomain?: string;
    companyWebsite?: {
      attempted: boolean;
      ok: boolean;
      url?: string;
      title?: string;
      description?: string;
      error?: string;
    };
  };
  crmMapping?: {
    attempted: boolean;
    ok: boolean;
    contactId?: string;
    accountId?: string;
    opportunityId?: string;
    createdContact: boolean;
    createdAccount: boolean;
    createdOpportunity: boolean;
    duplicateOpenOpportunity: boolean;
    error?: string;
  };
}

export function normalizeWebsiteString(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeWebsiteEmail(value: string | undefined): string {
  return normalizeWebsiteString(value).toLowerCase();
}

export function buildWebsiteLeadIdempotencyKey(payload: WebsiteLeadPayload, headerValue?: string | null): string {
  const explicit = normalizeWebsiteString(headerValue ?? undefined);
  if (explicit) return explicit.slice(0, 180);
  const source = [
    normalizeWebsiteEmail(payload.email),
    normalizeWebsiteString(payload.name).toLowerCase(),
    normalizeWebsiteString(payload.company).toLowerCase(),
    normalizeWebsiteString(payload.message).slice(0, 120).toLowerCase(),
  ].join("|");
  return `webform:${createHash("sha256").update(source).digest("hex")}`;
}

export function buildInboundLeadFromWebsitePayload(
  payload: WebsiteLeadPayload,
  idempotencyKey: string,
  options: { id: string; receivedAt: string; userAgent?: string; spam?: WebsiteWorkflowMetadata["spam"] },
): InboundLeadRecord {
  const company = normalizeWebsiteString(payload.company);
  const contactName = normalizeWebsiteString(payload.name);
  const receivedAt = options.receivedAt;
  const rawForm = {
    ...payload,
    userAgent: payload.userAgent || options.userAgent,
  };
  const websiteWorkflow: WebsiteWorkflowMetadata = {
    source: "example-client-website-contact-form",
    version: 1,
    ...(options.spam ? { spam: options.spam } : {}),
  };

  return {
    id: options.id,
    date: receivedAt.slice(0, 10),
    type: "corporate",
    name: company || contactName,
    companyName: company || undefined,
    contactName,
    email: normalizeWebsiteEmail(payload.email),
    phone: normalizeWebsiteString(payload.phone) || undefined,
    status: "new",
    source: "website",
    market: "other",
    receivedAt,
    contactedAt: null,
    lastUpdated: receivedAt,
    assignedTo: undefined,
    expectedRecordType: "company",
    tags: [payload.offering, "website-form"],
    notes: undefined,
    content: normalizeWebsiteString(payload.message),
    metadata: {
      rawForm,
      websiteLeadIdempotencyKey: idempotencyKey,
      websiteWorkflow,
      offering: payload.offering,
      offeringLabel: WEBSITE_OFFERING_LABELS[payload.offering],
      budget: payload.budget,
      budgetLabel: WEBSITE_BUDGET_LABELS[payload.budget],
      timeline: payload.timeline,
      timelineLabel: WEBSITE_TIMELINE_LABELS[payload.timeline],
      team: payload.team,
      teamLabel: WEBSITE_TEAM_LABELS[payload.team],
      role: normalizeWebsiteString(payload.role) || undefined,
      stack: normalizeWebsiteString(payload.stack) || undefined,
      successMetric: normalizeWebsiteString(payload.successMetric) || undefined,
      pageUrl: normalizeWebsiteString(payload.pageUrl) || undefined,
      referrer: normalizeWebsiteString(payload.referrer) || undefined,
      utm: payload.utm,
      sourceFormVersion: payload.sourceFormVersion ?? 1,
    },
  };
}
