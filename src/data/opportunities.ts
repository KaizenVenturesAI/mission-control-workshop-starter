// ── Example Client Mission Control CRM Opportunities Data ──

export type OpportunityType =
  | "AI Consulting"
  | "Half-Day Install"
  | "Full-Day Install"
  | "Hourly Consulting"
  | "Mission Control Build"
  | "Managed Agent Ops"
  | "Event - General Admission"
  | "Event - VIP"
  | "Referral Partnership"
  // prior Example Client-compatible values normalized at read/write boundaries
  | "Agentic Employee Installation"
  | "OpenClaw Install Day"
  // legacy-compatible values normalized at read/write boundaries
  | "Install Program"
  | "Corporate Events"
  | "Brand Partnerships";
export type OpportunityLocation = "Miami" | "Los Angeles" | "New York" | "Remote" | "Multi-Market" | "International" | "Fort Lauderdale" | "Chicago" | "Rio de Janeiro";
export type OpportunityStage = "Discovery" | "Propose" | "Contracting" | "Closed Won" | "Closed Lost";
export type LegacyOpportunityStage = OpportunityStage | "Qualify" | "Scope" | "Proposal";
export type ForecastConfidence = "High" | "Medium" | "Low";
export type OpportunityValueType = "Project" | "Hourly" | "Retainer" | "Referral" | "ARR" | "NRR";
export type OpportunitySource = "Website" | "Website Form" | "Referral" | "Direct Outreach" | "Email" | "Existing Network" | "In Person" | "Event" | "Import" | "Partner Intro" | "Manual";
export type OpportunityOwner = "Alex" | "Morgan" | "Mission Agent" | "Brian" | "Glenda" | "Duda" | "Mission Agent" | "Unassigned";
export type OpportunityLossReason = "Too Expensive" | "Timing" | "No Response" | "Not a Fit" | "Competitor" | "Internal Deprioritization" | "Other";
export type Provenance = "verified" | "seeded" | "manual" | "inferred" | "imported";
export type OpportunityPayoutAllocation = {
  owner: OpportunityOwner;
  percent: number;
};

export interface Opportunity {
  id: string;
  name: string;
  contactId: string;
  accountId: string;
  opportunityType: OpportunityType;
  location: OpportunityLocation;
  stage: OpportunityStage;
  openDate: string;
  closeDate?: string;
  forecastConfidence: ForecastConfidence;
  valueType: OpportunityValueType;
  value: number;
  pricingUnit?: "fixed" | "hour" | "seat";
  quantity?: number;
  unitPrice?: number;
  computedValue?: number;
  source: OpportunitySource;
  owner: OpportunityOwner;
  nextStep: string;
  nextStepDueDate: string;
  notes?: string;
  lossReason?: OpportunityLossReason;
  createdAt: string;
  updatedAt: string;
  provenance: Provenance;
  promotedFromAccountId?: string;
  referralPartnerAccountId?: string;
  referralPartnerContactId?: string;
  payoutAllocations?: OpportunityPayoutAllocation[];
  deletedAt?: string;
}

export const OPPORTUNITY_TYPES: OpportunityType[] = ["Half-Day Install", "Full-Day Install", "Hourly Consulting", "Mission Control Build", "Managed Agent Ops", "Event - General Admission", "Event - VIP", "Referral Partnership", "AI Consulting"];
export const OPPORTUNITY_LOCATIONS: OpportunityLocation[] = ["Miami", "Los Angeles", "New York", "Remote", "Multi-Market", "International"];
export const OPPORTUNITY_STAGES: OpportunityStage[] = ["Discovery", "Propose", "Contracting", "Closed Won", "Closed Lost"];
export const FORECAST_CONFIDENCE_OPTIONS: ForecastConfidence[] = ["High", "Medium", "Low"];
export const OPPORTUNITY_VALUE_TYPES: OpportunityValueType[] = ["Project", "Hourly", "Retainer", "Referral"];
export const OPPORTUNITY_SOURCE_OPTIONS: OpportunitySource[] = ["Website", "Referral", "Direct Outreach", "Existing Network", "Event", "Import", "Partner Intro", "Manual"];
export const OPPORTUNITY_OWNER_OPTIONS: OpportunityOwner[] = ["Alex", "Morgan", "Mission Agent"];
export const OPPORTUNITY_LOSS_REASON_OPTIONS: OpportunityLossReason[] = ["Too Expensive", "Timing", "No Response", "Not a Fit", "Competitor", "Internal Deprioritization", "Other"];

export function normalizeOpportunityStage(value: unknown): OpportunityStage {
  switch (value) {
    case "Discovery":
    case "Propose":
    case "Contracting":
    case "Closed Won":
    case "Closed Lost":
      return value;
    case "Qualify":
    case "Scope":
      return "Discovery";
    case "Proposal":
      return "Propose";
    default:
      return "Discovery";
  }
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-example-client-mission-control-discovery",
    name: "Example Client Mission Control Discovery",
    contactId: "contact-example-client-example-client",
    accountId: "acc-example-client-sample-customer",
    opportunityType: "Mission Control Build",
    location: "Remote",
    stage: "Discovery",
    openDate: "2026-06-22",
    forecastConfidence: "Medium",
    valueType: "Project",
    value: 0,
    source: "Manual",
    owner: "Alex",
    nextStep: "Map Example Client's operating workflows and decide the first Mission Control modules to customize.",
    nextStepDueDate: "2026-06-29",
    notes: "Fictional starter opportunity. Replace with Example Client's real pipeline once discovery is complete.",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    provenance: "seeded"
  }
];
