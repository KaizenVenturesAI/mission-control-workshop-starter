import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseRuntimeConfig } from "@/lib/supabase/env";
import type { DevLogLedgerEntry, DevLogReadModel, DevLogSyncRun, DevLogSyncStatus, DevLogSyncStore } from "./sourceRefs";
import { resolveGitHubConfig } from "./github";

const DATA_DIR = path.resolve(process.cwd(), ".data");
export const DEVLOG_EVENTS_PATH = path.join(DATA_DIR, "devlog-events.json");

function emptyStore(): DevLogSyncStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [],
    syncRuns: [],
  };
}

function isEntry(value: unknown): value is DevLogLedgerEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<DevLogLedgerEntry>;
  return typeof entry.id === "string" && typeof entry.title === "string" && typeof entry.occurredAt === "string";
}

export function readDevLogSyncStore(): DevLogSyncStore {
  try {
    if (!existsSync(DEVLOG_EVENTS_PATH)) return emptyStore();
    const parsed = JSON.parse(readFileSync(DEVLOG_EVENTS_PATH, "utf-8")) as Partial<DevLogSyncStore>;
    const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : [];
    const syncRuns = Array.isArray(parsed.syncRuns) ? parsed.syncRuns.filter((run): run is DevLogSyncRun => Boolean(run && typeof run === "object" && typeof (run as DevLogSyncRun).id === "string")) : [];
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      entries: entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      syncRuns: syncRuns.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    };
  } catch {
    return emptyStore();
  }
}

export function writeDevLogSyncStore(entries: DevLogLedgerEntry[], syncRuns: DevLogSyncRun[] = readDevLogSyncStore().syncRuns ?? []): DevLogSyncStore {
  mkdirSync(DATA_DIR, { recursive: true });
  const store: DevLogSyncStore = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    syncRuns: [...syncRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 50),
  };
  const tmp = `${DEVLOG_EVENTS_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  renameSync(tmp, DEVLOG_EVENTS_PATH);
  return store;
}

async function getDevLogSupabaseClient(): Promise<SupabaseClient | null> {
  const runtime = getSupabaseRuntimeConfig();
  const url = runtime.url;
  const serviceRoleKey = runtime.serviceRoleKey;
  const backendEnabled = runtime.backendEnabled;
  if (!backendEnabled || !url || !serviceRoleKey) {
    console.warn("[devlog] Supabase devlog backend unavailable", {
      backendEnabled,
      urlConfigured: Boolean(url),
      serviceRoleConfigured: Boolean(serviceRoleKey),
    });
    return null;
  }
  if (runtime.url && runtime.serviceRoleKey) return createServiceSupabaseClient();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function entryRow(entry: DevLogLedgerEntry) {
  const primary = entry.sources.find((source) => source.type === "commit") ?? entry.sources[0];
  return {
    id: entry.id,
    source_system: primary?.system ?? "manual",
    source_id: primary?.id ?? entry.id,
    title: entry.title,
    summary: entry.summary,
    occurred_at: entry.occurredAt,
    status: entry.status,
    owners: entry.owners,
    tags: entry.tags,
    sources: entry.sources,
    raw: entry,
    updated_at: new Date().toISOString(),
  };
}

function runRow(run: DevLogSyncRun) {
  return {
    id: run.id,
    source_system: run.sourceSystem,
    source_repo: run.sourceRepo,
    source_branch: run.sourceBranch,
    status: run.status,
    started_at: run.startedAt,
    completed_at: run.completedAt ?? null,
    created_count: run.created,
    updated_count: run.updated,
    unchanged_count: run.unchanged,
    total_count: run.total,
    latest_source_id: run.latestSourceId ?? null,
    latest_occurred_at: run.latestOccurredAt ?? null,
    error: run.error ?? null,
    raw: run,
  };
}

export async function readDevLogReadModel(): Promise<DevLogReadModel> {
  const supabase = await getDevLogSupabaseClient();
  if (supabase) {
    const [entriesRes, runsRes] = await Promise.all([
      supabase.from("devlog_entries").select("raw").order("occurred_at", { ascending: false }),
      supabase.from("devlog_sync_runs").select("raw").order("started_at", { ascending: false }).limit(1),
    ]);
    if (!entriesRes.error && !runsRes.error) {
      const entries = ((entriesRes.data ?? []) as Array<{ raw: DevLogLedgerEntry }>).map((row) => row.raw).filter(Boolean);
      const latestRun = ((runsRes.data ?? []) as Array<{ raw: DevLogSyncRun }>)[0]?.raw ?? null;
      return {
        updatedAt: latestRun?.completedAt ?? entries[0]?.updatedAt ?? new Date().toISOString(),
        backend: "supabase",
        entries,
        latestRun,
      };
    }
    console.warn("[devlog] Supabase read failed; falling back to local JSON", {
      entriesError: entriesRes.error?.message,
      runsError: runsRes.error?.message,
    });
  }

  const store = readDevLogSyncStore();
  return {
    updatedAt: store.updatedAt,
    backend: "local-json",
    entries: store.entries,
    latestRun: store.syncRuns?.[0] ?? null,
  };
}

export async function upsertDevLogEntries(entries: DevLogLedgerEntry[], run: DevLogSyncRun): Promise<DevLogSyncRun> {
  const supabase = await getDevLogSupabaseClient();
  if (supabase) {
    const { data: existingRows, error: existingError } = await supabase.from("devlog_entries").select("id,raw");
    if (existingError) throw existingError;
    const existing = new Map(((existingRows ?? []) as Array<{ id: string; raw: DevLogLedgerEntry }>).map((row) => [row.id, row.raw]));
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const entry of entries) {
      const previous = existing.get(entry.id);
      if (!previous) created += 1;
      else if (JSON.stringify(previous.payload) !== JSON.stringify(entry.payload) || previous.title !== entry.title || previous.summary !== entry.summary) updated += 1;
      else unchanged += 1;
    }
    const completedRun: DevLogSyncRun = {
      ...run,
      status: "completed",
      completedAt: new Date().toISOString(),
      created,
      updated,
      unchanged,
      total: entries.length,
      latestSourceId: entries[0]?.sources[0]?.id,
      latestOccurredAt: entries[0]?.occurredAt,
    };
    const [entryResult, runResult] = await Promise.all([
      entries.length ? supabase.from("devlog_entries").upsert(entries.map(entryRow), { onConflict: "source_system,source_id" }) : Promise.resolve({ error: null }),
      supabase.from("devlog_sync_runs").upsert(runRow(completedRun), { onConflict: "id" }),
    ]);
    if (entryResult.error) throw entryResult.error;
    if (runResult.error) throw runResult.error;
    return completedRun;
  }

  const store = readDevLogSyncStore();
  const existing = new Map(store.entries.map((entry) => [entry.id, entry]));
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const entry of entries) {
    const previous = existing.get(entry.id);
    if (!previous) created += 1;
    else if (JSON.stringify(previous.payload) !== JSON.stringify(entry.payload) || previous.title !== entry.title || previous.summary !== entry.summary) updated += 1;
    else unchanged += 1;
    existing.set(entry.id, { ...entry, createdAt: previous?.createdAt ?? entry.createdAt, updatedAt: new Date().toISOString() });
  }
  const completedRun: DevLogSyncRun = {
    ...run,
    status: "completed",
    completedAt: new Date().toISOString(),
    created,
    updated,
    unchanged,
    total: entries.length,
    latestSourceId: entries[0]?.sources[0]?.id,
    latestOccurredAt: entries[0]?.occurredAt,
  };
  writeDevLogSyncStore(Array.from(existing.values()), [completedRun, ...(store.syncRuns ?? [])]);
  return completedRun;
}

export async function recordFailedDevLogSyncRun(run: DevLogSyncRun, error: unknown): Promise<DevLogSyncRun> {
  const failedRun: DevLogSyncRun = {
    ...run,
    status: "failed",
    completedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  const supabase = await getDevLogSupabaseClient();
  if (supabase) {
    await supabase.from("devlog_sync_runs").upsert(runRow(failedRun), { onConflict: "id" });
  } else {
    const store = readDevLogSyncStore();
    writeDevLogSyncStore(store.entries, [failedRun, ...(store.syncRuns ?? [])]);
  }
  return failedRun;
}

export async function getDevLogSyncStatus(): Promise<DevLogSyncStatus> {
  const { config, missing } = await resolveGitHubConfig();
  const model = await readDevLogReadModel();
  return {
    backend: model.backend,
    configured: missing.length === 0,
    missing,
    repo: `${config.owner}/${config.repo}`,
    branch: config.branch,
    count: model.entries.length,
    latestEntry: model.entries[0] ?? null,
    latestRun: model.latestRun ?? null,
  };
}
