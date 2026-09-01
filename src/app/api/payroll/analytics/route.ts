import { NextResponse } from "next/server";
import { getPayrollAnalytics } from "@/modules/hr/payroll-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return NextResponse.json(getPayrollAnalytics({
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    location: searchParams.get("location") ?? undefined,
  }), {
    headers: { "Cache-Control": "no-cache" },
  });
}
