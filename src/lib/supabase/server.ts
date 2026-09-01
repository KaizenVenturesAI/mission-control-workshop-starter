import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { assertSupabaseServerConfig, getSupabaseRuntimeConfig } from "@/lib/supabase/env";

export function createServiceSupabaseClient(): SupabaseClient {
  const config = assertSupabaseServerConfig();
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createRequestSupabaseClient(accessToken?: string): SupabaseClient {
  const config = getSupabaseRuntimeConfig();
  if (!config.url || !config.anonKey) {
    throw new Error("Supabase request client configuration missing.");
  }
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function getSupabaseRequestUser(request: Request): Promise<User | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  const supabase = createRequestSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}
