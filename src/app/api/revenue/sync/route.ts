import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const DATA_PATH = join(process.cwd(), "src/data/revenue-events.json");
const META_PATH = join(process.cwd(), "src/data/revenue-meta.json");

function readRevenueEvents(): any[] {
  try {
    const raw = readFileSync(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildLocalMeta() {
  const events = readRevenueEvents();
  return {
    lastSync: null,
    eventCount: events.length,
    totalRevenue: events.reduce((sum: number, event: any) => sum + (Number(event.totalRevenue) || 0), 0),
    source: "local-json",
  };
}

export async function POST() {
  return NextResponse.json({
    success: true,
    ...buildLocalMeta(),
    message: "Revenue refresh is local-only in this Mission Control build.",
  });
}

export async function GET() {
  try {
    const raw = readFileSync(META_PATH, "utf-8");
    return NextResponse.json({ ...buildLocalMeta(), ...JSON.parse(raw), source: "local-json" });
  } catch {
    return NextResponse.json(buildLocalMeta());
  }
}
