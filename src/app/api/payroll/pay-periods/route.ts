import { NextResponse } from "next/server";
import { createPayPeriod, listPayPeriods, updatePayPeriod, lockPayPeriod, markPayPeriodPaid, getPayPeriodEntryCounts } from "@/modules/hr/payroll-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const periods = listPayPeriods();
  const entryCounts = getPayPeriodEntryCounts();
  return NextResponse.json({ periods, entryCounts }, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : null;

    if (action === "lock") {
      const period = lockPayPeriod(body.id);
      return NextResponse.json(period, { status: 200 });
    }

    if (action === "markPaid") {
      const period = markPayPeriodPaid(body.id);
      return NextResponse.json(period, { status: 200 });
    }

    const period = createPayPeriod(body);
    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) {
      return NextResponse.json({ error: "Pay period id is required" }, { status: 400 });
    }

    const period = updatePayPeriod(id, body);
    return NextResponse.json(period, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}
