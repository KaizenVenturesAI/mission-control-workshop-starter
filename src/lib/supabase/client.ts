"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/supabase/env";

let browserClient: SupabaseClient | null = null;
let configPromise: Promise<PublicSupabaseConfig> | null = null;

export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
  configured: boolean;
  backendEnabled?: boolean;
  missing?: string[];
};

async function fetchRuntimePublicConfig(): Promise<PublicSupabaseConfig> {
  const response = await fetch("/api/auth/public-config", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => ({}))) as Partial<PublicSupabaseConfig> & { error?: string };
  if (!response.ok) {
    const missing = Array.isArray(data.missing) && data.missing.length > 0 ? ` Missing: ${data.missing.join(", ")}.` : "";
    throw new Error(`${data.error || "Mission Control Supabase auth is not configured."}${missing}`);
  }
  return {
    url: data.url ?? "",
    anonKey: data.anonKey ?? "",
    configured: Boolean(data.configured && data.url && data.anonKey),
    backendEnabled: data.backendEnabled,
    missing: data.missing ?? [],
  };
}

export async function getPublicSupabaseRuntimeConfig(): Promise<PublicSupabaseConfig> {
  const inlined = getPublicSupabaseConfig();
  if (inlined.url && inlined.anonKey) {
    return { ...inlined, configured: true, missing: [] };
  }
  configPromise ??= fetchRuntimePublicConfig();
  return configPromise;
}

export function createBrowserSupabaseClient(): SupabaseClient {
  const { url, anonKey } = getPublicSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error("Mission Control Supabase auth is not configured.");
  }
  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

export async function getBrowserSupabaseClient(): Promise<SupabaseClient> {
  if (browserClient) return browserClient;
  const { url, anonKey, configured, missing } = await getPublicSupabaseRuntimeConfig();
  if (!configured || !url || !anonKey) {
    throw new Error(`Mission Control Supabase auth is not configured.${missing?.length ? ` Missing: ${missing.join(", ")}.` : ""}`);
  }
  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export async function getSupabaseAuthHeaders(): Promise<HeadersInit> {
  const supabase = await getBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
