// Server-side utility to fetch real cost data from codexbar
import { execSync } from "child_process";

export type ModelBreakdown = {
  modelName: string;
  totalTokens: number;
  cost: number;
};

export type DailyEntry = {
  date: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};

export type ProviderData = {
  provider: string;
  source: string;
  sessionTokens: number;
  sessionCostUSD: number;
  last30DaysTokens: number;
  last30DaysCostUSD: number;
  daily: DailyEntry[];
  totals: {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  };
  updatedAt: string;
};

export function fetchCostData(): ProviderData[] {
  try {
    const raw = execSync("codexbar cost --json 2>/dev/null", {
      timeout: 5000,
      encoding: "utf-8",
    });
    return JSON.parse(raw) as ProviderData[];
  } catch {
    return [];
  }
}
