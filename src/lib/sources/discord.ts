import { execSync } from "child_process";
import { readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { LiveDataResponse } from "@/lib/types/data-contract";
import { logFetch } from "@/lib/logger";
import { MEMBER_DIRECTORY, ALL_GUILD_MEMBERS } from "@/lib/sources/member-directory";

export interface DiscordChannelMember {
  id: string;
  name: string;
  username: string;
  role: "Admin" | "Standard" | "Integration";
}

export interface DiscordChannel {
  id: string;
  name: string;
  members: DiscordChannelMember[];
  memberCount: number;
  fetchedAt: string;
}

const CACHE_PATH = "/tmp/mc-discord-channels.json";
const FRESH_MAX_AGE_MS = 30 * 60 * 1000;      // 30 minutes
const STALE_MAX_AGE_MS = 2 * 60 * 60 * 1000;  // 2 hours

const GUILD_ID = process.env.MC_DISCORD_GUILD_ID || "";
const VIEW_CHANNEL = BigInt(1024);

interface RawPermissionOverwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

interface RawChannel {
  id: string;
  type: number;
  name: string;
  guild_id: string;
  permission_overwrites: RawPermissionOverwrite[];
}

function transformRawChannels(raw: RawChannel[]): DiscordChannel[] {
  const now = new Date().toISOString();

  return raw
    .filter((ch) => ch.type === 0)
    .map((ch) => {
      const isRestricted = ch.permission_overwrites.some(
        (ow) =>
          ow.type === 0 &&
          ow.id === GUILD_ID &&
          (BigInt(ow.deny) & VIEW_CHANNEL) !== BigInt(0)
      );

      let members: DiscordChannelMember[];

      if (isRestricted) {
        const allowedIds = ch.permission_overwrites
          .filter(
            (ow) =>
              ow.type === 1 && (BigInt(ow.allow) & VIEW_CHANNEL) !== BigInt(0)
          )
          .map((ow) => ow.id);

        members = allowedIds
          .map((id) => {
            const info = MEMBER_DIRECTORY[id];
            if (!info) return null;
            const { source: _, ...rest } = info;
            return { id, ...rest };
          })
          .filter((m): m is DiscordChannelMember => m !== null);
      } else {
        members = ALL_GUILD_MEMBERS.map(({ source: _, ...rest }) => rest);
      }

      return {
        id: ch.id,
        name: `#${ch.name}`,
        members,
        memberCount: members.length,
        fetchedAt: now,
      };
    });
}

function readCache(): { data: DiscordChannel[]; ageMs: number; mtimeMs: number } | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const stat = statSync(CACHE_PATH);
    const raw = readFileSync(CACHE_PATH, "utf-8");
    const data = JSON.parse(raw) as DiscordChannel[];
    return { data, ageMs: Date.now() - stat.mtimeMs, mtimeMs: stat.mtimeMs };
  } catch {
    return null;
  }
}

/**
 * Attempt to refresh data by calling openclaw CLI, transforming the output,
 * and writing the result to cache. Returns the transformed channels on success,
 * null on failure. NEVER throws.
 */
function refreshFromAPI(): DiscordChannel[] | null {
  try {
    const raw = execSync(
      `openclaw message channel-list --channel discord --guild-id ${GUILD_ID} --json 2>/dev/null`,
      { timeout: 10000, encoding: "utf-8" }
    );
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const channels = transformRawChannels(parsed);
    writeFileSync(CACHE_PATH, JSON.stringify(channels, null, 2), "utf-8");
    return channels;
  } catch {
    return null;
  }
}

export function fetchDiscordChannels(): LiveDataResponse<DiscordChannel[]> {
  const start = Date.now();
  const now = new Date().toISOString();
  const cached = readCache();

  // Case 1: Fresh cache (<30 min) — return as-is
  if (cached && cached.ageMs < FRESH_MAX_AGE_MS) {
    logFetch("discord", true, Date.now() - start, false);
    return {
      data: cached.data,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "fresh",
      isFallback: false,
      staleAfter: new Date(cached.mtimeMs + FRESH_MAX_AGE_MS).toISOString(),
      lastSuccessAt: new Date(cached.mtimeMs).toISOString(),
      source: "Discord",
      method: "Cached channel data from /tmp/mc-discord-channels.json",
    };
  }

  // Case 2: Stale cache (30 min – 2 hours) — try refresh, fall back to stale
  if (cached && cached.ageMs < STALE_MAX_AGE_MS) {
    const refreshed = refreshFromAPI();
    if (refreshed) {
      logFetch("discord", true, Date.now() - start, false);
      return {
        data: refreshed,
        sourceClass: "LOCAL",
        fetchedAt: now,
        freshness: "fresh",
        isFallback: false,
        staleAfter: new Date(Date.now() + FRESH_MAX_AGE_MS).toISOString(),
        lastSuccessAt: now,
        source: "Discord API via OpenClaw",
        method: "Runtime channel-list fetch",
      };
    }

    // Refresh failed, return stale cache
    logFetch("discord", true, Date.now() - start, true, "API refresh failed, using stale cache");
    return {
      data: cached.data,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "stale",
      isFallback: true,
      staleAfter: new Date(cached.mtimeMs + FRESH_MAX_AGE_MS).toISOString(),
      lastSuccessAt: new Date(cached.mtimeMs).toISOString(),
      limitations: "Cache is older than 30 minutes; API refresh failed",
      source: "Discord",
      method: "Cached channel data from /tmp/mc-discord-channels.json",
    };
  }

  // Case 3: No cache or very old (>2 hours) — try refresh, fail empty
  const refreshed = refreshFromAPI();
  if (refreshed) {
    logFetch("discord", true, Date.now() - start, false);
    return {
      data: refreshed,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "fresh",
      isFallback: false,
      staleAfter: new Date(Date.now() + FRESH_MAX_AGE_MS).toISOString(),
      lastSuccessAt: now,
      source: "Discord API via OpenClaw",
      method: "Runtime channel-list fetch",
    };
  }

  logFetch("discord", false, Date.now() - start, false, "No cache and API refresh failed");
  return {
    data: [],
    sourceClass: "UNKNOWN",
    fetchedAt: now,
    freshness: "failed",
    isFallback: false,
    error: "No Discord data available — API refresh failed and no valid cache",
    source: "Discord",
    method: "No data available",
  };
}

export function forceRefreshDiscordChannels(): LiveDataResponse<DiscordChannel[]> {
  const start = Date.now();
  const now = new Date().toISOString();
  const refreshed = refreshFromAPI();
  if (refreshed) {
    logFetch("discord", true, Date.now() - start, false, "Forced refresh");
    return {
      data: refreshed,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "fresh",
      isFallback: false,
      staleAfter: new Date(Date.now() + FRESH_MAX_AGE_MS).toISOString(),
      lastSuccessAt: now,
      source: "Discord API via OpenClaw",
      method: "Forced runtime channel-list refresh",
    };
  }
  // Fall back to cache on failure
  const cached = readCache();
  if (cached) {
    logFetch("discord", true, Date.now() - start, true, "Forced refresh failed, using cache");
    return {
      data: cached.data,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "stale",
      isFallback: true,
      limitations: "Forced refresh failed; showing cached data",
      source: "Discord",
      method: "Cached channel data (forced refresh failed)",
    };
  }
  logFetch("discord", false, Date.now() - start, false, "Forced refresh failed, no cache");
  return {
    data: [],
    sourceClass: "UNKNOWN",
    fetchedAt: now,
    freshness: "failed",
    isFallback: false,
    error: "Forced refresh failed and no cache available",
    source: "Discord",
    method: "No data available",
  };
}

export function refreshDiscordChannels(channels: DiscordChannel[]): LiveDataResponse<DiscordChannel[]> {
  const start = Date.now();
  const now = new Date().toISOString();

  try {
    writeFileSync(CACHE_PATH, JSON.stringify(channels, null, 2), "utf-8");
    logFetch("discord", true, Date.now() - start, false, "Refreshed via POST");

    return {
      data: channels,
      sourceClass: "LOCAL",
      fetchedAt: now,
      freshness: "fresh",
      isFallback: false,
      staleAfter: new Date(Date.now() + FRESH_MAX_AGE_MS).toISOString(),
      lastSuccessAt: now,
      source: "Discord API via OpenClaw",
      method: "Refreshed channel data via /api/channels/refresh",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logFetch("discord", false, Date.now() - start, false, errorMsg);

    return {
      data: [],
      sourceClass: "UNKNOWN",
      fetchedAt: now,
      freshness: "failed",
      isFallback: false,
      error: errorMsg,
      source: "Discord",
      method: "Refresh failed — could not write to cache",
    };
  }
}
