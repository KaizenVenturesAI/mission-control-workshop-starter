import { NextResponse } from "next/server";
import { getInboundLead } from "@/modules/revenue/inboundLeadsStore";
import { getEventsForLead } from "@/modules/revenue/inboundLeadEventsStore";
import { getSupabaseEventsForLead, getSupabaseInboundLead } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const lead = shouldUseSupabaseBackend() ? await getSupabaseInboundLead(id) : getInboundLead(id);

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const events = shouldUseSupabaseBackend() ? await getSupabaseEventsForLead(id) : getEventsForLead(id);
  return NextResponse.json(events, { headers: { "Cache-Control": "no-cache" } });
}
