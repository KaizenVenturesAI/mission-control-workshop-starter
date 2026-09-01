"use client";

import { useMemo, useState, useEffect } from "react";
import { agents } from "@/data/agents";
import Link from "next/link";
import { DashboardHomeActivityStrip } from "@/components/dashboardHomeActivityStrip";
import { DashboardHomeAgentHealth } from "@/components/dashboardHomeAgentHealth";
import { DashboardHomeHeader } from "@/components/dashboardHomeHeader";
import { DashboardHomeKpiStrip } from "@/components/dashboardHomeKpiStrip";
import { DashboardHomeOpportunityIntelligence } from "@/components/dashboardHomeOpportunityIntelligence";
import { DashboardHomeStyles } from "@/components/dashboardHomeStyles";
import { AsteriskNote } from "@/components/ProvenanceSystem";
import {
  formatDate,
  getGreeting,
} from "@/components/dashboardHomeShared";
import { computeOpportunityHealth } from "@/lib/crm/opportunityHealth";
import type { Opportunity } from "@/data/opportunities";
import { useResponsive } from "@/lib/useMediaQuery";

type DashboardOpportunity = Opportunity;

export type PipelineSummary = {
  openCount: number;
  openValue: number;
  overdueFollowUps: number;
  needsAlex: number;
  atRiskCount: number;
};

/* ──────────────────────────────────────────────────────────
   Main Component
────────────────────────────────────────────────────────── */
export function DashboardHome() {
  const { isMobile, isTablet } = useResponsive();

  /* Static computed stats */
  const stats = useMemo(() => {
    const active = agents.filter((a) => a.status !== "parked").length;
    return { total: agents.length, active };
  }, []);

  /* Action items count */
  const [actionItemCount, setActionItemCount] = useState<number | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummary | null>(null);
  const [opportunities, setOpportunities] = useState<DashboardOpportunity[] | null>(null);

  /* Stable greeting + date (computed once) */
  const [greeting] = useState(getGreeting);
  const [dateStr] = useState(formatDate);

  useEffect(() => {
    /* — Action items — */
    fetch("/api/action-items")
      .then((r) => r.json())
      .then((items: Array<{ status: string }>) => {
        setActionItemCount(items.filter((i) => i.status !== "complete").length);
      })
      .catch(() => setActionItemCount(null));

    fetch("/api/crm/opportunities")
      .then((r) => r.json())
      .then((items: DashboardOpportunity[]) => {
        setOpportunities(items);
        const today = new Date().toISOString().slice(0, 10);
        const open = items.filter((item) => !item.deletedAt && !["Closed Won", "Closed Lost"].includes(item.stage));
        setPipelineSummary({
          openCount: open.length,
          openValue: open.reduce((sum, item) => sum + (Number(item.value) || 0), 0),
          overdueFollowUps: open.filter((item) => item.nextStepDueDate && item.nextStepDueDate < today).length,
          needsAlex: open.filter((item) => item.owner === "Alex").length,
          atRiskCount: open.filter((item) => ["At Risk", "Critical"].includes(computeOpportunityHealth(item).status)).length,
        });
      })
      .catch(() => {
        setOpportunities([]);
        setPipelineSummary(null);
      });
  }, []);

  /* ── Column count for grids ── */
  const col3 = isMobile
    ? "1fr"
    : isTablet
      ? "1fr 1fr"
      : "repeat(auto-fit, minmax(340px, 1fr))";
  const col4 = isMobile
    ? "1fr 1fr"
    : isTablet
      ? "repeat(2, minmax(0, 1fr))"
      : "repeat(4, minmax(220px, 1fr))";

  return (
    <>
      <DashboardHomeStyles />

      <div className="fade-in-up" style={{ width: "100%", maxWidth: "none" }}>

        <DashboardHomeHeader
          isMobile={isMobile}
          greeting={greeting}
          dateStr={dateStr}
        />

        <DashboardHomeKpiStrip
          col4={col4}
          stats={stats}
          actionItemCount={actionItemCount}
          pipelineSummary={pipelineSummary}
        />

        <DashboardHomeOpportunityIntelligence opportunities={opportunities} />

        {/* ════════════════════════════════════════
            AGENT HEALTH GRID
        ════════════════════════════════════════ */}
        <DashboardHomeAgentHealth columns={col3} />

        {/* ════════════════════════════════════════
            BOTTOM STRIP: Activity + Quick Actions
        ════════════════════════════════════════ */}
        <DashboardHomeActivityStrip
          isMobile={isMobile}
          isTablet={isTablet}
        />

        <AsteriskNote />
      </div>
    </>
  );
}
