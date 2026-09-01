import { NextResponse } from "next/server";
import { readActionItems } from "@/lib/action-items/store";
import { buildStaleTicketDigest } from "@/lib/linear/staleDigest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const digest = buildStaleTicketDigest(readActionItems());

  if (format === "text" || format === "md" || format === "markdown") {
    return new Response(digest.markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  return NextResponse.json(digest, {
    headers: { "Cache-Control": "no-cache" },
  });
}
