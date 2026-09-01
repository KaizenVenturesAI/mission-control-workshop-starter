import { NextResponse } from "next/server";
import { createActionItemFromFinding } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = createActionItemFromFinding(id, typeof body.actor === "string" ? body.actor : "Alex");
    if (!result.finding) return NextResponse.json({ error: "Contradiction not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not create action item" }, { status: 500 });
  }
}
