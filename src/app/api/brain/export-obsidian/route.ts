import { NextResponse } from "next/server";
import { exportObsidianMaps } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const outputDir = typeof body.outputDir === "string" && body.outputDir.trim() ? body.outputDir.trim() : null;
    const result = exportObsidianMaps({ outputDir });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not export Obsidian maps" }, { status: 500 });
  }
}
