import type { Opportunity } from "@/data/opportunities";

export type OpportunityHealthStatus = "Healthy" | "Watch" | "At Risk" | "Critical" | "Closed";

export type OpportunityHealth = {
  score: number;
  status: OpportunityHealthStatus;
  reasons: string[];
};

const CLOSED_STAGES = new Set(["Closed Won", "Closed Lost"]);

function daysSince(dateValue?: string): number | null {
  if (!dateValue) return null;
  const parsed = new Date(`${dateValue}T12:00:00`).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

function isPastDue(dateValue?: string): boolean {
  if (!dateValue) return false;
  return dateValue < new Date().toISOString().slice(0, 10);
}

export function computeOpportunityHealth(opportunity: Opportunity): OpportunityHealth {
  if (CLOSED_STAGES.has(opportunity.stage)) {
    return { score: 100, status: "Closed", reasons: ["Closed opportunities are excluded from active health scoring."] };
  }

  let score = 100;
  const reasons: string[] = [];

  if (!opportunity.nextStep?.trim()) {
    score -= 30;
    reasons.push("Missing next step");
  }

  if (isPastDue(opportunity.nextStepDueDate)) {
    score -= 35;
    reasons.push(`Next step overdue since ${opportunity.nextStepDueDate}`);
  }

  if (!opportunity.owner || opportunity.owner === "Unassigned") {
    score -= 25;
    reasons.push("Missing accountable owner");
  }

  if (!Number.isFinite(opportunity.value) || opportunity.value <= 0) {
    score -= 20;
    reasons.push("Missing or zero pipeline value");
  }

  const age = daysSince(opportunity.openDate);
  if (opportunity.stage === "Discovery" && age !== null && age > 14) {
    score -= 15;
    reasons.push(`${opportunity.stage} for ${age} days`);
  }

  if (opportunity.forecastConfidence === "Low") {
    score -= 10;
    reasons.push("Low forecast confidence");
  }

  if (!opportunity.accountId || !opportunity.contactId) {
    score -= 20;
    reasons.push("Missing contact or account linkage");
  }

  const bounded = Math.max(0, Math.min(100, score));
  const status: OpportunityHealthStatus =
    bounded >= 80 ? "Healthy" :
    bounded >= 60 ? "Watch" :
    bounded >= 40 ? "At Risk" :
    "Critical";

  return {
    score: bounded,
    status,
    reasons: reasons.length ? reasons : ["No active health issues detected"],
  };
}

export function opportunityHealthTone(status: OpportunityHealthStatus): "green" | "amber" | "red" | "neutral" {
  if (status === "Healthy" || status === "Closed") return "green";
  if (status === "Watch") return "amber";
  if (status === "At Risk" || status === "Critical") return "red";
  return "neutral";
}
