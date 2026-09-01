import { NextResponse } from "next/server";
import { sendApprovedBDEmailDraft } from "@/lib/crm/bdDrafts";
import { safeAppendAuditEntry } from "@/lib/audit/store";
import { postBDStatusToSlack } from "@/lib/slack/bd";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const draft = sendApprovedBDEmailDraft(id, {
      approvedBy: typeof body?.approvedBy === "string" ? body.approvedBy : "Alex",
      approvalReaction: typeof body?.approvalReaction === "string" ? body.approvalReaction : "white_check_mark",
    });

    safeAppendAuditEntry({
      actor: "Alex",
      entityType: "activity",
      entityId: draft.activityId,
      action: "update",
      changes: [{ field: "bdDraftStatus", before: "pending_approval", after: draft.status }],
      context: {
        route: `/api/crm/bd-drafts/${id}/approve`,
        method: "POST",
        requestId: draft.intakeId,
        relatedEntityId: draft.contactId,
        summary: draft.status === "sent" ? "BD follow-up approved and sent" : "BD follow-up approval attempted",
      },
    });

    if (draft.sourceSlack?.channelId && draft.sourceSlack.threadTs) {
      await postBDStatusToSlack({
        channelId: draft.sourceSlack.channelId,
        threadTs: draft.sourceSlack.threadTs,
        text: draft.status === "sent"
          ? `Sent BD follow-up from Example Client Mission Agent for draft \`${draft.id}\`.`
          : `Could not send BD follow-up draft \`${draft.id}\`: ${draft.sendError ?? "unknown error"}`,
      });
    }

    return NextResponse.json(draft, { status: draft.status === "send_failed" ? 502 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "DRAFT_NOT_FOUND") {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DRAFT_CANCELLED") {
      return NextResponse.json({ error: "Draft is cancelled" }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 500 }
    );
  }
}
