import { execSync } from "child_process";
import { readFileSync, writeFileSync, statSync } from "fs";
import { LiveDataResponse } from "@/lib/types/data-contract";
import { ProviderData } from "@/lib/getCostData";
import { logFetch } from "@/lib/logger";

const CACHE_PATH = "/tmp/mc-codexbar-cache.json";
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const TIMEOUT_MS = 5000;

function readCache(): { data: ProviderData[]; age: number } | null {
  try {
    const stat = statSync(CACHE_PATH);
    const age = Date.now() - stat.mtimeMs;
    if (age > CACHE_MAX_AGE_MS) return null;
    const raw = readFileSync(CACHE_PATH, "utf-8");
    return { data: JSON.parse(raw) as ProviderData[], age };
  } catch {
    return null;
  }
}

function writeCache(data: ProviderData[]) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(data), "utf-8");
  } catch {
    // non-critical
  }
}

export function fetchCodexbarCost(): LiveDataResponse<ProviderData[]> {
  const start = Date.now();
  const now = new Date().toISOString();

  try {
    const raw = execSync("codexbar cost --json 2>/dev/null", {
      timeout: TIMEOUT_MS,
      encoding: "utf-8",
    });
    const data = JSON.parse(raw) as ProviderData[];
    const durationMs = Date.now() - start;

    writeCache(data);
    logFetch("codexbar", true, durationMs, false);

    return {
      data,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "fresh",
      isFallback: false,
      staleAfter: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      lastSuccessAt: now,
      source: "codexbar",
      method: "Runtime exec of codexbar cost --json",
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Try cache fallback
    const cached = readCache();
    if (cached) {
      logFetch("codexbar", false, durationMs, true, errorMsg);
      return {
        data: cached.data,
        sourceClass: "LOCAL",
        fetchedAt: now,
        freshness: "stale",
        isFallback: true,
        error: errorMsg,
        limitations: "Using cached data from previous successful fetch",
        source: "codexbar",
        method: "Fallback to /tmp/mc-codexbar-cache.json",
      };
    }

    logFetch("codexbar", false, durationMs, false, errorMsg);
    return {
      data: [],
      sourceClass: "UNKNOWN",
      fetchedAt: now,
      freshness: "failed",
      isFallback: false,
      error: errorMsg,
      source: "codexbar",
      method: "Runtime exec of codexbar cost --json (failed, no cache)",
    };
  }
}
