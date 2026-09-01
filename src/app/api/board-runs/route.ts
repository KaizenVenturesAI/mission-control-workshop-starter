import { NextResponse } from "next/server";
import { getBoardAuditSnapshot } from "@/lib/strategy/board-audit-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBoardAuditSnapshot(), { headers: { "Cache-Control": "no-cache" } });
}
