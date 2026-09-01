import { NextResponse } from "next/server";
import { getAuthenticatedProfile } from "@/lib/settings/supabase";
import { shouldRequireSupabaseBackend, shouldUseSupabaseBackend } from "@/lib/supabase/env";
import { syncGitHubDevLog } from "@/lib/devlog/sync";

export const dynamic = "force-dynamic";

async function requireDevLogEdit(request: Request): Promise<Response | null> {
  if (!(shouldUseSupabaseBackend() || shouldRequireSupabaseBackend())) return null;
  const profile = await getAuthenticatedProfile(request);
  if (!profile) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const permission = profile.role.permissions.devlog;
  if (profile.user.role_id !== "role-admin" && permission !== "edit") {
    return NextResponse.json({ error: "Development log edit access required" }, { status: 403 });
  }
  return null;
}

export async function POST(request: Request) {
  const authError = await requireDevLogEdit(request);
  if (authError) return authError;

  const run = await syncGitHubDevLog();
  return NextResponse.json(
    {
      success: run.status === "completed",
      run,
      created: run.created,
      updated: run.updated,
      unchanged: run.unchanged,
      total: run.total,
      error: run.error,
    },
    { status: run.status === "completed" ? 200 : 500 },
  );
}

