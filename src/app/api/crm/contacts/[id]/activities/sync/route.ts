import { NextResponse } from "next/server";
import { syncEmailsForContact } from "@/lib/crm/gmailSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contactId } = await params;
    if (!contactId) {
      return NextResponse.json({ error: "contactId is required" }, { status: 400 });
    }

    const result = await syncEmailsForContact(contactId);

    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
      synced: result.synced,
      created: result.created,
      errors: result.errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
