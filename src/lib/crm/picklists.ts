// ── CRM Picklist Registry ──
// Single source of truth for ALL CRM enum options.
// Every picklist selector in the CRM MUST reference this file.

export interface PicklistOption {
  value: string;
  label: string;
  color?: string;
  icon?: string;
  description?: string;
}

// ── Opportunity Picklists ──

export const PICKLIST_OPPORTUNITY_STAGE: PicklistOption[] = [
  { value: "Discovery", label: "Discovery", color: "#dadadb" },
  { value: "Propose", label: "Propose", color: "#F59E0B" },
  { value: "Contracting", label: "Contracting", color: "#D8DDE1" },
  { value: "Closed Won", label: "Closed Won", color: "#34D399" },
  { value: "Closed Lost", label: "Closed Lost", color: "#F87171" },
];

export const PICKLIST_OPPORTUNITY_TYPE: PicklistOption[] = [
  { value: "Half-Day Install", label: "Half-Day Install", color: "#dadadb", description: "$2,500 fixed install" },
  { value: "Full-Day Install", label: "Full-Day Install", color: "#F59E0B", description: "$5,000 fixed install" },
  { value: "Hourly Consulting", label: "Hourly Consulting", color: "#60A5FA", description: "$512/hour" },
  { value: "Event - General Admission", label: "Event - General Admission", color: "#34D399", description: "$297/seat" },
  { value: "Event - VIP", label: "Event - VIP", color: "#A78BFA", description: "$497/seat" },
  { value: "Mission Control Build", label: "Mission Control Build", color: "#D8DDE1" },
  { value: "Managed Agent Ops", label: "Managed Agent Ops", color: "#94A3B8" },
  { value: "Referral Partnership", label: "Referral Partnership", color: "#F472B6" },
  { value: "AI Consulting", label: "AI Consulting", color: "#dadadb" },
];

export const PICKLIST_OPPORTUNITY_OWNER: PicklistOption[] = [
  { value: "Alex", label: "Alex" },
  { value: "Morgan", label: "Morgan" },
  { value: "Mission Agent", label: "Mission Agent" },
];

export const PICKLIST_OPPORTUNITY_SOURCE: PicklistOption[] = [
  { value: "Website", label: "Website", color: "#dadadb" },
  { value: "Referral", label: "Referral", color: "#34D399" },
  { value: "Direct Outreach", label: "Direct Outreach", color: "#60A5FA" },
  { value: "Existing Network", label: "Existing Network", color: "#F59E0B" },
  { value: "Event", label: "Event", color: "#A78BFA" },
  { value: "Import", label: "Import", color: "#94A3B8" },
  { value: "Partner Intro", label: "Partner Intro", color: "#D8DDE1" },
  { value: "Manual", label: "Manual" },
];

export const PICKLIST_OPPORTUNITY_LOCATION: PicklistOption[] = [
  { value: "Miami", label: "Miami" },
  { value: "Los Angeles", label: "Los Angeles" },
  { value: "New York", label: "New York" },
  { value: "Remote", label: "Remote" },
  { value: "Multi-Market", label: "Multi-Market" },
  { value: "International", label: "International" },
];

export const PICKLIST_FORECAST_CONFIDENCE: PicklistOption[] = [
  { value: "High", label: "High", color: "#34D399" },
  { value: "Medium", label: "Medium", color: "#F59E0B" },
  { value: "Low", label: "Low", color: "#F87171" },
];

export const PICKLIST_VALUE_TYPE: PicklistOption[] = [
  { value: "Project", label: "Project", description: "Fixed-scope install or build revenue" },
  { value: "Hourly", label: "Hourly", description: "Consulting or follow-on advisory" },
  { value: "Retainer", label: "Retainer", description: "Managed agent operations" },
  { value: "Referral", label: "Referral", description: "Partner or referral-driven revenue" },
];

export const PICKLIST_LOSS_REASON: PicklistOption[] = [
  { value: "Too Expensive", label: "Too Expensive" },
  { value: "Timing", label: "Timing" },
  { value: "No Response", label: "No Response" },
  { value: "Not a Fit", label: "Not a Fit" },
  { value: "Competitor", label: "Competitor" },
  { value: "Internal Deprioritization", label: "Internal Deprioritization" },
  { value: "Other", label: "Other" },
];

// ── Contact Picklists ──

export const PICKLIST_CONTACT_STAGE: PicklistOption[] = [
  { value: "New", label: "New", color: "#94A3B8" },
  { value: "Active", label: "Active", color: "#34D399" },
  { value: "Warm", label: "Warm", color: "#F59E0B" },
  { value: "Strategic", label: "Strategic", color: "#A78BFA" },
  { value: "Dormant", label: "Dormant", color: "#F87171" },
];

export const PICKLIST_CONTACT_FOLLOW_UP: PicklistOption[] = [
  { value: "none", label: "None" },
  { value: "follow-up-this-week", label: "Follow Up", color: "#FBBF24" },
  { value: "waiting-on-reply", label: "Waiting", color: "#60A5FA" },
  { value: "needs-founder-response", label: "Needs Owner", color: "#dadadb" },
  { value: "needs-agent-action", label: "Agent Action", color: "#A78BFA" },
];

export const PICKLIST_CONTACT_PRIORITY: PicklistOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium", color: "#60A5FA" },
  { value: "high", label: "High", color: "#F59E0B" },
  { value: "critical", label: "Critical", color: "#E84393" },
];

export const PICKLIST_CONTACT_LOCATION: PicklistOption[] = [
  { value: "Los Angeles", label: "Los Angeles" },
  { value: "Miami", label: "Miami" },
  { value: "Fort Lauderdale", label: "Fort Lauderdale" },
  { value: "Chicago", label: "Chicago" },
  { value: "Rio de Janeiro", label: "Rio de Janeiro" },
  { value: "Other", label: "Other" },
];

// ── Account Picklists ──

export const PICKLIST_ACCOUNT_TYPE: PicklistOption[] = [
  { value: "Prospect", label: "Prospect", color: "#F59E0B" },
  { value: "Partner", label: "Partner", color: "#A78BFA" },
  { value: "Client", label: "Client", color: "#34D399" },
];

export const PICKLIST_ACCOUNT_SUB_TYPE: Record<string, PicklistOption[]> = {
  Client: [
    { value: "Founder / CEO", label: "Founder / CEO" },
    { value: "Operator", label: "Operator" },
    { value: "Professional Services", label: "Professional Services" },
    { value: "Technology", label: "Technology" },
  ],
  Partner: [
    { value: "Referral Partner", label: "Referral Partner" },
    { value: "Strategic Partner", label: "Strategic Partner" },
    { value: "Implementation Partner", label: "Implementation Partner" },
    { value: "Hospitality / Venue", label: "Hospitality / Venue" },
  ],
  Prospect: [
    { value: "Inbound Lead", label: "Inbound Lead" },
    { value: "Outbound Target", label: "Outbound Target" },
    { value: "Referral", label: "Referral" },
  ],
};

export const PICKLIST_ACCOUNT_MARKET: PicklistOption[] = [
  { value: "Los Angeles", label: "Los Angeles" },
  { value: "Miami", label: "Miami" },
  { value: "Fort Lauderdale", label: "Fort Lauderdale" },
  { value: "International", label: "International" },
  { value: "Multi-Market", label: "Multi-Market" },
];

export const PICKLIST_ACCOUNT_REVENUE_TIER: PicklistOption[] = [
  { value: "Startup", label: "Startup" },
  { value: "SMB", label: "SMB" },
  { value: "Mid-Market", label: "Mid-Market" },
  { value: "Enterprise", label: "Enterprise" },
];

export const PICKLIST_ACCOUNT_RELATIONSHIP_STAGE: PicklistOption[] = [
  { value: "Prospect", label: "Prospect", color: "#F59E0B" },
  { value: "Active", label: "Active", color: "#34D399" },
  { value: "Strategic", label: "Strategic", color: "#A78BFA" },
  { value: "Dormant", label: "Dormant", color: "#F87171" },
];

// ── Lead Picklists ──

export const PICKLIST_LEAD_STATUS: PicklistOption[] = [
  { value: "new", label: "New", color: "#60A5FA" },
  { value: "contacted", label: "Contacted", color: "#FBBF24" },
  { value: "qualified", label: "Qualified", color: "#34D399" },
  { value: "scheduled", label: "Scheduled", color: "#A78BFA" },
  { value: "confirmed", label: "Confirmed", color: "#E84393" },
  { value: "paid", label: "Paid", color: "#34D399" },
  { value: "active", label: "Active", color: "#34D399" },
  { value: "closed", label: "Closed", color: "#94A3B8" },
  { value: "lost", label: "Lost", color: "#F87171" },
];

export const PICKLIST_LEAD_TYPE: PicklistOption[] = [
  { value: "corporate", label: "Mission Control Builds", color: "#F59E0B" },
  { value: "partnership", label: "Referral Partnerships", color: "#dadadb" },
  { value: "academy-la", label: "Half-Day Installs", color: "#60A5FA" },
  { value: "academy-miami", label: "Full-Day Installs", color: "#A78BFA" },
];

export const PICKLIST_LEAD_SOURCE: PicklistOption[] = [
  { value: "referral", label: "Referral", color: "#34D399" },
  { value: "website", label: "Website", color: "#E84393" },
  { value: "dm", label: "Direct Message", color: "#60A5FA" },
  { value: "partner", label: "Partner", color: "#A78BFA" },
  { value: "event", label: "Event", color: "#F59E0B" },
  { value: "other", label: "Other" },
];

export const PICKLIST_LEAD_MARKET: PicklistOption[] = [
  { value: "la", label: "Los Angeles" },
  { value: "miami", label: "Miami" },
  { value: "other", label: "Other" },
];

// ── Registry ──

const PICKLIST_REGISTRY: Record<string, PicklistOption[]> = {
  opportunityStage: PICKLIST_OPPORTUNITY_STAGE,
  opportunityType: PICKLIST_OPPORTUNITY_TYPE,
  opportunityOwner: PICKLIST_OPPORTUNITY_OWNER,
  opportunitySource: PICKLIST_OPPORTUNITY_SOURCE,
  opportunityLocation: PICKLIST_OPPORTUNITY_LOCATION,
  forecastConfidence: PICKLIST_FORECAST_CONFIDENCE,
  valueType: PICKLIST_VALUE_TYPE,
  lossReason: PICKLIST_LOSS_REASON,
  contactStage: PICKLIST_CONTACT_STAGE,
  contactFollowUp: PICKLIST_CONTACT_FOLLOW_UP,
  contactPriority: PICKLIST_CONTACT_PRIORITY,
  contactLocation: PICKLIST_CONTACT_LOCATION,
  accountType: PICKLIST_ACCOUNT_TYPE,
  accountMarket: PICKLIST_ACCOUNT_MARKET,
  accountRevenueTier: PICKLIST_ACCOUNT_REVENUE_TIER,
  accountRelationshipStage: PICKLIST_ACCOUNT_RELATIONSHIP_STAGE,
  leadStatus: PICKLIST_LEAD_STATUS,
  leadType: PICKLIST_LEAD_TYPE,
  leadSource: PICKLIST_LEAD_SOURCE,
  leadMarket: PICKLIST_LEAD_MARKET,
};

export function getPicklistOptions(key: string): PicklistOption[] {
  return PICKLIST_REGISTRY[key] ?? [];
}

export function getPicklistColor(key: string, value: string): string | undefined {
  const options = PICKLIST_REGISTRY[key];
  if (!options) return undefined;
  return options.find((opt) => opt.value === value)?.color;
}

export function getAccountSubTypes(accountType: string): PicklistOption[] {
  return PICKLIST_ACCOUNT_SUB_TYPE[accountType] ?? [];
}

export function getPicklistLabel(key: string, value: string): string {
  const options = PICKLIST_REGISTRY[key];
  if (!options) return value;
  return options.find((opt) => opt.value === value)?.label ?? value;
}
