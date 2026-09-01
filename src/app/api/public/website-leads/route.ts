import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { runWebsiteLeadWorkflow } from "@/lib/website-leads/workflow";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = new Set([
  "https://example.com",
  "https://example.invalid",
]);

const WINDOW_MS = 60 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) || isLocalhostOrigin(origin) ? origin : "https://example.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1_000) };
  }
  bucket.count += 1;
  return { ok: true };
}

function baseUrlFromRequest(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const limited = rateLimit(clientIp(request));
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "Rate limit exceeded" },
      { status: 429, headers: { ...headers, "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  try {
    const body = await request.json();
    const result = await runWebsiteLeadWorkflow({
      body,
      idempotencyKeyHeader: request.headers.get("idempotency-key"),
      userAgent: request.headers.get("user-agent") ?? undefined,
      baseUrl: baseUrlFromRequest(request),
    });

    return NextResponse.json(
      {
        ok: true,
        leadId: result.lead.id,
        created: result.created,
        spam: result.spam,
        slack: result.slack,
        research: result.research,
      },
      { status: result.created ? 201 : 200, headers },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Invalid website lead payload", issues: error.issues },
        { status: 400, headers },
      );
    }
    const message = error instanceof Error ? error.message : "Unable to ingest website lead";
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers });
  }
}

