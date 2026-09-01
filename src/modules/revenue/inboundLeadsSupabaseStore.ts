import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { InboundLeadEvent, InboundLeadFilters, InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

function normalizeEmail(email?: string): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function leadToRow(lead: InboundLeadRecord) {
  return {
    id: lead.id,
    type: lead.type,
    source: lead.source,
    status: lead.status,
    name: lead.name,
    company_name: lead.companyName ?? null,
    contact_name: lead.contactName ?? null,
    email: lead.email ?? null,
    normalized_email: normalizeEmail(lead.email),
    phone: lead.phone ?? null,
    received_at: lead.receivedAt,
    last_updated: lead.lastUpdated,
    crm_account_id: lead.crmAccountId ?? lead.convertedToAccountId ?? null,
    crm_contact_id: lead.crmContactId ?? lead.convertedToContactId ?? null,
    raw: lead,
    updated_at: new Date().toISOString(),
  };
}

function rowToLead(row: Record<string, unknown>): InboundLeadRecord {
  return row.raw as InboundLeadRecord;
}

function sortLeads(leads: InboundLeadRecord[]): InboundLeadRecord[] {
  return [...leads].sort((a, b) => (b.receivedAt || b.lastUpdated || "").localeCompare(a.receivedAt || a.lastUpdated || ""));
}

export async function listSupabaseInboundLeads(filters: InboundLeadFilters = {}): Promise<InboundLeadRecord[]> {
  const supabase = createServiceSupabaseClient();
  let query = supabase.schema("crm").from("inbound_leads").select("raw,received_at").is("raw->>deletedAt", null).order("received_at", { ascending: false });
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("received_at", filters.from);
  if (filters.to) query = query.lte("received_at", filters.to);
  if (filters.limit && filters.limit > 0) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error) throw error;
  return sortLeads(((data ?? []) as Record<string, unknown>[]).map(rowToLead));
}

export async function getSupabaseInboundLead(id: string): Promise<InboundLeadRecord | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.schema("crm").from("inbound_leads").select("raw").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToLead(data as Record<string, unknown>) : null;
}

export async function findSupabaseInboundLeadByWebsiteKey(key: string): Promise<InboundLeadRecord | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("inbound_leads")
    .select("raw")
    .eq("raw->metadata->>websiteLeadIdempotencyKey", key)
    .is("raw->>deletedAt", null)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToLead(data as Record<string, unknown>) : null;
}

export async function upsertSupabaseInboundLead(lead: InboundLeadRecord): Promise<InboundLeadRecord> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("inbound_leads")
    .upsert(leadToRow(lead), { onConflict: "id" })
    .select("raw")
    .single();
  if (error) throw error;
  return rowToLead(data as Record<string, unknown>);
}

export async function updateSupabaseInboundLead(id: string, updates: Partial<InboundLeadRecord>): Promise<InboundLeadRecord | null> {
  const current = await getSupabaseInboundLead(id);
  if (!current) return null;
  const next: InboundLeadRecord = {
    ...current,
    ...updates,
    id: current.id,
    type: current.type,
    lastUpdated: new Date().toISOString(),
  };
  return upsertSupabaseInboundLead(next);
}

export async function deleteSupabaseInboundLead(id: string): Promise<boolean> {
  const updated = await updateSupabaseInboundLead(id, { deletedAt: new Date().toISOString() });
  return !!updated;
}

export async function appendSupabaseLeadEvent(event: Omit<InboundLeadEvent, "id"> & { id?: string }): Promise<InboundLeadEvent> {
  const newEvent: InboundLeadEvent = {
    ...event,
    id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("lead_events")
    .insert({
      id: newEvent.id,
      lead_id: newEvent.leadId,
      type: newEvent.type,
      actor: newEvent.actor,
      event_at: newEvent.timestamp,
      raw: newEvent,
    })
    .select("raw")
    .single();
  if (error) throw error;
  return data.raw as InboundLeadEvent;
}

export async function getSupabaseEventsForLead(leadId: string): Promise<InboundLeadEvent[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("lead_events")
    .select("raw,event_at")
    .eq("lead_id", leadId)
    .order("event_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => row.raw as InboundLeadEvent);
}
