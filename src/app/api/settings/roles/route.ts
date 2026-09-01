import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MCRole } from "@/data/settings-roles";
import { createSupabaseRole, getAuthenticatedProfile, listSupabaseRoles, requireSupabaseAdmin } from "@/lib/settings/supabase";
import { shouldRequireSupabaseBackend, shouldUseSupabaseBackend } from "@/lib/supabase/env";

const DATA_PATH = path.join(process.cwd(), "src/data/settings-roles.json");

function readRoles(): MCRole[] {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function writeRoles(roles: MCRole[]) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(roles, null, 2));
}

export async function GET(request: Request) {
  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      const profile = await getAuthenticatedProfile(request);
      if (!profile) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      return NextResponse.json(await listSupabaseRoles());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read Supabase roles";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json(readRoles());
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, description, permissions } = body;

  if (!name || !permissions) {
    return NextResponse.json({ error: "name and permissions required" }, { status: 400 });
  }

  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      await requireSupabaseAdmin(request);
      const role = await createSupabaseRole({ name, description: description || "", permissions });
      return NextResponse.json(role, { status: 201 });
    } catch (error) {
      if (error instanceof Response) return error;
      const message = error instanceof Error ? error.message : "Unable to create Supabase role";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const roles = readRoles();

  if (roles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "Role with this name already exists" }, { status: 409 });
  }

  const newRole: MCRole = {
    id: `role-${Date.now()}`,
    name,
    description: description || "",
    permissions,
  };

  roles.push(newRole);
  writeRoles(roles);

  return NextResponse.json(newRole, { status: 201 });
}
