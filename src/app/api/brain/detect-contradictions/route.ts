import { NextResponse } from "next/server";
import { contradictionService } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const domain = String(body.domain ?? "all");
    return NextResponse.json({ findings: contradictionService.detect(domain) });
  } catch {
    return NextResponse.json({ error: "Could not detect contradictions" }, { status: 500 });
  }
}
