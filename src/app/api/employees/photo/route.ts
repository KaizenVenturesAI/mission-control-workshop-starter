import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

const PHOTO_DIR = path.resolve(process.cwd(), "public", "photos");

try { mkdirSync(PHOTO_DIR, { recursive: true }); } catch { /* exists */ }

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const personId = formData.get("personId") as string | null;

  if (!file || !personId) {
    return NextResponse.json({ error: "file and personId required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const allowed = ["jpg", "jpeg", "png", "webp"];
  if (!allowed.includes(ext)) {
    return NextResponse.json({ error: "Only jpg, png, webp allowed" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${personId}.${ext}`;
  writeFileSync(path.join(PHOTO_DIR, filename), buffer);

  return NextResponse.json({ url: `/photos/${filename}`, personId });
}
