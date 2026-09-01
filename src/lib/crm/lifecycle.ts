// ── CRM Lifecycle Management ──
// Unified status mapping and transition validation across Leads, Contacts, and Opportunities.

import type { ContactStage } from "@/data/contacts";
import type { OpportunityStage } from "@/data/opportunities";
import type { InboundLeadStatus } from "@/modules/revenue/inboundLeadsTypes";

// ── Status Mapping Constants ──

export const LEAD_TO_CONTACT_STAGE: Record<InboundLeadStatus, ContactStage> = {
  new: "New",
  contacted: "New",
  qualified: "Active",
  scheduled: "Active",
  confirmed: "Active",
  paid: "Active",
  active: "Active",
  closed: "Dormant",
  lost: "Dormant",
};

export const LEAD_TO_OPPORTUNITY_STAGE: Record<InboundLeadStatus, OpportunityStage | null> = {
  new: null,
  contacted: null,
  qualified: "Discovery",
  scheduled: "Discovery",
  confirmed: "Contracting",
  paid: "Closed Won",
  active: "Closed Won",
  closed: "Closed Won",
  lost: "Closed Lost",
};

// ── Transition Orders ──

const LEAD_STATUS_ORDER: InboundLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "scheduled",
  "confirmed",
  "paid",
  "active",
  "closed",
];

const TERMINAL_LEAD_STATUSES = new Set<InboundLeadStatus>(["closed", "lost"]);

const OPPORTUNITY_STAGE_ORDER: OpportunityStage[] = [
  "Discovery",
  "Propose",
  "Contracting",
  "Closed Won",
];

const TERMINAL_OPPORTUNITY_STAGES = new Set<OpportunityStage>(["Closed Won", "Closed Lost"]);

// ── Lead Transitions ──

export function isValidLeadTransition(from: InboundLeadStatus, to: InboundLeadStatus): boolean {
  if (from === to) return false;
  if (TERMINAL_LEAD_STATUSES.has(from)) return false;

  // Any open status can go to 'lost'
  if (to === "lost") return true;

  const fromIndex = LEAD_STATUS_ORDER.indexOf(from);
  const toIndex = LEAD_STATUS_ORDER.indexOf(to);

  if (fromIndex === -1 || toIndex === -1) return false;

  // Forward only
  return toIndex > fromIndex;
}

export function getValidLeadTransitions(current: InboundLeadStatus): InboundLeadStatus[] {
  if (TERMINAL_LEAD_STATUSES.has(current)) return [];

  const currentIndex = LEAD_STATUS_ORDER.indexOf(current);
  if (currentIndex === -1) return [];

  const forward = LEAD_STATUS_ORDER.slice(currentIndex + 1);
  return [...forward, "lost"];
}

// ── Opportunity Transitions ──

export function isValidOpportunityTransition(from: OpportunityStage, to: OpportunityStage): boolean {
  if (from === to) return false;
  if (TERMINAL_OPPORTUNITY_STAGES.has(from)) return false;

  // Any open stage can go to Closed Lost
  if (to === "Closed Lost") return true;

  const fromIndex = OPPORTUNITY_STAGE_ORDER.indexOf(from);
  const toIndex = OPPORTUNITY_STAGE_ORDER.indexOf(to);

  if (fromIndex === -1 || toIndex === -1) return false;

  return toIndex > fromIndex;
}

export function getValidOpportunityTransitions(current: OpportunityStage): OpportunityStage[] {
  if (TERMINAL_OPPORTUNITY_STAGES.has(current)) return [];

  const currentIndex = OPPORTUNITY_STAGE_ORDER.indexOf(current);
  if (currentIndex === -1) return [];

  const forward = OPPORTUNITY_STAGE_ORDER.slice(currentIndex + 1);
  if (!forward.includes("Closed Lost")) {
    forward.push("Closed Lost");
  }
  return forward;
}

// ── Linked Updates ──

export function computeLinkedUpdates(leadStatus: InboundLeadStatus): {
  contactStage: ContactStage;
  opportunityStage: OpportunityStage | null;
} {
  return {
    contactStage: LEAD_TO_CONTACT_STAGE[leadStatus],
    opportunityStage: LEAD_TO_OPPORTUNITY_STAGE[leadStatus],
  };
}

// ── Bidirectional Cascading: Opportunity → Contact ──

export const OPPORTUNITY_TO_CONTACT_STAGE: Partial<Record<OpportunityStage, ContactStage>> = {
  'Closed Won': 'Strategic',
  'Closed Lost': 'Dormant',
};

export const CONTACT_STAGE_FLAGS: Partial<Record<ContactStage, string>> = {
  'Dormant': 'Contact marked dormant — review open opportunities',
};

export function computeOpportunityLinkedUpdates(opportunityStage: OpportunityStage): {
  contactStage: ContactStage | null;
} {
  return {
    contactStage: OPPORTUNITY_TO_CONTACT_STAGE[opportunityStage] ?? null,
  };
}
