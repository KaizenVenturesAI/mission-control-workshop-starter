import { NextResponse } from "next/server";
import { fetchCodexbarCost } from "@/lib/sources/codexbar";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = fetchCodexbarCost();

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-cache" },
  });
}
