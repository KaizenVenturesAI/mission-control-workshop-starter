// ── Strategy Runs Data Model ──
// Run history for the Nightly Strategic Synthesis system.
// Each run represents one nightly synthesis cycle with theme, participants, and memo output.

export type StrategyTheme =
  | "Revenue and Monetization"
  | "Partnerships and Brand Ecosystem"
  | "Product, Tech, and League Platform"
  | "Marketing, Content, and Community Growth"
  | "Operations, People, and Process"
  | "Competitive Landscape and Market Position"
  | "Big Picture Vision, 12-Month Horizon";

export type RunStatus = "running" | "completed" | "skipped" | "failed";

export interface TokenEstimate {
  input: number;
  output: number;
  cost: number;
}

export interface StrategyRun {
  id: string;
  date: string; // YYYY-MM-DD
  theme: StrategyTheme;
  status: RunStatus;
  startTime: string; // ISO
  endTime: string; // ISO
  durationMs: number;
  signalSources: string[];
  agentsConsulted: string[];
  tokenEstimate: TokenEstimate;
  memo: string;
  skipReason?: string;
}

export const THEME_BY_DAY: Record<string, StrategyTheme> = {
  Monday: "Revenue and Monetization",
  Tuesday: "Partnerships and Brand Ecosystem",
  Wednesday: "Product, Tech, and League Platform",
  Thursday: "Marketing, Content, and Community Growth",
  Friday: "Operations, People, and Process",
  Saturday: "Competitive Landscape and Market Position",
  Sunday: "Big Picture Vision, 12-Month Horizon",
};

export const THEME_COLORS: Record<StrategyTheme, string> = {
  "Revenue and Monetization": "#34D399",
  "Partnerships and Brand Ecosystem": "#A78BFA",
  "Product, Tech, and League Platform": "#60A5FA",
  "Marketing, Content, and Community Growth": "#F472B6",
  "Operations, People, and Process": "#FBBF24",
  "Competitive Landscape and Market Position": "#FB923C",
  "Big Picture Vision, 12-Month Horizon": "#E84393",
};

// ── Seeded Example Runs ──

export const STRATEGY_RUNS: StrategyRun[] = [];

// ── Helper Functions ──

export function getRunsByDate(date: string): StrategyRun[] {
  return STRATEGY_RUNS.filter((r) => r.date === date);
}

export function getLatestRun(): StrategyRun | undefined {
  const sorted = [...STRATEGY_RUNS].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );
  return sorted[0];
}

export function getRunStats(runs: StrategyRun[]): {
  totalRuns: number;
  completedRuns: number;
  avgDurationMs: number;
  totalCost: number;
  skipRate: number;
} {
  const completed = runs.filter((r) => r.status === "completed");
  const skipped = runs.filter((r) => r.status === "skipped");
  return {
    totalRuns: runs.length,
    completedRuns: completed.length,
    avgDurationMs:
      completed.length > 0
        ? completed.reduce((sum, r) => sum + r.durationMs, 0) / completed.length
        : 0,
    totalCost: runs.reduce((sum, r) => sum + (r.tokenEstimate?.cost ?? 0), 0),
    skipRate: runs.length > 0 ? skipped.length / runs.length : 0,
  };
}
