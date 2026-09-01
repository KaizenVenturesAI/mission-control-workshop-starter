import { NextResponse } from "next/server";
import { buildCRMConsolePayload } from "@/lib/crm/console";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await buildCRMConsolePayload();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-cache",
        "Server-Timing": `crm-console;dur=${payload.durationMs}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build CRM console payload" },
      { status: 500 },
    );
  }
}
