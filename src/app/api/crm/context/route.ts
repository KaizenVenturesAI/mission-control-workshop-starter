import { NextRequest, NextResponse } from "next/server";
import { buildCRMRecordContext } from "@/lib/crm/context";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const object = req.nextUrl.searchParams.get("object") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";

  if (!object.trim() || !id.trim()) {
    return NextResponse.json(
      { error: "Missing required query params: object and id" },
      { status: 400 },
    );
  }

  try {
    const result = await buildCRMRecordContext(object, id);
    if (!result.context) {
      return NextResponse.json(
        { error: "CRM record not found" },
        { status: result.notFound ? 404 : 400 },
      );
    }
    return NextResponse.json(result.context, {
      headers: {
        "Cache-Control": "no-cache",
        "Server-Timing": `crm-context;dur=${result.context.durationMs}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build CRM context" },
      { status: 500 },
    );
  }
}
