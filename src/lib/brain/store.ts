import { createHash, randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import type { BrainClaim, BrainDecision, BrainPromise, BrainRisk, BrainStore } from "./types";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "example-client-brain.json");
const TMP_STORE_PATH = `${STORE_PATH}.tmp`;

export const emptyBrainStore = (): BrainStore => ({
  sourceDocuments: [],
  sourceReferences: [],
  entities: [],
  entityAliases: [],
  entityRelationships: [],
  claims: [],
  decisions: [],
  risks: [],
  promises: [],
  contradictionFindings: [],
  compiledPages: [],
  contextPacks: [],
  learningEvents: [],
});

function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeReviewable<T extends BrainClaim | BrainDecision | BrainRisk | BrainPromise>(item: T): T {
  const createdAt = "created_at" in item ? item.created_at : nowIso();
  return {
    ...item,
    trust_status: item.trust_status ?? "candidate",
    review_priority: item.review_priority ?? "medium",
    reviewed_by: item.reviewed_by ?? null,
    reviewed_at: item.reviewed_at ?? null,
    review_note: item.review_note ?? null,
    created_at: createdAt,
    updated_at: item.updated_at ?? createdAt,
  };
}

function normalizeStore(parsed: Partial<BrainStore>): BrainStore {
  return {
    ...emptyBrainStore(),
    ...parsed,
    sourceDocuments: Array.isArray(parsed.sourceDocuments) ? parsed.sourceDocuments : [],
    sourceReferences: Array.isArray(parsed.sourceReferences) ? parsed.sourceReferences : [],
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    entityAliases: Array.isArray(parsed.entityAliases) ? parsed.entityAliases : [],
    entityRelationships: Array.isArray(parsed.entityRelationships) ? parsed.entityRelationships : [],
    claims: Array.isArray(parsed.claims) ? parsed.claims.map(normalizeReviewable) : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.map(normalizeReviewable) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(normalizeReviewable) : [],
    promises: Array.isArray(parsed.promises) ? parsed.promises.map(normalizeReviewable) : [],
    contradictionFindings: Array.isArray(parsed.contradictionFindings)
      ? parsed.contradictionFindings.map((finding) => ({
        ...finding,
        managerial_question: finding.managerial_question ?? null,
        evidence_summary: finding.evidence_summary ?? null,
      }))
      : [],
    compiledPages: Array.isArray(parsed.compiledPages) ? parsed.compiledPages : [],
    contextPacks: Array.isArray(parsed.contextPacks) ? parsed.contextPacks : [],
    learningEvents: Array.isArray(parsed.learningEvents) ? parsed.learningEvents : [],
  };
}

export function readBrainStore(): BrainStore {
  ensureDataDir();
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    return normalizeStore(JSON.parse(raw) as Partial<BrainStore>);
  } catch {
    const store = emptyBrainStore();
    writeBrainStore(store);
    return store;
  }
}

export function writeBrainStore(store: BrainStore): void {
  ensureDataDir();
  writeFileSync(TMP_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  renameSync(TMP_STORE_PATH, STORE_PATH);
}

export function updateBrainStore(mutator: (store: BrainStore) => void): BrainStore {
  const store = readBrainStore();
  mutator(store);
  writeBrainStore(store);
  return store;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newBrainId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function stableHash(input: unknown): string {
  const text = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return createHash("sha256").update(text).digest("hex");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeMemoryText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\n\r\t]+/g, " ")
    .replace(/[.,;:!?'"()[\]{}]/g, "")
    .trim();
}
