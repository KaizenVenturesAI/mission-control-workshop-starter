import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { MCRole, PermissionLevel } from "@/data/settings-roles";
import type { MCUser, ModuleKey } from "@/data/settings-users";

export const SESSION_COOKIE_NAME = "mc_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const USERS_PATH = path.join(process.cwd(), "src/data/settings-users.json");
const ROLES_PATH = path.join(process.cwd(), "src/data/settings-roles.json");

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  permissions: Record<ModuleKey, PermissionLevel>;
  iat: number;
  exp: number;
};

export type AuthenticatedSession = {
  user: MCUser;
  role: MCRole;
  payload: SessionPayload;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function getSigningSecret(): string {
  const secret = process.env.MISSION_CONTROL_SESSION_SECRET || process.env.MISSION_CONTROL_PASSWORD;
  if (!secret || secret.length < 16) {
    throw new Error("MISSION_CONTROL_SESSION_SECRET must be set to at least 16 characters.");
  }
  return secret;
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");
}

export function createSessionToken(user: MCUser, role: MCRole): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    roleId: role.id,
    roleName: role.name,
    permissions: role.permissions,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function attachSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function getLocalProfileByEmail(email: string): AuthenticatedSession | null {
  const users = readJson<MCUser[]>(USERS_PATH, []);
  const roles = readJson<MCRole[]>(ROLES_PATH, []);
  const user = users.find((item) => item.email.toLowerCase() === email.toLowerCase() && item.status === "active");
  if (!user) return null;
  const role = roles.find((item) => item.id === user.role_id);
  if (!role) return null;
  const tokenPayload = verifySessionToken(createSessionToken(user, role));
  if (!tokenPayload) return null;
  return { user, role, payload: tokenPayload };
}

export function getSessionFromRequest(request: Request | NextRequest): AuthenticatedSession | null {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  const token = cookie ? decodeURIComponent(cookie.slice(SESSION_COOKIE_NAME.length + 1)) : null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const users = readJson<MCUser[]>(USERS_PATH, []);
  const roles = readJson<MCRole[]>(ROLES_PATH, []);
  const user = users.find((item) => item.id === payload.sub && item.status === "active");
  const role = roles.find((item) => item.id === payload.roleId);
  if (!user || !role) return null;
  return { user, role, payload: { ...payload, permissions: role.permissions } };
}

export function hasPermission(session: AuthenticatedSession, moduleKey: ModuleKey, required: PermissionLevel): boolean {
  const current = session.role.permissions[moduleKey];
  if (required === "hidden") return true;
  if (required === "view") return current === "view" || current === "edit";
  return current === "edit";
}

export function unauthorized(status = 401, error = "Authentication required"): NextResponse {
  return NextResponse.json({ error }, { status });
}
