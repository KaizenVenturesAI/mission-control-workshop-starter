import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { MCUser } from "@/data/settings-users";
import type { MCRole } from "@/data/settings-roles";
import { attachSessionCookie, clearSessionCookie, createSessionToken } from "@/lib/auth/session";

const USERS_PATH = path.join(process.cwd(), "src/data/settings-users.json");
const ROLES_PATH = path.join(process.cwd(), "src/data/settings-roles.json");

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    password?: string;
  };
  const username = (body.username || body.email || "").toLowerCase().trim();
  const password = body.password || "";
  const configuredUsername = (process.env.MISSION_CONTROL_USERNAME || "").toLowerCase().trim();
  const configuredPassword = process.env.MISSION_CONTROL_PASSWORD || "";

  if (!configuredUsername || !configuredPassword) {
    return NextResponse.json(
      { error: "Local Mission Control auth is missing MISSION_CONTROL_USERNAME or MISSION_CONTROL_PASSWORD." },
      { status: 503 },
    );
  }

  if (username !== configuredUsername || password !== configuredPassword) {
    return NextResponse.json({ error: "Invalid Mission Control username or password." }, { status: 401 });
  }

  const users = readJson<MCUser[]>(USERS_PATH, []);
  const roles = readJson<MCRole[]>(ROLES_PATH, []);
  const user = users.find((item) => item.email.toLowerCase() === configuredUsername && item.status === "active");
  if (!user) return NextResponse.json({ error: "No active Mission Control user exists for that username." }, { status: 401 });

  const role = roles.find((item) => item.id === user.role_id);
  if (!role) return NextResponse.json({ error: "No Mission Control role exists for this user." }, { status: 401 });

  return attachSessionCookie(NextResponse.json({ user, role }), createSessionToken(user, role));
}

export async function DELETE() {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
