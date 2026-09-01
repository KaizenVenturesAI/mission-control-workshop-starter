import { NextResponse } from "next/server";
import { getMeetingById } from "@/lib/meetings/store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const meeting = getMeetingById(id);

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  return NextResponse.json(meeting, { headers: { "Cache-Control": "no-cache" } });
}
