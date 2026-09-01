import Link from "next/link";
import { agents } from "@/data/agents";
import { agentPermissions } from "@/data/permissions";
import { InspectableValue } from "@/components/ProvenanceSystem";

function getRiskPosture(agentId: string): {
  label: string;
  color: string;
  borderColor: string;
  bgColor: string;
} {
  const agent = agentPermissions.find((a) => a.agentId === agentId);
  if (!agent)
    return {
      label: "Minimal",
      color: "rgba(52,211,153,0.9)",
      borderColor: "rgba(52,211,153,0.35)",
      bgColor: "rgba(52,211,153,0.07)",
    };

  const hasElevated = agent.permissions.some((p) => p.level === "elevated");
  const hasWrite = agent.permissions.some((p) => p.level === "write");

  if (hasElevated)
    return {
      label: "Elevated",
      color: "rgba(232,67,147,0.9)",
      borderColor: "rgba(232,67,147,0.5)",
      bgColor: "rgba(232,67,147,0.08)",
    };

  if (hasWrite)
    return {
      label: "Write",
      color: "rgba(96,165,250,0.9)",
      borderColor: "rgba(96,165,250,0.4)",
      bgColor: "rgba(96,165,250,0.07)",
    };

  return {
    label: "Minimal",
    color: "rgba(52,211,153,0.9)",
    borderColor: "rgba(52,211,153,0.3)",
    bgColor: "rgba(52,211,153,0.06)",
  };
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const W = 52;
  const H = 20;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", flexShrink: 0 }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.6}
      />
    </svg>
  );
}

export function DashboardHomeAgentHealth({
  columns,
}: {
  columns: string;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "-0.01em",
          }}
        >
          Agent Health
        </span>
        <Link
          href="/people/agentic-org-chart"
          style={{
            fontSize: 11,
            color: "rgba(96,165,250,0.85)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            textDecoration: "none",
          }}
        >
          View all →
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: columns,
          gap: 10,
        }}
      >
        {agents.map((agent) => {
          const risk = getRiskPosture(agent.id);
          const isParked = agent.status === "parked";
          const activityCount = agent.activityCount24h ?? 0;
          const sparkData = Array.from({ length: 8 }, (_, i) =>
            Math.max(
              0,
              activityCount / 8 +
                Math.sin(i * 1.8 + agent.id.charCodeAt(0) * 0.1) *
                  (activityCount * 0.35)
            )
          );

          return (
            <Link key={agent.id} href="/people/agentic-org-chart" style={{ textDecoration: "none" }}>
              <div
                className="client-agent-card"
                style={{
                  padding: "14px 16px",
                  borderRadius: 13,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderLeft: `3px solid ${risk.borderColor}`,
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 3,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: isParked
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(52,211,153,0.9)",
                        flexShrink: 0,
                        display: "inline-block",
                        animation: isParked
                          ? "none"
                          : "client-pulse 2.4s ease-in-out infinite",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "rgba(255,255,255,0.88)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {agent.name}
                    </span>
                  </div>

                  {!isParked && <Sparkline data={sparkData} color={risk.color} />}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(255,255,255,0.32)",
                    marginBottom: 9,
                    paddingLeft: 14,
                  }}
                >
                  {agent.role}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    flexWrap: "wrap",
                    marginBottom: 9,
                  }}
                >
                  <InspectableValue
                    value={isParked ? "Parked" : "Active"}
                    sourceClass="CONFIG"
                    source="Agent registry"
                    method="Agent status from agents data"
                    inline
                  >
                    <span
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isParked
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(52,211,153,0.08)",
                        color: isParked
                          ? "rgba(255,255,255,0.28)"
                          : "rgba(52,211,153,0.9)",
                      }}
                    >
                      {isParked ? "Parked" : "Active"}
                    </span>
                  </InspectableValue>

                  <span
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.38)",
                    }}
                  >
                    {agent.model.split("-").slice(0, 2).join("-")}
                  </span>

                  <span
                    style={{
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: risk.bgColor,
                      color: risk.color,
                    }}
                  >
                    {risk.label}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.38)",
                    lineHeight: 1.4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <InspectableValue
                    value={agent.lastAction}
                    sourceClass="CONFIG"
                    source="Agent registry"
                    method="Last recorded action from agents data"
                    inline
                  >
                    <span>{agent.lastAction}</span>
                  </InspectableValue>
                  <span style={{ color: "rgba(255,255,255,0.18)" }}>
                    {" "}· {agent.lastActionTime}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
