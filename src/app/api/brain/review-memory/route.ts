import { NextResponse } from "next/server";
import { reviewMemoryRecord } from "@/lib/brain/services";
import type { BrainTrustStatus } from "@/lib/brain/types";

export const dynamic = "force-dynamic";

const recordTypes = new Set(["claim", "decision", "risk", "promise"]);
const trustStatuses = new Set(["candidate", "approved", "rejected", "superseded"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const recordType = String(body.recordType ?? "");
    const recordId = String(body.recordId ?? "");
    const trustStatus = String(body.trustStatus ?? "");
    if (!recordTypes.has(recordType) || !recordId || !trustStatuses.has(trustStatus)) {
      return NextResponse.json({ error: "recordType, recordId, and trustStatus are required" }, { status: 400 });
    }
    const result = reviewMemoryRecord({
      recordType: recordType as "claim" | "decision" | "risk" | "promise",
      recordId,
      trustStatus: trustStatus as BrainTrustStatus,
      reviewedBy: typeof body.reviewedBy === "string" ? body.reviewedBy : "Alex",
      reviewNote: typeof body.reviewNote === "string" ? body.reviewNote : null,
    });
    if (!result.record) return NextResponse.json({ error: "Memory record not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
