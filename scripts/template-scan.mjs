#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const SKIP_DIRS = new Set([".git", ".next", ".open-next", ".vercel", "node_modules", "coverage", "out", "build"]);
const SKIP_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".otf", ".lock", ".tsbuildinfo"]);
const SKIP_FILES = new Set(["package-lock.json", "next-env.d.ts"]);
const PATTERN_ALLOWLIST_FILES = new Set(["scripts/template-scan.mjs"]);
const CLIENT_ENDPOINT_FILES = new Set(["src/config/brand.ts", ".env.example"]);
const COLOR_ALLOWLIST_PREFIXES = ["src/components/", "src/app/", "src/modules/", "src/lib/", "src/config/", "src/data/", "public/", "docs/brand-brief.example.json", "scripts/reports/"];
const ENDPOINT_ALLOWLIST_PREFIXES = [
  "https://api.linear.app/",
  "https://slack.com/",
  "https://discord.com/",
  "https://api.canva.com/",
  "https://www.canva.com/",
  "https://mcp.plaud.ai/",
  "https://maps.googleapis.com/",
  "https://docs.google.com/",
  "https://www.notion.so/",
];

const SECRET_PATTERNS = [
  ["OpenAI API key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g],
  ["Supabase project URL", /https:\/\/[a-z0-9]{20}\.supabase\.co/g],
  ["Assigned secret literal", /\b(?:password|secret|token|private_key|client_secret)\s*[:=]\s*["'][^"'<>{}\s]{8,}["']/gi],
];

const FORBIDDEN_MARKERS = [
  ["Prior-client or owner marker", /(?:\bDigital[ _-]?Twin|\bdigitalxtwin\b|\b(?:Adrianna|Natalie|Gahl|IBL|Sava|Blake|Michelangelo|Olivia|clientbeachtennis)\b)/gi],
  ["Template-owner marker", /\b(?:Kaizen|kaizenventures|KaizenVenturesAI)\b/gi],
  ["Legacy persona marker", /Mission[ _-]?Agent[ _-]?Finch/gi],
  ["Legacy endpoint or inbox", /\b(?:savaventuresai\.com|digitalxtwin\.io|mission-control\.digitalxtwin\.io)\b/gi],
  ["Local machine marker", /\/Users\/(?:olivia|clientbeachtennis)|~\/\.openclaw/gi],
];

const ENDPOINT_PATTERNS = [
  ["Concrete production URL", /https:\/\/(?!localhost\b|example\.invalid\b|example\.com\b|api\.github\.com\b)[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi],
  ["Provider project identifier", /\b(?:vercel_project|supabase_project|cloudflare_account|ga_measurement_id|sentry_dsn)\b\s*[:=]/gi],
];

const PRIVATE_ARTIFACT_PATTERNS = [
  ["Tracked runtime data", /^\.data\//],
  ["Tracked env file", /^\.env(?!\.example$)/],
  ["Tracked local var file", /^\.dev\.vars/],
  ["Tracked upload", /^public\/uploads\//],
  ["Private artifact filename", /(?:screenshot|export|recording|transcript|customer|client)[-_ ].*\.(?:csv|xlsx|pdf|mp3|mp4|mov|png|jpg|jpeg)$/i],
];

const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}|\brgba?\([^)]*\)/g;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const rel = path.relative(root, fullPath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) yield* walk(fullPath);
      continue;
    }
    if (!stat.isFile()) continue;
    if (SKIP_FILES.has(rel)) continue;
    if (SKIP_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
    if (stat.size > 1_000_000) continue;
    yield rel;
  }
}

function lineFor(text, index) {
  return text.slice(0, index).split("\n").length;
}

function scanPatterns(relPath, text, patterns) {
  const findings = [];
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (label === "Assigned secret literal" && /["'](?:|<[^>]+>)["']$/.test(match[0])) continue;
      if (label === "Concrete production URL" && ENDPOINT_ALLOWLIST_PREFIXES.some((prefix) => match[0].startsWith(prefix))) continue;
      findings.push({ label, relPath, line: lineFor(text, match.index ?? 0) });
    }
  }
  return findings;
}

function scanFile(relPath) {
  const blockers = [];
  for (const [label, pattern] of PRIVATE_ARTIFACT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(relPath)) blockers.push({ label, relPath, line: 1 });
  }
  let text = "";
  try {
    text = readFileSync(path.join(root, relPath), "utf8");
  } catch {
    return blockers;
  }

  blockers.push(...scanPatterns(relPath, text, SECRET_PATTERNS));
  if (!PATTERN_ALLOWLIST_FILES.has(relPath)) {
    const isGeneratedHandoffReport = /^scripts\/reports\/[^/]+-handoff\.json$/.test(relPath);
    const markerText = relPath === "src/config/brand.ts" || isGeneratedHandoffReport
      ? text.replace(/("prohibitedTerms"\s*:\s*)\[[^\]]*\]/g, "$1[]")
      : text;
    blockers.push(...scanPatterns(relPath, markerText, FORBIDDEN_MARKERS));
    if (!CLIENT_ENDPOINT_FILES.has(relPath) && !isGeneratedHandoffReport) blockers.push(...scanPatterns(relPath, text, ENDPOINT_PATTERNS));
  }

  const colorsAllowed = COLOR_ALLOWLIST_PREFIXES.some((prefix) => relPath.startsWith(prefix));
  if (!colorsAllowed && !PATTERN_ALLOWLIST_FILES.has(relPath)) {
    COLOR_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(COLOR_PATTERN)) {
      blockers.push({ label: "Unapproved hard-coded color outside theme/config allowlist", relPath, line: lineFor(text, match.index ?? 0) });
    }
  }
  return blockers;
}

function readRecordCount(file, exportName) {
  const fullPath = path.join(root, file);
  try {
    const text = readFileSync(fullPath, "utf8");
    const marker = new RegExp(`export const ${exportName}[^=]*= \\[`, "m");
    if (!marker.test(text)) return "unknown";
    return (text.match(/\{\s*(?:"id"|id)\s*:/g) || []).length;
  } catch {
    return "missing";
  }
}

function main() {
  const files = [...walk(root)];
  const blockers = files.flatMap(scanFile);
  console.log("Template handoff scan");
  console.log("=====================");
  console.log(`Files scanned: ${files.length}`);
  console.log(`Blockers: ${blockers.length}`);
  console.log("");
  console.log("Documented allowlists");
  console.log("---------------------");
  console.log("- Pattern definitions: scripts/template-scan.mjs");
  console.log("- Transitional UI color files: src/components, src/modules, src/lib, src/app/globals.css");
  console.log("");
  console.log("Seed record counts");
  console.log("------------------");
  console.log(`contacts: ${readRecordCount("src/data/contacts.ts", "CONTACTS")}`);
  console.log(`accounts: ${readRecordCount("src/data/accounts.ts", "ACCOUNTS")}`);
  console.log(`opportunities: ${readRecordCount("src/data/opportunities.ts", "OPPORTUNITIES")}`);
  console.log(`activities: ${readRecordCount("src/data/crm-activities.ts", "CRM_ACTIVITIES")}`);
  console.log("");
  if (blockers.length) {
    console.log("Blocking findings");
    console.log("-----------------");
    for (const finding of blockers) console.log(`- ${finding.label}: ${finding.relPath}:${finding.line}`);
    console.error("Template scan failed. Remove blocking findings before handoff.");
    process.exit(1);
  }
  if (!existsSync(path.join(root, "src/config/brand.ts")) || !existsSync(path.join(root, "src/config/modules.ts"))) {
    console.error("Template scan failed. Missing typed brand or module config.");
    process.exit(1);
  }
  console.log("Template scan passed with no residue, secret, endpoint, private artifact, or disallowed color blockers.");
}

main();
