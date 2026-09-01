import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MCUser } from "@/data/settings-users";
import { deleteSupabaseUser, getSupabaseUser, requireSupabaseAdmin, updateSupabaseUser } from "@/lib/settings/supabase";
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      const user = await getSupabaseUser(id);
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      return NextResponse.json(user);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read Supabase user";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  const users = readUsers();
  const user = users.find((u) => u.id === id);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Partial<MCUser>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      await requireSupabaseAdmin(request);
      const user = await updateSupabaseUser(id, body);
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      return NextResponse.json(user);
    } catch (error) {
      if (error instanceof Response) return error;
      const message = error instanceof Error ? error.message : "Unable to update Supabase user";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === id);

  if (idx === -1) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Updatable fields
  if (body.name !== undefined) users[idx].name = body.name;
  if (body.role_id !== undefined) users[idx].role_id = body.role_id;
  if (body.status !== undefined) users[idx].status = body.status;
  if (body.last_login !== undefined) users[idx].last_login = body.last_login;

  writeUsers(users);
  return NextResponse.json(users[idx]);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (shouldUseSupabaseBackend() || shouldRequireSupabaseBackend()) {
    try {
      await requireSupabaseAdmin(_request);
      await deleteSupabaseUser(id);
      return NextResponse.json({ deleted: true });
    } catch (error) {
      if (error instanceof Response) return error;
      const message = error instanceof Error ? error.message : "Unable to delete Supabase user";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  const users = readUsers();
  const filtered = users.filter((u) => u.id !== id);

  if (filtered.length === users.length) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  writeUsers(filtered);
  return NextResponse.json({ deleted: true });
}
