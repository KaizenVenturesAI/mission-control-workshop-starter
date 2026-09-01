import { NextResponse } from "next/server";
import { importPayrollSheets, type PayrollImportSource } from "@/modules/hr/payroll-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = body?.source;

    if (source !== "miami-coaches" && source !== "la-coaches" && source !== "all") {
      return NextResponse.json(
        { error: 'source must be one of "miami-coaches", "la-coaches", or "all"' },
        { status: 400 }
      );
    }

    const result = importPayrollSheets(source as PayrollImportSource);
    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-cache" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
