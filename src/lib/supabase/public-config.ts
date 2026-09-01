import { getSupabaseRuntimeConfig, hasSupabaseServerConfig } from "@/lib/supabase/env";

export type ResolvedPublicAuthConfig = {
  url: string;
  anonKey: string;
  backendEnabled: boolean;
  failClosed: boolean;
  configured: boolean;
  missing: string[];
};

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function resolvePublicAuthConfig(): Promise<ResolvedPublicAuthConfig> {
  const runtime = getSupabaseRuntimeConfig();
  const url = runtime.url;
  const anonKey = runtime.anonKey;
  const backendEnabled = runtime.backendEnabled;
  const failClosed = runtime.failClosed || readBoolean(process.env.SUPABASE_FAIL_CLOSED);
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !anonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean) as string[];

  return {
    url,
    anonKey,
    backendEnabled,
    failClosed,
    configured: missing.length === 0,
    missing,
  };
}

export async function resolveAuthHealth() {
  const publicConfig = await resolvePublicAuthConfig();
  const serverConfig = hasSupabaseServerConfig();
  const serviceRoleConfigured = serverConfig.serviceRoleConfigured;
  const missing = [
    ...publicConfig.missing,
    !serviceRoleConfigured ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter(Boolean) as string[];

  return {
    configured: publicConfig.configured && serviceRoleConfigured,
    publicUrlConfigured: Boolean(publicConfig.url),
    anonKeyConfigured: Boolean(publicConfig.anonKey),
    serviceRoleConfigured,
    backendEnabled: publicConfig.backendEnabled,
    failClosed: publicConfig.failClosed,
    missing,
  };
}
