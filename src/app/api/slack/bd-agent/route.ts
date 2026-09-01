import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { listBDEmailDrafts, sendApprovedBDEmailDraft } from "@/lib/crm/bdDrafts";
import { runBDIntake } from "@/lib/crm/bdWorkflow";
import { isApprovalReaction, postBDStatusToSlack } from "@/lib/slack/bd";

export const dynamic = "force-dynamic";

function baseUrlFromRequest(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function isAllowedChannel(channel?: string): boolean {
  const configured = process.env.SLACK_BD_CHANNEL_ID || process.env.SLACK_BUSINESS_DEVELOPMENT_CHANNEL_ID;
  return !configured || !channel || configured === channel;
}

function verifySlackSignature(request: Request, rawBody: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return true;
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 60 * 5) return false;
  const digest = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

function isAllowedApprover(userId?: string): boolean {
  const clientApproverUserId = process.env.SLACK_CLIENT_APPROVER_USER_ID;
  return !clientApproverUserId || userId === clientApproverUserId;
}

function findDraftForSlackApproval(channel: string | undefined, ts: string | undefined) {
  if (!ts) return null;
  return listBDEmailDrafts(200).find((draft) =>
    (!channel || draft.sourceSlack?.channelId === channel) &&
    (
      draft.sourceSlack?.postedDraftTs === ts ||
      draft.sourceSlack?.messageTs === ts ||
      draft.sourceSlack?.threadTs === ts
    )
  ) ?? null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySlackSignature(request, rawBody)) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }
  const body = (() => {
    try {
      return JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback" || typeof body.event !== "object" || body.event === null) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = body.event as Record<string, unknown>;
  const channel = typeof event.channel === "string" ? event.channel : undefined;
  if (!isAllowedChannel(channel)) return NextResponse.json({ ok: true, ignored: "channel" });

  if (event.type === "message") {
    if (event.subtype || event.bot_id) return NextResponse.json({ ok: true, ignored: "bot/subtype" });
    const text = typeof event.text === "string" ? event.text : "";
    if (!text.trim()) return NextResponse.json({ ok: true, ignored: "empty" });
    const ts = typeof event.ts === "string" ? event.ts : undefined;
    const threadTs = typeof event.thread_ts === "string" ? event.thread_ts : ts;
    const result = await runBDIntake({
      note: text,
      baseUrl: baseUrlFromRequest(request),
      slack: {
        channelId: channel,
        messageTs: ts,
        threadTs,
        userId: typeof event.user === "string" ? event.user : undefined,
      },
    });
    return NextResponse.json({ ok: true, intakeId: result.intakeId, draftId: result.draft.id, duplicate: result.duplicate });
  }

  if (event.type === "reaction_added") {
    const reaction = typeof event.reaction === "string" ? event.reaction : "";
    if (!isApprovalReaction(reaction)) return NextResponse.json({ ok: true, ignored: "reaction" });
    const approver = typeof event.user === "string" ? event.user : undefined;
    if (!isAllowedApprover(approver)) return NextResponse.json({ ok: true, ignored: "approver" });
    const item = typeof event.item === "object" && event.item !== null ? event.item as Record<string, unknown> : {};
    const itemChannel = typeof item.channel === "string" ? item.channel : channel;
    const itemTs = typeof item.ts === "string" ? item.ts : undefined;
    const draft = findDraftForSlackApproval(itemChannel, itemTs);
    if (!draft) return NextResponse.json({ ok: true, ignored: "draft-not-found" });
    const sent = sendApprovedBDEmailDraft(draft.id, {
      approvedBy: approver ?? "Alex",
      approvalReaction: reaction,
    });
    await postBDStatusToSlack({
      channelId: sent.sourceSlack?.channelId,
      threadTs: sent.sourceSlack?.threadTs,
      text: sent.status === "sent"
        ? `Sent BD follow-up from Example Client Mission Agent for draft \`${sent.id}\`.`
        : `Could not send BD follow-up draft \`${sent.id}\`: ${sent.sendError ?? "unknown error"}`,
    });
    return NextResponse.json({ ok: true, draftId: sent.id, status: sent.status });
  }

  return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
}
