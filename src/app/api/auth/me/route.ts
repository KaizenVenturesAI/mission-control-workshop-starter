import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getAuthenticatedProfile } from "@/lib/settings/supabase";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const localSession = getSessionFromRequest(request);
  if (localSession) {
    return NextResponse.json({ user: localSession.user, role: localSession.role });
  }

  if (!shouldUseSupabaseBackend()) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const profile = await getAuthenticatedProfile(request);
    if (!profile) {
      return NextResponse.json({ error: "No active Mission Control profile found" }, { status: 401 });
    }
    return NextResponse.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
