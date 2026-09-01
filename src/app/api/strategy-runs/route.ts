import { NextResponse } from "next/server";
import { getRuns, createRun } from "@/lib/strategy/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const runs = getRuns();
  return NextResponse.json(runs, { headers: { "Cache-Control": "no-cache" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const run = createRun(body);
    return NextResponse.json(run, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
