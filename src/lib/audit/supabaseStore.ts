import type { AuditLogEntry } from "@/types/audit-log";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export async function appendSupabaseAuditEntry(entry: AuditLogEntry): Promise<void> {
  const supabase = createServiceSupabaseClient();
  const context = entry.context ?? {};
  const rawContext = context as Record<string, unknown>;
  await supabase.schema("crm").from("audit_logs").insert({
    id: entry.id,
    actor: entry.actor,
    actor_email: typeof rawContext.actorEmail === "string" ? rawContext.actorEmail : null,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    route: typeof context.route === "string" ? context.route : null,
    method: typeof context.method === "string" ? context.method : null,
    occurred_at: entry.timestamp,
    changes: entry.changes,
    raw: entry,
  });
}

export async function readSupabaseAuditEntries(limit: number): Promise<AuditLogEntry[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("audit_logs")
    .select("raw,occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { raw: AuditLogEntry }[]).map((row) => row.raw);
}
