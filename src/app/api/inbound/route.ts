import { NextResponse } from "next/server";
import { createInboundLead, listInboundLeads } from "@/modules/revenue/inboundLeadsStore";
import { listSupabaseInboundLeads, upsertSupabaseInboundLead } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

function getFilters(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : null;

  return {
    type: url.searchParams.get("type"),
    status: url.searchParams.get("status"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    limit: Number.isFinite(limit) ? limit : null,
  };
}

export async function GET(request: Request) {
  const leads = shouldUseSupabaseBackend()
    ? await listSupabaseInboundLeads(getFilters(request))
    : listInboundLeads(getFilters(request));
  return NextResponse.json(leads, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as InboundLeadRecord;
    const lead = shouldUseSupabaseBackend() ? await upsertSupabaseInboundLead(body) : createInboundLead(body);
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
