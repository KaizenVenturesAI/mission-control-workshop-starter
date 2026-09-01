import { OPPORTUNITY_STAGES, type Opportunity, type OpportunityStage } from "@/data/opportunities";

const CLOSED_STAGES = new Set<OpportunityStage>(["Closed Won", "Closed Lost"]);

const stageColors: Record<OpportunityStage, string> = {
  Discovery: "rgba(218,218,219,0.88)",
  Propose: "rgba(148,163,184,0.85)",
  Contracting: "rgba(251,191,36,0.86)",
  "Closed Won": "rgba(34,197,94,0.82)",
  "Closed Lost": "rgba(239,68,68,0.42)",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricCard({
  value,
  label,
  helper,
  tone = "default",
}: {
  value: string;
  label: string;
  helper: string;
  tone?: "default" | "red" | "muted";
}) {
  const color = tone === "red" ? "#dadadb" : tone === "muted" ? "#C4C9D1" : "rgba(247,248,248,0.94)";
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        minHeight: 96,
      }}
    >
      <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 800, color }}>{value}</div>
      <div style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: "var(--color-client-text)" }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 11, color: "var(--color-client-text-dim)" }}>{helper}</div>
    </div>
  );
}

export function DashboardHomeOpportunityIntelligence({
  opportunities,
}: {
  opportunities: Opportunity[] | null;
}) {
  const activeOpportunities = (opportunities ?? []).filter((opportunity) => !opportunity.deletedAt);
  const open = activeOpportunities.filter((opportunity) => !CLOSED_STAGES.has(opportunity.stage));
  const closedWon = activeOpportunities.filter((opportunity) => opportunity.stage === "Closed Won");
  const closedLost = activeOpportunities.filter((opportunity) => opportunity.stage === "Closed Lost");
  const totalPipeline = open.reduce((sum, opportunity) => sum + (Number(opportunity.value) || 0), 0);
  const avgDeal = open.length > 0 ? totalPipeline / open.length : 0;
  const totalClosed = closedWon.length + closedLost.length;
  const winRate = totalClosed > 0 ? Math.round((closedWon.length / totalClosed) * 100) : 0;
  const avgDaysToClose = closedWon.length > 0
    ? Math.round(closedWon.reduce((sum, opportunity) => {
        const openedAt = new Date(opportunity.openDate).getTime();
        const closedAt = opportunity.closeDate ? new Date(opportunity.closeDate).getTime() : Date.now();
        return Number.isFinite(openedAt) && Number.isFinite(closedAt)
          ? sum + (closedAt - openedAt) / (1000 * 60 * 60 * 24)
          : sum;
      }, 0) / closedWon.length)
    : 0;
  const totalStageCount = activeOpportunities.length || 1;
  const stageBreakdown = OPPORTUNITY_STAGES.map((stage) => {
    const items = activeOpportunities.filter((opportunity) => opportunity.stage === stage);
    return {
      stage,
      count: items.length,
      value: items.reduce((sum, opportunity) => sum + (Number(opportunity.value) || 0), 0),
      pct: (items.length / totalStageCount) * 100,
      color: stageColors[stage],
    };
  });

  return (
    <section
      style={{
        marginBottom: 24,
        padding: "20px 22px 22px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>
            Opportunity Intelligence
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", marginLeft: 10 }}>
            Pipeline object report
          </span>
        </div>
        <a
          href="/contacts?object=opportunities"
          style={{
            color: "#60A5FA",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          View all →
        </a>
      </div>

      {opportunities === null ? (
        <div
          style={{
            minHeight: 190,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.18)",
            fontSize: 12,
            animation: "client-shimmer 1.6s ease-in-out infinite",
          }}
        >
          Loading opportunity intelligence…
        </div>
      ) : (
        <>
          <div className="crm-fluid-grid-compact" style={{ marginBottom: 18 }}>
            <MetricCard value={formatCurrency(totalPipeline)} label="Total Pipeline" helper="Sum of all open deals" tone="muted" />
            <MetricCard value={String(open.length)} label="Open Deals" helper="Active opportunities" tone="red" />
            <MetricCard value={formatCurrency(avgDeal)} label="Avg Deal Size" helper="Per open opportunity" />
            <MetricCard value={`${winRate}%`} label="Win Rate" helper="Closed Won vs total closed" tone="red" />
            <MetricCard value={`${avgDaysToClose}d`} label="Avg Time to Close" helper="Days for closed-won deals" tone="red" />
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-client-text)", marginBottom: 14 }}>
            Pipeline by Stage
          </div>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", height: 32, marginBottom: 14, background: "rgba(255,255,255,0.04)" }}>
            {stageBreakdown.filter((stage) => stage.count > 0).map((stage) => (
              <div
                key={stage.stage}
                style={{
                  width: `${stage.pct}%`,
                  minWidth: stage.pct > 0 ? 2 : 0,
                  background: stage.color,
                  transition: "width 0.3s ease",
                }}
                title={`${stage.stage}: ${stage.count} deals`}
              />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {stageBreakdown.map((stage) => (
              <div key={stage.stage} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12, minWidth: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: stage.color, flex: "0 0 auto" }} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: "var(--color-client-text)", fontWeight: 700 }}>{stage.stage}</span>
                  <span style={{ color: "var(--color-client-text-dim)", marginLeft: 6 }}>
                    {stage.count} · {formatCurrency(stage.value)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
