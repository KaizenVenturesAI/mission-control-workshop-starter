import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { createSessionToken } from "@/lib/auth/session";
import type { MCRole } from "@/data/settings-roles";
import type { MCUser } from "@/data/settings-users";

const user: MCUser = {
  id: "user-view",
  email: "viewer@example.invalid",
  name: "Viewer",
  role_id: "role-view",
  status: "active",
  invited_by: "system",
  invited_at: "2026-01-01T00:00:00.000Z",
  last_login: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const role: MCRole = {
  id: "role-view",
  name: "Viewer",
  description: "Read-only CRM role",
  permissions: {
    dashboard: "view",
    crm: "view",
    revenue: "hidden",
    hr: "hidden",
    strategy: "hidden",
    brain: "hidden",
    devlog: "hidden",
    calendar: "hidden",
    usage: "hidden",
    permissions: "hidden",
    rulebook: "hidden",
    settings: "hidden",
    action_board: "view",
  },
};

function request(pathname: string, init?: RequestInit) {
  return new NextRequest(new Request(`http://localhost:3000${pathname}`, init));
}

describe("api auth middleware", () => {
  it("denies unauthenticated non-public API routes", async () => {
    const response = await middleware(request("/api/crm/accounts"));
    expect(response.status).toBe(401);
  });

  it("allows explicitly public API routes without a session", async () => {
    const response = await middleware(request("/api/auth/health"));
    expect(response.status).toBe(200);
  });

  it("does not treat public route name prefixes as public routes", async () => {
    const response = await middleware(request("/api/auth/healthcheck"));
    expect(response.status).toBe(401);
  });

  it("does not accept arbitrary bearer tokens on protected API routes", async () => {
    const response = await middleware(request("/api/crm/accounts", { headers: { authorization: "Bearer test-token" } }));
    expect(response.status).toBe(401);
  });

  it("allows handler-authenticated sync routes to validate bearer tokens themselves", async () => {
    const response = await middleware(request("/api/meetings/plaud/sync", { method: "POST", headers: { authorization: "Bearer test-token" } }));
    expect(response.status).toBe(200);
  });

  it("denies mutations when the session only has view permission", async () => {
    const token = createSessionToken(user, role);
    const response = await middleware(request("/api/crm/accounts", { method: "POST", headers: { cookie: `mc_session=${token}` } }));
    expect(response.status).toBe(403);
  });
});
