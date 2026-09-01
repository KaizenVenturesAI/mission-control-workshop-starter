import { NextResponse } from "next/server";
import { getStore } from "@/modules/revenue/inboundLeadsStore";
import { listSupabaseInboundLeads } from "@/modules/revenue/inboundLeadsSupabaseStore";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

export const dynamic = "force-dynamic";

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]+/g, "").toLowerCase();
}

interface DuplicateGroup {
  matchType: "email" | "phone" | "name+company";
  matchValue: string;
  leads: Pick<InboundLeadRecord, "id" | "name" | "type" | "status" | "receivedAt">[];
}

export async function GET() {
  const leads = shouldUseSupabaseBackend() ? await listSupabaseInboundLeads() : getStore().leads;
  const groups: DuplicateGroup[] = [];
  const seenLeadIds = new Set<string>();

  // --- Email duplicates (exact, case-insensitive) ---
  const emailMap = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    if (!lead.email) continue;
    const key = lead.email.toLowerCase().trim();
    const arr = emailMap.get(key);
    if (arr) arr.push(lead);
    else emailMap.set(key, [lead]);
  }
  for (const [email, group] of emailMap) {
    if (group.length < 2) continue;
    const sorted = group.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    groups.push({
      matchType: "email",
      matchValue: email,
      leads: sorted.map(pick),
    });
    for (const l of group) seenLeadIds.add(l.id);
  }

  // --- Phone duplicates (normalized) ---
  const phoneMap = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    if (!lead.phone) continue;
    const key = normalizePhone(lead.phone);
    if (!key) continue;
    const arr = phoneMap.get(key);
    if (arr) arr.push(lead);
    else phoneMap.set(key, [lead]);
  }
  for (const [phone, group] of phoneMap) {
    if (group.length < 2) continue;
    // Skip if all leads in this group are already captured by email match
    if (group.every((l) => seenLeadIds.has(l.id))) continue;
    const sorted = group.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    groups.push({
      matchType: "phone",
      matchValue: phone,
      leads: sorted.map(pick),
    });
    for (const l of group) seenLeadIds.add(l.id);
  }

  // --- Name + Company duplicates (case-insensitive) ---
  const nameCompanyMap = new Map<string, InboundLeadRecord[]>();
  for (const lead of leads) {
    const nameVal = (lead.contactName || lead.name || "").toLowerCase().trim();
    const companyVal = (lead.companyName || "").toLowerCase().trim();
    if (!nameVal || !companyVal) continue;
    const key = `${nameVal}|${companyVal}`;
    const arr = nameCompanyMap.get(key);
    if (arr) arr.push(lead);
    else nameCompanyMap.set(key, [lead]);
  }
  for (const [key, group] of nameCompanyMap) {
    if (group.length < 2) continue;
    if (group.every((l) => seenLeadIds.has(l.id))) continue;
    const sorted = group.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    groups.push({
      matchType: "name+company",
      matchValue: key.replace("|", " @ "),
      leads: sorted.map(pick),
    });
  }

  const totalDuplicates = groups.reduce((sum, g) => sum + g.leads.length, 0);

  return NextResponse.json(
    { duplicateGroups: groups, totalDuplicates },
    { headers: { "Cache-Control": "no-cache" } },
  );
}

function pick(lead: InboundLeadRecord) {
  return {
    id: lead.id,
    name: lead.name,
    type: lead.type,
    status: lead.status,
    receivedAt: lead.receivedAt,
  };
}
