import { NextResponse } from "next/server";
import { getPendingUnmatchedEmails } from "@/lib/crm/unmatchedEmails";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pending = getPendingUnmatchedEmails();
    return NextResponse.json(pending, {
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read unmatched emails" },
      { status: 500 },
    );
  }
}
