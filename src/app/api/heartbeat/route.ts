import { NextResponse } from "next/server";
import { syncPlaudMeetings } from "@/lib/meetings/plaud";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface HeartbeatTask {
  name: string;
  status: "ok" | "error" | "skipped";
  durationMs: number;
  error?: string;
}

async function runTask(
  name: string,
  fn: () => Promise<void>,
): Promise<HeartbeatTask> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: "ok", durationMs: Date.now() - start };
  } catch (err) {
    return {
      name,
      status: "error",
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST() {
  const tasks: HeartbeatTask[] = [];

  // ── 1. Gmail Email Sync ──
  tasks.push(
    await runTask("email-sync", async () => {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/crm/sync-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`sync-email returned ${res.status}: ${body}`);
      }
    }),
  );

  // ── 2. Plaud Meeting Sync ──
  tasks.push(
    await runTask("plaud-meetings-sync", async () => {
      const result = await syncPlaudMeetings({ actor: "system" });
      if (!result.configured) return;
      if (result.failed > 0) {
        throw new Error(`Plaud sync completed with ${result.failed} failed import(s): ${result.errors.join("; ")}`);
      }
    }),
  );

  const allOk = tasks.every((t) => t.status === "ok");

  return NextResponse.json(
    {
      heartbeat: true,
      ranAt: new Date().toISOString(),
      status: allOk ? "ok" : "degraded",
      tasks,
    },
    {
      status: allOk ? 200 : 207,
      headers: { "Cache-Control": "no-cache" },
    },
  );
}

export async function GET() {
  return NextResponse.json({
    heartbeat: true,
    description: "POST to run heartbeat cycle. GET returns meta only.",
    tasks: ["email-sync", "plaud-meetings-sync"],
  });
}
