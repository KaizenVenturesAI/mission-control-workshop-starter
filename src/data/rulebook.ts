/* ─── Agent Rulebook Data ─── */

export interface ApprovalStep {
  actor: string;
  action: string;
}

export interface GovernanceRelationship {
  reportsTo: string;
  routesThrough: string;
  escalatesTo: string;
  requiresApprovalFrom: string;
  touchesSystems: string[];
  accessPosture: "Read-Heavy" | "Write-Capable" | "Elevated" | "Minimal";
}

export interface AgentRule {
  id: string;
  name: string;
  role: string;
  status: "active" | "parked";
  owner: string;
  approvalChain: ApprovalStep[];
  escalationPath: string[];
  operatingRules: string[];
  canDo: string[];
  cannotDo: string[];
  needsApprovalFor: string[];
  verificationSource: "verified" | "manual";
  approvalRequired: "yes" | "no" | "conditional";
  highestRiskBoundary: string;
  governance: GovernanceRelationship;
}

export const agentRules: AgentRule[] = [];

/* ─── Derived stats ─── */
export function getRulebookStats() {
  const active = agentRules.filter((a) => a.status === "active");
  return {
    totalAgents: agentRules.length,
    approvalChainsActive: active.filter((a) => a.approvalChain.length > 0).length,
    escalationPathsDefined: active.filter((a) => a.escalationPath.length > 0).length,
  };
}
