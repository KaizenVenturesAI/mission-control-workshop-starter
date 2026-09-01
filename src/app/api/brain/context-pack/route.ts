import { NextResponse } from "next/server";
import { contextPackService } from "@/lib/brain/services";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const pack = contextPackService.generate({
      pack: typeof body.pack === "string" ? body.pack : undefined,
      domain: typeof body.domain === "string" ? body.domain : undefined,
      audience: typeof body.audience === "string" ? body.audience : undefined,
      tokenBudget: Number.isFinite(Number(body.tokenBudget)) ? Number(body.tokenBudget) : undefined,
    });
    return NextResponse.json({ pack });
  } catch {
    return NextResponse.json({ error: "Could not generate context pack" }, { status: 500 });
  }
}
