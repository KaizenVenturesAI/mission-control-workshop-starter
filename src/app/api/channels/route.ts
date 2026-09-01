import { NextRequest, NextResponse } from "next/server";
import { fetchDiscordChannels, forceRefreshDiscordChannels } from "@/lib/sources/discord";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  const result = forceRefresh ? forceRefreshDiscordChannels() : fetchDiscordChannels();

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-cache" },
  });
}
