import { describe, expect, it } from "vitest";
import { hasPermission, verifySessionToken, createSessionToken } from "@/lib/auth/session";
import type { MCRole } from "@/data/settings-roles";
import type { MCUser } from "@/data/settings-users";

const user: MCUser = {
  id: "user-test",
  email: "operator@example.invalid",
  name: "Example Operator",
  role_id: "role-viewer",
  status: "active",
  invited_by: "system",
  invited_at: "2026-01-01T00:00:00.000Z",
  last_login: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const role: MCRole = {
  id: "role-viewer",
  name: "Viewer",
  description: "Read-only",
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

describe("signed local sessions", () => {
  it("verifies untampered tokens and rejects tampered tokens", () => {
    const token = createSessionToken(user, role);
    expect(verifySessionToken(token)?.sub).toBe(user.id);
    expect(verifySessionToken(`${token.slice(0, -2)}xx`)).toBeNull();
  });

  it("enforces view versus edit permissions", () => {
    const token = createSessionToken(user, role);
    const payload = verifySessionToken(token);
    expect(payload).not.toBeNull();
    const session = { user, role, payload: payload! };
    expect(hasPermission(session, "crm", "view")).toBe(true);
    expect(hasPermission(session, "crm", "edit")).toBe(false);
    expect(hasPermission(session, "settings", "view")).toBe(false);
  });
});
