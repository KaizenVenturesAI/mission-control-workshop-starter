import { NextRequest, NextResponse } from "next/server";
import { updateUnmatchedEmailStatus } from "@/lib/crm/unmatchedEmails";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const status = body.status;

    if (status !== "skipped") {
      return NextResponse.json(
        { error: "Only status: \"skipped\" is supported" },
        { status: 400 },
      );
    }

    const updated = updateUnmatchedEmailStatus(id, status);
    if (!updated) {
      return NextResponse.json(
        { error: "Unmatched email not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}
