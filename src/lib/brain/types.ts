export type BrainSourceType =
  | "fireflies"
  | "discord"
  | "email"
  | "sheet"
  | "shopify"
  | "quickbooks"
  | "notion"
  | "obsidian"
  | "canva"
  | "manual"
  | "api";

export type BrainSensitivityLevel = "public" | "internal" | "leadership" | "financial" | "private";
export type BrainProcessedStatus = "pending" | "processed" | "failed" | "ignored";
export type BrainEntityType = "person" | "company" | "brand" | "program" | "event" | "location" | "product" | "market" | "agent" | "document" | "system";
export type BrainEntityStatus = "active" | "inactive" | "archived";
export type BrainRelationshipStrength = "weak" | "medium" | "strong";
export type BrainClaimType = "fact" | "preference" | "policy" | "price" | "location" | "date" | "status" | "promise" | "instruction" | "constraint";
export type BrainClaimStatus = "active" | "superseded" | "contradicted" | "expired" | "unverified";
export type BrainDecisionStatus = "active" | "superseded" | "reversed" | "pending" | "archived";
export type BrainImpactLevel = "low" | "medium" | "high" | "critical";
export type BrainRiskSeverity = "low" | "medium" | "high" | "critical";
export type BrainRiskStatus = "open" | "monitoring" | "mitigated" | "accepted" | "closed";
export type BrainPromiseStatus = "active" | "fulfilled" | "broken" | "superseded" | "unclear";
export type BrainFindingStatus = "open" | "assigned" | "resolved" | "ignored";
export type BrainTrustStatus = "candidate" | "approved" | "rejected" | "superseded";
export type BrainReviewPriority = "low" | "medium" | "high" | "critical";
export type BrainFindingType =
  | "conflicting_claims"
  | "stale_task"
  | "missing_owner"
  | "stale_source"
  | "promise_without_task"
  | "event_detail_conflict"
  | "price_conflict"
  | "location_conflict";
export type BrainPageType = "strategy" | "entity_profile" | "weekly_brief" | "playbook" | "operating_model" | "risk_report" | "decision_log";
export type BrainFreshnessStatus = "fresh" | "stale" | "needs_review" | "failed";
export type BrainTargetSystem = "mission_control" | "obsidian" | "notion" | "both";
export type BrainLearningSourceType = "user_correction" | "agent_error" | "contradiction" | "meeting_decision" | "style_correction";
export type BrainLearningStatus = "pending" | "applied" | "rejected";
export type BrainLearningAppliedTo = "skill" | "style_guide" | "context_pack" | "memory" | "entity_profile" | "docs";

export interface BrainSourceDocument {
  id: string;
  source_type: BrainSourceType;
  source_system: string;
  external_id: string | null;
  source_url: string | null;
  title: string;
  raw_text: string | null;
  raw_json: unknown | null;
  author_name: string | null;
  author_id: string | null;
  created_at_source: string | null;
  captured_at: string;
  processed_at: string | null;
  processed_status: BrainProcessedStatus;
  hash: string;
  sensitivity_level: BrainSensitivityLevel;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BrainSourceReference {
  id: string;
  source_document_id: string;
  target_type: string;
  target_id: string;
  quote_text: string | null;
  start_offset: number | null;
  end_offset: number | null;
  confidence: number;
  created_at: string;
}

export interface BrainEntity {
  id: string;
  entity_type: BrainEntityType;
  name: string;
  canonical_name: string;
  description: string | null;
  status: BrainEntityStatus;
  domain: string | null;
  owner_person_id: string | null;
  confidence: number;
  last_confirmed_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BrainEntityAlias {
  id: string;
  entity_id: string;
  alias: string;
  source_document_id: string | null;
  created_at: string;
}

export interface BrainEntityRelationship {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  relationship_type: string;
  strength: BrainRelationshipStrength;
  confidence: number;
  source_document_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainClaim {
  id: string;
  claim_text: string;
  normalized_claim: string;
  domain: string;
  entity_id: string | null;
  claim_type: BrainClaimType;
  status: BrainClaimStatus;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
  last_confirmed_at: string | null;
  source_document_id: string | null;
  supersedes_claim_id: string | null;
  sensitivity_level: BrainSensitivityLevel;
  trust_status: BrainTrustStatus;
  review_priority: BrainReviewPriority;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainDecision {
  id: string;
  decision_text: string;
  normalized_decision: string;
  domain: string;
  status: BrainDecisionStatus;
  decided_by_entity_id: string | null;
  owner_entity_id: string | null;
  decision_date: string | null;
  effective_date: string | null;
  source_document_id: string | null;
  supersedes_decision_id: string | null;
  confidence: number;
  impact_level: BrainImpactLevel;
  trust_status: BrainTrustStatus;
  review_priority: BrainReviewPriority;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainRisk {
  id: string;
  risk_text: string;
  domain: string;
  severity: BrainRiskSeverity;
  status: BrainRiskStatus;
  owner_entity_id: string | null;
  recommended_action: string | null;
  source_document_id: string | null;
  related_entity_id: string | null;
  trust_status: BrainTrustStatus;
  review_priority: BrainReviewPriority;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainPromise {
  id: string;
  promise_text: string;
  made_by_entity_id: string | null;
  made_to_entity_id: string | null;
  domain: string;
  status: BrainPromiseStatus;
  due_date: string | null;
  source_document_id: string | null;
  related_opportunity_id: string | null;
  related_event_id: string | null;
  related_company_id: string | null;
  trust_status: BrainTrustStatus;
  review_priority: BrainReviewPriority;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainContradictionFinding {
  id: string;
  title: string;
  description: string;
  domain: string;
  severity: BrainRiskSeverity;
  status: BrainFindingStatus;
  finding_type: BrainFindingType;
  entity_id: string | null;
  claim_a_id: string | null;
  claim_b_id: string | null;
  source_document_a_id: string | null;
  source_document_b_id: string | null;
  recommended_resolution: string | null;
  managerial_question: string | null;
  evidence_summary: string | null;
  assigned_to_entity_id: string | null;
  resolved_by_entity_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainCompiledPage {
  id: string;
  title: string;
  slug: string;
  domain: string;
  page_type: BrainPageType;
  markdown: string;
  summary: string;
  source_record_ids_json: string[];
  freshness_status: BrainFreshnessStatus;
  last_generated_at: string;
  generated_by: string;
  target_system: BrainTargetSystem;
  external_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainContextPack {
  id: string;
  name: string;
  slug: string;
  domain: string;
  purpose: string;
  audience: string;
  token_budget: number;
  markdown: string;
  source_record_ids_json: string[];
  freshness_status: BrainFreshnessStatus;
  last_generated_at: string;
  created_at: string;
  updated_at: string;
}

export interface BrainLearningEvent {
  id: string;
  event_text: string;
  domain: string;
  source_type: BrainLearningSourceType;
  affected_agent: string | null;
  proposed_rule: string | null;
  status: BrainLearningStatus;
  applied_to: BrainLearningAppliedTo | null;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrainStore {
  sourceDocuments: BrainSourceDocument[];
  sourceReferences: BrainSourceReference[];
  entities: BrainEntity[];
  entityAliases: BrainEntityAlias[];
  entityRelationships: BrainEntityRelationship[];
  claims: BrainClaim[];
  decisions: BrainDecision[];
  risks: BrainRisk[];
  promises: BrainPromise[];
  contradictionFindings: BrainContradictionFinding[];
  compiledPages: BrainCompiledPage[];
  contextPacks: BrainContextPack[];
  learningEvents: BrainLearningEvent[];
}
