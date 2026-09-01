#!/usr/bin/env tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { brandBriefSchema, type BrandBrief } from "./brand-brief.schema";

type PlanEntry = { path: string; action: "write" | "copy" | "generate" | "delete" | "report"; detail: string; sha256?: string };

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const briefArg = process.argv.find((arg) => arg.startsWith("--brief="));
const dryRun = args.has("--dry-run");
const allowDemoAssets = args.has("--allow-demo-assets");
const allowLowResolutionAssets = args.has("--allow-low-resolution-assets");
const exportDirArg = process.argv.find((arg) => arg.startsWith("--export-dir="));

function usage(): never {
  console.error("Usage: npm run bootstrap:client -- --brief=path/to/brief.json [--dry-run] [--allow-demo-assets] [--allow-low-resolution-assets] [--export-dir=../client-export]");
  process.exit(1);
}

if (!briefArg) usage();
const briefPath = path.resolve(root, briefArg.slice("--brief=".length));

function readBrief(filePath: string): BrandBrief {
  const raw = fs.readFileSync(path.resolve(root, filePath), "utf8");
  return brandBriefSchema.parse(JSON.parse(raw));
}

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function validateSvg(filePath: string): { width: number; height: number; transparent: boolean } {
  const text = fs.readFileSync(filePath, "utf8");
  if (!/<svg\b/i.test(text)) throw new Error(`${filePath} is not an SVG.`);
  const width = Number(text.match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
  const height = Number(text.match(/\bheight=["']?(\d+)/i)?.[1] ?? 0);
  const viewBox = text.match(/\bviewBox=["'][^"']+["']/i);
  if ((!width || !height) && !viewBox) throw new Error(`${filePath} must declare width/height or viewBox.`);
  return { width, height, transparent: !/<rect[^>]+width=["']?100%["']?[^>]+fill=/i.test(text) };
}

function validatePng(filePath: string): { width: number; height: number; transparent: boolean } {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`${filePath} is not a PNG.`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer.readUInt8(25);
  return { width, height, transparent: colorType === 4 || colorType === 6 };
}

function validateAsset(assetPath: string, minWidth: number, minHeight: number) {
  const absolute = path.resolve(root, assetPath);
  if (!fs.existsSync(absolute)) throw new Error(`Asset not found: ${assetPath}`);
  const ext = path.extname(absolute).toLowerCase();
  const meta = ext === ".svg" ? validateSvg(absolute) : ext === ".png" ? validatePng(absolute) : null;
  if (!meta) throw new Error(`${assetPath} must be SVG or PNG.`);
  const belowMinimum = Boolean((meta.width && meta.width < minWidth) || (meta.height && meta.height < minHeight));
  if (belowMinimum && !allowLowResolutionAssets) {
    throw new Error(`${assetPath} dimensions ${meta.width}x${meta.height} are below the required ${minWidth}x${minHeight}.`);
  }
  return { sourcePath: path.relative(root, absolute), absolute, ext, ...meta, minWidth, minHeight, belowMinimum, sha256: sha256(absolute) };
}

function writeFile(plan: PlanEntry[], relPath: string, content: string) {
  plan.push({ path: relPath, action: "write", detail: `${Buffer.byteLength(content)} bytes` });
  if (dryRun) return;
  fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
  fs.writeFileSync(path.join(root, relPath), content);
}

function copyFile(plan: PlanEntry[], source: string, relPath: string, hash: string) {
  plan.push({ path: relPath, action: "copy", detail: `from ${path.relative(root, source)}`, sha256: hash });
  if (dryRun) return;
  fs.mkdirSync(path.dirname(path.join(root, relPath)), { recursive: true });
  fs.copyFileSync(source, path.join(root, relPath));
}

function removeFile(plan: PlanEntry[], relPath: string, retainedPaths: Set<string>) {
  if (retainedPaths.has(relPath) || !fs.existsSync(path.join(root, relPath))) return;
  plan.push({ path: relPath, action: "delete", detail: "superseded starter or mismatched-format asset" });
  if (!dryRun) fs.rmSync(path.join(root, relPath));
}

async function generateIcon(plan: PlanEntry[], source: string, relPath: string, size: number) {
  const entry: PlanEntry = { path: relPath, action: "generate", detail: `${size}x${size} transparent PNG from ${path.relative(root, source)}` };
  plan.push(entry);
  if (dryRun) return;
  const destination = path.join(root, relPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await sharp(source)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(destination);
  entry.sha256 = sha256(destination);
}

function brandConfig(brief: BrandBrief, logoPath: string, socialPath: string): string {
  return `import { z } from "zod";

export const clientBrandSchema = z.object({
  clientName: z.string().min(2),
  legalName: z.string().min(2),
  productName: z.string().min(2),
  tagline: z.string().min(8),
  audience: z.string().min(8),
  tone: z.array(z.string()).min(1),
  shortName: z.string().min(2).max(24),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/),
  repositoryName: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$/),
  initials: z.string().regex(/^[A-Z0-9]{2,4}$/),
  description: z.string().min(12),
  baseUrl: z.string().url(),
  supportEmail: z.string().email(),
  typography: z.object({ sans: z.string(), mono: z.string() }),
  colors: z.object({
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    border: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textSecondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentSecondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  assets: z.object({
    logoPath: z.string(),
    ogImagePath: z.string(),
    icon192Path: z.string(),
    icon512Path: z.string(),
    appleTouchIconPath: z.string(),
    attribution: z.string(),
    license: z.string(),
  }),
});

export type ClientBrandConfig = z.infer<typeof clientBrandSchema>;

export const clientBrand = clientBrandSchema.parse(${JSON.stringify({
    clientName: brief.company.displayName,
    legalName: brief.company.legalName,
    productName: brief.product.name,
    tagline: brief.product.tagline,
    audience: brief.product.audience,
    tone: brief.product.tone,
    shortName: brief.company.shortName,
    slug: brief.company.slug,
    repositoryName: brief.company.repositoryName,
    initials: brief.brand.initials,
    description: brief.product.tagline,
    baseUrl: brief.product.baseUrl,
    supportEmail: brief.product.supportEmail,
    typography: brief.brand.typography,
    colors: {
      background: brief.brand.colors.background,
      surface: brief.brand.colors.surface,
      border: brief.brand.colors.border,
      text: brief.brand.colors.text,
      textSecondary: brief.brand.colors.textSecondary,
      accent: brief.brand.colors.primary,
      accentSecondary: brief.brand.colors.secondary,
    },
    assets: {
      logoPath,
      ogImagePath: socialPath,
      icon192Path: "/icons/icon-192.png",
      icon512Path: "/icons/icon-512.png",
      appleTouchIconPath: "/icons/apple-touch-icon.png",
      attribution: brief.assets.attribution,
      license: brief.assets.license,
    },
  }, null, 2)});
`;
}

function manifestJson(brief: BrandBrief): string {
  return `${JSON.stringify({
    name: `${brief.company.displayName} ${brief.product.name}`,
    short_name: brief.product.name,
    description: brief.product.tagline,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: brief.brand.colors.background,
    theme_color: brief.brand.colors.primary,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }, null, 2)}\n`;
}

function packageJson(brief: BrandBrief): string {
  const current = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  current.name = brief.company.repositoryName;
  return `${JSON.stringify(current, null, 2)}\n`;
}

function envExample(brief: BrandBrief): string {
  return `# Copy to .env.local for local development. Never commit real values.

MISSION_CONTROL_USERNAME=operator@${brief.company.slug}.example
MISSION_CONTROL_PASSWORD=
MISSION_CONTROL_SESSION_SECRET=
NEXT_PUBLIC_BASE_URL=${brief.product.baseUrl}

# Optional integrations are intentionally blank until client-owned credentials exist.
MISSION_CONTROL_SYNC_SECRET=
OPENCLAW_BIN=
OPENCLAW_AGENT_ENDPOINT=
OPENCLAW_AGENT_TOKEN=
`;
}

function localUsersJson(brief: BrandBrief): string {
  return `${JSON.stringify([{
    id: "user-client-operator",
    email: `operator@${brief.company.slug}.example`,
    name: `${brief.company.shortName} Operator`,
    role_id: "role-admin",
    status: "active",
    invited_by: "system",
    invited_at: "2026-01-01T00:00:00.000Z",
    last_login: null,
    created_at: "2026-01-01T00:00:00.000Z",
  }], null, 2)}\n`;
}

function reportMarkdown(brief: BrandBrief, plan: PlanEntry[], assetEvidence: unknown, productionReady: boolean): string {
  const hasLowResolutionAssets = Object.values(assetEvidence as Record<string, unknown>)
    .some((value) => typeof value === "object" && value !== null && "belowMinimum" in value && value.belowMinimum === true);
  return `# White-Label Handoff Report

Client: ${brief.company.displayName}
Product: ${brief.product.name}
Repository: ${brief.company.repositoryName}
Dry run: ${dryRun ? "yes" : "no"}
Estimated operator time: 15-25 minutes after approved assets are available
Operator steps: 6
Production ready: ${productionReady ? "yes, subject to deployment/security configuration" : allowDemoAssets ? "no — demo assets are for fictional dry runs only" : hasLowResolutionAssets ? "no — replace undersized source assets before production" : "no"}

## Evidence
- Brand brief validated as structured input.
- Asset provenance and hashes recorded.
- Low-resolution exceptions never improve source quality; generated icons/previews are layout derivatives only.
- Config writes are path-scoped and idempotent.
- Optional modules remain disabled/not configured unless the brief enables them.
- Run \`npm run template:scan\`, \`npm run typecheck\`, \`npm run lint\`, \`npm run test\`, and \`npm run build\` before handoff.
- For client export, create a fresh repository from the export directory with a new initial commit so canonical history is not exposed.

## Visual QA Checklist
- Desktop dashboard renders without missing logo, favicon, or social-preview references.
- Mobile navigation opens and displays the client mark and product name.
- Login screen uses client initials, approved product copy, and no prior-client language.
- Primary semantic colors meet contrast expectations against background and surface tokens.
- Browser manifest resolves the generated app icons.

## Asset Evidence
\`\`\`json
${JSON.stringify(assetEvidence, null, 2)}
\`\`\`

## Planned Changes
${plan.map((entry) => `- ${entry.action}: ${entry.path} (${entry.detail}${entry.sha256 ? `, sha256=${entry.sha256}` : ""})`).join("\n")}
`;
}

async function main() {
const started = Date.now();
const brief = readBrief(briefPath);
const requiredAssets = [brief.assets.logo, brief.assets.favicon, brief.assets.socialPreview].filter(Boolean);
if (!allowDemoAssets && requiredAssets.length < 3) {
  throw new Error("Production bootstrap requires logo, favicon, and socialPreview assets. Use --allow-demo-assets only for fictional dry runs.");
}

const logo = brief.assets.logo ? validateAsset(brief.assets.logo, 128, 64) : validateAsset("public/brand/starter-logo.svg", 128, 64);
const favicon = brief.assets.favicon ? validateAsset(brief.assets.favicon, 180, 180) : validateAsset("public/icons/icon-512.svg", 180, 180);
const social = brief.assets.socialPreview ? validateAsset(brief.assets.socialPreview, 1200, 630) : validateAsset("public/brand/starter-og.svg", 1200, 630);
const assetEvidence = {
  logo: { sourcePath: logo.sourcePath, ext: logo.ext, width: logo.width, height: logo.height, transparent: logo.transparent, minimum: `${logo.minWidth}x${logo.minHeight}`, belowMinimum: logo.belowMinimum, sha256: logo.sha256 },
  favicon: { sourcePath: favicon.sourcePath, ext: favicon.ext, width: favicon.width, height: favicon.height, transparent: favicon.transparent, minimum: `${favicon.minWidth}x${favicon.minHeight}`, belowMinimum: favicon.belowMinimum, sha256: favicon.sha256 },
  social: { sourcePath: social.sourcePath, ext: social.ext, width: social.width, height: social.height, transparent: social.transparent, minimum: `${social.minWidth}x${social.minHeight}`, belowMinimum: social.belowMinimum, sha256: social.sha256 },
  license: brief.assets.license,
  attribution: brief.assets.attribution,
};
const hasLowResolutionAssets = [logo, favicon, social].some((asset) => asset.belowMinimum);
const productionReady = !allowDemoAssets && !hasLowResolutionAssets && requiredAssets.length === 3;
if (exportDirArg && !productionReady) {
  throw new Error("Client export requires complete, production-resolution client assets; demo or low-resolution exceptions cannot be exported.");
}

const plan: PlanEntry[] = [];
const logoOutput = `public/brand/client-logo${logo.ext}`;
const socialOutput = `public/brand/client-og${social.ext}`;
const logoPublicPath = `/${logoOutput.slice("public/".length)}`;
const socialPublicPath = `/${socialOutput.slice("public/".length)}`;
writeFile(plan, "src/config/brand.ts", brandConfig(brief, logoPublicPath, socialPublicPath));
writeFile(plan, "package.json", packageJson(brief));
writeFile(plan, ".env.example", envExample(brief));
writeFile(plan, "src/data/settings-users.json", localUsersJson(brief));
writeFile(plan, "public/manifest.webmanifest", manifestJson(brief));
copyFile(plan, logo.absolute, logoOutput, logo.sha256);
copyFile(plan, social.absolute, socialOutput, social.sha256);
await generateIcon(plan, favicon.absolute, "public/icons/icon-192.png", 192);
await generateIcon(plan, favicon.absolute, "public/icons/icon-512.png", 512);
await generateIcon(plan, favicon.absolute, "public/icons/apple-touch-icon.png", 180);
const retainedAssetPaths = new Set([logoOutput, socialOutput, "public/icons/icon-192.png", "public/icons/icon-512.png", "public/icons/apple-touch-icon.png"]);
for (const staleAsset of [
  "public/brand/starter-logo.svg",
  "public/brand/starter-og.svg",
  "public/brand/client-logo.svg",
  "public/brand/client-logo.png",
  "public/brand/client-og.svg",
  "public/brand/client-og.png",
  "public/icons/icon-192.svg",
  "public/icons/icon-512.svg",
  "public/icons/apple-touch-icon.svg",
]) removeFile(plan, staleAsset, retainedAssetPaths);

void started;
const report = reportMarkdown(brief, plan, assetEvidence, productionReady);
const { prohibitedTerms, ...reportBrand } = brief.brand;
const reportBrief = { ...brief, brand: reportBrand };
writeFile(plan, `scripts/reports/${brief.company.slug}-handoff.md`, report);
writeFile(plan, `scripts/reports/${brief.company.slug}-handoff.json`, `${JSON.stringify({ brief: reportBrief, prohibitedTermCount: prohibitedTerms.length, dryRun, productionReady, plan, assetEvidence }, null, 2)}\n`);

if (exportDirArg && !dryRun) {
  const exportDir = path.resolve(root, exportDirArg.slice("--export-dir=".length));
  if (exportDir.startsWith(`${root}${path.sep}`)) {
    throw new Error("Client export directory must be outside the starter working directory.");
  }
  const excludedExportSources = new Set([briefPath, logo.absolute, favicon.absolute, social.absolute]);
  const excludedExportDirectories = new Set([".git", "node_modules", ".next", ".data", "coverage"]);
  fs.rmSync(exportDir, { recursive: true, force: true });
  fs.mkdirSync(exportDir, { recursive: true });
  fs.cpSync(root, exportDir, {
    recursive: true,
    filter: (source) => {
      const relativeParts = path.relative(root, source).split(path.sep).filter(Boolean);
      return !excludedExportSources.has(path.resolve(source))
        && !relativeParts.some((part) => excludedExportDirectories.has(part));
    },
  });
  plan.push({ path: exportDir, action: "report", detail: "fresh-history export directory created" });
}

console.log(report);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
