"use client";

function SeededTag() {
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: "rgba(251,191,36,0.10)",
        color: "rgba(251,191,36,0.55)",
        border: "1px solid rgba(251,191,36,0.15)",
        flexShrink: 0,
        lineHeight: "16px",
      }}
    >
      SEEDED
    </span>
  );
}

const COST_DATA = {
  today: 4.82,
  week: 31.47,
  mostExpensive: { name: "Example Client Mission Agent", cost: 12.34 },
  mostActive: { model: "claude-sonnet-4-6", calls: 847 },
  agents: [
    { name: "Example Client Mission Agent", cost: 12.34, color: "#dadadb" },
    { name: "Engineering Agent", cost: 6.21, color: "#f0a030" },
    { name: "Delivery / Install Agent", cost: 4.18, color: "#60A5FA" },
    { name: "Sales Follow-Up Agent", cost: 3.92, color: "#A78BFA" },
    { name: "Marketing Agent", cost: 2.41, color: "#60A5FA" },
    { name: "Strategy Review Agent", cost: 1.23, color: "#34D399" },
    { name: "Operations Agent", cost: 0.87, color: "#34D399" },
    { name: "Executive Assistant", cost: 0.31, color: "#A78BFA" },
  ],
};

const maxCost = Math.max(...COST_DATA.agents.map(a => a.cost));

export function CostDashboard() {
  return (
    <div
      className="rounded-2xl"
      style={{
        background: "var(--color-client-card)",
        border: "1px solid var(--color-client-border)",
        padding: 20,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <div className="flex items-center gap-2">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-client-text)", letterSpacing: "-0.01em" }}>
            Cost Overview
          </h2>
          <SeededTag />
        </div>
        <span style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          This Week
        </span>
      </div>

      {/* Cost Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginBottom: 16 }}>
        <CostCard label="Spend Today" value={`$${COST_DATA.today.toFixed(2)}`} accent="blue" seeded />
        <CostCard label="Spend This Week" value={`$${COST_DATA.week.toFixed(2)}`} accent="green" seeded />
        <CostCard label="Top Spender" value={COST_DATA.mostExpensive.name} sub={`$${COST_DATA.mostExpensive.cost.toFixed(2)}`} accent="pink" />
        <CostCard label="Most Active Model" value={COST_DATA.mostActive.model} sub={`${COST_DATA.mostActive.calls} calls`} accent="purple" />
      </div>

      {/* Agent Cost Bars */}
      <div className="flex items-center gap-2" style={{ fontSize: 10, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        Cost by Agent
        <SeededTag />
      </div>
      <div className="flex flex-col gap-2">
        {COST_DATA.agents.map(agent => (
          <div key={agent.name} className="flex items-center gap-3">
            <span style={{ fontSize: 11, color: "var(--color-client-text-secondary)", width: 140, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agent.name}
            </span>
            <div style={{ flex: 1, height: 14, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(agent.cost / maxCost) * 100}%`,
                  height: "100%",
                  background: `${agent.color}40`,
                  borderRadius: 4,
                  borderRight: `2px solid ${agent.color}`,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: "var(--color-client-text)", fontFamily: "var(--font-mono)", width: 50, textAlign: "right", flexShrink: 0 }}>
              ${agent.cost.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostCard({ label, value, sub, accent, seeded }: { label: string; value: string; sub?: string; accent: "blue" | "green" | "pink" | "purple"; seeded?: boolean }) {
  const colors = {
    blue: { bg: "rgba(96,165,250,0.06)", border: "rgba(96,165,250,0.12)", text: "var(--color-client-blue)" },
    green: { bg: "rgba(52,211,153,0.06)", border: "rgba(52,211,153,0.12)", text: "var(--color-client-green)" },
    pink: { bg: "rgba(218,218,219,0.06)", border: "rgba(218,218,219,0.12)", text: "var(--color-client-pink)" },
    purple: { bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.12)", text: "var(--color-client-purple)" },
  };
  const c = colors[accent];

  return (
    <div className="rounded-xl" style={{ padding: "12px 14px", background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="flex items-center gap-2" style={{ fontSize: 9, color: "var(--color-client-text-dim)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        {label}
        {seeded && <SeededTag />}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: c.text, fontFamily: value.startsWith("$") ? "var(--font-mono)" : "inherit", letterSpacing: "-0.01em" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "var(--color-client-text-dim)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
