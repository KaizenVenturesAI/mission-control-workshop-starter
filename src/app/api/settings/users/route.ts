import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MCUser } from "@/data/settings-users";
import { createSupabaseUser, getAuthenticatedProfile, listSupabaseUsers, requireSupabaseAdmin } from "@/lib/settings/supabase";
import { shouldRequireSupabaseBackend, shouldUseSupabaseBackend } from "@/lib/supabase/env";

const DATA_PATH = path.join(process.cwd(), "src/data/settings-users.json");

function readUsers(): MCUser[] {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeUsers(users: MCUser[]) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(users, null, 2));
}

export async function GET(request: Request) {
  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      const profile = await getAuthenticatedProfile(request);
      if (!profile) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      return NextResponse.json(await listSupabaseUsers());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read Supabase users";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json(readUsers());
}

export async function POST(request: Request) {
  const body = await request.json();
  const { email, name, role_id, invited_by } = body;

  if (!email || !role_id) {
    return NextResponse.json({ error: "email and role_id required" }, { status: 400 });
  }

  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      await requireSupabaseAdmin(request);
      const user = await createSupabaseUser({ email, name, role_id, invited_by });
      return NextResponse.json(user, { status: 201 });
    } catch (error) {
      if (error instanceof Response) return error;
      const message = error instanceof Error ? error.message : "Unable to create Supabase user";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const users = readUsers();

  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
  }

  const newUser: MCUser = {
    id: `user-${Date.now()}`,
    email: email.toLowerCase().trim(),
    name: name || email.split("@")[0],
    role_id,
    status: "invited",
    invited_by: invited_by || "admin",
    invited_at: new Date().toISOString(),
    last_login: null,
    created_at: new Date().toISOString(),
  };

  users.push(newUser);
  writeUsers(users);

  return NextResponse.json(newUser, { status: 201 });
}
