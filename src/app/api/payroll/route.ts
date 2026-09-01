import { NextResponse } from "next/server";
import { getPayrollSnapshot } from "@/modules/hr/payroll-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  return NextResponse.json(getPayrollSnapshot({
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    location: searchParams.get("location"),
  }), {
    headers: { "Cache-Control": "no-cache" },
  });
}
