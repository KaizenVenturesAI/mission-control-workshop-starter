import { NextResponse } from "next/server";
import { runBDIntake } from "@/lib/crm/bdWorkflow";
import { safeAppendAuditEntry } from "@/lib/audit/store";

export const dynamic = "force-dynamic";

function baseUrlFromRequest(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const note = typeof body?.note === "string" ? body.note : "";
    if (!note.trim()) {
      return NextResponse.json({ error: "note is required" }, { status: 400 });
    }

    const result = await runBDIntake({
      note,
      createOpportunity: body?.createOpportunity === true,
      idempotencyKey: request.headers.get("Idempotency-Key") || body?.idempotencyKey,
      baseUrl: baseUrlFromRequest(request),
      slack: body?.slack && typeof body.slack === "object" ? {
        channelId: typeof body.slack.channelId === "string" ? body.slack.channelId : undefined,
        channelName: typeof body.slack.channelName === "string" ? body.slack.channelName : undefined,
        messageTs: typeof body.slack.messageTs === "string" ? body.slack.messageTs : undefined,
        threadTs: typeof body.slack.threadTs === "string" ? body.slack.threadTs : undefined,
        userId: typeof body.slack.userId === "string" ? body.slack.userId : undefined,
        permalink: typeof body.slack.permalink === "string" ? body.slack.permalink : undefined,
      } : undefined,
    });

    safeAppendAuditEntry({
      actor: "Mission Agent",
      entityType: "activity",
      entityId: result.activityId,
      action: "create",
      changes: [],
      context: {
        route: "/api/crm/bd-intake",
        method: "POST",
        requestId: result.intakeId,
        relatedEntityId: result.contact.id,
        summary: "BD intake processed and follow-up draft prepared",
      },
    });

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_REQUIRED") {
      return NextResponse.json({ error: "Could not find an email address in the note" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "NOTE_REQUIRED") {
      return NextResponse.json({ error: "note is required" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BD intake failed" },
      { status: 500 }
    );
  }
}
