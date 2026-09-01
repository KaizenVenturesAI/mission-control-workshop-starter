import { NextResponse } from "next/server";
import { ingestMeetingsAsSources } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return NextResponse.json(ingestMeetingsAsSources({ force: Boolean(body.force) }));
}
