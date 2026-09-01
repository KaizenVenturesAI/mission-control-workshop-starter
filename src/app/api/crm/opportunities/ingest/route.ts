import { NextResponse } from "next/server";
import { ingestInboundLead } from "@/lib/crm/leadIngestion";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = ingestInboundLead(body);
    return NextResponse.json(result, { status: result.created.opportunity ? 201 : 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_NAME_REQUIRED") {
      return NextResponse.json({ error: "account.name is required for non-academy lead ingestion" }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
