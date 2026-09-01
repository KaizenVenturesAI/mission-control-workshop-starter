import { NextResponse } from "next/server";
import { readStore } from "@/lib/crm/store";
import { readSupabaseCrmStore } from "@/lib/crm/supabaseStore";
import { hasSupabaseServerConfig, shouldUseSupabaseBackend } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const useSupabase = shouldUseSupabaseBackend();
    const store = useSupabase ? await readSupabaseCrmStore() : readStore();

    return NextResponse.json(
      {
        status: "ok",
        backend: useSupabase ? "supabase" : "local-json",
        readModel: useSupabase ? "postgres" : "json",
        urlConfigured: hasSupabaseServerConfig().urlConfigured,
        secretConfigured: hasSupabaseServerConfig().serviceRoleConfigured,
        counts: {
          contacts: store.contacts.length,
          accounts: store.accounts.length,
          activities: store.activities.length,
          opportunities: store.opportunities.length,
        },
      },
      { headers: { "Cache-Control": "no-cache" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        status: "error",
        backend: "local-json",
        readModel: "json",
        error: message,
      },
      { status: 500, headers: { "Cache-Control": "no-cache" } },
    );
  }
}
