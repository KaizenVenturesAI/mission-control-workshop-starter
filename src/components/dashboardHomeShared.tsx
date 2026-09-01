import type React from "react";

export type SpendFreshness = "loading" | "fresh" | "stale" | "failed";

export interface LiveSpendData {
  spendToday: number;
  dailyData: Array<{ date: string; cost: number }>;
  activeAgents: number;
  dailyTarget: number;
}

export const AGENT_EMOJI: Record<string, string> = {
  "Example Client Mission Agent": "◈",
  "CRM Hygiene Agent": "▦",
  "Strategy Review Agent": "▥",
  "Sales Follow-Up Agent": "▤",
  "Delivery / Install Agent": "▧",
  "Revenue Ops Agent": "$",
  "Operations Agent": "⚙️",
  "Partnerships Agent": "🤝",
  "Marketing Agent": "📣",
  "Executive Assistant Agent": "📋",
  "Engineering Agent": "🛠️",
  "Alex": "👤",
  "Example Client Operator": "👤",
};

export function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function FreshnessBadge({
  freshness,
}: {
  freshness: SpendFreshness;
}) {
  const map: Record<
    SpendFreshness,
    { label: string; bg: string; color: string; border: string }
  > = {
    loading: {
      label: "Loading",
      bg: "rgba(167,139,250,0.10)",
      color: "rgba(167,139,250,0.7)",
      border: "rgba(167,139,250,0.15)",
    },
    fresh: {
      label: "Live",
      bg: "rgba(52,211,153,0.10)",
      color: "rgba(52,211,153,0.7)",
      border: "rgba(52,211,153,0.15)",
    },
    stale: {
      label: "Stale",
      bg: "rgba(251,191,36,0.10)",
      color: "rgba(251,191,36,0.55)",
      border: "rgba(251,191,36,0.15)",
    },
    failed: {
      label: "Failed",
      bg: "rgba(248,113,113,0.10)",
      color: "rgba(248,113,113,0.7)",
      border: "rgba(248,113,113,0.15)",
    },
  };

  const s = map[freshness];

  return (
    <span
      style={{
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "1px 6px",
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}

export function KpiCard({
  accentColor,
  label,
  badge,
  children,
}: {
  accentColor: string;
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="client-kpi-card"
      style={{
        padding: "18px 20px 16px",
        borderRadius: 14,
        background: "linear-gradient(145deg, rgba(255,255,255,0.052), rgba(255,255,255,0.018) 42%, rgba(185,190,198,0.04))",
        border: "1px solid rgba(196,201,209,0.13)",
        borderTop: `2px solid ${accentColor}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 18px 42px rgba(0,0,0,0.18)",
        backdropFilter: "blur(12px)",
        cursor: "default",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0,
            textTransform: "uppercase",
            color: "rgba(218,222,229,0.48)",
          }}
        >
          {label}
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}
