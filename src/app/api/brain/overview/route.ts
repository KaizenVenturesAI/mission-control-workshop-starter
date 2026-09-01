import { NextResponse } from "next/server";
import { bootstrapBrainArtifacts, getBrainOverview } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function GET() {
  bootstrapBrainArtifacts();
  return NextResponse.json(getBrainOverview(), { headers: { "Cache-Control": "no-cache" } });
}
