import "@/lib/localStorageShim";
import { nextActionItemId, readActionItems, writeActionItems } from "@/lib/action-items/store";
import { getMeetings } from "@/lib/meetings/store";
import { getRuns } from "@/lib/strategy/store";
import type { ActionItem } from "@/types/action-item";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  newBrainId,
  normalizeMemoryText,
  nowIso,
  readBrainStore,
  slugify,
  stableHash,
  updateBrainStore,
  writeBrainStore,
} from "./store";
import type {
  BrainClaim,
  BrainClaimType,
  BrainCompiledPage,
  BrainContextPack,
  BrainContradictionFinding,
  BrainDecision,
  BrainEntity,
  BrainFindingType,
  BrainImpactLevel,
  BrainLearningAppliedTo,
  BrainLearningSourceType,
  BrainPageType,
  BrainPromise,
  BrainRisk,
  BrainRiskSeverity,
  BrainReviewPriority,
  BrainSensitivityLevel,
  BrainSourceDocument,
  BrainSourceReference,
  BrainSourceType,
  BrainStore,
  BrainTargetSystem,
  BrainTrustStatus,
} from "./types";

const DEFAULT_DOMAINS = [
  "leadership",
  "pipeline",
  "agent_ops",
  "install_program",
  "referral_partnerships",
  "mission_control_builds",
  "delivery",
  "marketing",
  "finance",
  "systems",
];

const DEFAULT_PACKS = [
  { name: "Leadership Priorities Pack", slug: "leadership-priorities", domain: "leadership", audience: "leadership_agent", purpose: "Give leadership agents the current operating priorities.", tokenBudget: 1500 },
  { name: "Marketing Copy Pack", slug: "marketing-copy", domain: "marketing", audience: "marketing_agent", purpose: "Keep copy aligned with active brand rules and preferences.", tokenBudget: 1200 },
  { name: "Referral Partnerships Pack", slug: "referral-partnerships", domain: "referral_partnerships", audience: "sales_agent", purpose: "Summarize referral partner facts, risks, and decisions.", tokenBudget: 1500 },
  { name: "Mission Control Builds Pack", slug: "mission-control-builds", domain: "mission_control_builds", audience: "delivery_agent", purpose: "Support Mission Control build sales and delivery.", tokenBudget: 1500 },
  { name: "Agent Ops Pack", slug: "agent-ops", domain: "agent_ops", audience: "agent_ops_agent", purpose: "Keep Agent Ops facts, pricing, and risks current.", tokenBudget: 1500 },
  { name: "Pipeline Ops Pack", slug: "pipeline-ops", domain: "pipeline", audience: "sales_agent", purpose: "Summarize current pipeline operating details.", tokenBudget: 1500 },
  { name: "Founder Brief Pack", slug: "founder-brief", domain: "leadership", audience: "founder", purpose: "Give Alex a compact operating brief.", tokenBudget: 1800 },
  { name: "Agent Systems Pack", slug: "agent-systems", domain: "systems", audience: "agent_manager", purpose: "Coordinate agent behavior and unresolved learning events.", tokenBudget: 1500 },
];

const DEFAULT_OBSIDIAN_EXPORT_DIR = path.resolve(process.cwd(), "docs", "obsidian", "example-client-brain");

function byUpdatedAt<T extends { updated_at: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

function sameNullable(a: string | null, b: string | null): boolean {
  return (a ?? "") === (b ?? "");
}

function upsertFinding(store: BrainStore, finding: Omit<BrainContradictionFinding, "id" | "created_at" | "updated_at" | "status" | "resolved_by_entity_id" | "resolved_at" | "managerial_question" | "evidence_summary"> & {
  managerial_question?: string | null;
  evidence_summary?: string | null;
}): BrainContradictionFinding {
  const existing = store.contradictionFindings.find((item) =>
    item.finding_type === finding.finding_type &&
    item.domain === finding.domain &&
    sameNullable(item.entity_id, finding.entity_id) &&
    sameNullable(item.claim_a_id, finding.claim_a_id) &&
    sameNullable(item.claim_b_id, finding.claim_b_id) &&
    item.status !== "resolved" &&
    item.status !== "ignored"
  );
  const now = nowIso();
  if (existing) {
    Object.assign(existing, finding, {
      managerial_question: finding.managerial_question ?? existing.managerial_question,
      evidence_summary: finding.evidence_summary ?? existing.evidence_summary,
      updated_at: now,
    });
    return existing;
  }
  const created: BrainContradictionFinding = {
    ...finding,
    id: newBrainId("brain-finding"),
    status: "open",
    managerial_question: finding.managerial_question ?? null,
    evidence_summary: finding.evidence_summary ?? null,
    resolved_by_entity_id: null,
    resolved_at: null,
    created_at: now,
    updated_at: now,
  };
  store.contradictionFindings.unshift(created);
  return created;
}

function inferDomain(text: string): string {
  const normalized = normalizeMemoryText(text);
  if (normalized.includes("fit")) return "client_fit";
  if (normalized.includes("open play") || normalized.includes("6th street") || normalized.includes("12th street")) return "open_play";
  if (normalized.includes("partner") || normalized.includes("sponsor")) return "partnerships";
  if (normalized.includes("corporate") || normalized.includes("event")) return "corporate_events";
  if (normalized.includes("copy") || normalized.includes("brand") || normalized.includes("marketing")) return "marketing";
  if (normalized.includes("agent")) return "agent_ops";
  return "leadership";
}

function severityForFinding(type: BrainFindingType, domain: string): BrainRiskSeverity {
  if (type === "price_conflict" || type === "event_detail_conflict" || type === "location_conflict") return "high";
  if (type === "promise_without_task" && ["partnerships", "corporate_events"].includes(domain)) return "high";
  if (type === "missing_owner") return "medium";
  if (type === "stale_task") return "high";
  return "medium";
}

function reviewPriorityForRisk(severity: BrainRiskSeverity): BrainReviewPriority {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "low") return "low";
  return "medium";
}

function reviewPriorityForImpact(impact: BrainImpactLevel): BrainReviewPriority {
  if (impact === "critical") return "critical";
  if (impact === "high") return "high";
  if (impact === "low") return "low";
  return "medium";
}

function evidenceLabel(store: BrainStore, sourceId: string | null | undefined): string {
  if (!sourceId) return "No source document linked";
  const source = store.sourceDocuments.find((item) => item.id === sourceId);
  if (!source) return sourceId;
  const date = source.created_at_source?.slice(0, 10) ?? source.captured_at.slice(0, 10);
  return `${source.title} (${date})`;
}

function acceptedTrustStatuses(): BrainTrustStatus[] {
  return ["approved", "candidate"];
}

function isAcceptedTrust(status: BrainTrustStatus): boolean {
  return acceptedTrustStatuses().includes(status);
}

function domainLabel(domain: string): string {
  return domain.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recordEvidence(store: BrainStore, targetType: string, targetId: string, sourceId?: string | null) {
  const reference = store.sourceReferences.find((item) => item.target_type === targetType && item.target_id === targetId);
  const source = store.sourceDocuments.find((item) => item.id === (reference?.source_document_id ?? sourceId));
  return {
    sourceId: source?.id ?? sourceId ?? null,
    sourceTitle: source?.title ?? "No source document linked",
    sourceDate: source?.created_at_source?.slice(0, 10) ?? source?.captured_at.slice(0, 10) ?? null,
    sourceType: source?.source_type ?? null,
    quote: reference?.quote_text ?? null,
    confidence: reference?.confidence ?? null,
  };
}

function keywordHit(text: string, keywords: string[]): boolean {
  const normalized = normalizeMemoryText(text);
  return keywords.some((keyword) => normalized.includes(normalizeMemoryText(keyword)));
}

const BUSINESS_INITIATIVES = [
  { id: "agent_ops", name: "Agent Ops", domain: "agent_ops", keywords: ["agent ops", "managed agents", "operator"] },
  { id: "pipeline", name: "Pipeline Ops", domain: "pipeline", keywords: ["pipeline", "follow-up", "sales"] },
  { id: "delivery", name: "Delivery", domain: "delivery", keywords: ["install day", "delivery", "handoff"] },
  { id: "mission_control_builds", name: "Mission Control Builds", domain: "mission_control_builds", keywords: ["mission control", "build", "implementation"] },
  { id: "referral_partnerships", name: "Referral Partnerships", domain: "referral_partnerships", keywords: ["partner", "referral", "intro"] },
  { id: "systems", name: "Agent Systems", domain: "systems", keywords: ["agent", "mission control", "brain"] },
];

function initiativeMatchesText(initiative: (typeof BUSINESS_INITIATIVES)[number], text: string, domain?: string | null): boolean {
  return domain === initiative.domain || keywordHit(text, initiative.keywords);
}

function statusSummary(score: number): string {
  if (score >= 82) return "Ready to use";
  if (score >= 65) return "Mostly ready";
  if (score >= 45) return "Needs decisions";
  return "Not ready yet";
}

function topEvidenceForText(store: BrainStore, text: string, sourceId?: string | null): string {
  const label = evidenceLabel(store, sourceId);
  if (label !== "No source document linked") return label;
  const source = byUpdatedAt(store.sourceDocuments).find((item) => keywordHit(`${item.title} ${item.raw_text ?? ""}`, text.split(" ").slice(0, 6)));
  return source ? evidenceLabel(store, source.id) : label;
}

function buildReviewQueue(store: BrainStore) {
  return [
    ...store.claims.filter((item) => item.trust_status === "candidate").map((item) => ({
      id: item.id,
      recordType: "claim" as const,
      text: item.claim_text,
      domain: item.domain,
      priority: item.review_priority,
      confidence: item.confidence,
      source: evidenceLabel(store, item.source_document_id),
      evidence: recordEvidence(store, "claim", item.id, item.source_document_id),
      created_at: item.created_at,
    })),
    ...store.decisions.filter((item) => item.trust_status === "candidate").map((item) => ({
      id: item.id,
      recordType: "decision" as const,
      text: item.decision_text,
      domain: item.domain,
      priority: item.review_priority,
      confidence: item.confidence,
      source: evidenceLabel(store, item.source_document_id),
      evidence: recordEvidence(store, "decision", item.id, item.source_document_id),
      created_at: item.created_at,
    })),
    ...store.risks.filter((item) => item.trust_status === "candidate").map((item) => ({
      id: item.id,
      recordType: "risk" as const,
      text: item.risk_text,
      domain: item.domain,
      priority: item.review_priority,
      confidence: item.severity === "critical" ? 0.9 : item.severity === "high" ? 0.8 : 0.65,
      source: evidenceLabel(store, item.source_document_id),
      evidence: recordEvidence(store, "risk", item.id, item.source_document_id),
      created_at: item.created_at,
    })),
    ...store.promises.filter((item) => item.trust_status === "candidate").map((item) => ({
      id: item.id,
      recordType: "promise" as const,
      text: item.promise_text,
      domain: item.domain,
      priority: item.review_priority,
      confidence: 0.68,
      source: evidenceLabel(store, item.source_document_id),
      evidence: recordEvidence(store, "promise", item.id, item.source_document_id),
      created_at: item.created_at,
    })),
  ].sort((a, b) => {
    const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityRank[b.priority] - priorityRank[a.priority] || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function buildDecisionInbox(store: BrainStore, reviewQueue: ReturnType<typeof buildReviewQueue>) {
  const contradictionCards = store.contradictionFindings
    .filter((item) => item.status === "open")
    .map((item) => ({
      id: item.id,
      kind: "contradiction" as const,
      title: item.title,
      domain: item.domain,
      severity: item.severity,
      businessImpact: item.finding_type === "promise_without_task"
        ? "A commitment may be floating without ownership, which can quietly damage follow-through."
        : item.finding_type === "missing_owner"
          ? "A risk is visible but not accountable, so it may keep resurfacing."
          : "The business has competing versions of the truth, so agents and people may act on the wrong assumption.",
      decisionNeeded: item.managerial_question ?? "Decide which memory should become the operating truth.",
      recommendedAction: item.recommended_resolution ?? "Review the source evidence and resolve the memory record.",
      evidence: item.evidence_summary ?? topEvidenceForText(store, item.description, item.source_document_a_id),
      created_at: item.created_at,
    }));
  const reviewCards = reviewQueue
    .filter((item) => item.priority === "critical" || item.priority === "high")
    .map((item) => ({
      id: item.id,
      kind: "memory_review" as const,
      recordType: item.recordType,
      title: `Approve ${item.recordType}: ${item.text}`,
      domain: item.domain,
      severity: item.priority,
      businessImpact: "This memory could affect agent behavior or business reporting, so it needs a human trust decision.",
      decisionNeeded: "Approve this as operating memory, reject it, or leave it as candidate context.",
      recommendedAction: "Review the source quote, then approve only if you would let an agent rely on it.",
      evidence: item.source,
      created_at: item.created_at,
    }));
  return [...contradictionCards, ...reviewCards].sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    return (rank[b.severity as keyof typeof rank] ?? 1) - (rank[a.severity as keyof typeof rank] ?? 1) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }).slice(0, 16);
}

function buildInitiativeReadiness(store: BrainStore) {
  return BUSINESS_INITIATIVES.map((initiative) => {
    const decisions = store.decisions.filter((item) => item.status === "active" && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.decision_text, item.domain));
    const risks = store.risks.filter((item) => ["open", "monitoring"].includes(item.status) && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.risk_text, item.domain));
    const promises = store.promises.filter((item) => item.status === "active" && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.promise_text, item.domain));
    const contradictions = store.contradictionFindings.filter((item) => item.status === "open" && initiativeMatchesText(initiative, `${item.title} ${item.description}`, item.domain));
    const candidates =
      store.claims.filter((item) => item.trust_status === "candidate" && initiativeMatchesText(initiative, item.claim_text, item.domain)).length +
      store.decisions.filter((item) => item.trust_status === "candidate" && initiativeMatchesText(initiative, item.decision_text, item.domain)).length +
      store.risks.filter((item) => item.trust_status === "candidate" && initiativeMatchesText(initiative, item.risk_text, item.domain)).length +
      store.promises.filter((item) => item.trust_status === "candidate" && initiativeMatchesText(initiative, item.promise_text, item.domain)).length;
    const blockers = [
      ...contradictions.slice(0, 2).map((item) => item.title),
      ...risks.filter((item) => item.severity === "critical" || item.severity === "high").slice(0, 2).map((item) => item.risk_text),
      ...(promises.length > 6 ? ["Many active promises need task hygiene."] : []),
      ...(candidates > 10 ? ["Memory needs review before agents should rely on it."] : []),
    ].slice(0, 4);
    const score = Math.max(5, Math.min(98, 72 + Math.min(decisions.length, 4) * 4 - contradictions.length * 7 - risks.length * 3 - Math.min(candidates, 12)));
    return {
      id: initiative.id,
      name: initiative.name,
      domain: initiative.domain,
      score,
      status: statusSummary(score),
      blockers,
      nextBestAction: blockers[0] ? `Resolve: ${blockers[0]}` : decisions.length ? "Compile and distribute the latest approved context pack." : "Approve the first operating decisions for this initiative.",
      counts: {
        decisions: decisions.length,
        risks: risks.length,
        promises: promises.length,
        contradictions: contradictions.length,
        candidates,
      },
    };
  }).sort((a, b) => a.score - b.score);
}

function buildEntityProfiles(store: BrainStore) {
  const explicitProfiles = BUSINESS_INITIATIVES.map((initiative) => {
    const facts = store.claims.filter((item) => item.status === "active" && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.claim_text, item.domain)).slice(0, 4);
    const decisions = store.decisions.filter((item) => item.status === "active" && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.decision_text, item.domain)).slice(0, 4);
    const risks = store.risks.filter((item) => ["open", "monitoring"].includes(item.status) && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.risk_text, item.domain)).slice(0, 4);
    const promises = store.promises.filter((item) => item.status === "active" && isAcceptedTrust(item.trust_status) && initiativeMatchesText(initiative, item.promise_text, item.domain)).slice(0, 4);
    const contradictions = store.contradictionFindings.filter((item) => item.status === "open" && initiativeMatchesText(initiative, `${item.title} ${item.description}`, item.domain)).slice(0, 4);
    const latestSource = byUpdatedAt(store.sourceDocuments.filter((source) => keywordHit(`${source.title} ${source.raw_text ?? ""}`, initiative.keywords)))[0] ?? null;
    return {
      id: initiative.id,
      name: initiative.name,
      type: "program",
      domain: initiative.domain,
      summary: contradictions[0]?.managerial_question ?? decisions[0]?.decision_text ?? risks[0]?.risk_text ?? "No strong operating summary yet.",
      facts: facts.map((item) => item.claim_text),
      decisions: decisions.map((item) => item.decision_text),
      risks: risks.map((item) => item.risk_text),
      promises: promises.map((item) => item.promise_text),
      contradictions: contradictions.map((item) => item.title),
      lastSource: latestSource ? evidenceLabel(store, latestSource.id) : null,
    };
  });
  const entityProfiles = byUpdatedAt(store.entities)
    .filter((item) => item.domain && item.canonical_name.length > 3)
    .slice(0, 8)
    .map((entity) => ({
      id: entity.id,
      name: entity.canonical_name,
      type: entity.entity_type,
      domain: entity.domain ?? "leadership",
      summary: entity.description ?? `Tracked ${entity.entity_type} in ${domainLabel(entity.domain ?? "leadership")}.`,
      facts: store.claims.filter((item) => item.entity_id === entity.id).slice(0, 3).map((item) => item.claim_text),
      decisions: store.decisions.filter((item) => item.owner_entity_id === entity.id || item.decided_by_entity_id === entity.id).slice(0, 3).map((item) => item.decision_text),
      risks: store.risks.filter((item) => item.owner_entity_id === entity.id || item.related_entity_id === entity.id).slice(0, 3).map((item) => item.risk_text),
      promises: store.promises.filter((item) => item.made_by_entity_id === entity.id || item.made_to_entity_id === entity.id).slice(0, 3).map((item) => item.promise_text),
      contradictions: store.contradictionFindings.filter((item) => item.entity_id === entity.id && item.status === "open").slice(0, 3).map((item) => item.title),
      lastSource: null,
    }));
  return [...explicitProfiles, ...entityProfiles].slice(0, 14);
}

function buildMemoryDiff(store: BrainStore) {
  const since = Date.now() - 1000 * 60 * 60 * 24 * 7;
  const recentSources = byUpdatedAt(store.sourceDocuments.filter((item) => new Date(item.updated_at).getTime() >= since)).slice(0, 8);
  const recentDecisions = byUpdatedAt(store.decisions.filter((item) => new Date(item.updated_at).getTime() >= since)).slice(0, 8);
  const recentRisks = byUpdatedAt(store.risks.filter((item) => new Date(item.updated_at).getTime() >= since)).slice(0, 8);
  const recentPromises = byUpdatedAt(store.promises.filter((item) => new Date(item.updated_at).getTime() >= since)).slice(0, 8);
  const recentContradictions = byUpdatedAt(store.contradictionFindings.filter((item) => new Date(item.updated_at).getTime() >= since && item.status === "open")).slice(0, 8);
  return {
    window: "Last 7 days",
    headline: `${recentSources.length} sources updated, ${recentDecisions.length} decisions captured, ${recentContradictions.length} tensions surfaced.`,
    sources: recentSources.map((item) => ({ id: item.id, title: item.title, date: item.created_at_source?.slice(0, 10) ?? item.captured_at.slice(0, 10), type: item.source_type })),
    decisions: recentDecisions.map((item) => ({ id: item.id, text: item.decision_text, domain: item.domain, trust: item.trust_status })),
    risks: recentRisks.map((item) => ({ id: item.id, text: item.risk_text, domain: item.domain, severity: item.severity })),
    promises: recentPromises.map((item) => ({ id: item.id, text: item.promise_text, domain: item.domain, status: item.status })),
    contradictions: recentContradictions.map((item) => ({ id: item.id, title: item.title, domain: item.domain, question: item.managerial_question })),
  };
}

function writeMarkdownFile(baseDir: string, relativePath: string, markdown: string): string {
  const filePath = path.join(baseDir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${markdown.trim()}\n`, "utf-8");
  return filePath;
}

function domainMapMarkdown(domain: string, store: BrainStore): string {
  const claims = store.claims.filter((item) => item.domain === domain && item.status === "active" && isAcceptedTrust(item.trust_status)).slice(0, 8);
  const decisions = store.decisions.filter((item) => item.domain === domain && item.status === "active" && isAcceptedTrust(item.trust_status)).slice(0, 8);
  const risks = store.risks.filter((item) => item.domain === domain && ["open", "monitoring"].includes(item.status) && isAcceptedTrust(item.trust_status)).slice(0, 8);
  const promises = store.promises.filter((item) => item.domain === domain && item.status === "active" && isAcceptedTrust(item.trust_status)).slice(0, 8);
  const contradictions = store.contradictionFindings.filter((item) => item.domain === domain && item.status === "open").slice(0, 8);
  const sources = byUpdatedAt(store.sourceDocuments.filter((item) => inferDomain(`${item.title} ${item.raw_text ?? ""}`) === domain)).slice(0, 6);
  return [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: nowIso(), domain, trust_mode: "approved_plus_candidate", max_read_time: "3 minutes" }),
    `# ${domainLabel(domain)} Map`,
    "Use this map when the task is specifically about this business area. Do not read raw sources unless evidence is required.",
    "## Agent Routing",
    "- For external-facing work, query Knowledge Brain in approved-only mode before using facts.",
    "- For strategy work, use this map plus the Decision Inbox.",
    "- For forensic questions, use the source IDs and evidence records in Mission Control.",
    compactSubList("Current Decisions", decisions.map((item) => `${item.decision_text} (${item.trust_status})`)),
    compactSubList("Useful Facts", claims.map((item) => `${item.claim_text} (${item.trust_status})`)),
    compactSubList("Risks", risks.map((item) => `${item.risk_text} (${item.severity})`)),
    compactSubList("Promises", promises.map((item) => item.promise_text)),
    compactSubList("Contradictions To Preserve", contradictions.map((item) => `${item.title}: ${item.managerial_question ?? item.description}`)),
    compactSubList("Recent Sources", sources.map((item) => `${item.title} (${item.created_at_source?.slice(0, 10) ?? item.captured_at.slice(0, 10)})`)),
  ].join("\n\n");
}

export function exportObsidianMaps(input: { outputDir?: string | null } = {}) {
  seedBrainIfEmpty();
  contradictionService.detect("all");
  const store = readBrainStore();
  const reviewQueue = buildReviewQueue(store);
  const decisionInbox = buildDecisionInbox(store, reviewQueue);
  const readiness = buildInitiativeReadiness(store);
  const entityProfiles = buildEntityProfiles(store);
  const memoryDiff = buildMemoryDiff(store);
  const outputDir = input.outputDir || process.env.CLIENT_BRAIN_OBSIDIAN_DIR || DEFAULT_OBSIDIAN_EXPORT_DIR;
  const files: string[] = [];
  const generatedAt = nowIso();

  files.push(writeMarkdownFile(outputDir, "MAP_OF_MAPS.md", [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: generatedAt, source_of_truth: "Mission Control structured memory", max_read_time: "2 minutes" }),
    "# Knowledge Brain Map Of Maps",
    "Start here. This file is intentionally short so agents can route themselves without reading the entire vault.",
    "## Rules For Agents",
    "- Do not bulk-read the vault.",
    "- Use maps first, generated packs second, and raw source files only when evidence is requested.",
    "- For customer-facing, partner-facing, pricing, or legal-sensitive work, use approved-only memory.",
    "- Treat contradictions as strategic signal, not noise.",
    "- Compiled markdown is an artifact. Mission Control Knowledge Brain is the source of truth.",
    "## Where To Go",
    "- Need a management decision: [[01_DECISION_INBOX]]",
    "- Need initiative health: [[02_INITIATIVE_READINESS]]",
    "- Need recent changes: [[03_WHAT_CHANGED]]",
    "- Need entity/program context: [[04_ENTITY_PROFILES]]",
    "- Need agent behavior rules: [[00_AGENT_ROUTING]]",
    "## Domain Maps",
    ...DEFAULT_DOMAINS.map((domain) => `- ${domainLabel(domain)}: [[domains/${sanitizeMarkdownFilename(domainLabel(domain))} Map]]`),
  ].join("\n\n")));

  files.push(writeMarkdownFile(outputDir, "00_AGENT_ROUTING.md", [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: generatedAt, max_read_time: "2 minutes" }),
    "# Agent Routing",
    "This file tells agents how to spend context efficiently.",
    "## Default Flow",
    "1. Read [[MAP_OF_MAPS]].",
    "2. Read one domain map or one generated artifact that matches the task.",
    "3. Query Mission Control Knowledge Brain for structured records.",
    "4. Read raw source evidence only when the task needs quotes, proof, or dispute resolution.",
    "## Trust Modes",
    "- approved_only: external-facing copy, pricing, partner commitments, operational instructions.",
    "- approved_plus_candidate: internal planning, strategy, synthesis, brainstorming.",
    "- contradiction_mode: management review, risk review, strategy debugging.",
    "- raw_evidence: audits, source verification, transcript inspection.",
    "## Context Budget",
    "- Small task: Map of Maps only.",
    "- Normal task: Map of Maps plus one domain map.",
    "- Complex strategy task: Map of Maps, Decision Inbox, Readiness, and one domain map.",
  ].join("\n\n")));

  files.push(writeMarkdownFile(outputDir, "01_DECISION_INBOX.md", [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: generatedAt, max_read_time: "5 minutes" }),
    "# Decision Inbox",
    "These are the places where Example Client needs a decision, owner, or accepted source of truth.",
    ...decisionInbox.slice(0, 12).map((item, index) => [
      `## ${index + 1}. ${item.decisionNeeded}`,
      `- Domain: ${domainLabel(item.domain)}`,
      `- Severity: ${item.severity}`,
      `- Why it matters: ${item.businessImpact}`,
      `- Recommended move: ${item.recommendedAction}`,
      `- Evidence: ${item.evidence}`,
    ].join("\n")),
  ].join("\n\n")));

  files.push(writeMarkdownFile(outputDir, "02_INITIATIVE_READINESS.md", [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: generatedAt, max_read_time: "4 minutes" }),
    "# Initiative Readiness",
    "Use this when deciding where management attention should go next.",
    ...readiness.map((item) => [
      `## ${item.name}: ${item.score}% (${item.status})`,
      `- Domain: ${domainLabel(item.domain)}`,
      `- Next best action: ${item.nextBestAction}`,
      `- Decisions: ${item.counts.decisions}`,
      `- Risks: ${item.counts.risks}`,
      `- Promises: ${item.counts.promises}`,
      `- Contradictions: ${item.counts.contradictions}`,
      item.blockers.length ? `- Blockers: ${item.blockers.join("; ")}` : "- Blockers: none recorded",
    ].join("\n")),
  ].join("\n\n")));

  files.push(writeMarkdownFile(outputDir, "03_WHAT_CHANGED.md", [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: generatedAt, window: memoryDiff.window, max_read_time: "3 minutes" }),
    "# What Changed",
    memoryDiff.headline,
    compactSubList("Updated Sources", memoryDiff.sources.map((item) => `${item.title} (${item.date})`)),
    compactSubList("Decisions Captured", memoryDiff.decisions.map((item) => `${item.text} (${item.trust})`)),
    compactSubList("Risks Surfaced", memoryDiff.risks.map((item) => `${item.text} (${item.severity})`)),
    compactSubList("Promises Captured", memoryDiff.promises.map((item) => item.text)),
    compactSubList("New Tensions", memoryDiff.contradictions.map((item) => item.question ?? item.title)),
  ].join("\n\n")));

  files.push(writeMarkdownFile(outputDir, "04_ENTITY_PROFILES.md", [
    frontmatter({ generated_by: "Knowledge Brain", generated_at: generatedAt, max_read_time: "6 minutes" }),
    "# Entity Profiles",
    "Use this as a lightweight index of important programs, partners, people, venues, and systems.",
    ...entityProfiles.slice(0, 14).map((item) => [
      `## ${item.name}`,
      `- Type: ${item.type}`,
      `- Domain: ${domainLabel(item.domain)}`,
      `- Summary: ${item.summary}`,
      item.decisions.length ? `- Decisions: ${item.decisions.slice(0, 2).join("; ")}` : "- Decisions: none recorded",
      item.risks.length ? `- Risks: ${item.risks.slice(0, 2).join("; ")}` : "- Risks: none recorded",
      item.contradictions.length ? `- Contradictions: ${item.contradictions.slice(0, 2).join("; ")}` : "- Contradictions: none open",
      item.lastSource ? `- Latest source: ${item.lastSource}` : "- Latest source: none linked",
    ].join("\n")),
  ].join("\n\n")));

  for (const domain of DEFAULT_DOMAINS) {
    files.push(writeMarkdownFile(outputDir, path.join("domains", `${sanitizeMarkdownFilename(domainLabel(domain))} Map.md`), domainMapMarkdown(domain, store)));
  }

  const manifest = {
    generated_at: generatedAt,
    output_dir: outputDir,
    source_of_truth: "Mission Control Knowledge Brain structured memory",
    files: files.map((filePath) => path.relative(outputDir, filePath)),
  };
  files.push(writeMarkdownFile(outputDir, "manifest.json.md", `# Export Manifest\n\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``));
  return { outputDir, generatedAt, files, fileCount: files.length };
}

function claimSubjectKey(text: string): Set<string> {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "client", "beach", "tennis", "price", "fee", "cost", "costs", "is", "are", "was", "will"]);
  return new Set(
    normalizeMemoryText(text)
      .split(" ")
      .filter((term) => term.length > 3 && !stop.has(term))
      .slice(0, 10)
  );
}

function moneyValues(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*([kK])?/g)) {
    const raw = match[1]?.replace(/,/g, "");
    if (!raw) continue;
    const value = Number(raw) * (match[2] ? 1000 : 1);
    if (Number.isFinite(value)) values.add(value);
  }
  return values;
}

function hasSameMoneyValue(a: string, b: string): boolean {
  const aValues = moneyValues(a);
  const bValues = moneyValues(b);
  for (const value of aValues) {
    if (bValues.has(value)) return true;
  }
  return false;
}

function shouldCompareClaims(a: BrainClaim, b: BrainClaim): boolean {
  if (a.domain !== b.domain || a.claim_type !== b.claim_type) return false;
  if (!sameNullable(a.entity_id, b.entity_id)) return false;
  if (a.entity_id) return true;
  if (a.claim_type !== "price" && a.claim_type !== "location" && a.claim_type !== "date") return true;
  if (a.claim_type === "price" && hasSameMoneyValue(a.claim_text, b.claim_text)) return false;
  const aTerms = claimSubjectKey(a.claim_text);
  const bTerms = claimSubjectKey(b.claim_text);
  let overlap = 0;
  for (const term of aTerms) {
    if (bTerms.has(term)) overlap += 1;
  }
  return overlap >= 2;
}

function compactList(label: string, values: string[]): string {
  if (values.length === 0) return `## ${label}\n- None recorded.`;
  return `## ${label}\n${values.map((item) => `- ${item}`).join("\n")}`;
}

function compactSubList(label: string, values: string[], limit = 6): string {
  if (values.length === 0) return `### ${label}\n- None recorded.`;
  return `### ${label}\n${values.slice(0, limit).map((item) => `- ${item}`).join("\n")}`;
}

function sanitizeMarkdownFilename(value: string): string {
  return value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function frontmatter(values: Record<string, string | number | boolean | null>): string {
  const lines = Object.entries(values).map(([key, value]) => `${key}: ${JSON.stringify(value ?? "")}`);
  return `---\n${lines.join("\n")}\n---`;
}

function approximateTokenTrim(markdown: string, tokenBudget: number): string {
  const charBudget = Math.max(400, tokenBudget * 4);
  if (markdown.length <= charBudget) return markdown;
  return `${markdown.slice(0, charBudget - 80).trim()}\n\n[Trimmed to approximate token budget]`;
}

function stripMarkdownPrefix(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => stripMarkdownPrefix(line))
    .filter((line) => line.length > 12);
}

function classifyClaimType(text: string): BrainClaimType {
  const normalized = normalizeMemoryText(text);
  if (/\$\d+|\b(drop-in|fee|price)\s+(is|was|will be|=)|\b(costs?|priced at)\s+\$?\d+/i.test(text)) return "price";
  if (/\bvenue|location|street|drive|park|beach|at\s+\d/.test(normalized)) return "location";
  if (/\b(date|time|schedule|calendar|month|week|today|tomorrow)\b/.test(normalized)) return "date";
  if (/\bnever|always|do not|don't|must|should not|constraint|rule\b/.test(normalized)) return "constraint";
  if (/\bstatus|active|paused|complete|pending\b/.test(normalized)) return "status";
  return "fact";
}

function looksLikeRisk(text: string): boolean {
  return /\b(risk|blocked|blocker|concern|issue|problem|threat|delay|stale|overdue|missing|failed|failure|uncertain|unclear)\b/i.test(text);
}

function looksLikePromise(text: string): boolean {
  return /\b(send|follow.?up|review|draft|confirm|create|share|respond|schedule|prepare|approve|decide|evaluate|sync|update|deliver|next step|recommended action)\b/i.test(text);
}

function looksLikeDecision(text: string): boolean {
  return /\b(decide|decision|approved|approve|confirmed|deprioritized|prioritize|tabled|choose|open decisions?)\b/i.test(text);
}

function looksLikeDurableClaim(text: string): boolean {
  if (/^participants?:/i.test(text)) return false;
  return (
    /\bnever|always|must|do not|don't|should not\b/i.test(text) ||
    /\$\d+|\b(drop-in|fee|price)\s+(is|was|will be|=)|\b(costs?|priced at)\s+\$?\d+/i.test(text) ||
    /\b(open play|client fit|academy fit)\b.+\b(is|at|runs|starts|costs)\b/i.test(text) ||
    /\b(location|venue)\b.+\b(is|at)\b/i.test(text)
  );
}

function inferImpact(text: string): BrainImpactLevel {
  if (/\b(critical|urgent|legal|financial|brand|external promise)\b/i.test(text)) return "critical";
  if (/\b(high|approve|decision|revenue|risk|blocked|launch)\b/i.test(text)) return "high";
  if (/\b(low|minor)\b/i.test(text)) return "low";
  return "medium";
}

function inferSeverity(text: string): BrainRiskSeverity {
  if (/\b(critical|legal|financial|brand|external promise)\b/i.test(text)) return "critical";
  if (/\b(high|blocked|blocker|failed|overdue|urgent|risk)\b/i.test(text)) return "high";
  if (/\b(low|minor)\b/i.test(text)) return "low";
  return "medium";
}

function sourceOffset(text: string, quote: string): { start: number | null; end: number | null } {
  const start = text.indexOf(quote);
  return start >= 0 ? { start, end: start + quote.length } : { start: null, end: null };
}

export const sourceDocumentService = {
  createOrFind(input: {
    source_type: BrainSourceType;
    source_system: string;
    external_id?: string | null;
    source_url?: string | null;
    title: string;
    raw_text?: string | null;
    raw_json?: unknown | null;
    author_name?: string | null;
    author_id?: string | null;
    created_at_source?: string | null;
    sensitivity_level?: BrainSensitivityLevel;
    metadata_json?: Record<string, unknown>;
  }): BrainSourceDocument {
    const hash = stableHash(input.raw_text ?? input.raw_json ?? `${input.source_type}:${input.external_id ?? input.title}`);
    let document = readBrainStore().sourceDocuments.find((item) =>
      (input.external_id && item.source_type === input.source_type && item.external_id === input.external_id) || item.hash === hash
    );
    if (document) {
      updateBrainStore((store) => {
        const existing = store.sourceDocuments.find((item) => item.id === document?.id);
        if (!existing) return;
        const changed = existing.hash !== hash;
        existing.source_system = input.source_system;
        existing.source_url = input.source_url ?? existing.source_url;
        existing.title = input.title;
        existing.raw_text = input.raw_text ?? existing.raw_text;
        existing.raw_json = input.raw_json ?? existing.raw_json;
        existing.author_name = input.author_name ?? existing.author_name;
        existing.author_id = input.author_id ?? existing.author_id;
        existing.created_at_source = input.created_at_source ?? existing.created_at_source;
        existing.sensitivity_level = input.sensitivity_level ?? existing.sensitivity_level;
        existing.metadata_json = { ...existing.metadata_json, ...(input.metadata_json ?? {}) };
        existing.hash = hash;
        existing.updated_at = nowIso();
        if (changed) {
          existing.processed_status = "pending";
          existing.processed_at = null;
        }
        document = existing;
      });
      return document;
    }

    const now = nowIso();
    const createdDocument: BrainSourceDocument = {
      id: newBrainId("brain-src"),
      source_type: input.source_type,
      source_system: input.source_system,
      external_id: input.external_id ?? null,
      source_url: input.source_url ?? null,
      title: input.title,
      raw_text: input.raw_text ?? null,
      raw_json: input.raw_json ?? null,
      author_name: input.author_name ?? null,
      author_id: input.author_id ?? null,
      created_at_source: input.created_at_source ?? null,
      captured_at: now,
      processed_at: null,
      processed_status: "pending",
      hash,
      sensitivity_level: input.sensitivity_level ?? "internal",
      metadata_json: input.metadata_json ?? {},
      created_at: now,
      updated_at: now,
    };
    updateBrainStore((store) => {
      store.sourceDocuments.unshift(createdDocument);
    });
    return createdDocument;
  },

  updateProcessedStatus(id: string, processed_status: BrainSourceDocument["processed_status"]): BrainSourceDocument | null {
    let result: BrainSourceDocument | null = null;
    updateBrainStore((store) => {
      const document = store.sourceDocuments.find((item) => item.id === id);
      if (!document) return;
      document.processed_status = processed_status;
      document.processed_at = nowIso();
      document.updated_at = document.processed_at;
      result = document;
    });
    return result;
  },
};

export const sourceReferenceService = {
  link(input: Omit<BrainSourceReference, "id" | "created_at">): BrainSourceReference {
    let reference: BrainSourceReference | undefined;
    updateBrainStore((store) => {
      reference = store.sourceReferences.find((item) =>
        item.source_document_id === input.source_document_id &&
        item.target_type === input.target_type &&
        item.target_id === input.target_id
      );
      if (reference) return;
      reference = { ...input, id: newBrainId("brain-ref"), created_at: nowIso() };
      store.sourceReferences.unshift(reference);
    });
    return reference as BrainSourceReference;
  },
};

export const entityService = {
  upsert(input: {
    entity_type: BrainEntity["entity_type"];
    name: string;
    canonical_name?: string;
    description?: string | null;
    domain?: string | null;
    owner_person_id?: string | null;
    confidence?: number;
    metadata_json?: Record<string, unknown>;
  }): BrainEntity {
    const canonical = input.canonical_name ?? input.name.trim();
    let entity: BrainEntity | undefined;
    const now = nowIso();
    updateBrainStore((store) => {
      entity = store.entities.find((item) => item.canonical_name.toLowerCase() === canonical.toLowerCase() && item.entity_type === input.entity_type);
      if (entity) {
        entity.description = input.description ?? entity.description;
        entity.domain = input.domain ?? entity.domain;
        entity.owner_person_id = input.owner_person_id ?? entity.owner_person_id;
        entity.confidence = Math.max(entity.confidence, input.confidence ?? entity.confidence);
        entity.metadata_json = { ...entity.metadata_json, ...(input.metadata_json ?? {}) };
        entity.updated_at = now;
        return;
      }
      entity = {
        id: newBrainId("brain-ent"),
        entity_type: input.entity_type,
        name: input.name,
        canonical_name: canonical,
        description: input.description ?? null,
        status: "active",
        domain: input.domain ?? null,
        owner_person_id: input.owner_person_id ?? null,
        confidence: input.confidence ?? 0.75,
        last_confirmed_at: now,
        metadata_json: input.metadata_json ?? {},
        created_at: now,
        updated_at: now,
      };
      store.entities.unshift(entity);
    });
    return entity as BrainEntity;
  },
};

export const claimService = {
  create(input: {
    claim_text: string;
    domain?: string;
    entity_id?: string | null;
    claim_type?: BrainClaimType;
    source_document_id?: string | null;
    confidence?: number;
    sensitivity_level?: BrainSensitivityLevel;
    valid_from?: string | null;
    valid_until?: string | null;
    supersedes_claim_id?: string | null;
  }): BrainClaim {
    const normalized_claim = normalizeMemoryText(input.claim_text);
    const domain = input.domain ?? inferDomain(input.claim_text);
    let claim: BrainClaim | undefined;
    const now = nowIso();
    updateBrainStore((store) => {
      claim = store.claims.find((item) =>
        item.normalized_claim === normalized_claim &&
        item.domain === domain &&
        item.claim_type === (input.claim_type ?? "fact") &&
        sameNullable(item.entity_id, input.entity_id ?? null)
      );
      if (claim) {
        claim.status = claim.status === "contradicted" ? "contradicted" : "active";
        claim.last_confirmed_at = now;
        claim.updated_at = now;
        return;
      }
      claim = {
        id: newBrainId("brain-claim"),
        claim_text: input.claim_text,
        normalized_claim,
        domain,
        entity_id: input.entity_id ?? null,
        claim_type: input.claim_type ?? "fact",
        status: "active",
        confidence: input.confidence ?? 0.72,
        valid_from: input.valid_from ?? null,
        valid_until: input.valid_until ?? null,
        last_confirmed_at: now,
        source_document_id: input.source_document_id ?? null,
        supersedes_claim_id: input.supersedes_claim_id ?? null,
        sensitivity_level: input.sensitivity_level ?? "internal",
        trust_status: input.source_document_id ? "candidate" : "approved",
        review_priority: input.claim_type === "price" || input.claim_type === "policy" || input.claim_type === "constraint" ? "high" : "medium",
        reviewed_by: input.source_document_id ? null : "system",
        reviewed_at: input.source_document_id ? null : now,
        review_note: input.source_document_id ? null : "Seeded or manually entered memory.",
        created_at: now,
        updated_at: now,
      };
      store.claims.unshift(claim);
    });
    return claim as BrainClaim;
  },
};

export const decisionService = {
  create(input: {
    decision_text: string;
    domain?: string;
    owner_entity_id?: string | null;
    source_document_id?: string | null;
    impact_level?: BrainDecision["impact_level"];
    decision_date?: string | null;
  }): BrainDecision {
    const normalized_decision = normalizeMemoryText(input.decision_text);
    const domain = input.domain ?? inferDomain(input.decision_text);
    let decision: BrainDecision | undefined;
    const now = nowIso();
    updateBrainStore((store) => {
      decision = store.decisions.find((item) => item.normalized_decision === normalized_decision && item.domain === domain);
      if (decision) return;
      decision = {
        id: newBrainId("brain-decision"),
        decision_text: input.decision_text,
        normalized_decision,
        domain,
        status: "active",
        decided_by_entity_id: null,
        owner_entity_id: input.owner_entity_id ?? null,
        decision_date: input.decision_date ?? now.slice(0, 10),
        effective_date: null,
        source_document_id: input.source_document_id ?? null,
        supersedes_decision_id: null,
        confidence: 0.72,
        impact_level: input.impact_level ?? "medium",
        trust_status: input.source_document_id ? "candidate" : "approved",
        review_priority: reviewPriorityForImpact(input.impact_level ?? "medium"),
        reviewed_by: input.source_document_id ? null : "system",
        reviewed_at: input.source_document_id ? null : now,
        review_note: input.source_document_id ? null : "Seeded or manually entered decision.",
        created_at: now,
        updated_at: now,
      };
      store.decisions.unshift(decision);
    });
    return decision as BrainDecision;
  },
};

export const riskService = {
  create(input: {
    risk_text: string;
    domain?: string;
    severity?: BrainRiskSeverity;
    owner_entity_id?: string | null;
    recommended_action?: string | null;
    source_document_id?: string | null;
  }): BrainRisk {
    const domain = input.domain ?? inferDomain(input.risk_text);
    let risk: BrainRisk | undefined;
    const now = nowIso();
    updateBrainStore((store) => {
      risk = store.risks.find((item) => normalizeMemoryText(item.risk_text) === normalizeMemoryText(input.risk_text) && item.domain === domain);
      if (risk) return;
      risk = {
        id: newBrainId("brain-risk"),
        risk_text: input.risk_text,
        domain,
        severity: input.severity ?? "medium",
        status: "open",
        owner_entity_id: input.owner_entity_id ?? null,
        recommended_action: input.recommended_action ?? null,
        source_document_id: input.source_document_id ?? null,
        related_entity_id: null,
        trust_status: input.source_document_id ? "candidate" : "approved",
        review_priority: reviewPriorityForRisk(input.severity ?? "medium"),
        reviewed_by: input.source_document_id ? null : "system",
        reviewed_at: input.source_document_id ? null : now,
        review_note: input.source_document_id ? null : "Seeded or manually entered risk.",
        created_at: now,
        updated_at: now,
      };
      store.risks.unshift(risk);
    });
    return risk as BrainRisk;
  },
};

export const promiseService = {
  create(input: {
    promise_text: string;
    domain?: string;
    due_date?: string | null;
    source_document_id?: string | null;
    related_opportunity_id?: string | null;
  }): BrainPromise {
    const domain = input.domain ?? inferDomain(input.promise_text);
    let promise: BrainPromise | undefined;
    const now = nowIso();
    updateBrainStore((store) => {
      promise = store.promises.find((item) => normalizeMemoryText(item.promise_text) === normalizeMemoryText(input.promise_text) && item.domain === domain);
      if (promise) return;
      promise = {
        id: newBrainId("brain-promise"),
        promise_text: input.promise_text,
        made_by_entity_id: null,
        made_to_entity_id: null,
        domain,
        status: "active",
        due_date: input.due_date ?? null,
        source_document_id: input.source_document_id ?? null,
        related_opportunity_id: input.related_opportunity_id ?? null,
        related_event_id: null,
        related_company_id: null,
        trust_status: input.source_document_id ? "candidate" : "approved",
        review_priority: "medium",
        reviewed_by: input.source_document_id ? null : "system",
        reviewed_at: input.source_document_id ? null : now,
        review_note: input.source_document_id ? null : "Seeded or manually entered promise.",
        created_at: now,
        updated_at: now,
      };
      store.promises.unshift(promise);
    });
    return promise as BrainPromise;
  },
};

type ReviewableRecordType = "claim" | "decision" | "risk" | "promise";

export function reviewMemoryRecord(input: {
  recordType: ReviewableRecordType;
  recordId: string;
  trustStatus: BrainTrustStatus;
  reviewedBy?: string | null;
  reviewNote?: string | null;
}): { record: BrainClaim | BrainDecision | BrainRisk | BrainPromise | null } {
  let record: BrainClaim | BrainDecision | BrainRisk | BrainPromise | null = null;
  const now = nowIso();
  updateBrainStore((store) => {
    const collection =
      input.recordType === "claim" ? store.claims :
      input.recordType === "decision" ? store.decisions :
      input.recordType === "risk" ? store.risks :
      store.promises;
    const match = collection.find((item) => item.id === input.recordId);
    if (!match) return;
    match.trust_status = input.trustStatus;
    match.reviewed_by = input.trustStatus === "candidate" ? null : input.reviewedBy ?? "Alex";
    match.reviewed_at = input.trustStatus === "candidate" ? null : now;
    match.review_note = input.trustStatus === "candidate" ? null : input.reviewNote ?? null;
    match.updated_at = now;
    if (input.trustStatus === "rejected") {
      if (input.recordType === "claim") match.status = "unverified";
      if (input.recordType === "decision") match.status = "archived";
      if (input.recordType === "risk") match.status = "closed";
      if (input.recordType === "promise") match.status = "unclear";
    }
    record = match;
  });
  return { record };
}

function normalizeOwnerFromText(text: string): string {
  const owners = ["Alex", "Glenda", "Brian", "Mission Agent", "Duda", "Miles", "Isadora"];
  return owners.find((owner) => new RegExp(`\\b${owner}\\b`, "i").test(text)) ?? "";
}

function inferActionPriority(text: string): ActionItem["priority"] {
  if (/\b(urgent|critical|blocked|blocker|asap|high)\b/i.test(text)) return "high";
  if (/\b(low|minor|later)\b/i.test(text)) return "low";
  return "medium";
}

function inferActionType(text: string): string {
  if (/\bfollow.?up\b/i.test(text)) return "Follow-up";
  if (/\b(send|respond|email|share)\b/i.test(text)) return "Outreach";
  if (/\b(draft|write|copy|deck|memo)\b/i.test(text)) return "Content";
  if (/\b(confirm|review|approve|decide)\b/i.test(text)) return "Review";
  return "Task";
}

function inferActionDeadline(text: string): string | null {
  const today = new Date();
  if (/\btoday\b/i.test(text)) return today.toISOString().slice(0, 10);
  if (/\btomorrow\b/i.test(text)) {
    const date = new Date(today);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
  }
  const match = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(text);
  return match?.[1] ?? null;
}

export function createActionItemFromPromise(promiseId: string, actor = "Knowledge Brain"): { actionItem: ActionItem | null; promise: BrainPromise | null; alreadyLinked: boolean } {
  const store = readBrainStore();
  const promise = store.promises.find((item) => item.id === promiseId) ?? null;
  if (!promise) return { actionItem: null, promise: null, alreadyLinked: false };
  const items = readActionItems();
  const normalizedPromise = normalizeMemoryText(promise.promise_text);
  const existing = items.find((item) => normalizeMemoryText(`${item.title} ${item.notes}`).includes(normalizedPromise.slice(0, 48)));
  if (existing) return { actionItem: existing, promise, alreadyLinked: true };
  const now = nowIso();
  const source = promise.source_document_id ? store.sourceDocuments.find((item) => item.id === promise.source_document_id) : null;
  const actionItem: ActionItem = {
    id: nextActionItemId(items),
    title: promise.promise_text,
    owner: normalizeOwnerFromText(promise.promise_text),
    department: promise.domain.replace(/_/g, " "),
    type: inferActionType(promise.promise_text),
    deadline: promise.due_date ?? inferActionDeadline(promise.promise_text),
    status: "not_started",
    sourceMeeting: source?.title ?? "Knowledge Brain",
    sourceDate: source?.created_at_source?.slice(0, 10) ?? now.slice(0, 10),
    sourceChannelId: "",
    sourceMessageId: promise.id,
    relatedAccount: "",
    notes: `Created from Knowledge Brain promise ${promise.id}.${source ? ` Source document: ${source.id}.` : ""}`,
    priority: inferActionPriority(promise.promise_text),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    createdBy: actor,
    updatedBy: actor,
  };
  writeActionItems([...items, actionItem]);
  return { actionItem, promise, alreadyLinked: false };
}

export function createActionItemFromFinding(findingId: string, actor = "Knowledge Brain"): { actionItem: ActionItem | null; finding: BrainContradictionFinding | null; alreadyLinked: boolean } {
  const store = readBrainStore();
  const finding = store.contradictionFindings.find((item) => item.id === findingId) ?? null;
  if (!finding) return { actionItem: null, finding: null, alreadyLinked: false };
  const items = readActionItems();
  const existing = items.find((item) => item.sourceMessageId === finding.id);
  if (existing) return { actionItem: existing, finding, alreadyLinked: true };
  const now = nowIso();
  const actionItem: ActionItem = {
    id: nextActionItemId(items),
    title: finding.managerial_question ?? finding.title,
    owner: "",
    department: finding.domain.replace(/_/g, " "),
    type: "Decision",
    deadline: null,
    status: "not_started",
    sourceMeeting: finding.evidence_summary ?? "Knowledge Brain",
    sourceDate: now.slice(0, 10),
    sourceChannelId: "",
    sourceMessageId: finding.id,
    relatedAccount: "",
    notes: [
      finding.description,
      finding.recommended_resolution ? `Recommended action: ${finding.recommended_resolution}` : "",
      finding.evidence_summary ? `Evidence: ${finding.evidence_summary}` : "",
    ].filter(Boolean).join("\n"),
    priority: finding.severity === "critical" || finding.severity === "high" ? "high" : finding.severity === "low" ? "low" : "medium",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    createdBy: actor,
    updatedBy: actor,
  };
  writeActionItems([...items, actionItem]);
  return { actionItem, finding, alreadyLinked: false };
}

export function seedBrainIfEmpty(): BrainStore {
  const store = readBrainStore();
  if (store.sourceDocuments.length || store.claims.length || store.decisions.length) return store;

  const source = sourceDocumentService.createOrFind({
    source_type: "manual",
    source_system: "mission_control_seed",
    external_id: "example-client-brain-mvp-seed",
    title: "Knowledge Brain MVP seed memory",
    raw_text: [
      "Decision: Knowledge Brain should remain additive to Mission Control.",
      "Risk: Knowledge Brain has no production database migration path yet.",
      "Claim: Agent Ops drop-in is $19.",
      "Claim: Never use rhythm in Example Client copy.",
      "Promise: Review generated context packs before agents use them operationally.",
    ].join("\n"),
    sensitivity_level: "internal",
  });
  decisionService.create({ decision_text: "Knowledge Brain should remain additive to Mission Control.", domain: "leadership", source_document_id: source.id, impact_level: "high" });
  riskService.create({ risk_text: "Knowledge Brain has no production database migration path yet.", domain: "agent_ops", severity: "medium", source_document_id: source.id, recommended_action: "Keep the JSON spine additive until the production persistence layer is confirmed." });
  claimService.create({ claim_text: "Agent Ops drop-in is $19.", domain: "client_fit", claim_type: "price", source_document_id: source.id });
  claimService.create({ claim_text: "Never use rhythm in Example Client copy.", domain: "marketing", claim_type: "constraint", source_document_id: source.id });
  promiseService.create({ promise_text: "Review generated context packs before agents use them operationally.", domain: "agent_ops", source_document_id: source.id });
  sourceDocumentService.updateProcessedStatus(source.id, "processed");
  return readBrainStore();
}

type BrainExtractionCounts = { claims: number; decisions: number; risks: number; promises: number; entities: number };

function linkSourceRecord(source: BrainSourceDocument, target_type: string, target_id: string, quote: string, confidence: number): void {
  const offsets = sourceOffset(source.raw_text ?? "", quote);
  sourceReferenceService.link({
    source_document_id: source.id,
    target_type,
    target_id,
    quote_text: quote,
    start_offset: offsets.start,
    end_offset: offsets.end,
    confidence,
  });
}

function extractEntitiesFromText(text: string, source: BrainSourceDocument, domain: string): number {
  const candidates = new Set<string>();
  const raw = source.raw_json as { participants?: Array<{ name?: string; company?: string }> } | null;
  for (const participant of raw?.participants ?? []) {
    if (participant.name) candidates.add(participant.name);
    if (participant.company && participant.company !== "Example Client") candidates.add(participant.company);
  }
  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,3})\b/g)) {
    const value = match[1]?.trim();
    if (!value || value.length < 3) continue;
    if (/^(Decision|Risk|Claim|Promise|Recommended|Executive Summary|Top|What Changed|Open Decisions|Example Client|Mission Control)$/i.test(value)) continue;
    candidates.add(value);
  }
  let count = 0;
  for (const candidate of Array.from(candidates).slice(0, 24)) {
    const entity = entityService.upsert({
      entity_type: /\b(inc|llc|hotel|grille|club|brand|company|co)\b/i.test(candidate) ? "company" : "person",
      name: candidate,
      domain,
      confidence: 0.55,
      metadata_json: { extractedFrom: source.id },
    });
    linkSourceRecord(source, "entity", entity.id, candidate, 0.55);
    count += 1;
  }
  return count;
}

function processExplicitLine(source: BrainSourceDocument, line: string, extracted: BrainExtractionCounts): boolean {
  const match = /^(decision|risk|claim|promise)\s*:\s*(.+)$/i.exec(line);
  if (!match) return false;
  const [, kind, body] = match;
  if (!body) return false;
  const domain = inferDomain(body);
  if (kind.toLowerCase() === "decision") {
    const record = decisionService.create({ decision_text: body, domain, source_document_id: source.id, impact_level: inferImpact(body) });
    linkSourceRecord(source, "decision", record.id, line, 0.86);
    extracted.decisions += 1;
  }
  if (kind.toLowerCase() === "risk") {
    const record = riskService.create({ risk_text: body, domain, source_document_id: source.id, severity: inferSeverity(body) });
    linkSourceRecord(source, "risk", record.id, line, 0.82);
    extracted.risks += 1;
  }
  if (kind.toLowerCase() === "claim") {
    const record = claimService.create({ claim_text: body, domain, claim_type: classifyClaimType(body), source_document_id: source.id });
    linkSourceRecord(source, "claim", record.id, line, 0.78);
    extracted.claims += 1;
  }
  if (kind.toLowerCase() === "promise") {
    const record = promiseService.create({ promise_text: body, domain, source_document_id: source.id });
    linkSourceRecord(source, "promise", record.id, line, 0.76);
    extracted.promises += 1;
  }
  return true;
}

function processHeuristicLine(source: BrainSourceDocument, line: string, extracted: BrainExtractionCounts): void {
  const clean = stripMarkdownPrefix(line);
  if (clean.length < 16) return;
  const domain = inferDomain(clean);
  if (looksLikeRisk(clean)) {
    const record = riskService.create({ risk_text: clean, domain, source_document_id: source.id, severity: inferSeverity(clean) });
    linkSourceRecord(source, "risk", record.id, clean, 0.58);
    extracted.risks += 1;
    return;
  }
  if (looksLikeDecision(clean)) {
    const record = decisionService.create({ decision_text: clean, domain, source_document_id: source.id, impact_level: inferImpact(clean) });
    linkSourceRecord(source, "decision", record.id, clean, 0.6);
    extracted.decisions += 1;
    return;
  }
  if (looksLikePromise(clean)) {
    const record = promiseService.create({ promise_text: clean, domain, source_document_id: source.id });
    linkSourceRecord(source, "promise", record.id, clean, 0.58);
    extracted.promises += 1;
    return;
  }
  if (looksLikeDurableClaim(clean) && clean.length <= 180) {
    const record = claimService.create({ claim_text: clean, domain, claim_type: classifyClaimType(clean), source_document_id: source.id, confidence: 0.56 });
    linkSourceRecord(source, "claim", record.id, clean, 0.54);
    extracted.claims += 1;
  }
}

export function processSourceDocument(sourceDocumentId: string): { sourceDocument: BrainSourceDocument | null; extracted: BrainExtractionCounts } {
  const store = readBrainStore();
  const source = store.sourceDocuments.find((item) => item.id === sourceDocumentId);
  if (!source) return { sourceDocument: null, extracted: { claims: 0, decisions: 0, risks: 0, promises: 0, entities: 0 } };
  const text = source.raw_text ?? "";
  const lines = splitSentences(text);
  const extracted: BrainExtractionCounts = { claims: 0, decisions: 0, risks: 0, promises: 0, entities: 0 };

  for (const line of lines) {
    if (processExplicitLine(source, line, extracted)) continue;
    processHeuristicLine(source, line, extracted);
  }
  extracted.entities = extractEntitiesFromText(text, source, inferDomain(`${source.title} ${text}`));

  const updated = sourceDocumentService.updateProcessedStatus(source.id, "processed");
  return { sourceDocument: updated, extracted };
}

function formatClientMeetingSourceText(meeting: ReturnType<typeof getMeetings>[number]): string {
  return [
    `# ${meeting.title}`,
    `Meeting date: ${meeting.date} ${meeting.time}`,
    `Departments: ${meeting.departments.join(", ")}`,
    `Participants: ${meeting.participants.map((item) => `${item.name} (${item.role}, ${item.company})`).join(", ")}`,
    "## Executive Summary",
    meeting.executiveSummary,
    meeting.strategicNote ? `## Strategic Note\n${meeting.strategicNote}` : "",
    "## What Was Handled",
    ...meeting.whatsHandled.map((item) => `Decision: ${item}`),
    "## Next Steps",
    ...meeting.nextSteps.map((item) => `Promise: ${item}`),
  ].filter(Boolean).join("\n");
}

function formatStrategyRunSourceText(run: ReturnType<typeof getRuns>[number]): string {
  const runRecord = run as typeof run & { type?: string; summary?: string };
  const signalSources = Array.isArray(run.signalSources) ? run.signalSources : [];
  const agentsConsulted = Array.isArray(run.agentsConsulted) ? run.agentsConsulted : [];
  const title = run.theme ?? runRecord.type ?? "Agentic Board Meeting";
  const status = run.status ?? "completed";
  const memoText = typeof run.memo === "string" && run.memo.endsWith(".md")
    ? [runRecord.summary, `Memo file: ${run.memo}`].filter(Boolean).join("\n\n")
    : run.memo;
  return [
    `# Agentic Board Meeting: ${title}`,
    `Meeting date: ${run.date}`,
    `Status: ${status}`,
    `Signal sources: ${signalSources.join(", ")}`,
    `Agents consulted: ${agentsConsulted.join(", ")}`,
    run.skipReason ? `Risk: ${run.skipReason}` : "",
    memoText,
  ].filter(Boolean).join("\n\n");
}

function pruneLowConfidenceMeetingClaimNoise(): number {
  let removed = 0;
  updateBrainStore((store) => {
    const meetingSourceIds = new Set(
      store.sourceDocuments
        .filter((source) => source.source_system === "mission_control_agentic_board_meetings" || source.source_system === "mission_control_client_meetings")
        .map((source) => source.id)
    );
    const noisyClaimIds = new Set(
      store.claims
        .filter((claim) => claim.confidence <= 0.56 && claim.source_document_id && meetingSourceIds.has(claim.source_document_id))
        .map((claim) => claim.id)
    );
    if (noisyClaimIds.size === 0) return;
    removed = noisyClaimIds.size;
    store.claims = store.claims.filter((claim) => !noisyClaimIds.has(claim.id));
    store.sourceReferences = store.sourceReferences.filter((ref) => !(ref.target_type === "claim" && noisyClaimIds.has(ref.target_id)));
    store.contradictionFindings = store.contradictionFindings.filter((finding) =>
      !(finding.claim_a_id && noisyClaimIds.has(finding.claim_a_id)) && !(finding.claim_b_id && noisyClaimIds.has(finding.claim_b_id))
    );
  });
  return removed;
}

export function ingestMeetingsAsSources(options: { force?: boolean } = {}): { processed: number; createdOrFound: number; clientMeetings: number; boardMeetings: number } {
  if (options.force) pruneLowConfidenceMeetingClaimNoise();
  const meetings = getMeetings();
  const runs = getRuns();
  let processed = 0;
  for (const meeting of meetings) {
    const source = sourceDocumentService.createOrFind({
      source_type: "fireflies",
      source_system: "mission_control_client_meetings",
      external_id: `client-meeting:${meeting.id}`,
      source_url: meeting.transcriptUrl ?? null,
      title: meeting.title,
      raw_text: formatClientMeetingSourceText(meeting),
      raw_json: meeting,
      created_at_source: meeting.createdAt,
      metadata_json: { meetingKind: "client_employee", departments: meeting.departments, participants: meeting.participants.map((item) => item.name) },
    });
    if (options.force || source.processed_status !== "processed") {
      processSourceDocument(source.id);
      processed += 1;
    }
  }
  for (const run of runs) {
    const source = sourceDocumentService.createOrFind({
      source_type: "api",
      source_system: "mission_control_agentic_board_meetings",
      external_id: `strategy-run:${run.id}`,
      title: `Agentic Board Meeting - ${run.theme ?? (run as typeof run & { type?: string }).type ?? "Board"} - ${run.date}`,
      raw_text: formatStrategyRunSourceText(run),
      raw_json: run,
      created_at_source: run.endTime || run.startTime,
      metadata_json: {
        meetingKind: "agentic_board",
        theme: run.theme ?? (run as typeof run & { type?: string }).type ?? null,
        status: run.status ?? "completed",
        signalSources: Array.isArray(run.signalSources) ? run.signalSources : [],
        agentsConsulted: Array.isArray(run.agentsConsulted) ? run.agentsConsulted : [],
      },
    });
    if (options.force || source.processed_status !== "processed") {
      processSourceDocument(source.id);
      processed += 1;
    }
  }
  return { processed, createdOrFound: meetings.length + runs.length, clientMeetings: meetings.length, boardMeetings: runs.length };
}

export const contradictionService = {
  detect(domain = "all"): BrainContradictionFinding[] {
    seedBrainIfEmpty();
    updateBrainStore((store) => {
      const generatedTypes = new Set<BrainFindingType>(["conflicting_claims", "price_conflict", "location_conflict", "event_detail_conflict", "missing_owner", "promise_without_task"]);
      store.contradictionFindings = store.contradictionFindings.filter((finding) =>
        finding.status !== "open" ||
        !generatedTypes.has(finding.finding_type) ||
        (domain !== "all" && finding.domain !== domain)
      );
      const claims = store.claims.filter((claim) => claim.status === "active" && isAcceptedTrust(claim.trust_status) && (domain === "all" || claim.domain === domain));
      for (let index = 0; index < claims.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < claims.length; otherIndex += 1) {
          const a = claims[index];
          const b = claims[otherIndex];
          if (!a || !b) continue;
          if (!shouldCompareClaims(a, b) || a.normalized_claim === b.normalized_claim) continue;
          const type: BrainFindingType = a.claim_type === "price" ? "price_conflict" : a.claim_type === "location" ? "location_conflict" : "conflicting_claims";
          upsertFinding(store, {
            title: `Conflicting ${a.claim_type} claims`,
            description: `"${a.claim_text}" conflicts with "${b.claim_text}".`,
            domain: a.domain,
            severity: severityForFinding(type, a.domain),
            finding_type: type,
            entity_id: a.entity_id,
            claim_a_id: a.id,
            claim_b_id: b.id,
            source_document_a_id: a.source_document_id,
            source_document_b_id: b.source_document_id,
            recommended_resolution: "Confirm the current source of truth and mark the stale claim superseded or contradicted.",
            managerial_question: `Which version should Mission Control treat as the operating truth for ${a.domain.replace(/_/g, " ")}?`,
            evidence_summary: `${evidenceLabel(store, a.source_document_id)} vs ${evidenceLabel(store, b.source_document_id)}`,
            assigned_to_entity_id: null,
          });
        }
      }

      for (const claim of store.claims.filter((item) => item.supersedes_claim_id && item.status === "active")) {
        const oldClaim = store.claims.find((item) => item.id === claim.supersedes_claim_id && item.status === "active");
        if (!oldClaim) continue;
        upsertFinding(store, {
          title: "Superseded claim still active",
          description: `"${oldClaim.claim_text}" is still active even though "${claim.claim_text}" supersedes it.`,
          domain: claim.domain,
          severity: "medium",
          finding_type: "conflicting_claims",
          entity_id: claim.entity_id,
          claim_a_id: oldClaim.id,
          claim_b_id: claim.id,
          source_document_a_id: oldClaim.source_document_id,
          source_document_b_id: claim.source_document_id,
          recommended_resolution: "Mark the old claim superseded.",
          managerial_question: "Should the newer claim supersede the older operating memory?",
          evidence_summary: `${evidenceLabel(store, oldClaim.source_document_id)} vs ${evidenceLabel(store, claim.source_document_id)}`,
          assigned_to_entity_id: null,
        });
      }

      for (const risk of store.risks.filter((item) => ["open", "monitoring"].includes(item.status) && isAcceptedTrust(item.trust_status) && !item.owner_entity_id && (domain === "all" || item.domain === domain))) {
        upsertFinding(store, {
          title: "Risk is missing an owner",
          description: risk.risk_text,
          domain: risk.domain,
          severity: severityForFinding("missing_owner", risk.domain),
          finding_type: "missing_owner",
          entity_id: risk.related_entity_id,
          claim_a_id: null,
          claim_b_id: null,
          source_document_a_id: risk.source_document_id,
          source_document_b_id: null,
          recommended_resolution: "Assign an accountable owner or accept the risk.",
          managerial_question: "Who owns this risk, and what decision would reduce ambiguity?",
          evidence_summary: evidenceLabel(store, risk.source_document_id),
          assigned_to_entity_id: null,
        });
      }

      const openActionText = readActionItems().filter((item) => item.status !== "complete").map((item) => normalizeMemoryText(`${item.title} ${item.notes}`));
      for (const promise of store.promises.filter((item) => item.status === "active" && isAcceptedTrust(item.trust_status) && (domain === "all" || item.domain === domain))) {
        const hasTask = openActionText.some((text) => text.includes(normalizeMemoryText(promise.promise_text).slice(0, 32)));
        if (hasTask) continue;
        upsertFinding(store, {
          title: "Promise has no matching open task",
          description: promise.promise_text,
          domain: promise.domain,
          severity: severityForFinding("promise_without_task", promise.domain),
          finding_type: "promise_without_task",
          entity_id: promise.made_by_entity_id,
          claim_a_id: null,
          claim_b_id: null,
          source_document_a_id: promise.source_document_id,
          source_document_b_id: null,
          recommended_resolution: "Create or link an action item, or mark the promise fulfilled/superseded.",
          managerial_question: "Is this still a real commitment, and who should be accountable for the next move?",
          evidence_summary: evidenceLabel(store, promise.source_document_id),
          assigned_to_entity_id: null,
        });
      }
    });
    return readBrainStore().contradictionFindings.filter((item) => item.status === "open" && (domain === "all" || item.domain === domain));
  },

  resolve(id: string, input: { resolution: string; winningClaimId?: string | null; resolvedBy?: string | null }): BrainContradictionFinding | null {
    let finding: BrainContradictionFinding | null = null;
    updateBrainStore((store) => {
      const match = store.contradictionFindings.find((item) => item.id === id);
      if (!match) return;
      match.status = "resolved";
      match.resolved_at = nowIso();
      match.resolved_by_entity_id = input.resolvedBy ?? null;
      match.recommended_resolution = input.resolution;
      match.updated_at = match.resolved_at;
      if (input.winningClaimId) {
        for (const claim of store.claims) {
          if ((claim.id === match.claim_a_id || claim.id === match.claim_b_id) && claim.id !== input.winningClaimId) {
            claim.status = "superseded";
            claim.updated_at = match.resolved_at;
          }
        }
      }
      finding = match;
    });
    return finding;
  },
};

export const contextPackService = {
  generate(input: { pack?: string; domain?: string; audience?: string; tokenBudget?: number }): BrainContextPack {
    seedBrainIfEmpty();
    const template = DEFAULT_PACKS.find((pack) => pack.slug === input.pack || pack.domain === input.domain) ?? DEFAULT_PACKS[0];
    const domain = input.domain ?? template.domain;
    const audience = input.audience ?? template.audience;
    const tokenBudget = input.tokenBudget ?? template.tokenBudget;
    const store = readBrainStore();
    const actionItems = readActionItems().filter((item) => item.status !== "complete" && (domain === "leadership" || normalizeMemoryText(item.department).includes(domain.replace("_", " "))));
    const approvedClaims = store.claims.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "approved").slice(0, 12);
    const candidateClaims = store.claims.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "candidate").slice(0, 6);
    const approvedDecisions = store.decisions.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "approved").slice(0, 8);
    const candidateDecisions = store.decisions.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "candidate").slice(0, 4);
    const risks = store.risks.filter((item) => item.domain === domain && ["open", "monitoring"].includes(item.status) && isAcceptedTrust(item.trust_status)).slice(0, 8);
    const contradictions = store.contradictionFindings.filter((item) => item.domain === domain && item.status === "open").slice(0, 8);
    const entities = store.entities.filter((item) => item.domain === domain || domain === "leadership").slice(0, 8);
    const sourceIds = [...approvedClaims.map((item) => item.id), ...candidateClaims.map((item) => item.id), ...approvedDecisions.map((item) => item.id), ...candidateDecisions.map((item) => item.id), ...risks.map((item) => item.id), ...contradictions.map((item) => item.id)];
    const markdown = approximateTokenTrim([
      `# ${template.name}`,
      `purpose: ${template.purpose}`,
      `audience: ${audience}`,
      `token_budget: ${tokenBudget}`,
      `generated_at: ${nowIso()}`,
      "freshness_status: fresh",
      "source_of_truth: Knowledge Brain structured memory; candidate records are labeled and should be verified before operational use.",
      compactList("Approved priorities", approvedDecisions.map((item) => item.decision_text)),
      compactList("Candidate priorities needing review", candidateDecisions.map((item) => item.decision_text)),
      compactList("Approved facts", approvedClaims.map((item) => item.claim_text)),
      compactList("Candidate facts needing review", candidateClaims.map((item) => item.claim_text)),
      compactList("Open action items", actionItems.slice(0, 8).map((item) => `${item.title} (${item.owner || "unowned"})`)),
      compactList("Risks, contradictions, and managerial tensions", [...risks.map((item) => item.risk_text), ...contradictions.map((item) => `${item.title}${item.managerial_question ? ` - ${item.managerial_question}` : ""}`)]),
      compactList("Relevant entities", entities.map((item) => item.canonical_name)),
      compactList("Source IDs", sourceIds),
    ].join("\n\n"), tokenBudget);

    let pack: BrainContextPack | undefined;
    const now = nowIso();
    updateBrainStore((draft) => {
      pack = draft.contextPacks.find((item) => item.slug === template.slug && item.audience === audience);
      if (pack) {
        Object.assign(pack, { domain, purpose: template.purpose, audience, token_budget: tokenBudget, markdown, source_record_ids_json: sourceIds, freshness_status: "fresh", last_generated_at: now, updated_at: now });
        return;
      }
      pack = {
        id: newBrainId("brain-pack"),
        name: template.name,
        slug: template.slug,
        domain,
        purpose: template.purpose,
        audience,
        token_budget: tokenBudget,
        markdown,
        source_record_ids_json: sourceIds,
        freshness_status: "fresh",
        last_generated_at: now,
        created_at: now,
        updated_at: now,
      };
      draft.contextPacks.unshift(pack);
    });
    return pack as BrainContextPack;
  },

  generateDefaults(): BrainContextPack[] {
    return DEFAULT_PACKS.map((pack) => contextPackService.generate({ pack: pack.slug }));
  },
};

export const compiledPageService = {
  generate(input: { pageType?: BrainPageType; domain?: string; target?: BrainTargetSystem; title?: string }): BrainCompiledPage {
    seedBrainIfEmpty();
    const domain = input.domain ?? "leadership";
    const pageType = input.pageType ?? "strategy";
    const title = input.title ?? `${domain.replace(/_/g, " ")} ${pageType.replace(/_/g, " ")}`;
    const store = readBrainStore();
    const approvedClaims = store.claims.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "approved").slice(0, 12);
    const candidateClaims = store.claims.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "candidate").slice(0, 8);
    const approvedDecisions = store.decisions.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "approved").slice(0, 12);
    const candidateDecisions = store.decisions.filter((item) => item.domain === domain && item.status === "active" && item.trust_status === "candidate").slice(0, 8);
    const risks = store.risks.filter((item) => item.domain === domain && ["open", "monitoring"].includes(item.status) && isAcceptedTrust(item.trust_status)).slice(0, 12);
    const contradictions = store.contradictionFindings.filter((item) => item.domain === domain && item.status === "open").slice(0, 12);
    const actionItems = readActionItems().filter((item) => item.status !== "complete").slice(0, 12);
    const sourceRecordIds = [...approvedClaims.map((item) => item.id), ...candidateClaims.map((item) => item.id), ...approvedDecisions.map((item) => item.id), ...candidateDecisions.map((item) => item.id), ...risks.map((item) => item.id), ...contradictions.map((item) => item.id)];
    const markdown = [
      `# ${title}`,
      `generated_at: ${nowIso()}`,
      "freshness: fresh",
      "source_of_truth: Generated from Knowledge Brain structured memory. This page is an artifact, not the authority.",
      "## Executive summary",
      `${title} is generated from Knowledge Brain structured memory and source-linked records.`,
      compactList("Approved current state", approvedClaims.map((item) => item.claim_text)),
      compactList("Candidate current state needing review", candidateClaims.map((item) => item.claim_text)),
      compactList("Approved decisions", approvedDecisions.map((item) => item.decision_text)),
      compactList("Candidate decisions needing review", candidateDecisions.map((item) => item.decision_text)),
      compactList("Open action items", actionItems.map((item) => `${item.title} (${item.owner || "unowned"})`)),
      compactList("Risks", risks.map((item) => item.risk_text)),
      compactList("Managerial contradictions", contradictions.map((item) => `${item.severity}: ${item.title}${item.managerial_question ? ` - ${item.managerial_question}` : ""}${item.evidence_summary ? ` [${item.evidence_summary}]` : ""}`)),
      compactList("Source record IDs", sourceRecordIds),
    ].join("\n\n");
    const summary = approvedDecisions[0]?.decision_text ?? candidateDecisions[0]?.decision_text ?? risks[0]?.risk_text ?? "Generated Knowledge Brain page with current structured memory.";
    const slug = slugify(title);
    let page: BrainCompiledPage | undefined;
    const now = nowIso();
    updateBrainStore((draft) => {
      page = draft.compiledPages.find((item) => item.slug === slug);
      if (page) {
        Object.assign(page, { markdown, summary, source_record_ids_json: sourceRecordIds, freshness_status: "fresh", last_generated_at: now, target_system: input.target ?? "mission_control", updated_at: now });
        return;
      }
      page = {
        id: newBrainId("brain-page"),
        title,
        slug,
        domain,
        page_type: pageType,
        markdown,
        summary,
        source_record_ids_json: sourceRecordIds,
        freshness_status: "fresh",
        last_generated_at: now,
        generated_by: "client_brain_service",
        target_system: input.target ?? "mission_control",
        external_url: null,
        created_at: now,
        updated_at: now,
      };
      draft.compiledPages.unshift(page);
    });
    return page as BrainCompiledPage;
  },
};

export function createLearningEvent(input: {
  event_text: string;
  domain?: string;
  source_type?: BrainLearningSourceType;
  affected_agent?: string | null;
  proposed_rule?: string | null;
  applied_to?: BrainLearningAppliedTo | null;
  source_document_id?: string | null;
}) {
  let event = null as ReturnType<typeof readBrainStore>["learningEvents"][number] | null;
  const now = nowIso();
  updateBrainStore((store) => {
    event = {
      id: newBrainId("brain-learning"),
      event_text: input.event_text,
      domain: input.domain ?? inferDomain(input.event_text),
      source_type: input.source_type ?? "user_correction",
      affected_agent: input.affected_agent ?? null,
      proposed_rule: input.proposed_rule ?? null,
      status: "pending",
      applied_to: input.applied_to ?? null,
      source_document_id: input.source_document_id ?? null,
      created_at: now,
      updated_at: now,
    };
    store.learningEvents.unshift(event);
  });
  return event;
}

export function getBrainOverview() {
  seedBrainIfEmpty();
  const store = readBrainStore();
  const now = new Date();
  const actionItems = readActionItems();
  const staleActionItems = actionItems.filter((item) => {
    if (item.status === "complete") return false;
    if (item.deadline && item.deadline < now.toISOString().slice(0, 10)) return true;
    return new Date(item.updatedAt).getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 21;
  }).slice(0, 10);
  const domainSummaries = DEFAULT_DOMAINS.map((domain) => ({
    domain,
    freshness: store.compiledPages.some((page) => page.domain === domain && page.freshness_status === "fresh") ? "fresh" : "needs_review",
    openRisks: store.risks.filter((item) => item.domain === domain && ["open", "monitoring"].includes(item.status)).length,
    openActions: staleActionItems.filter((item) => normalizeMemoryText(item.department).includes(domain.replace("_", " "))).length,
    recentDecisions: store.decisions.filter((item) => item.domain === domain && item.status === "active").slice(0, 3),
    lastCompiled: byUpdatedAt(store.compiledPages.filter((item) => item.domain === domain))[0]?.last_generated_at ?? null,
  }));
  const allReviewQueue = buildReviewQueue(store);
  const reviewQueue = allReviewQueue.slice(0, 30);
  const decisionInbox = buildDecisionInbox(store, allReviewQueue);
  const readiness = buildInitiativeReadiness(store);
  const entityProfiles = buildEntityProfiles(store);
  const memoryDiff = buildMemoryDiff(store);
  const managerBrief = {
    title: "Managerial Decision Brief",
    posture: "Structured memory is authoritative; compiled pages and packs are generated artifacts.",
    headline: decisionInbox[0]?.decisionNeeded ?? "No urgent decision surfaced right now.",
    recommendedFocus: readiness[0]?.nextBestAction ?? "Approve high-confidence memory so agents can safely rely on it.",
    topContradictions: store.contradictionFindings
      .filter((item) => item.status === "open")
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        title: item.title,
        domain: item.domain,
        severity: item.severity,
        question: item.managerial_question,
        evidence: item.evidence_summary,
        recommendation: item.recommended_resolution,
      })),
    decisionsNeeded: reviewQueue.filter((item) => item.priority === "critical" || item.priority === "high").slice(0, 8),
  };
  return {
    managerBrief,
    decisionInbox,
    readiness,
    entityProfiles,
    memoryDiff,
    obsidianExport: {
      defaultOutputDir: process.env.CLIENT_BRAIN_OBSIDIAN_DIR || DEFAULT_OBSIDIAN_EXPORT_DIR,
      mapOfMapsPath: path.join(process.env.CLIENT_BRAIN_OBSIDIAN_DIR || DEFAULT_OBSIDIAN_EXPORT_DIR, "MAP_OF_MAPS.md"),
      strategy: "Generated markdown is a context router over Knowledge Brain; structured memory remains authoritative.",
    },
    today: {
      urgentContradictions: store.contradictionFindings.filter((item) => item.status === "open" && ["critical", "high"].includes(item.severity)).slice(0, 8),
      staleActionItems,
      newDecisions: byUpdatedAt(store.decisions.filter((item) => item.status === "active")).slice(0, 8),
      topRisks: byUpdatedAt(store.risks.filter((item) => ["open", "monitoring"].includes(item.status))).slice(0, 8),
      activePromises: byUpdatedAt(store.promises.filter((item) => item.status === "active")).slice(0, 8),
    },
    domains: domainSummaries,
    recentSourceDocuments: byUpdatedAt(store.sourceDocuments).slice(0, 12),
    contradictions: byUpdatedAt(store.contradictionFindings.filter((item) => item.status === "open")).slice(0, 20),
    compiledPages: byUpdatedAt(store.compiledPages).slice(0, 20),
    contextPacks: byUpdatedAt(store.contextPacks).slice(0, 20),
    promises: byUpdatedAt(store.promises.filter((item) => item.status === "active")).slice(0, 20),
    learningEvents: byUpdatedAt(store.learningEvents).slice(0, 20),
    reviewQueue,
    counts: {
      sources: store.sourceDocuments.length,
      claims: store.claims.length,
      decisions: store.decisions.length,
      risks: store.risks.length,
      promises: store.promises.length,
      contradictions: store.contradictionFindings.filter((item) => item.status === "open").length,
      reviewQueue: reviewQueue.length,
      approvedMemory:
        store.claims.filter((item) => item.trust_status === "approved").length +
        store.decisions.filter((item) => item.trust_status === "approved").length +
        store.risks.filter((item) => item.trust_status === "approved").length +
        store.promises.filter((item) => item.trust_status === "approved").length,
      contextPacks: store.contextPacks.length,
      compiledPages: store.compiledPages.length,
      learningEvents: store.learningEvents.length,
    },
  };
}

export function getBrainHealth() {
  const store = readBrainStore();
  const latestSource = byUpdatedAt(store.sourceDocuments)[0] ?? null;
  const latestProcessed = byUpdatedAt(store.sourceDocuments.filter((item) => item.processed_at))[0] ?? null;
  return {
    ok: true,
    store: "file-backed",
    latestSource,
    latestProcessed,
    pendingSources: store.sourceDocuments.filter((item) => item.processed_status === "pending").length,
    failedSources: store.sourceDocuments.filter((item) => item.processed_status === "failed").length,
    openContradictions: store.contradictionFindings.filter((item) => item.status === "open").length,
    staleCompiledPages: store.compiledPages.filter((item) => item.freshness_status !== "fresh").length,
    staleContextPacks: store.contextPacks.filter((item) => item.freshness_status !== "fresh").length,
    counts: {
      sources: store.sourceDocuments.length,
      references: store.sourceReferences.length,
      entities: store.entities.length,
      claims: store.claims.length,
      decisions: store.decisions.length,
      risks: store.risks.length,
      promises: store.promises.length,
      contradictions: store.contradictionFindings.length,
      contextPacks: store.contextPacks.length,
      compiledPages: store.compiledPages.length,
      learningEvents: store.learningEvents.length,
    },
  };
}

export function queryBrain(input: { question: string; domain?: string; mode?: string; maxTokens?: number; includeSources?: boolean }) {
  seedBrainIfEmpty();
  const domain = input.domain && input.domain !== "all" ? input.domain : null;
  const mode = input.mode ?? "approved_plus_candidate";
  const normalizedQuestion = normalizeMemoryText(input.question);
  const terms = normalizedQuestion
    .split(" ")
    .filter((term) => term.length > 2 && !["what", "are", "the", "for", "and", "current"].includes(term));
  const isRelevant = (text: string) => terms.length === 0 || terms.some((term) => normalizeMemoryText(text).includes(term));
  const store = readBrainStore();
  const trustAllowed = (status: BrainTrustStatus) => mode === "approved_only" ? status === "approved" : isAcceptedTrust(status);
  const matches = {
    contextPacks: mode === "approved_only" ? [] : store.contextPacks.filter((item) => (!domain || item.domain === domain) && (domain || isRelevant(`${item.name} ${item.markdown}`))).slice(0, 3),
    claims: store.claims.filter((item) => item.status === "active" && trustAllowed(item.trust_status) && (!domain || item.domain === domain) && (domain || isRelevant(item.claim_text))).slice(0, 8),
    decisions: store.decisions.filter((item) => item.status === "active" && trustAllowed(item.trust_status) && (!domain || item.domain === domain) && (domain || isRelevant(item.decision_text))).slice(0, 8),
    risks: store.risks.filter((item) => trustAllowed(item.trust_status) && (!domain || item.domain === domain) && ["open", "monitoring"].includes(item.status) && (domain || isRelevant(item.risk_text))).slice(0, 8),
    contradictions: mode === "contradiction_mode" || mode === "approved_plus_candidate"
      ? store.contradictionFindings.filter((item) => item.status === "open" && (!domain || item.domain === domain) && (domain || isRelevant(`${item.title} ${item.description}`))).slice(0, 8)
      : [],
    compiledPages: mode === "approved_only" ? [] : store.compiledPages.filter((item) => (!domain || item.domain === domain) && (domain || isRelevant(`${item.title} ${item.markdown}`))).slice(0, 3),
  };
  const sourceIds = new Set<string>();
  for (const claim of matches.claims) if (claim.source_document_id) sourceIds.add(claim.source_document_id);
  for (const decision of matches.decisions) if (decision.source_document_id) sourceIds.add(decision.source_document_id);
  for (const risk of matches.risks) if (risk.source_document_id) sourceIds.add(risk.source_document_id);
  return {
    answerMode: "structured_retrieval",
    synthesisTodo: "No existing LLM abstraction was used; returning structured Knowledge Brain records.",
    question: input.question,
    domain: domain ?? "all",
    mode,
    policy: mode === "approved_only" ? "Only approved memory is returned." : mode === "raw_evidence" ? "Structured records plus linked sources are returned." : "Approved and candidate memory are returned with source evidence.",
    maxTokens: input.maxTokens ?? 2000,
    results: matches,
    sources: input.includeSources ? store.sourceDocuments.filter((item) => sourceIds.has(item.id)) : [],
  };
}

export function bootstrapBrainArtifacts(): void {
  seedBrainIfEmpty();
  contradictionService.detect("all");
  contextPackService.generate({ pack: "leadership-priorities" });
  contextPackService.generate({ pack: "client-fit" });
  compiledPageService.generate({ pageType: "strategy", domain: "leadership", title: "Leadership Decisions" });
  const store = readBrainStore();
  writeBrainStore(store);
}
