import { NextResponse } from "next/server";
import path from "path";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function dataPath(...segments: string[]) {
  return path.join(process.cwd(), ".data", ...segments);
}

function checkGwsAuth(): { status: "ok" | "error"; message: string } {
  try {
    const nodeRequire = eval("require") as NodeRequire;
    const { execSync } = nodeRequire("child_process") as typeof import("child_process");
    const output = execSync("gws whoami 2>&1", { timeout: 5000 }).toString().trim();
    if (output && !output.toLowerCase().includes("error") && !output.toLowerCase().includes("not found")) {
      return { status: "ok", message: output };
    }
    return { status: "error", message: output || "gws whoami returned empty output" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", message };
  }
}

function getLastSync(): { timestamp: string | null; leadsTotal: number; leadsCreated: number } | null {
  const nodeRequire = eval("require") as NodeRequire;
  const { existsSync, readFileSync } = nodeRequire("fs") as typeof import("fs");
  const logFile = dataPath("inbound-sync-log.json");
  if (!existsSync(logFile)) return null;
  try {
    const data = JSON.parse(readFileSync(logFile, "utf8"));
    return {
      timestamp: data.timestamp ?? null,
      leadsTotal: data.leadsTotal ?? 0,
      leadsCreated: data.leadsCreated ?? 0,
    };
  } catch {
    return null;
  }
}

function getLeadsTotal(): number {
  const nodeRequire = eval("require") as NodeRequire;
  const { existsSync, readFileSync } = nodeRequire("fs") as typeof import("fs");
  const leadsFile = dataPath("inbound-leads.json");
  if (!existsSync(leadsFile)) return 0;
  try {
    const data = JSON.parse(readFileSync(leadsFile, "utf8"));
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

function getDiscordAlerts(): { configured: boolean; missingVars: string[] } {
  const vars = ["DISCORD_ESCALATION_CHANNEL_ID", "DISCORD_BOT_TOKEN"];
  const missing = vars.filter((v) => !process.env[v]?.trim());
  return { configured: missing.length === 0, missingVars: missing };
}

function getPendingEmailDrafts(): { count: number; paths: string[] } {
  const nodeRequire = eval("require") as NodeRequire;
  const { existsSync, readdirSync } = nodeRequire("fs") as typeof import("fs");
  const dir = dataPath("pending-email-drafts");
  if (!existsSync(dir)) return { count: 0, paths: [] };
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    return { count: files.length, paths: files.map((f) => `.data/pending-email-drafts/${f}`) };
  } catch {
    return { count: 0, paths: [] };
  }
}

export async function GET() {
  if (shouldUseSupabaseBackend()) {
    const leads = await listSupabaseInboundLeads();
    return NextResponse.json({
      backend: "supabase",
      gwsAuth: { status: "skipped", message: "Google Workspace sheet sync is disabled in Supabase production mode." },
      lastSync: { timestamp: null, leadsTotal: leads.length, leadsCreated: 0 },
      discordAlerts: getDiscordAlerts(),
      cron: { configured: false, hint: "Use a server-side Supabase-aware sync worker before enabling sheet sync." },
      pendingEmailDrafts: { count: 0, paths: [] },
      academyEmail: { configured: false },
    }, { headers: { "Cache-Control": "no-cache" } });
  }
  const gwsAuth = checkGwsAuth();
  const lastSyncFromLog = getLastSync();
  const leadsTotal = getLeadsTotal();

  const lastSync = lastSyncFromLog
    ? { ...lastSyncFromLog, leadsTotal }
    : { timestamp: null, leadsTotal, leadsCreated: 0 };

  const discordAlerts = getDiscordAlerts();
  const pendingEmailDrafts = getPendingEmailDrafts();

  const crontabHint = `*/15 8-21 * * * cd ${process.cwd()} && npx ts-node scripts/sync-inbound-leads.ts >> .data/sync-cron.log 2>&1`;

  return NextResponse.json(
    {
      gwsAuth,
      lastSync,
      discordAlerts,
      cron: { configured: false, hint: crontabHint },
      pendingEmailDrafts,
      academyEmail: { configured: pendingEmailDrafts.count > 0 },
    },
    { headers: { "Cache-Control": "no-cache" } }
  );
}
