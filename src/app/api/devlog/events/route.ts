import { NextResponse } from "next/server";
import { readDevLogReadModel } from "@/lib/devlog/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readDevLogReadModel();
  return NextResponse.json({
    updatedAt: store.updatedAt,
    backend: store.backend,
    latestRun: store.latestRun,
    count: store.entries.length,
    entries: store.entries,
  });
}
