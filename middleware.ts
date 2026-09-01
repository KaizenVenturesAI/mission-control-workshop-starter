import { NextResponse, type NextRequest } from "next/server";
import type { ModuleKey } from "@/data/settings-users";
import type { PermissionLevel } from "@/data/settings-roles";
import { verifyEdgeSession } from "@/lib/auth/edge-session";

const PUBLIC_API_PREFIXES = [
  "/api/auth/health",
  "/api/auth/local",
  "/api/auth/public-config",
  "/api/public",
];

const HANDLER_AUTH_API_PREFIXES = [
  "/api/meetings/plaud/sync",
];

const ROUTE_MODULES: { prefix: string; moduleKey: ModuleKey }[] = [
  { prefix: "/api/settings", moduleKey: "settings" },
  { prefix: "/api/permissions", moduleKey: "permissions" },
  { prefix: "/api/crm", moduleKey: "crm" },
  { prefix: "/api/action-items", moduleKey: "action_board" },
  { prefix: "/api/board-runs", moduleKey: "strategy" },
  { prefix: "/api/strategy-runs", moduleKey: "strategy" },
  { prefix: "/api/brain", moduleKey: "brain" },
  { prefix: "/api/inbound", moduleKey: "revenue" },
  { prefix: "/api/leads", moduleKey: "revenue" },
  { prefix: "/api/revenue", moduleKey: "revenue" },
  { prefix: "/api/payroll", moduleKey: "hr" },
  { prefix: "/api/employees", moduleKey: "hr" },
  { prefix: "/api/meetings", moduleKey: "strategy" },
  { prefix: "/api/usage", moduleKey: "usage" },
  { prefix: "/api/devlog", moduleKey: "devlog" },
  { prefix: "/api/audit", moduleKey: "devlog" },
  { prefix: "/api/channels", moduleKey: "calendar" },
  { prefix: "/api/agents", moduleKey: "permissions" },
  { prefix: "/api/linear", moduleKey: "devlog" },
  { prefix: "/api/slack", moduleKey: "crm" },
  { prefix: "/api/canva", moduleKey: "crm" },
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function usesHandlerAuth(pathname: string): boolean {
  return HANDLER_AUTH_API_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

function requiredLevel(method: string): PermissionLevel {
  return method === "GET" || method === "HEAD" || method === "OPTIONS" ? "view" : "edit";
}

function routeModule(pathname: string): ModuleKey {
  return ROUTE_MODULES.find((route) => matchesPathPrefix(pathname, route.prefix))?.moduleKey ?? "dashboard";
}

function hasPermission(value: PermissionLevel | undefined, required: PermissionLevel): boolean {
  if (required === "view") return value === "view" || value === "edit";
  return value === "edit";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/") || isPublicApi(pathname)) return NextResponse.next();

  const session = await verifyEdgeSession(request);
  const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ");
  if (!session && hasBearer && usesHandlerAuth(pathname)) return NextResponse.next();
  if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const moduleKey = routeModule(pathname);
  const required = requiredLevel(request.method);
  if (!hasPermission(session.permissions[moduleKey], required)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const response = NextResponse.next();
  response.headers.set("Vary", "Cookie, Authorization");
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
