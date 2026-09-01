import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

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

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, primary, fallbacks } = body;

    if (!agentId || !primary) {
      return NextResponse.json({ error: "agentId and primary are required" }, { status: 400 });
    }

    const ocId = MC_TO_OC[agentId];
    if (!ocId) {
      return NextResponse.json({ error: `Unknown agent: ${agentId}` }, { status: 400 });
    }

    if (!OPENCLAW_CONFIG) {
      return NextResponse.json({ error: "OPENCLAW_CONFIG_PATH is not configured" }, { status: 400 });
    }

    // Read current config
    const config = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, "utf8"));
    const agentEntry = config.agents.list.find((a: { id: string }) => a.id === ocId);

    if (!agentEntry) {
      return NextResponse.json({ error: `Agent ${ocId} not found in config` }, { status: 404 });
    }

    // Update model config
    if (typeof agentEntry.model === "string") {
      // Convert from simple string to object format
      agentEntry.model = {
        primary,
        fallbacks: fallbacks || config.agents.defaults.model.fallbacks || [],
      };
    } else if (typeof agentEntry.model === "object") {
      agentEntry.model.primary = primary;
      if (fallbacks !== undefined) {
        agentEntry.model.fallbacks = fallbacks;
      }
    } else {
      agentEntry.model = {
        primary,
        fallbacks: fallbacks || config.agents.defaults.model.fallbacks || [],
      };
    }

    // Write updated config
    fs.writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2));

    // No rebuild needed — MC reads models live from openclaw.json via /api/agents/models

    // Auto-log to permissions audit trail
    try {
      const dataDir = path.join(process.cwd(), ".data");
      const auditFile = path.join(dataDir, "permissions-audit.json");
      const prevModel = typeof agentEntry.model === "string" ? agentEntry.model : agentEntry.model?.primary ?? "unknown";
      const auditEvent = {
        id: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        agentId,
        agentName: agentId,
        tool: "Model",
        action: "model_changed",
        detail: `Primary model changed to ${primary}${fallbacks?.length ? ` (fallbacks: ${fallbacks.join(", ")})` : ""}`,
        source: "auto",
        severity: "info",
        actor: "mission-control",
      };
      let existing: unknown[] = [];
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      if (fs.existsSync(auditFile)) {
        try { existing = JSON.parse(fs.readFileSync(auditFile, "utf8")); } catch { existing = []; }
      }
      existing.push(auditEvent);
      if (existing.length > 1000) existing.splice(0, existing.length - 1000);
      fs.writeFileSync(auditFile, JSON.stringify(existing, null, 2));
    } catch (auditErr) {
      console.error("Failed to write audit log:", auditErr);
    }

    return NextResponse.json({
      ok: true,
      agent: ocId,
      model: agentEntry.model,
    });
  } catch (err) {
    console.error("PATCH /api/agents/model error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
