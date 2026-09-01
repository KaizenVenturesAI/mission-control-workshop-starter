import Link from "next/link";
import { activityFeed } from "@/data/activity";
import { InspectableValue } from "@/components/ProvenanceSystem";
import { AGENT_EMOJI } from "@/components/dashboardHomeShared";

function getSignificanceTag(
  action: string
): { label: string; color: string; bg: string } | null {
  const lower = action.toLowerCase();

  if (
    lower.includes("lead") ||
    lower.includes("quote") ||
    lower.includes("sponsor") ||
    lower.includes("partnership") ||
    lower.includes("event") ||
    lower.includes("inquiry")
  ) {
    return {
      label: "revenue",
      color: "rgba(232,67,147,0.9)",
      bg: "rgba(232,67,147,0.10)",
    };
  }

  if (
    lower.includes("operations") ||
    lower.includes("schedule") ||
    lower.includes("calendar") ||
    lower.includes("brief") ||
    lower.includes("build") ||
    lower.includes("commit") ||
    lower.includes("resolved") ||
    lower.includes("drafted")
  ) {
    return {
      label: "ops",
      color: "rgba(96,165,250,0.9)",
      bg: "rgba(96,165,250,0.10)",
    };
  }

  if (
    lower.includes("escalat") ||
    lower.includes("health check") ||
    lower.includes("error")
  ) {
    return {
      label: "risk",
      color: "rgba(251,191,36,0.9)",
      bg: "rgba(251,191,36,0.10)",
    };
  }

  return null;
}

function timelineDotColor(type: string): string {
  if (type === "tool") return "rgba(96,165,250,0.9)";
  if (type === "user") return "rgba(52,211,153,0.9)";
  return "rgba(167,139,250,0.9)";
}

const QUICK_ACTIONS = [
  {
    label: "Review Permissions",
    subtitle: "Credential lifecycle & access",
    href: "/permissions",
    icon: "🛡️",
    accent: "rgba(232,67,147,0.08)",
    accentBorder: "rgba(232,67,147,0.18)",
  },
  {
    label: "Check Usage",
    subtitle: "Cost & token consumption",
    href: "/usage",
    icon: "📊",
    accent: "rgba(52,211,153,0.07)",
    accentBorder: "rgba(52,211,153,0.16)",
  },
  {
    label: "Open CRM",
    subtitle: "People & organizations",
    href: "/contacts",
    icon: "👥",
    accent: "rgba(96,165,250,0.07)",
    accentBorder: "rgba(96,165,250,0.16)",
  },
  {
    label: "Rulebook",
    subtitle: "Operating directives",
    href: "/rulebook",
    icon: "📖",
    accent: "rgba(167,139,250,0.07)",
    accentBorder: "rgba(167,139,250,0.16)",
  },
  {
    label: "Org Chart",
    subtitle: "Agent workforce map",
    href: "/people/agentic-org-chart",
    icon: "🗺️",
    accent: "rgba(251,191,36,0.07)",
    accentBorder: "rgba(251,191,36,0.16)",
  },
  {
    label: "Strategy Runs",
    subtitle: "Board-level analysis",
    href: "/strategy",
    icon: "♟️",
    accent: "rgba(96,165,250,0.06)",
    accentBorder: "rgba(96,165,250,0.13)",
  },
];

export function DashboardHomeActivityStrip({
  isMobile,
  isTablet,
}: {
  isMobile: boolean;
  isTablet: boolean;
}) {
  const recentActivity = activityFeed.slice(0, 6);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile || isTablet ? "1fr" : "minmax(0, 1fr) minmax(340px, 420px)",
        gap: 12,
        marginBottom: 28,
        alignItems: "start",
      }}
    >
      <div
        style={{
          padding: "18px 20px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                letterSpacing: "-0.01em",
              }}
            >
              Recent Activity
            </span>
            <span
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.28)",
                textTransform: "uppercase",
                letterSpacing: "0.09em",
              }}
            >
              High-signal
            </span>
          </div>
          <Link
            href="/activity"
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

        <div style={{ position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 9,
              top: 6,
              bottom: 6,
              width: 1,
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
              zIndex: 0,
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
              position: "relative",
              zIndex: 1,
            }}
          >
            {recentActivity.map((entry, idx) => {
              const tag = getSignificanceTag(entry.action);
              const dotColor = timelineDotColor(entry.type);
              const emoji = AGENT_EMOJI[entry.agent] ?? "🤖";
              const isLast = idx === recentActivity.length - 1;

              return (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    gap: 13,
                    paddingBottom: isLast ? 0 : 16,
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 19,
                      display: "flex",
                      justifyContent: "center",
                      paddingTop: 3,
                    }}
                  >
                    <div
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: dotColor,
                        border: "2px solid rgba(12,12,20,0.9)",
                        boxShadow: `0 0 7px ${dotColor}`,
                        flexShrink: 0,
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 3,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.58)",
                          letterSpacing: "0.01em",
                        }}
                      >
                        {entry.agent}
                      </span>
                      {tag && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: tag.bg,
                            color: tag.color,
                          }}
                        >
                          {tag.label}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.66)",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        marginBottom: 2,
                      }}
                    >
                      <InspectableValue
                        value={entry.action}
                        sourceClass="CONFIG"
                        source="Activity feed"
                        method="Activity log entry"
                        inline
                      >
                        <span>{entry.action}</span>
                      </InspectableValue>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.22)",
                      }}
                    >
                      {entry.relativeTime}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "18px 20px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(8px)",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "-0.01em",
            display: "block",
            marginBottom: 14,
          }}
        >
          Quick Actions
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {QUICK_ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} style={{ textDecoration: "none" }}>
              <div
                className="client-qa-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 13px",
                  borderRadius: 10,
                  background: action.accent,
                  border: `1px solid ${action.accentBorder}`,
                  cursor: "pointer",
                  backdropFilter: "blur(6px)",
                }}
              >
                <span style={{ fontSize: 17, flexShrink: 0, lineHeight: 1 }}>
                  {action.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.84)",
                      marginBottom: 1,
                    }}
                  >
                    {action.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "rgba(255,255,255,0.36)",
                      lineHeight: 1.3,
                    }}
                  >
                    {action.subtitle}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.22)",
                    flexShrink: 0,
                  }}
                >
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
