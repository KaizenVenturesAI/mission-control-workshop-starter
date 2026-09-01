import { NextResponse } from "next/server";
import { getDevLogSyncStatus } from "@/lib/devlog/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getDevLogSyncStatus(), { headers: { "Cache-Control": "no-cache" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500, headers: { "Cache-Control": "no-cache" } });
  }
}

