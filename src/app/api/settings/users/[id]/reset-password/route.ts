import { NextResponse } from "next/server";
import { requireSupabaseAdmin, sendSupabasePasswordReset } from "@/lib/settings/supabase";
import { shouldRequireSupabaseBackend, shouldUseSupabaseBackend } from "@/lib/supabase/env";

function getRedirectTo(request: Request): string {
  const url = new URL(request.url);
  const configured = process.env.NEXT_PUBLIC_MISSION_CONTROL_URL?.trim();
  return configured?.replace(/\/+$/, "") || `${url.protocol}//${url.host}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(shouldUseSupabaseBackend() || shouldRequireSupabaseBackend())) {
    return NextResponse.json({ error: "Supabase backend is disabled" }, { status: 503 });
  }

  try {
    await requireSupabaseAdmin(request);
    const { id } = await params;
    const result = await sendSupabasePasswordReset(id, getRedirectTo(request));
    return NextResponse.json({ ok: true, email: result.email });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Unable to send password reset";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
