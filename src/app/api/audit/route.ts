import { NextRequest, NextResponse } from "next/server";
import { readAuditEntries } from "@/lib/audit/store";
import type { AuditEntityType } from "@/types/audit-log";

export const dynamic = "force-dynamic";

const VALID_ENTITY_TYPES: readonly AuditEntityType[] = [
  "lead",
  "account",
  "contact",
  "activity",
  "opportunity",
  "action-item",
];

function parseEntityType(value: string | null): AuditEntityType | undefined {
  if (!value) return undefined;
  return (VALID_ENTITY_TYPES as readonly string[]).includes(value)
    ? (value as AuditEntityType)
    : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const entityType = parseEntityType(params.get("entityType"));
  const entityId = params.get("entityId") ?? undefined;
  const actor = params.get("actor") ?? undefined;
  const since = params.get("since") ?? undefined;
  const cursor = params.get("cursor") ?? undefined;

  let limit = 50;
  const limitParam = params.get("limit");
  if (limitParam) {
    const parsed = Number(limitParam);
    if (Number.isFinite(parsed)) limit = Math.min(Math.max(Math.floor(parsed), 1), 500);
  }

  const result = readAuditEntries({ entityType, entityId, actor, since, limit, cursor });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-cache" } });
}
