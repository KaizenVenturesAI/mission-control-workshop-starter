import path from "path";
import { NextResponse } from "next/server";
import { getAccounts, updateAccount } from "@/lib/crm/store";
import { getSupabaseAccounts, updateSupabaseAccount } from "@/lib/crm/supabaseStore";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { CRMRecordAsset } from "@/data/accounts";

export const dynamic = "force-dynamic";

const PUBLIC_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "crm-assets");
const SUPABASE_BUCKET = "crm-assets";

function safeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "asset";
}

function assetKind(fileName: string, isLogo: boolean): CRMRecordAsset["kind"] {
  if (isLogo) return "logo";
  if (/\.(png|jpe?g|webp|gif|svg|heic)$/i.test(fileName)) return "image";
  if (/\.(pdf|docx?|pptx?|xlsx?)$/i.test(fileName)) return "document";
  return "other";
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const accountId = String(form.get("accountId") || "");
    const label = String(form.get("label") || "");
    const isLogo = String(form.get("isLogo") || "") === "true";
    const file = form.get("file");

    if (!accountId || !(file instanceof File)) {
      return NextResponse.json({ error: "accountId and file are required" }, { status: 400 });
    }

    const account = shouldUseSupabaseBackend()
      ? (await getSupabaseAccounts({ includeMerged: true })).find((item) => item.id === accountId)
      : getAccounts({ includeMerged: true }).find((item) => item.id === accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const originalName = file.name || "asset";
    const ext = path.extname(originalName);
    const base = safeSegment(path.basename(originalName, ext));
    const stampedName = `${Date.now()}-${base}${ext.toLowerCase()}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    let assetUrl = `/uploads/crm-assets/${safeSegment(accountId)}/${stampedName}`;
    let storagePath: string | undefined;
    if (shouldUseSupabaseBackend()) {
      storagePath = `${safeSegment(accountId)}/${stampedName}`;
      const supabase = createServiceSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;
      const { data: signed, error: signedError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      if (signedError) throw signedError;
      assetUrl = signed.signedUrl;
    } else {
      const nodeRequire = eval("require") as NodeRequire;
      const { mkdirSync, writeFileSync } = nodeRequire("fs") as typeof import("fs");
      const uploadDir = path.join(PUBLIC_UPLOAD_ROOT, safeSegment(accountId));
      mkdirSync(uploadDir, { recursive: true });
      writeFileSync(path.join(uploadDir, stampedName), bytes);
    }

    const asset: CRMRecordAsset = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: label.trim() || originalName,
      fileName: originalName,
      url: `/uploads/crm-assets/${safeSegment(accountId)}/${stampedName}`,
      kind: assetKind(originalName, isLogo),
      mimeType: file.type || undefined,
      source: "Manual Upload",
      createdAt: new Date().toISOString(),
      ...(storagePath ? { sourceUrl: `supabase://${SUPABASE_BUCKET}/${storagePath}` } : {}),
    } as CRMRecordAsset;

    const assets = [...(account.assets ?? []), asset];
    const updates = {
      assets,
      logoAssetId: isLogo || !account.logoAssetId && asset.kind === "logo" ? asset.id : account.logoAssetId,
    };
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseAccount(accountId, updates)
      : updateAccount(accountId, updates);

    return NextResponse.json({ asset, account: updated }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const accountId = String(body?.accountId || "");
    const assetId = String(body?.assetId || "");
    if (!accountId || !assetId) {
      return NextResponse.json({ error: "accountId and assetId are required" }, { status: 400 });
    }

    const account = shouldUseSupabaseBackend()
      ? (await getSupabaseAccounts({ includeMerged: true })).find((item) => item.id === accountId)
      : getAccounts({ includeMerged: true }).find((item) => item.id === accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const asset = (account.assets ?? []).find((item) => item.id === assetId);
    const assets = (account.assets ?? []).filter((item) => item.id !== assetId);
    const fallbackLogo = assets.find((item) => item.kind === "logo") ?? assets.find((item) => item.kind === "image");
    const logoAssetId = account.logoAssetId === assetId ? fallbackLogo?.id : account.logoAssetId;
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseAccount(accountId, { assets, logoAssetId })
      : updateAccount(accountId, { assets, logoAssetId });

    if (shouldUseSupabaseBackend() && asset?.sourceUrl?.startsWith(`supabase://${SUPABASE_BUCKET}/`)) {
      const storagePath = asset.sourceUrl.replace(`supabase://${SUPABASE_BUCKET}/`, "");
      await createServiceSupabaseClient().storage.from(SUPABASE_BUCKET).remove([storagePath]);
    } else if (asset?.url?.startsWith("/uploads/crm-assets/")) {
      const nodeRequire = eval("require") as NodeRequire;
      const { existsSync, unlinkSync } = nodeRequire("fs") as typeof import("fs");
      const diskPath = path.join(process.cwd(), "public", asset.url.replace(/^\//, ""));
      if (diskPath.startsWith(PUBLIC_UPLOAD_ROOT) && existsSync(diskPath)) {
        try { unlinkSync(diskPath); } catch { /* best-effort */ }
      }
    }

    return NextResponse.json({ success: true, account: updated });
  } catch {
    return NextResponse.json({ error: "Invalid delete request" }, { status: 400 });
  }
}
