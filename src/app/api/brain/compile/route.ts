import { NextResponse } from "next/server";
import { compiledPageService } from "@/lib/brain/services";
import type { BrainPageType, BrainTargetSystem } from "@/lib/brain/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const page = compiledPageService.generate({
      pageType: (body.pageType ?? "strategy") as BrainPageType,
      domain: String(body.domain ?? "leadership"),
      target: (body.target ?? "mission_control") as BrainTargetSystem,
      title: typeof body.title === "string" ? body.title : undefined,
    });
    return NextResponse.json({ page });
  } catch {
    return NextResponse.json({ error: "Could not compile page" }, { status: 500 });
  }
}
