import { NextResponse } from "next/server";
import { processSourceDocument } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sourceDocumentId = String(body.sourceDocumentId ?? "");
    if (!sourceDocumentId) return NextResponse.json({ error: "sourceDocumentId is required" }, { status: 400 });
    const result = processSourceDocument(sourceDocumentId);
    if (!result.sourceDocument) return NextResponse.json({ error: "Source document not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
