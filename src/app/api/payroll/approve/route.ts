import { NextResponse } from "next/server";
import { approveForPayment, unapproveForPayment } from "@/modules/hr/payroll-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId : "";
    const amount = Number(body?.amount ?? 0);
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
    }
    return NextResponse.json(approveForPayment(employeeId, amount), { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request body" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId") ?? "";
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
    }
    return NextResponse.json(unapproveForPayment(employeeId), { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}
