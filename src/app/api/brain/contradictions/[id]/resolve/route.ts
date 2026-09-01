import { NextResponse } from "next/server";
import { contradictionService, createLearningEvent } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const resolution = String(body.resolution ?? "").trim();
    if (!resolution) return NextResponse.json({ error: "resolution is required" }, { status: 400 });
    const finding = contradictionService.resolve(id, {
      resolution,
      winningClaimId: typeof body.winningClaimId === "string" ? body.winningClaimId : null,
      resolvedBy: typeof body.resolvedBy === "string" ? body.resolvedBy : null,
    });
    if (!finding) return NextResponse.json({ error: "Contradiction not found" }, { status: 404 });
    createLearningEvent({
      event_text: `Contradiction resolved: ${finding.title}. ${resolution}`,
      domain: finding.domain,
      source_type: "contradiction",
      proposed_rule: resolution,
      applied_to: "memory",
    });
    return NextResponse.json({ finding });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
