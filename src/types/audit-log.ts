export type AuditEntityType =
  | "lead"
  | "account"
  | "contact"
  | "activity"
  | "opportunity"
  | "action-item"
  | "meeting"
  | "meeting-sync";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "merge"
  | "patch";

export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: AuditFieldChange[];
  context?: {
    route?: string;
    method?: string;
    requestId?: string;
    relatedEntityId?: string;
    summary?: string;
  };
}

export const AUDIT_ACTORS = ["Alex", "Brian", "Glenda", "Mission Agent", "system", "sub-agent"] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];

export function isAuditActor(value: unknown): value is AuditActor {
  return typeof value === "string" && (AUDIT_ACTORS as readonly string[]).includes(value);
}
