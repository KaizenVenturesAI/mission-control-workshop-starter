import { NextResponse } from "next/server";
import { resolveAuthHealth } from "@/lib/supabase/public-config";

export async function GET() {
  const health = await resolveAuthHealth();
  return NextResponse.json(health, { status: health.configured ? 200 : 503 });
}
