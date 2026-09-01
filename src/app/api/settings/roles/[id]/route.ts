import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MCRole } from "@/data/settings-roles";
import { deleteSupabaseRole, getSupabaseRole, requireSupabaseAdmin, updateSupabaseRole } from "@/lib/settings/supabase";
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      const role = await getSupabaseRole(id);
      if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
      return NextResponse.json(role);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read Supabase role";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  const roles = readRoles();
  const role = roles.find((r) => r.id === id);
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  return NextResponse.json(role);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      await requireSupabaseAdmin(request);
      const role = await updateSupabaseRole(id, body);
      if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
      return NextResponse.json(role);
    } catch (error) {
      if (error instanceof Response) return error;
      const message = error instanceof Error ? error.message : "Unable to update Supabase role";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  const roles = readRoles();
  const idx = roles.findIndex((r) => r.id === id);

  if (idx === -1) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  if (body.name !== undefined) roles[idx].name = body.name;
  if (body.description !== undefined) roles[idx].description = body.description;
  if (body.permissions !== undefined) roles[idx].permissions = body.permissions;

  writeRoles(roles);
  return NextResponse.json(roles[idx]);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Prevent deleting built-in admin role
  if (id === "role-admin") {
    return NextResponse.json({ error: "Cannot delete the Admin role" }, { status: 403 });
  }

  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      await requireSupabaseAdmin(_request);
      await deleteSupabaseRole(id);
      return NextResponse.json({ deleted: true });
    } catch (error) {
      if (error instanceof Response) return error;
      const message = error instanceof Error ? error.message : "Unable to delete Supabase role";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const roles = readRoles();

  const filtered = roles.filter((r) => r.id !== id);
  if (filtered.length === roles.length) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  writeRoles(filtered);
  return NextResponse.json({ deleted: true });
}
