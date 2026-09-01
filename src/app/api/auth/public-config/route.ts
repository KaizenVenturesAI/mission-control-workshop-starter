import { NextResponse } from "next/server";
import { resolvePublicAuthConfig } from "@/lib/supabase/public-config";

export async function GET() {
  const config = await resolvePublicAuthConfig();
  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        backendEnabled: config.backendEnabled,
        missing: config.missing,
        error: "Mission Control Supabase public auth configuration is missing.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: config.url,
    anonKey: config.anonKey,
    configured: true,
    backendEnabled: config.backendEnabled,
    missing: [],
  });
}
