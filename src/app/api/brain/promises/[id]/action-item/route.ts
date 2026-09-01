import { NextResponse } from "next/server";
import { createActionItemFromPromise } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = createActionItemFromPromise(id, typeof body.actor === "string" ? body.actor : "Knowledge Brain");
    if (!result.promise) return NextResponse.json({ error: "Promise not found" }, { status: 404 });
    return NextResponse.json(result, { status: result.alreadyLinked ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: "Could not create action item" }, { status: 500 });
  }
}
