import { NextResponse } from "next/server";
import { buildCRMConsolePayload } from "@/lib/crm/console";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const consolePayload = await buildCRMConsolePayload();
    return NextResponse.json(
      {
        generatedAt: consolePayload.generatedAt,
        backend: consolePayload.backend,
        diagnostics: consolePayload.diagnostics,
        counts: consolePayload.counts,
        health: consolePayload.healthSummary,
        queue: consolePayload.queue,
      },
      {
        headers: {
          "Cache-Control": "no-cache",
          "Server-Timing": `crm-health;dur=${consolePayload.durationMs}`,
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build CRM health payload" },
      { status: 500 },
    );
  }
}
