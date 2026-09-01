export type SupabaseRuntimeConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  backendEnabled: boolean;
  failClosed: boolean;
};

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    backendEnabled: readBoolean(process.env.SUPABASE_BACKEND_ENABLED),
    failClosed: readBoolean(process.env.SUPABASE_FAIL_CLOSED),
  };
}

export function getPublicSupabaseConfig(): Pick<SupabaseRuntimeConfig, "url" | "anonKey"> {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

export function hasSupabaseBrowserConfig(): boolean {
  const config = getPublicSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}

export function hasSupabaseServerConfig(): {
  urlConfigured: boolean;
  anonKeyConfigured: boolean;
  serviceRoleConfigured: boolean;
} {
  const config = getSupabaseRuntimeConfig();
  return {
    urlConfigured: Boolean(config.url),
    anonKeyConfigured: Boolean(config.anonKey),
    serviceRoleConfigured: Boolean(config.serviceRoleKey),
  };
}

export function shouldUseSupabaseBackend(): boolean {
  return getSupabaseRuntimeConfig().backendEnabled;
}

export function shouldRequireSupabaseBackend(): boolean {
  const config = getSupabaseRuntimeConfig();
  return config.backendEnabled || (config.failClosed && process.env.NODE_ENV === "production");
}

export function assertSupabaseServerConfig(): SupabaseRuntimeConfig {
  const config = getSupabaseRuntimeConfig();
  const missing: string[] = [];
  if (!config.url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!config.anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!config.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(`Supabase server configuration missing: ${missing.join(", ")}`);
  }
  return config;
}
