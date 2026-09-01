import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { FreshnessBadge, type LiveSpendData, type SpendFreshness } from "@/components/dashboardHomeShared";

const SPEND_RED = "#dadadb";
const SPEND_RED_SOFT = "rgba(218,218,219,0.72)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SpendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "rgba(15,15,25,0.96)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 8,
        padding: "8px 13px",
        fontSize: 12,
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{ color: "rgba(255,255,255,0.45)", marginBottom: 3, fontSize: 10 }}
      >
        {label}
      </div>
      <div
        style={{ color: "rgba(255,255,255,0.94)", fontWeight: 700, fontSize: 14 }}
      >
        ${(payload[0].value as number).toFixed(2)}
      </div>
      <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, color: "rgba(218,218,219,0.78)", fontSize: 10, fontWeight: 700 }}>
        <span className="spend-tooltip-pulse" />
        LIVE SPEND
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiveSpendDot(props: any) {
  const { cx, cy } = props;
  if (typeof cx !== "number" || typeof cy !== "number") return null;

  return (
    <g className="spend-active-dot">
      <circle cx={cx} cy={cy} r={11} fill="rgba(218,218,219,0.12)" />
      <circle cx={cx} cy={cy} r={7} fill="rgba(218,218,219,0.18)" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={3.5} fill={SPEND_RED} stroke="rgba(255,255,255,0.88)" strokeWidth={1.5} />
    </g>
  );
}

export function DashboardHomeSpendTrend({
  liveSpend,
  spendFreshness,
}: {
  liveSpend: LiveSpendData | null;
  spendFreshness: SpendFreshness;
}) {
  return (
    <div
      style={{
        marginBottom: 24,
        padding: "20px 22px 16px",
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
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              letterSpacing: "-0.01em",
            }}
          >
            Spend Trend
          </span>
          <span
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.32)",
              marginLeft: 10,
            }}
          >
            Last 7 days · AI workforce cost
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width={22} height={8} className="spend-legend-pulse">
              <line x1={1} y1={4} x2={21} y2={4} stroke={SPEND_RED_SOFT} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 6" />
            </svg>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>
              Actual
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <svg width={18} height={6}>
              <line
                x1={0}
                y1={3}
                x2={18}
                y2={3}
                stroke="rgba(251,191,36,0.6)"
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
            </svg>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>
              $25 target
            </span>
          </div>
          <FreshnessBadge freshness={spendFreshness} />
        </div>
      </div>

      <div className="spend-trend-chart" style={{ height: 148 }}>
        {liveSpend?.dailyData && liveSpend.dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={liveSpend.dailyData}
              margin={{ top: 4, right: 8, left: -24, bottom: 0 }}
            >
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="rgba(218,218,219,0.36)"
                    stopOpacity={1}
                  />
                  <stop
                    offset="100%"
                    stopColor="rgba(218,218,219,0)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{
                  fill: "rgba(255,255,255,0.32)",
                  fontSize: 10,
                }}
                axisLine={false}
                tickLine={false}
                dy={4}
              />
              <YAxis
                tick={{
                  fill: "rgba(255,255,255,0.32)",
                  fontSize: 10,
                }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v}`}
              />
              <Tooltip
                content={<SpendTooltip />}
                cursor={{ stroke: "rgba(218,218,219,0.22)", strokeWidth: 1, strokeDasharray: "3 4" }}
              />
              <ReferenceLine
                y={25}
                stroke="rgba(251,191,36,0.45)"
                strokeDasharray="4 3"
                label={{
                  value: "$25",
                  fill: "rgba(251,191,36,0.55)",
                  fontSize: 9,
                  position: "insideTopRight",
                }}
              />
              <Area
                type="monotone"
                dataKey="cost"
                className="spend-trend-area"
                stroke={SPEND_RED_SOFT}
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray="1 7"
                fill="url(#spendGrad)"
                dot={{
                  fill: "#0b0b0f",
                  stroke: SPEND_RED,
                  strokeWidth: 2,
                  r: 3.5,
                }}
                activeDot={<ActiveSpendDot />}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.18)",
              fontSize: 12,
              animation: "client-shimmer 1.6s ease-in-out infinite",
            }}
          >
            Loading spend data…
          </div>
        )}
      </div>
    </div>
  );
}
