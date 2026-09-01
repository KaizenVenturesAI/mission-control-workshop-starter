import { NextResponse } from "next/server";
import { getPlaudSyncStatus } from "@/lib/meetings/plaud";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPlaudSyncStatus(), { headers: { "Cache-Control": "no-cache, no-store" } });
}
