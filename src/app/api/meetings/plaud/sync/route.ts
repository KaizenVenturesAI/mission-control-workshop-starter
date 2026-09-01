import { NextResponse } from "next/server";
import { actorFromRequest } from "@/lib/audit/store";
import { syncPlaudMeetings } from "@/lib/meetings/plaud";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.MISSION_CONTROL_SYNC_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || request.headers.get("x-mission-control-sync-secret") || "";
  return header === `Bearer ${secret}` || header === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await syncPlaudMeetings({
    actor: actorFromRequest(request),
    force: Boolean((body as { force?: unknown }).force),
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-cache, no-store" } });
}
