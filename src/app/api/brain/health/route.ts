import { NextResponse } from "next/server";
import { getBrainHealth } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBrainHealth(), { headers: { "Cache-Control": "no-cache" } });
}
