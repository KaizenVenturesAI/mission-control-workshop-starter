import { NextResponse } from "next/server";
import { getPayrollDigest } from "@/modules/hr/payroll-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPayrollDigest(), {
    headers: { "Cache-Control": "no-cache" },
  });
}
