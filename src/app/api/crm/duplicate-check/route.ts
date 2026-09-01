import { NextResponse } from "next/server";
import { checkForDuplicates } from "@/lib/crm/duplicateCheck";

export const dynamic = "force-dynamic";

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 300) : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = cleanString(body?.email);
    const phone = cleanString(body?.phone);
    const contactName = cleanString(body?.contactName);
    const companyName = cleanString(body?.companyName);

    if (!email && !phone && !contactName && !companyName) {
      return NextResponse.json(
        { error: "At least one duplicate-check field is required" },
        { status: 400 },
      );
    }

    const result = checkForDuplicates({ email, phone, contactName, companyName });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
