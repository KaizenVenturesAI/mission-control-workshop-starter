import { NextResponse } from "next/server";
import { createLearningEvent } from "@/lib/brain/services";
import type { BrainLearningAppliedTo, BrainLearningSourceType } from "@/lib/brain/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const eventText = String(body.eventText ?? body.event_text ?? "").trim();
    if (!eventText) return NextResponse.json({ error: "eventText is required" }, { status: 400 });
    const event = createLearningEvent({
      event_text: eventText,
      domain: typeof body.domain === "string" ? body.domain : undefined,
      source_type: (body.sourceType ?? body.source_type ?? "user_correction") as BrainLearningSourceType,
      affected_agent: typeof body.affectedAgent === "string" ? body.affectedAgent : null,
      proposed_rule: typeof body.proposedRule === "string" ? body.proposedRule : null,
      applied_to: typeof body.appliedTo === "string" ? body.appliedTo as BrainLearningAppliedTo : null,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
