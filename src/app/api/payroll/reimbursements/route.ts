import { NextResponse } from "next/server";
import { createReimbursement, deleteReimbursement, listReimbursements, updateReimbursement } from "@/modules/hr/payroll-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listReimbursements(), {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const reimbursement = createReimbursement(body);
    return NextResponse.json(reimbursement, { status: 201 });
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
      return NextResponse.json({ error: "Reimbursement id is required" }, { status: 400 });
    }

    const reimbursement = updateReimbursement(id, body);
    return NextResponse.json(reimbursement, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Reimbursement id is required" }, { status: 400 });
    }

    const deleted = deleteReimbursement(id);
    return NextResponse.json(deleted, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }
}
