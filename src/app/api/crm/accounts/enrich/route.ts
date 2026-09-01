import path from "path";
import { NextResponse } from "next/server";
import { getAccounts, getContacts, updateAccount } from "@/lib/crm/store";
import { getSupabaseAccounts, updateSupabaseAccount } from "@/lib/crm/supabaseStore";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { shouldUseSupabaseBackend } from "@/lib/supabase/env";
import type { Account, CRMRecordAsset } from "@/data/accounts";

export const dynamic = "force-dynamic";

const PUBLIC_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads", "crm-assets");
const SUPABASE_BUCKET = "crm-assets";
const MAX_LOGOS = 5;
const CONSUMER_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

type WebsiteCandidateSource = "existing" | "email-domain" | "company-name" | "name-and-email";

type PublicSearchInput = {
  url?: string;
  title?: string;
  snippet?: string;
  source?: string;
};

type LinkedInIntel = Pick<Account,
  | "linkedinUrl"
  | "linkedinDescription"
  | "employeeRange"
  | "associatedMembers"
  | "linkedinIndustry"
  | "linkedinHeadquarters"
  | "linkedinCompanyType"
  | "enrichmentSource"
  | "enrichmentConfidence"
  | "enrichedAt"
>;

function safeSegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "asset";
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function candidateDomainsFromName(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const legalSuffixes = new Set(["co", "company", "inc", "llc", "llp", "ltd", "corp", "corporation", "group", "usa", "us"]);
  const words = cleaned.split(/\s+/).filter((word) => word && !legalSuffixes.has(word));
  if (words.length === 0) return [];
  const joined = words.join("");
  const dashed = words.join("-");
  const firstTwo = words.slice(0, 2).join("");
  const compact = joined.replace(/and/g, "");
  return unique(
    [
      `${joined}.com`,
      `${joined}.co`,
      `${joined}.io`,
      `${joined}.app`,
      `${dashed}.com`,
      `${dashed}.co`,
      `${compact}.com`,
      `${firstTwo}.com`,
      words[0] ? `${words[0]}.com` : "",
      words[0] ? `${words[0]}.co` : "",
    ].filter(Boolean),
    (domain) => domain
  );
}

function linkedEmailDomains(account: Account): string[] {
  if (shouldUseSupabaseBackend()) return [];
  const contacts = getContacts({ includeMerged: true }).filter((contact) => contact.accountId === account.id);
  const domains = contacts.flatMap((contact) => contact.emails ?? [])
    .map((email) => email.split("@")[1]?.trim().toLowerCase())
    .filter((domain): domain is string => Boolean(domain && domain.includes(".")))
    .filter((domain) => !CONSUMER_EMAIL_DOMAINS.has(domain));
  return unique(domains, (domain) => domain);
}

function accountNameTokens(name: string): string[] {
  const stop = new Set(["and", "the", "of", "for", "la", "los", "angeles", "miami", "inc", "llc", "co", "company", "group"]);
  return unique(
    name
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stop.has(token)),
    (token) => token
  );
}

function compactAccountName(name: string): string {
  return accountNameTokens(name).join("");
}

function hasGeoConflict(accountName: string, finalUrl: string, html: string): boolean {
  const name = ` ${accountName.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const host = new URL(finalUrl).hostname.replace(/^www\./, "").toLowerCase();
  const haystack = `${host} ${stripHtml(html).slice(0, 900)}`.toLowerCase();
  const rules = [
    { wants: [" los angeles ", " la "], conflicts: ["nyc", "new york"] },
    { wants: [" new york ", " nyc "], conflicts: ["los angeles", " la "] },
    { wants: [" miami "], conflicts: ["los angeles", "new york", "nyc"] },
    { wants: [" fort lauderdale "], conflicts: ["los angeles", "new york", "nyc"] },
  ];
  return rules.some((rule) =>
    rule.wants.some((marker) => name.includes(marker)) &&
    rule.conflicts.some((conflict) => haystack.includes(conflict))
  );
}

function absoluteUrl(value: string, base: string): string | null {
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function unique<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return decodeHtml(match?.[1] ?? "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number.parseInt(dec, 10)));
}

function stripHtml(html: string): string {
  return decodeHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractMeta(html: string, baseUrl: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
  const description = decodeHtml(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ??
    ""
  );
  const linkedin = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|school)\/[^"'\s<)]+/i)?.[0];
  const text = stripHtml(html).slice(0, 2400);
  const logoCandidates: Array<{ url: string; label: string; score: number }> = [];

  for (const tag of html.matchAll(/<link[^>]+>/gi)) {
    const raw = tag[0];
    const rel = attr(raw, "rel").toLowerCase();
    const href = attr(raw, "href");
    if (!href) continue;
    const url = absoluteUrl(href, baseUrl);
    if (!url) continue;
    const score = rel.includes("apple-touch") ? 72 : rel.includes("icon") ? 62 : rel.includes("mask-icon") ? 56 : 0;
    if (score) logoCandidates.push({ url, label: rel.includes("apple") ? "Apple touch logo" : "Site icon", score });
  }

  for (const tag of html.matchAll(/<meta[^>]+>/gi)) {
    const raw = tag[0];
    const property = `${attr(raw, "property")} ${attr(raw, "name")}`.toLowerCase();
    const content = attr(raw, "content");
    if (!content || !/(og:image|twitter:image)/.test(property)) continue;
    const url = absoluteUrl(content, baseUrl);
    if (url) logoCandidates.push({ url, label: "Social preview image", score: 48 });
  }

  for (const tag of html.matchAll(/<img[^>]+>/gi)) {
    const raw = tag[0];
    const src = attr(raw, "src") || attr(raw, "data-src") || attr(raw, "data-lazy-src");
    if (!src) continue;
    const label = attr(raw, "alt") || path.basename(src.split("?")[0]) || "Website image";
    const haystack = `${src} ${label} ${attr(raw, "class")}`.toLowerCase();
    if (!/(logo|brand|mark|wordmark|lockup|navbar|header)/.test(haystack)) continue;
    const url = absoluteUrl(src, baseUrl);
    if (!url) continue;
    logoCandidates.push({ url, label: label.slice(0, 80), score: /logo|wordmark|lockup/.test(haystack) ? 95 : 68 });
  }

  return {
    title,
    description: description.replace(/\s+/g, " ").trim(),
    linkedin,
    text,
    logoCandidates: unique(logoCandidates.sort((a, b) => b.score - a.score), (item) => item.url).slice(0, MAX_LOGOS),
  };
}

async function fetchWebsite(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await fetch(normalizeUrl(url), {
      headers: { "User-Agent": "Example Client Mission Control CRM Enrichment/1.0" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    return { html: await response.text(), finalUrl: response.url || normalizeUrl(url) };
  } catch {
    return null;
  }
}

function scoreWebsiteCandidate(
  account: Account,
  finalUrl: string,
  html: string,
  source: WebsiteCandidateSource,
  emailDomains: string[]
): number {
  if (source === "existing") return 1000;
  const meta = extractMeta(html, finalUrl);
  const tokens = accountNameTokens(account.name);
  const compact = compactAccountName(account.name);
  const host = new URL(finalUrl).hostname.replace(/^www\./, "").toLowerCase();
  const hostCompact = host.split(".")[0].replace(/[^a-z0-9]/g, "");
  const haystack = `${meta.title ?? ""} ${meta.description} ${meta.text}`.toLowerCase();
  let score = source === "name-and-email" ? 70 : source === "email-domain" ? 48 : 36;
  let nameEvidence = false;
  let hostNameEvidence = false;
  let hostTokenMatches = 0;
  let exactPhraseEvidence = false;

  if (emailDomains.includes(host)) score += 38;
  if (compact && hostCompact.includes(compact)) {
    score += 55;
    nameEvidence = true;
    hostNameEvidence = true;
  }
  if (compact && compact.includes(hostCompact) && hostCompact.length >= 5) {
    score += 24;
    nameEvidence = true;
    hostNameEvidence = true;
  }
  for (const token of tokens) {
    if (hostCompact.includes(token)) {
      score += 18;
      nameEvidence = true;
      hostNameEvidence = true;
      hostTokenMatches += 1;
    }
    if (haystack.includes(token)) {
      score += 10;
      nameEvidence = true;
    }
  }
  if (tokens.length >= 2 && haystack.includes(tokens.join(" "))) {
    score += 36;
    nameEvidence = true;
    exactPhraseEvidence = true;
  }
  if (!nameEvidence && source === "email-domain") score -= 45;
  if (!nameEvidence && source === "company-name") score -= 60;
  if (!hostNameEvidence && source === "email-domain") score = Math.min(score, 39);
  if (source === "company-name" && tokens.length >= 2 && hostTokenMatches < 2 && !exactPhraseEvidence) score = Math.min(score, 39);
  if (hasGeoConflict(account.name, finalUrl, html)) return -1000;
  if (/(parked domain|domain is for sale|buy this domain)/i.test(haystack)) score -= 90;
  if (/(linkedin|facebook|instagram|twitter|x.com)/i.test(host)) score -= 30;
  return score;
}

async function resolveWebsite(account: Account): Promise<{ website: string; html: string; source: WebsiteCandidateSource; score: number } | null> {
  const emailDomains = linkedEmailDomains(account);
  const nameDomains = candidateDomainsFromName(account.name);
  const emailSet = new Set(emailDomains);
  const candidates = unique(
    [
      ...(account.website ? [{ url: normalizeUrl(account.website), source: "existing" as const }] : []),
      ...emailDomains.flatMap((domain) => [
        { url: `https://${domain}`, source: "email-domain" as const },
        { url: `https://www.${domain}`, source: "email-domain" as const },
      ]),
      ...nameDomains.flatMap((domain) => [
        { url: `https://${domain}`, source: emailSet.has(domain) ? "name-and-email" as const : "company-name" as const },
        { url: `https://www.${domain}`, source: emailSet.has(domain) ? "name-and-email" as const : "company-name" as const },
      ]),
    ],
    (candidate) => candidate.url
  ).slice(0, 28);

  const scored: Array<{ website: string; html: string; source: WebsiteCandidateSource; score: number }> = [];
  for (const candidate of candidates) {
    const fetched = await fetchWebsite(candidate.url);
    if (!fetched) continue;
    scored.push({
      website: fetched.finalUrl,
      html: fetched.html,
      source: candidate.source,
      score: scoreWebsiteCandidate(account, fetched.finalUrl, fetched.html, candidate.source, emailDomains),
    });
  }

  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best) return null;
  return best.source === "existing" || best.score >= 40 ? best : null;
}

function inferCategory(text: string): { category?: string; industry?: string; interests: string[]; fit: string[] } {
  const lower = text.toLowerCase();
  if (/(tennis|pickleball|padel|racquet|racket|sports club|athlete|league|tournament)/.test(lower)) {
    return {
      category: "Sports / Recreation",
      industry: "Sports / Recreation",
      interests: ["Brand Partnership", "Tournaments"],
      fit: ["direct racket-sports audience overlap", "event programming", "media or tournament partnership angles"],
    };
  }
  if (/(wellness|health|hydration|supplement|recovery|fitness|pilates|yoga|cold plunge|iv)/.test(lower)) {
    return {
      category: "Wellness / CPG",
      industry: "Wellness / Fitness",
      interests: ["Brand Partnership", "Open Play"],
      fit: ["wellness audience overlap", "member experience add-ons", "event sampling or recovery activations"],
    };
  }
  if (/(beverage|drink|coffee|water|juice|snack|food|protein|cpg|restaurant|açaí|acai)/.test(lower)) {
    return {
      category: "Food & Beverage / CPG",
      industry: "Food & Beverage / CPG",
      interests: ["Brand Partnership", "Mission Control Build"],
      fit: ["on-site sampling", "tournament/event sponsorship", "hospitality for leagues and corporate events"],
    };
  }
  if (/(hotel|resort|venue|hospitality|restaurant|club)/.test(lower)) {
    return {
      category: "Hospitality / Venue",
      industry: "Hospitality",
      interests: ["Mission Control Build", "Brand Partnership"],
      fit: ["private event programming", "guest experiences", "co-branded agentic systems activations"],
    };
  }
  if (/(apparel|fashion|activewear|sportswear|gear|equipment)/.test(lower)) {
    return {
      category: "Apparel / Equipment",
      industry: "Apparel / Sporting Goods",
      interests: ["Brand Partnership", "Tournaments"],
      fit: ["athlete/content partnerships", "tournament visibility", "community-driven retail activations"],
    };
  }
  return {
    category: undefined,
    industry: undefined,
    interests: ["Brand Partnership"],
    fit: ["community activation", "corporate event programming", "co-marketing with Example Client's agentic systems audience"],
  };
}

function normalizeLinkedInUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school)\/[^\s"'<>),]+/i);
  if (!match) return undefined;
  return match[0].replace(/[.,;:]+$/, "");
}

function parsePublicLinkedInIntel(account: Account, meta: ReturnType<typeof extractMeta>, publicSearchResults: PublicSearchInput[]): LinkedInIntel {
  const sources = publicSearchResults
    .filter((item) => item && (item.url || item.title || item.snippet))
    .map((item) => `${item.source || "public-search"}: ${item.url || item.title || item.snippet}`.slice(0, 260));
  const publicText = publicSearchResults
    .map((item) => [item.title, item.snippet, item.url].filter(Boolean).join(" — "))
    .join("\n");
  const text = `${publicText}\n${meta.description}\n${meta.text.slice(0, 1200)}`;
  const linkedinUrl = normalizeLinkedInUrl(meta.linkedin || account.linkedinUrl || publicText) ?? account.linkedinUrl;
  const employeeRange = text.match(/(\b\d{1,3}(?:,\d{3})?\s*-\s*\d{1,3}(?:,\d{3})?\s+employees\b)/i)?.[1]?.replace(/\s+/g, " ");
  const associatedMembersRaw = text.match(/(\d{1,4})\s+associated\s+members/i)?.[1];
  const associatedMembers = associatedMembersRaw ? Number.parseInt(associatedMembersRaw, 10) : undefined;
  const linkedinIndustry = text.match(/Industry\s*[:：-]?\s*([^\n•|]+?)(?:\s{2,}|Company size|Headquarters|Type|$)/i)?.[1]?.trim();
  const linkedinHeadquarters = text.match(/Headquarters\s*[:：-]?\s*([^\n•|]+?)(?:\s{2,}|Type|Industry|Company size|$)/i)?.[1]?.trim();
  const linkedinCompanyType = text.match(/Type\s*[:：-]?\s*([^\n•|]+?)(?:\s{2,}|Founded|Specialties|Industry|$)/i)?.[1]?.trim();
  const description = meta.description || publicSearchResults.find((item) => item.snippet && !/linkedin\.com/i.test(item.snippet))?.snippet || undefined;
  const hasLinkedInSpecificData = Boolean(employeeRange || associatedMembers || linkedinIndustry || linkedinHeadquarters || linkedinCompanyType);
  const confidence: Account["enrichmentConfidence"] = hasLinkedInSpecificData && linkedinUrl ? "high" : linkedinUrl || description ? "medium" : "low";

  const intel: LinkedInIntel = {
    linkedinUrl,
    linkedinDescription: description?.replace(/\s+/g, " ").trim().slice(0, 700),
    employeeRange,
    associatedMembers: Number.isFinite(associatedMembers) ? associatedMembers : undefined,
    linkedinIndustry,
    linkedinHeadquarters,
    linkedinCompanyType,
    enrichmentSource: sources.length > 0 ? sources.join(" | ") : meta.linkedin ? `Website public link: ${meta.linkedin}` : `Website metadata: ${account.website || "unknown"}`,
    enrichmentConfidence: confidence,
    enrichedAt: new Date().toISOString(),
  };
  return Object.fromEntries(Object.entries(intel).filter(([, value]) => value !== undefined && value !== "")) as LinkedInIntel;
}

function buildSummary(account: Account, meta: ReturnType<typeof extractMeta>) {
  const sourceText = `${meta.title ?? ""}. ${meta.description}. ${meta.text}`;
  const inferred = inferCategory(sourceText);
  const description = meta.description || meta.text.split(". ").slice(0, 2).join(". ").slice(0, 360);
  const fit = inferred.fit.join("; ");
  const lines = [
    "AI Enrichment Brief",
    `Source: ${account.website}`,
    meta.linkedin ? `LinkedIn: ${meta.linkedin}` : "LinkedIn: not found on website",
    "",
    `Context: ${description || `${account.name} appears relevant to Example Client's CRM pipeline.`}`,
    `Example Client relevance: ${fit}.`,
  ];
  return { notesBlock: lines.join("\n"), inferred };
}

function extFromContentType(contentType: string, url: string): string {
  const fromUrl = path.extname(new URL(url).pathname);
  if (fromUrl && fromUrl.length <= 6) return fromUrl.toLowerCase();
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("gif")) return ".gif";
  return ".png";
}

async function downloadLogo(accountId: string, candidate: { url: string; label: string }, index: number): Promise<CRMRecordAsset | null> {
  const response = await fetch(candidate.url, {
    headers: { "User-Agent": "Example Client Mission Control CRM Enrichment/1.0" },
    redirect: "follow",
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^image\//i.test(contentType)) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 120 || buffer.length > 5_000_000) return null;

  const ext = extFromContentType(contentType, candidate.url);
  const sourceName = path.basename(new URL(candidate.url).pathname, path.extname(new URL(candidate.url).pathname)) || `logo-${index + 1}`;
  const fileName = `${safeSegment(sourceName)}${ext}`;
  const stampedName = `${Date.now()}-${index + 1}-${fileName}`;
  let url = `/uploads/crm-assets/${safeSegment(accountId)}/${stampedName}`;
  let sourceUrl = candidate.url;
  if (shouldUseSupabaseBackend()) {
    const storagePath = `${safeSegment(accountId)}/${stampedName}`;
    const supabase = createServiceSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(storagePath, buffer, { contentType: contentType.split(";")[0] || "image/png", upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signedError) throw signedError;
    url = signed.signedUrl;
    sourceUrl = `supabase://${SUPABASE_BUCKET}/${storagePath}`;
  } else {
    const nodeRequire = eval("require") as NodeRequire;
    const { mkdirSync, writeFileSync } = nodeRequire("fs") as typeof import("fs");
    const uploadDir = path.join(PUBLIC_UPLOAD_ROOT, safeSegment(accountId));
    mkdirSync(uploadDir, { recursive: true });
    writeFileSync(path.join(uploadDir, stampedName), buffer);
  }

  return {
    id: `asset-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    label: candidate.label || fileName,
    fileName,
    url,
    kind: "logo",
    mimeType: contentType.split(";")[0],
    source: "AI Enrichment",
    sourceUrl,
    createdAt: new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const publicSearchResults = Array.isArray(body?.publicSearchResults) ? body.publicSearchResults as PublicSearchInput[] : [];
    const accountId = String(body?.accountId || "");
    if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

    const account = shouldUseSupabaseBackend()
      ? (await getSupabaseAccounts({ includeMerged: true })).find((item) => item.id === accountId)
      : getAccounts({ includeMerged: true }).find((item) => item.id === accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const resolved = await resolveWebsite(account);
    if (!resolved) {
      return NextResponse.json(
        { error: "Could not discover a usable website from this account name or linked contact emails" },
        { status: 404 }
      );
    }

    const finalUrl = resolved.website;
    const meta = extractMeta(resolved.html, finalUrl);
    const accountWithWebsite = { ...account, website: finalUrl };
    const linkedInIntel = parsePublicLinkedInIntel(accountWithWebsite, meta, publicSearchResults);
    const { notesBlock, inferred } = buildSummary(accountWithWebsite, meta);

    const existingAssets = account.assets ?? [];
    const existingSourceUrls = new Set(existingAssets.map((asset) => asset.sourceUrl || asset.url));
    const logoAssets: CRMRecordAsset[] = [];
    for (const candidate of meta.logoCandidates) {
      if (existingSourceUrls.has(candidate.url)) continue;
      try {
        const asset = await downloadLogo(account.id, candidate, logoAssets.length);
        if (asset) {
          logoAssets.push(asset);
          existingSourceUrls.add(candidate.url);
        }
      } catch {
        // Keep enrichment useful even when one image blocks hotlinking.
      }
      if (logoAssets.length >= MAX_LOGOS) break;
    }

    const existingNotes = account.notes ?? "";
    const notes = existingNotes.includes("AI Enrichment Brief") || existingNotes.includes("AI Web Enrichment")
      ? existingNotes
      : [existingNotes.trim(), notesBlock].filter(Boolean).join("\n\n---\n\n");
    const mergedInterests = Array.from(new Set([...(account.interests ?? []), ...inferred.interests]));
    const assets = [...existingAssets, ...logoAssets];
    const logoAssetId = account.logoAssetId ?? logoAssets[0]?.id;
    const updates = {
      website: finalUrl,
      notes,
      category: account.category || inferred.category,
      industry: account.industry || inferred.industry,
      interests: mergedInterests,
      assets,
      logoAssetId,
      ...linkedInIntel,
    };
    const updated = shouldUseSupabaseBackend()
      ? await updateSupabaseAccount(account.id, updates)
      : updateAccount(account.id, updates);

    return NextResponse.json({
      account: updated,
      summary: notesBlock,
      discoveredWebsite: finalUrl,
      websiteSource: resolved.source,
      linkedin: linkedInIntel.linkedinUrl ?? meta.linkedin,
      enrichmentConfidence: linkedInIntel.enrichmentConfidence,
      logoCandidates: meta.logoCandidates.length,
      logosImported: logoAssets.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enrichment failed" }, { status: 500 });
  }
}
