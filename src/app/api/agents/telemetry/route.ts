import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { ProviderData } from "@/lib/getCostData";

export const dynamic = "force-dynamic";

/* ─── Optional messaging IDs per agent. Configure per deployment. ─── */
const AGENT_DISCORD_IDS: Record<string, string> = {
  "chief-of-staff": process.env.MC_CHIEF_OF_STAFF_DISCORD_ID || "",
  "operations": process.env.MC_OPERATIONS_DISCORD_ID || "",
  "partnerships": process.env.MC_PARTNERSHIPS_DISCORD_ID || "",
  "corporate-events": process.env.MC_CORPORATE_EVENTS_DISCORD_ID || "",
  "marketing": process.env.MC_MARKETING_DISCORD_ID || "",
  "executive-assistant": process.env.MC_EXECUTIVE_ASSISTANT_DISCORD_ID || "",
  "engineering": process.env.MC_ENGINEERING_DISCORD_ID || "",
  "strategy": process.env.MC_STRATEGY_DISCORD_ID || "",
};

/* ─── OpenClaw session shape ─── */
interface OpenClawSession {
  key: string;
  updatedAt: number; // unix ms
  agentId: string;
  totalTokens: number;
  model: string;
  kind: string;
}

function fetchSessionData(): {
  lastSeenMs: number;
  activeSessionCount: number;
  totalContextTokens: number;
} {
  try {
    const raw = execSync("openclaw sessions --json 2>/dev/null", {
      timeout: 5000,
      encoding: "utf-8",
    });
    const parsed = JSON.parse(raw);
    const sessions: OpenClawSession[] = parsed.sessions || (Array.isArray(parsed) ? parsed : []);
    if (sessions.length === 0) {
      return { lastSeenMs: 0, activeSessionCount: 0, totalContextTokens: 0 };
    }
    const lastSeenMs = Math.max(...sessions.map((s) => Number(s.updatedAt) || 0));
    const totalContextTokens = sessions.reduce((sum, s) => sum + (Number(s.totalTokens) || 0), 0);
    return {
      lastSeenMs,
      activeSessionCount: sessions.length,
      totalContextTokens,
    };
  } catch {
    return { lastSeenMs: 0, activeSessionCount: 0, totalContextTokens: 0 };
  }
}

function fetchOrgCost(): {
  cost24h: number;
  cost7d: number;
  source: string;
  provenance: string;
} {
  try {
    const raw = execSync("codexbar cost --json 2>/dev/null", {
      timeout: 5000,
      encoding: "utf-8",
    });
    const providers: ProviderData[] = JSON.parse(raw);

    let cost24h = 0;
    let cost7d = 0;

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    for (const provider of providers) {
      for (const day of provider.daily) {
        const date = new Date(day.date);
        if (date >= oneDayAgo) cost24h += day.totalCost;
        if (date >= sevenDaysAgo) cost7d += day.totalCost;
      }
    }

    return { cost24h, cost7d, source: "codexbar", provenance: "LOCAL" };
  } catch {
    return { cost24h: 0, cost7d: 0, source: "codexbar", provenance: "LOCAL" };
  }
}

export async function GET() {
  const sessionData = fetchSessionData();
  const costData = fetchOrgCost();

  const agents: Record<string, { discordBotId: string }> = {};
  for (const [agentId, botId] of Object.entries(AGENT_DISCORD_IDS)) {
    agents[agentId] = { discordBotId: botId };
  }

  return NextResponse.json(
    {
      orgStatus: {
        lastSeenMs: sessionData.lastSeenMs,
        activeSessionCount: sessionData.activeSessionCount,
        totalContextTokens: sessionData.totalContextTokens,
      },
      orgCost: {
        cost24h: costData.cost24h,
        cost7d: costData.cost7d,
        source: costData.source,
        provenance: costData.provenance,
      },
      agents,
    },
    { headers: { "Cache-Control": "no-cache" } }
  );
}
