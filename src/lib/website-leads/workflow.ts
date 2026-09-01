import { createHash } from "crypto";
import {
  appendSupabaseLeadEvent,
  findSupabaseInboundLeadByWebsiteKey,
  updateSupabaseInboundLead,
  upsertSupabaseInboundLead,
} from "@/modules/revenue/inboundLeadsSupabaseStore";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { postWebsiteLeadToSlack } from "@/lib/slack/bd";
import { mapWebsiteLeadToCrm } from "@/lib/website-leads/crmMapping";
import { researchWebsiteLead } from "@/lib/website-leads/research";
import {
  buildInboundLeadFromWebsitePayload,
  buildWebsiteLeadIdempotencyKey,
  normalizeWebsiteString,
  websiteLeadSchema,
  type WebsiteLeadPayload,
  type WebsiteWorkflowMetadata,
} from "@/lib/website-leads/schema";

export interface WebsiteLeadWorkflowInput {
  body: unknown;
  idempotencyKeyHeader?: string | null;
  userAgent?: string;
  baseUrl: string;
}

export interface WebsiteLeadWorkflowResult {
  lead: InboundLeadRecord;
  created: boolean;
  spam: boolean;
  slack: WebsiteWorkflowMetadata["slack"];
  research?: WebsiteWorkflowMetadata["research"];
  crmMapping?: WebsiteWorkflowMetadata["crmMapping"];
}

function generateLeadId(idempotencyKey: string): string {
  return `web-${Date.now()}-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 8)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getWorkflowMetadata(lead: InboundLeadRecord): WebsiteWorkflowMetadata {
  const metadata = isObject(lead.metadata) ? lead.metadata : {};
  const workflow = isObject(metadata.websiteWorkflow) ? metadata.websiteWorkflow : {};
  return {
    source: "example-client-website-contact-form",
    version: 1,
    ...workflow,
  } as WebsiteWorkflowMetadata;
}

async function findLeadByIdempotencyKey(key: string): Promise<InboundLeadRecord | null> {
  if (shouldUseSupabaseBackend()) return findSupabaseInboundLeadByWebsiteKey(key);
  const { listInboundLeads } = await import("@/modules/revenue/inboundLeadsStore");
  return listInboundLeads().find((lead) => {
    if (!isObject(lead.metadata)) return false;
    return lead.metadata.websiteLeadIdempotencyKey === key;
  }) ?? null;
}

async function persistLead(lead: InboundLeadRecord): Promise<InboundLeadRecord> {
  if (shouldUseSupabaseBackend()) return upsertSupabaseInboundLead(lead);
  const { createInboundLead } = await import("@/modules/revenue/inboundLeadsStore");
  return createInboundLead(lead);
}

async function patchLead(id: string, updates: Partial<InboundLeadRecord>, fallback: InboundLeadRecord): Promise<InboundLeadRecord> {
  if (shouldUseSupabaseBackend()) return (await updateSupabaseInboundLead(id, updates)) ?? fallback;
  const { updateInboundLead } = await import("@/modules/revenue/inboundLeadsStore");
  return updateInboundLead(id, updates) ?? fallback;
}

async function recordEvent(event: Parameters<typeof appendSupabaseLeadEvent>[0]): Promise<void> {
  if (shouldUseSupabaseBackend()) {
    await appendSupabaseLeadEvent(event);
    return;
  }
  const { appendEvent } = await import("@/modules/revenue/inboundLeadEventsStore");
  appendEvent(event);
}

function mergeMetadata(
  lead: InboundLeadRecord,
  payload: WebsiteLeadPayload,
  idempotencyKey: string,
  workflowPatch: Partial<WebsiteWorkflowMetadata>,
): Record<string, unknown> {
  const current = isObject(lead.metadata) ? lead.metadata : {};
  const currentWorkflow = getWorkflowMetadata(lead);
  const previousRawForm = isObject(current.rawForm) ? current.rawForm : {};
  return {
    ...current,
    rawForm: {
      ...payload,
      userAgent: payload.userAgent || (typeof previousRawForm.userAgent === "string" ? previousRawForm.userAgent : undefined),
    },
    websiteLeadIdempotencyKey: idempotencyKey,
    websiteWorkflow: {
      ...currentWorkflow,
      ...workflowPatch,
    },
    offering: payload.offering,
    budget: payload.budget,
    timeline: payload.timeline,
    team: payload.team,
    role: normalizeWebsiteString(payload.role) || undefined,
    stack: normalizeWebsiteString(payload.stack) || undefined,
    successMetric: normalizeWebsiteString(payload.successMetric) || undefined,
    pageUrl: normalizeWebsiteString(payload.pageUrl) || undefined,
    referrer: normalizeWebsiteString(payload.referrer) || undefined,
    utm: payload.utm,
    sourceFormVersion: payload.sourceFormVersion ?? 1,
  };
}

function hasHoneypot(payload: WebsiteLeadPayload): boolean {
  return Boolean(normalizeWebsiteString(payload.website) || normalizeWebsiteString(payload.companyWebsiteHidden));
}

export async function runWebsiteLeadWorkflow(input: WebsiteLeadWorkflowInput): Promise<WebsiteLeadWorkflowResult> {
  const payload = websiteLeadSchema.parse(input.body);
  const idempotencyKey = buildWebsiteLeadIdempotencyKey(payload, input.idempotencyKeyHeader);
  const receivedAt = payload.submittedAt && !Number.isNaN(new Date(payload.submittedAt).getTime())
    ? new Date(payload.submittedAt).toISOString()
    : new Date().toISOString();
  const spam = hasHoneypot(payload);
  const spamMetadata = spam ? { honeypot: true, reason: "Hidden website field was filled" } : undefined;
  const existing = await findLeadByIdempotencyKey(idempotencyKey);
  const baseLead = buildInboundLeadFromWebsitePayload(payload, idempotencyKey, {
    id: existing?.id ?? generateLeadId(idempotencyKey),
    receivedAt: existing?.receivedAt ?? receivedAt,
    userAgent: input.userAgent,
    spam: spamMetadata,
  });
  const created = !existing;

  let lead = existing
    ? await patchLead(existing.id, {
        name: baseLead.name,
        companyName: baseLead.companyName,
        contactName: baseLead.contactName,
        email: baseLead.email,
        phone: baseLead.phone,
        source: "website",
        content: baseLead.content,
        tags: baseLead.tags,
        metadata: mergeMetadata(existing, payload, idempotencyKey, spamMetadata ? { spam: spamMetadata } : {}),
      }, existing)
    : await persistLead(baseLead);

  await recordEvent({
    leadId: lead.id,
    type: "website_lead_received",
    actor: "system",
    timestamp: new Date().toISOString(),
    metadata: { created, spam, idempotencyKey },
  });

  if (spam) {
    const slack: NonNullable<WebsiteWorkflowMetadata["slack"]> = { attempted: false, ok: false, skipped: true, error: "Skipped honeypot spam" };
    lead = await patchLead(lead.id, {
      metadata: {
        ...(isObject(lead.metadata) ? lead.metadata : {}),
        websiteWorkflow: {
          ...getWorkflowMetadata(lead),
          spam: spamMetadata,
          slack,
        },
      },
    }, lead);
    await recordEvent({
      leadId: lead.id,
      type: "slack_skipped",
      actor: "system",
      timestamp: new Date().toISOString(),
      metadata: slack,
    });
    return { lead, created, spam, slack };
  }

  const research = await researchWebsiteLead(lead, payload);
  lead = await patchLead(lead.id, {
    assignedTo: lead.assignedTo ?? research.recommendedOwner,
    crmAccountId: lead.crmAccountId ?? research.crmAccountId,
    metadata: {
      ...(isObject(lead.metadata) ? lead.metadata : {}),
      websiteWorkflow: {
        ...getWorkflowMetadata(lead),
        research,
      },
    },
  }, lead);
  await recordEvent({
    leadId: lead.id,
    type: "lead_researched",
    actor: "system",
    timestamp: new Date().toISOString(),
    metadata: research,
  });

  const crmMapping = await mapWebsiteLeadToCrm(lead, payload, research);
  lead = await patchLead(lead.id, {
    crmContactId: lead.crmContactId ?? crmMapping.contactId,
    crmAccountId: lead.crmAccountId ?? crmMapping.accountId,
    crmOpportunityId: lead.crmOpportunityId ?? crmMapping.opportunityId,
    status: lead.status === "new" && crmMapping.ok ? "qualified" : lead.status,
    metadata: {
      ...(isObject(lead.metadata) ? lead.metadata : {}),
      websiteWorkflow: {
        ...getWorkflowMetadata(lead),
        research,
        crmMapping,
      },
    },
  }, lead);
  await recordEvent({
    leadId: lead.id,
    type: crmMapping.ok ? "crm_linked" : "crm_link_failed",
    actor: "system",
    timestamp: new Date().toISOString(),
    metadata: crmMapping,
  });

  const slackResult = await postWebsiteLeadToSlack({ lead, baseUrl: input.baseUrl });
  const slack: NonNullable<WebsiteWorkflowMetadata["slack"]> = { attempted: true, ...slackResult };
  lead = await patchLead(lead.id, {
    metadata: {
      ...(isObject(lead.metadata) ? lead.metadata : {}),
      websiteWorkflow: {
        ...getWorkflowMetadata(lead),
        research,
        crmMapping,
        slack,
      },
    },
  }, lead);
  await recordEvent({
    leadId: lead.id,
    type: slack.skipped ? "slack_skipped" : "slack_notified",
    actor: "system",
    timestamp: new Date().toISOString(),
    metadata: { ...slack },
  });

  return { lead, created, spam, slack, research, crmMapping };
}
