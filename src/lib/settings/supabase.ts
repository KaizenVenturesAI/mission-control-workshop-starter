import type { MCUser, UserStatus } from "@/data/settings-users";
import type { MCRole } from "@/data/settings-roles";
import type { User } from "@supabase/supabase-js";
import { createServiceSupabaseClient, getSupabaseRequestUser } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role_id: string;
  status: UserStatus;
  invited_by: string | null;
  invited_at: string | null;
  last_login: string | null;
  created_at: string | null;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: MCRole["permissions"];
};

export type AuthenticatedProfile = {
  user: MCUser;
  role: MCRole;
};

function mapProfile(row: ProfileRow): MCUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role_id: row.role_id,
    status: row.status,
    invited_by: row.invited_by ?? "system",
    invited_at: row.invited_at ?? row.created_at ?? new Date().toISOString(),
    last_login: row.last_login,
    created_at: row.created_at ?? new Date().toISOString(),
  };
}

function attachAuthMetadata(user: MCUser, authUser?: User | null): MCUser {
  if (!authUser) return user;
  const providers = Array.isArray(authUser.app_metadata?.providers)
    ? authUser.app_metadata.providers.filter((provider): provider is string => typeof provider === "string")
    : typeof authUser.app_metadata?.provider === "string"
      ? [authUser.app_metadata.provider]
      : [];
  return {
    ...user,
    auth_user_id: authUser.id,
    auth_email_confirmed_at: authUser.email_confirmed_at ?? null,
    auth_last_sign_in_at: authUser.last_sign_in_at ?? null,
    auth_created_at: authUser.created_at ?? null,
    auth_updated_at: authUser.updated_at ?? null,
    auth_providers: providers,
    auth_is_sso_user: Boolean(authUser.is_sso_user),
    auth_banned_until: authUser.banned_until ?? null,
  };
}

function mapRole(row: RoleRow): MCRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    permissions: row.permissions,
  };
}

export async function listSupabaseUsers(): Promise<MCUser[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,name,role_id,status,invited_by,invited_at,last_login,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const users = ((data ?? []) as ProfileRow[]).map(mapProfile);
  const authUsers = await supabase.auth.admin.listUsers();
  if (authUsers.error) throw authUsers.error;
  const authById = new Map(authUsers.data.users.map((user) => [user.id, user]));
  return users.map((user) => attachAuthMetadata(user, authById.get(user.id)));
}

export async function listSupabaseRoles(): Promise<MCRole[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id,name,description,permissions")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as RoleRow[]).map(mapRole);
}

export async function getSupabaseUser(id: string): Promise<MCUser | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,name,role_id,status,invited_by,invited_at,last_login,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const authUser = await supabase.auth.admin.getUserById(id);
  if (authUser.error) return mapProfile(data as ProfileRow);
  return attachAuthMetadata(mapProfile(data as ProfileRow), authUser.data.user);
}

export async function getSupabaseRole(id: string): Promise<MCRole | null> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id,name,description,permissions")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRole(data as RoleRow) : null;
}

export async function getAuthenticatedProfile(request: Request): Promise<AuthenticatedProfile | null> {
  const authUser = await getSupabaseRequestUser(request);
  if (!authUser) return null;
  const supabase = createServiceSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,name,role_id,status,invited_by,invited_at,last_login,created_at")
    .eq("id", authUser.id)
    .maybeSingle();
  if (profileError || !profile) return null;
  const user = mapProfile(profile as ProfileRow);
  if (user.status !== "active") return null;

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id,name,description,permissions")
    .eq("id", user.role_id)
    .maybeSingle();
  if (roleError || !role) return null;

  await supabase
    .from("profiles")
    .update({ last_login: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", authUser.id);

  return { user, role: mapRole(role as RoleRow) };
}

export async function requireSupabaseAdmin(request: Request): Promise<AuthenticatedProfile> {
  const profile = await getAuthenticatedProfile(request);
  if (!profile || profile.user.role_id !== "role-admin") {
    throw new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return profile;
}

export async function createSupabaseUser(input: {
  email: string;
  name?: string;
  role_id: string;
  invited_by?: string;
}): Promise<MCUser> {
  const supabase = createServiceSupabaseClient();
  const email = input.email.toLowerCase().trim();
  const name = input.name?.trim() || email.split("@")[0] || email;
  const now = new Date().toISOString();

  const existingUsers = await supabase.auth.admin.listUsers();
  const existingAuthUser = existingUsers.data.users.find((user) => user.email?.toLowerCase() === email);
  const authUser =
    existingAuthUser ??
    (
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name },
      })
    ).data.user;

  if (!authUser) throw new Error("Unable to create Supabase auth user.");

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: authUser.id,
        email,
        name,
        role_id: input.role_id,
        status: "invited",
        invited_by: input.invited_by ?? "admin",
        invited_at: now,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("id,email,name,role_id,status,invited_by,invited_at,last_login,created_at")
    .single();
  if (error) throw error;
  return mapProfile(data as ProfileRow);
}

export async function updateSupabaseUser(id: string, updates: Partial<MCUser>): Promise<MCUser | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.role_id !== undefined) patch.role_id = updates.role_id;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.last_login !== undefined) patch.last_login = updates.last_login;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select("id,email,name,role_id,status,invited_by,invited_at,last_login,created_at")
    .maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data as ProfileRow) : null;
}

export async function deleteSupabaseUser(id: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function sendSupabasePasswordReset(id: string, redirectTo?: string): Promise<{ email: string }> {
  const user = await getSupabaseUser(id);
  if (!user) throw new Error("User not found");
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, redirectTo ? { redirectTo } : undefined);
  if (error) throw error;
  return { email: user.email };
}

export async function createSupabaseRole(input: Omit<MCRole, "id"> & { id?: string }): Promise<MCRole> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .insert({
      id: input.id ?? `role-${Date.now()}`,
      name: input.name,
      description: input.description ?? "",
      permissions: input.permissions,
    })
    .select("id,name,description,permissions")
    .single();
  if (error) throw error;
  return mapRole(data as RoleRow);
}

export async function updateSupabaseRole(id: string, updates: Partial<MCRole>): Promise<MCRole | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.permissions !== undefined) patch.permissions = updates.permissions;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("roles")
    .update(patch)
    .eq("id", id)
    .select("id,name,description,permissions")
    .maybeSingle();
  if (error) throw error;
  return data ? mapRole(data as RoleRow) : null;
}

export async function deleteSupabaseRole(id: string): Promise<boolean> {
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) throw error;
  return true;
}
