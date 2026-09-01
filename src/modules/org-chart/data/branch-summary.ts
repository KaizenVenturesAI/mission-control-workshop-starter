// ── Branch Summary Aggregation Layer ──
// Computes leadership-grade branch summaries from the org hierarchy

import type { OrgPerson } from "../types";

export interface BranchSummary {
  leaderId: string;
  leaderName: string;
  totalPeople: number;
  directReports: number;
  roleMix: Record<string, number>;
  regionMix: Record<string, number>;
  levelMix: Record<string, number>;
  usdHourlyTotal: number;
  brlMonthlyTotal: number;
  usdCount: number;
  brlCount: number;
}

function parseUsdRate(rate: string | null | undefined): number {
  if (!rate) return 0;
  if (rate.includes("R$")) return 0;
  if (rate.toLowerCase().includes("variable")) return 0;
  if (rate.includes("/day")) {
    const cleaned = rate.replace(/[^0-9.]/g, "");
    return (parseFloat(cleaned) || 0) / 8;
  }
  const cleaned = rate.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function parseBrlMonthly(comp: string | null | undefined): number {
  if (!comp) return 0;
  if (!comp.includes("R$")) return 0;
  if (comp.toLowerCase().includes("variable")) return 0;
  const cleaned = comp.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

function getSubtreeIds(personId: string, byId: Map<string, OrgPerson>): string[] {
  const person = byId.get(personId);
  if (!person) return [];
  const ids = [personId];
  person.directReportIds.forEach((cid) => {
    ids.push(...getSubtreeIds(cid, byId));
  });
  return ids;
}

function classifyRole(person: OrgPerson): string {
  const role = person.role.toLowerCase();
  const dept = person.department.toLowerCase();
  if (role.includes("coach") || role.includes("fitness")) return "Coaching";
  if (role.includes("receptionist") || dept.includes("reception")) return "Reception";
  if (role.includes("facilit")) return "Facilities";
  if (dept.includes("marketing") || role.includes("editor") || role.includes("athlete")) return "Marketing";
  if (role.includes("massage") || role.includes("therapist")) return "Wellness";
  if (role.includes("founder") || dept.includes("leadership")) return "Leadership";
  if (dept.includes("support")) return "Support";
  return "Other";
}

export function computeBranchSummary(leaderId: string, byId: Map<string, OrgPerson>): BranchSummary {
  const leader = byId.get(leaderId);
  if (!leader) {
    return {
      leaderId,
      leaderName: "Unknown",
      totalPeople: 0,
      directReports: 0,
      roleMix: {},
      regionMix: {},
      levelMix: {},
      usdHourlyTotal: 0,
      brlMonthlyTotal: 0,
      usdCount: 0,
      brlCount: 0,
    };
  }

  const ids = getSubtreeIds(leaderId, byId);
  const roleMix: Record<string, number> = {};
  const regionMix: Record<string, number> = {};
  const levelMix: Record<string, number> = {};
  let usdHourlyTotal = 0;
  let brlMonthlyTotal = 0;
  let usdCount = 0;
  let brlCount = 0;

  ids.forEach((id) => {
    const p = byId.get(id);
    if (!p) return;

    const roleFamily = classifyRole(p);
    roleMix[roleFamily] = (roleMix[roleFamily] || 0) + 1;
    regionMix[p.locationLabel] = (regionMix[p.locationLabel] || 0) + 1;

    const levelBand = p.level.startsWith("L") ? "Leaders" : "ICs";
    levelMix[levelBand] = (levelMix[levelBand] || 0) + 1;

    const usd = parseUsdRate(p.hourlyRate);
    if (usd > 0) { usdHourlyTotal += usd; usdCount += 1; }
    const brl = parseBrlMonthly(p.monthlyComp);
    if (brl > 0) { brlMonthlyTotal += brl; brlCount += 1; }
  });

  return {
    leaderId,
    leaderName: leader.name,
    totalPeople: ids.length,
    directReports: leader.directReports,
    roleMix,
    regionMix,
    levelMix,
    usdHourlyTotal,
    brlMonthlyTotal,
    usdCount,
    brlCount,
  };
}
