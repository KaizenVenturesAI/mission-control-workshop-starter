import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), ".data");
const AUDIT_FILE = path.join(DATA_DIR, "permissions-audit.json");

export type PermissionAuditEvent = {
  id: string;
  timestamp: string; // ISO 8601
  agentId: string;
  agentName: string;
  tool: string;
  action: string;    // e.g., "model_changed", "permission_verified", "access_granted", "access_revoked"
  detail: string;
  source: "auto" | "manual";
  severity?: "info" | "elevated" | "critical";
  actor?: string;    // e.g., "chief-of-staff", "system"
};

function readAuditLog(): PermissionAuditEvent[] {
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const raw = fs.readFileSync(AUDIT_FILE, "utf8");
    return JSON.parse(raw) as PermissionAuditEvent[];
  } catch {
    return [];
  }
}

function writeAuditLog(events: PermissionAuditEvent[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(events, null, 2));
}

function generateId(): string {
  return `perm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** GET /api/permissions/audit — list events, newest first, optional limit */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitStr = url.searchParams.get("limit");
  const agentId = url.searchParams.get("agentId");
  const limit = limitStr ? parseInt(limitStr, 10) : 100;

  let events = readAuditLog();

  // Filter by agent if requested
  if (agentId) {
    events = events.filter((e) => e.agentId === agentId);
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply limit
  events = events.slice(0, limit);

  return NextResponse.json({ ok: true, events, total: events.length });
}

/** POST /api/permissions/audit — log a new event */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      agentId,
      agentName,
      tool,
      action,
      detail,
      source = "manual",
      severity = "info",
      actor,
    } = body;

    if (!agentId || !tool || !action || !detail) {
      return NextResponse.json(
        { error: "agentId, tool, action, and detail are required" },
        { status: 400 }
      );
    }

    const event: PermissionAuditEvent = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      agentId,
      agentName: agentName || agentId,
      tool,
      action,
      detail,
      source,
      severity,
      actor: actor || "system",
    };

    const events = readAuditLog();
    events.push(event);
    // Keep only the last 1000 events
    if (events.length > 1000) events.splice(0, events.length - 1000);
    writeAuditLog(events);

    return NextResponse.json({ ok: true, event });
  } catch (err) {
    console.error("POST /api/permissions/audit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
