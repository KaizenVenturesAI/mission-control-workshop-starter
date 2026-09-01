import { NextResponse } from "next/server";
import { runLeadCrmLinkageById, type LeadCrmLinkageMode } from "@/lib/crm/inboundLeadLinkage";

export const dynamic = "force-dynamic";

function resolveMode(value: unknown): LeadCrmLinkageMode {
  if (value === "apply-existing") return "apply-existing";
  if (value === "promote") return "promote";
  return "prepare";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const body = await request.json().catch(() => ({}));
    const mode = resolveMode(body?.mode);
    const options = {
      mergeContactId: typeof body?.mergeContactId === 'string' ? body.mergeContactId : undefined,
      mergeAccountId: typeof body?.mergeAccountId === 'string' ? body.mergeAccountId : undefined,
    };
    const result = runLeadCrmLinkageById(id, mode, options);

    if (!result) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json(result, { status: mode === "prepare" ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to evaluate CRM linkage";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
