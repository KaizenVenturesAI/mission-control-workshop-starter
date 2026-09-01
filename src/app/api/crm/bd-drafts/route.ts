import { NextResponse } from "next/server";
import { listBDEmailDrafts } from "@/lib/crm/bdDrafts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limitRaw = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  return NextResponse.json(listBDEmailDrafts(limit), {
    headers: { "Cache-Control": "no-cache" },
  });
}
