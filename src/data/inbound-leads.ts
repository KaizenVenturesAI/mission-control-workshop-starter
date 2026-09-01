// ── Example Client Mission Control CRM Inbound Lead Data ──

export type InboundLeadSource =
  | "Referral Partnerships"
  | "Mission Control Builds"
  | "Install Ops"
  | "Website";

export interface InboundLead {
  id: string;             // sheet row id; CRMActivity.externalRef points here
  source: InboundLeadSource;
  name: string;
  email?: string;
  company?: string;
  message?: string;
  submittedAt: string;
  rawRow?: Record<string, string>;  // original sheet payload, for debugging
}

export const INBOUND_LEADS: InboundLead[] = [];
