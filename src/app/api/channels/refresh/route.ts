import { NextRequest, NextResponse } from "next/server";
import { refreshDiscordChannels, DiscordChannel } from "@/lib/sources/discord";

export const dynamic = "force-dynamic";

function validateChannels(data: unknown): data is DiscordChannel[] {
  if (!Array.isArray(data)) return false;
  return data.every(
    (ch) =>
      typeof ch === "object" &&
      ch !== null &&
      typeof ch.id === "string" &&
      typeof ch.name === "string" &&
      typeof ch.memberCount === "number" &&
      Array.isArray(ch.members) &&
      ch.members.every(
        (m: Record<string, unknown>) =>
          typeof m.id === "string" &&
          typeof m.name === "string" &&
          typeof m.username === "string" &&
          ["Admin", "Standard", "Integration"].includes(m.role as string),
      ),
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!validateChannels(body)) {
      return NextResponse.json(
        { error: "Invalid data: expected DiscordChannel[] with id, name, memberCount, and members array" },
        { status: 400 },
      );
    }

    // Add fetchedAt timestamp to each channel if missing
    const now = new Date().toISOString();
    const channels = body.map((ch) => ({
      ...ch,
      fetchedAt: ch.fetchedAt || now,
    }));

    const result = refreshDiscordChannels(channels);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-cache" },
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
}
