import { NextResponse } from "next/server";
import fs from "fs";

export const dynamic = "force-dynamic";

const OPENCLAW_CONFIG = process.env.OPENCLAW_CONFIG_PATH;

// Map MC agent IDs to OpenClaw agent IDs
const MC_TO_OC: Record<string, string> = {
  "chief-of-staff": "main",
  operations: "operations",
  partnerships: "partnerships",
  "corporate-events": "corporateevents",
  marketing: "marketing",
  "executive-assistant": "executiveassistant",
  engineering: "engineering",
  strategy: "strategy",
  support: "support",
  academy: "academy",
  security: "security",
  finance: "finance",
};

const OC_TO_MC: Record<string, string> = Object.fromEntries(
  Object.entries(MC_TO_OC).map(([mc, oc]) => [oc, mc])
);

function cleanModelName(modelStr: string): string {
  if (!modelStr) return "Unknown";
  return modelStr.split("/").pop()?.replace("-preview", "") || modelStr;
}

function getProvider(modelStr: string): string {
  if (!modelStr) return "Unknown";
  if (modelStr.includes("anthropic")) return "Anthropic";
  if (modelStr.includes("google")) return "Google";
  if (modelStr.includes("minimax")) return "MiniMax";
  if (modelStr.includes("openai")) return "OpenAI";
  if (modelStr.includes("ollama")) return "Ollama (Local)";
  if (modelStr.includes("claude-cli")) return "Claude CLI";
  return "Unknown";
}

export async function GET() {
  try {
    if (!OPENCLAW_CONFIG) {
      return NextResponse.json({ ok: true, models: {} }, { headers: { "Cache-Control": "no-cache, no-store" } });
    }
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, "utf8"));
    const agentsList = config.agents?.list || [];
    const defaults = config.agents?.defaults?.model || {};

    const models: Record<string, {
      primary: string;
      primaryRaw: string;
      provider: string;
      fallbacks: string[];
      fallbacksRaw: string[];
    }> = {};

    for (const agent of agentsList) {
      const mcId = OC_TO_MC[agent.id];
      if (!mcId) continue;

      let primaryRaw = "";
      let fallbacksRaw: string[] = [];

      if (agent.model && typeof agent.model === "object") {
        primaryRaw = agent.model.primary || defaults.primary || "";
        fallbacksRaw = agent.model.fallbacks || defaults.fallbacks || [];
      } else if (typeof agent.model === "string") {
        primaryRaw = agent.model;
        fallbacksRaw = defaults.fallbacks || [];
      } else {
        primaryRaw = defaults.primary || "";
        fallbacksRaw = defaults.fallbacks || [];
      }

      models[mcId] = {
        primary: cleanModelName(primaryRaw),
        primaryRaw,
        provider: getProvider(primaryRaw),
        fallbacks: fallbacksRaw.map(cleanModelName),
        fallbacksRaw,
      };
    }

    return NextResponse.json({ ok: true, models }, { headers: { "Cache-Control": "no-cache, no-store" } });
  } catch (err) {
    console.error("GET /api/agents/models error:", err);
    return NextResponse.json({ error: "Failed to read config" }, { status: 500 });
  }
}
