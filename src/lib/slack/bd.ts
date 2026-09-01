import type { PendingBDEmailDraft } from "@/lib/crm/bdDrafts";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export interface SlackPostResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  skipped?: boolean;
  error?: string;
}

export interface BDSlackSummaryInput {
  channelId?: string;
  threadTs?: string;
  contactName: string;
  accountName?: string;
  draft: PendingBDEmailDraft;
  opportunityName?: string;
  warnings: string[];
}

export interface WebsiteLeadSlackInput {
  lead: InboundLeadRecord;
  baseUrl: string;
}

function slackToken(): string | null {
  return process.env.SLACK_BOT_TOKEN || null;
}

export function isApprovalReaction(name: string): boolean {
  return new Set(["white_check_mark", "heavy_check_mark", "heavy_check_mark", "✅", "check"]).has(name);
}

function warningBlock(warnings: string[]): string {
  if (warnings.length === 0) return "No blocking warnings.";
  return warnings.map((warning) => `• ${warning}`).join("\n");
}

export function renderBDDraftSlackMessage(input: BDSlackSummaryInput): string {
  const lines = [
    "*BD follow-up draft ready*",
    `Contact: ${input.contactName}`,
    input.accountName ? `Account: ${input.accountName}` : undefined,
    input.opportunityName ? `Opportunity: ${input.opportunityName}` : "Opportunity: not created",
    input.draft.businessMotion ? `Motion: ${input.draft.businessMotion}` : undefined,
    input.draft.assignedOwner ? `Owner: ${input.draft.assignedOwner}` : undefined,
    input.draft.senderMode ? `Sender mode: ${input.draft.senderMode}` : undefined,
    input.draft.packageSuggestion ? `Package: ${input.draft.packageSuggestion}` : undefined,
    input.draft.approvalDueAt ? `Approval due: ${input.draft.approvalDueAt}` : undefined,
    input.draft.promiseActionItemIds?.length ? `Action items: ${input.draft.promiseActionItemIds.join(", ")}` : undefined,
    input.draft.completionStatus ? `Loose-thread check: ${input.draft.completionStatus.complete ? "complete" : `needs review (${input.draft.completionStatus.missing.join(", ")})`}` : undefined,
    input.draft.memoryWriteBack?.required ? `Strategic memory: ${input.draft.memoryWriteBack.written ? `written (${input.draft.memoryWriteBack.ref ?? "recorded"})` : "required"}` : undefined,
    `Draft ID: \`${input.draft.id}\``,
    "",
    "*To*",
    input.draft.to.join(", "),
    "*CC*",
    input.draft.cc.join(", "),
    "*Subject*",
    input.draft.subject,
    "",
    "*Email draft*",
    "```",
    input.draft.bodyText,
    "```",
    "",
    "*Review flags*",
    warningBlock(input.warnings),
    "",
    "React with :white_check_mark: to authorize sending from Example Client Mission Agent, Chief of Staff to Alex.",
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

export async function postBDDraftToSlack(input: BDSlackSummaryInput): Promise<SlackPostResult> {
  const token = slackToken();
  const channel = input.channelId || process.env.SLACK_BD_CHANNEL_ID || process.env.SLACK_BUSINESS_DEVELOPMENT_CHANNEL_ID;
  if (!token || !channel) {
    return { ok: false, skipped: true, error: "Slack token or BD channel not configured" };
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        thread_ts: input.threadTs,
        text: renderBDDraftSlackMessage(input),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; ts?: string; channel?: string; error?: string } | null;
    if (!response.ok || !body?.ok) {
      return { ok: false, channel, error: body?.error || `Slack post failed (${response.status})` };
    }
    return { ok: true, ts: body.ts, channel: body.channel || channel };
  } catch (error) {
    return { ok: false, channel, error: error instanceof Error ? error.message : "Slack post failed" };
  }
}

export async function postBDStatusToSlack(input: { channelId?: string; threadTs?: string; text: string }): Promise<SlackPostResult> {
  const token = slackToken();
  const channel = input.channelId || process.env.SLACK_BD_CHANNEL_ID || process.env.SLACK_BUSINESS_DEVELOPMENT_CHANNEL_ID;
  if (!token || !channel) {
    return { ok: false, skipped: true, error: "Slack token or BD channel not configured" };
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        thread_ts: input.threadTs,
        text: input.text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; ts?: string; channel?: string; error?: string } | null;
    if (!response.ok || !body?.ok) {
      return { ok: false, channel, error: body?.error || `Slack post failed (${response.status})` };
    }
    return { ok: true, ts: body.ts, channel: body.channel || channel };
  } catch (error) {
    return { ok: false, channel, error: error instanceof Error ? error.message : "Slack post failed" };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataString(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function leadUrl(baseUrl: string, leadId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/contacts?object=leads&select=${encodeURIComponent(leadId)}`;
}

export function renderWebsiteLeadSlackMessage(input: WebsiteLeadSlackInput): string {
  const metadata = asRecord(input.lead.metadata);
  const workflow = asRecord(metadata.websiteWorkflow);
  const research = asRecord(workflow.research);
  const lines = [
    "*New website lead*",
    `Name: ${input.lead.contactName || input.lead.name}`,
    input.lead.companyName ? `Company: ${input.lead.companyName}` : undefined,
    input.lead.email ? `Email: ${input.lead.email}` : undefined,
    input.lead.phone ? `Phone: ${input.lead.phone}` : undefined,
    `Interested in: ${metadataString(metadata, "offeringLabel") || metadataString(metadata, "offering") || "Unknown"}`,
    `Budget: ${metadataString(metadata, "budgetLabel") || metadataString(metadata, "budget") || "Unknown"}`,
    `Timeline: ${metadataString(metadata, "timelineLabel") || metadataString(metadata, "timeline") || "Unknown"}`,
    `Team size: ${metadataString(metadata, "teamLabel") || metadataString(metadata, "team") || "Unknown"}`,
    metadataString(metadata, "role") ? `Role: ${metadataString(metadata, "role")}` : undefined,
    metadataString(metadata, "stack") ? `Current stack: ${metadataString(metadata, "stack")}` : undefined,
    metadataString(metadata, "successMetric") ? `Success metric: ${metadataString(metadata, "successMetric")}` : undefined,
    typeof research.fitScore === "number" ? `Fit score: ${research.fitScore}` : undefined,
    typeof research.recommendedOwner === "string" ? `Recommended owner: ${research.recommendedOwner}` : undefined,
    typeof research.recommendedNextAction === "string" ? `Next action: ${research.recommendedNextAction}` : undefined,
    "",
    "*Bottleneck & desired outcome*",
    input.lead.content || "No message captured.",
    "",
    `<${leadUrl(input.baseUrl, input.lead.id)}|Open lead in Mission Control>`,
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

export async function postWebsiteLeadToSlack(input: WebsiteLeadSlackInput): Promise<SlackPostResult> {
  const token = slackToken();
  const channel = process.env.SLACK_BD_CHANNEL_ID || process.env.SLACK_BUSINESS_DEVELOPMENT_CHANNEL_ID;
  if (!token || !channel) {
    return { ok: false, skipped: true, error: "Slack token or BD channel not configured" };
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel,
        text: renderWebsiteLeadSlackMessage(input),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const body = await response.json().catch(() => null) as { ok?: boolean; ts?: string; channel?: string; error?: string } | null;
    if (!response.ok || !body?.ok) {
      return { ok: false, channel, error: body?.error || `Slack post failed (${response.status})` };
    }
    return { ok: true, ts: body.ts, channel: body.channel || channel };
  } catch (error) {
    return { ok: false, channel, error: error instanceof Error ? error.message : "Slack post failed" };
  }
}
