import { InspectableValue } from "@/components/ProvenanceSystem";
import { KpiCard } from "@/components/dashboardHomeShared";
import type { PipelineSummary } from "@/components/DashboardHome";

const METALLIC_SILVER = "rgba(196,201,209,0.84)";
const METALLIC_SILVER_VALUE = "rgba(238,240,244,0.95)";

export function DashboardHomeKpiStrip({
  col4,
  stats,
  actionItemCount,
  pipelineSummary,
}: {
  col4: string;
  stats: { total: number; active: number };
  actionItemCount: number | null;
  pipelineSummary: PipelineSummary | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: col4,
        gap: 12,
        marginBottom: 24,
      }}
    >
      <KpiCard accentColor={METALLIC_SILVER} label="Open Pipeline">
        <div style={{ fontSize: 34, fontWeight: 700, color: METALLIC_SILVER_VALUE, letterSpacing: 0, lineHeight: 1, textShadow: "0 0 18px rgba(196,201,209,0.16)" }}>
          <InspectableValue
            value={pipelineSummary ? `$${pipelineSummary.openValue.toLocaleString()}` : "loading"}
            sourceClass="LOCAL"
            source="Local CRM"
            method="Sum of open opportunity values"
          >
            <span>{pipelineSummary ? `$${pipelineSummary.openValue.toLocaleString()}` : "..."}</span>
          </InspectableValue>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 7 }}>
          {pipelineSummary ? `${pipelineSummary.openCount} active opportunities` : "Loading CRM"}
        </div>
      </KpiCard>

      <KpiCard accentColor={METALLIC_SILVER} label="Founder Follow-Ups">
        <div style={{ fontSize: 34, fontWeight: 700, color: METALLIC_SILVER_VALUE, letterSpacing: 0, lineHeight: 1, textShadow: "0 0 18px rgba(196,201,209,0.16)" }}>
          {pipelineSummary === null ? (
            <span
              style={{
                color: "rgba(255,255,255,0.18)",
                animation: "client-shimmer 1.6s ease-in-out infinite",
                display: "inline-block",
              }}
            >
              ···
            </span>
          ) : (
            <InspectableValue
              value={String(pipelineSummary.needsAlex)}
              sourceClass="LOCAL"
              source="Local CRM"
              method="Open opportunities owned by Alex"
            >
              <span>{pipelineSummary.needsAlex}</span>
            </InspectableValue>
          )}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 7 }}>
          {pipelineSummary ? `${pipelineSummary.overdueFollowUps} overdue next steps` : "Checking follow-ups"}
        </div>
      </KpiCard>

      <KpiCard accentColor={METALLIC_SILVER} label="At-Risk Deals">
        <div style={{ fontSize: 34, fontWeight: 700, color: METALLIC_SILVER_VALUE, letterSpacing: 0, lineHeight: 1, textShadow: "0 0 18px rgba(196,201,209,0.16)" }}>
          {pipelineSummary === null ? (
            <span
              style={{
                color: "rgba(255,255,255,0.18)",
                animation: "client-shimmer 1.6s ease-in-out infinite",
                display: "inline-block",
              }}
            >
              ···
            </span>
          ) : (
            <InspectableValue
              value={String(pipelineSummary.atRiskCount)}
              sourceClass="LOCAL"
              source="Local CRM"
              method="Count of open opportunities with At Risk or Critical health"
            >
              <span>{pipelineSummary.atRiskCount}</span>
            </InspectableValue>
          )}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 7 }}>
          {actionItemCount === null ? "action queue loading" : `${actionItemCount} open action items`}
        </div>
      </KpiCard>

      <KpiCard accentColor={METALLIC_SILVER} label="Agents Active">
        <div style={{ fontSize: 34, fontWeight: 700, color: METALLIC_SILVER_VALUE, letterSpacing: 0, lineHeight: 1, textShadow: "0 0 18px rgba(196,201,209,0.16)" }}>
          <InspectableValue
            value={String(stats.active)}
            sourceClass="LOCAL"
            source="Agent registry"
            method="Count of non-parked agents"
          >
            <span>{stats.active}</span>
          </InspectableValue>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 7 }}>
          of {stats.total} total · parked lanes visible
        </div>
      </KpiCard>
    </div>
  );
}
