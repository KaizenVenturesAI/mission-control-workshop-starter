import { NextResponse } from "next/server";
import { createLinearIssueDraft } from "@/lib/linear/client";

export const dynamic = "force-dynamic";

function buildDescription(body: {
  source?: string;
  requestText?: string;
  owner?: string;
  channel?: string;
  messageUrl?: string;
  checklist?: string[];
  notes?: string;
}): string | undefined {
  const lines: string[] = [];

  if (body.source || body.channel || body.owner) {
    lines.push("## Intake context");
    if (body.source) lines.push(`- Source: ${body.source}`);
    if (body.channel) lines.push(`- Channel: ${body.channel}`);
    if (body.owner) lines.push(`- Requested by: ${body.owner}`);
    if (body.messageUrl) lines.push(`- Message: ${body.messageUrl}`);
    lines.push("");
  }

  if (body.requestText) {
    lines.push("## Request");
    lines.push(body.requestText.trim());
    lines.push("");
  }

  if (body.checklist?.length) {
    lines.push("## Draft checklist");
    for (const item of body.checklist) lines.push(`- [ ] ${item}`);
    lines.push("");
  }

  if (body.notes?.trim()) {
    lines.push("## Notes");
    lines.push(body.notes.trim());
    lines.push("");
  }

  const description = lines.join("\n").trim();
  return description || undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const issue = await createLinearIssueDraft({
      title,
      description: typeof body.description === "string" && body.description.trim()
        ? body.description.trim()
        : buildDescription(body),
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      assigneeId: typeof body.assigneeId === "string" ? body.assigneeId : undefined,
      priority: typeof body.priority === "number" ? body.priority : undefined,
    });

    return NextResponse.json({
      success: true,
      issue,
      confirmationText: `Draft issue created: ${issue.identifier} ${issue.url}`,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
