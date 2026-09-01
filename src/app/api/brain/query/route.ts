import { NextResponse } from "next/server";
import { queryBrain } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = String(body.question ?? "").trim();
    if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
    return NextResponse.json(queryBrain({
      question,
      domain: typeof body.domain === "string" ? body.domain : "all",
      mode: typeof body.mode === "string" ? body.mode : "approved_plus_candidate",
      maxTokens: Number.isFinite(Number(body.maxTokens)) ? Number(body.maxTokens) : 2000,
      includeSources: Boolean(body.includeSources),
    }));
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
