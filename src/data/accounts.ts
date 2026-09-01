// ── Example Client Mission Control CRM Account Data ──

import { z } from "zod";

export type Provenance = "verified" | "seeded" | "manual" | "inferred" | "imported";

export interface CRMSourceRef {
  system: string;
  externalId?: string;
  url?: string;
  importBatchId?: string;
  label?: string;
  importedAt?: string;
}

export interface CRMRecordAsset {
  id: string;
  label: string;
  fileName: string;
  url: string;
  kind: "logo" | "image" | "document" | "link" | "other";
  mimeType?: string;
  source?: "Manual Upload" | "Notion Import" | "External Link" | "AI Enrichment";
  sourceUrl?: string;
  importBatchId?: string;
  createdAt: string;
}

// Account record-type discriminates B2B vs B2C-as-account.
// "company"        — corporate/brand/venue accounts (B2B motion).
// "person_account" — reserved for rare one-person commercial entities.
// All currently-existing accounts in the system are companies, so the migration
// helper backfills missing values to "company".
export type AccountRecordType = "company" | "person_account";

export type AccountType = "Prospect" | "Partner" | "Client";
export type LegacyAccountType = AccountType | "Customer" | "Vendor";
export type AccountLifecycleStage = "new" | "outreach" | "engaged" | "meeting" | "opportunity" | "nurture" | "disqualified";
export type LegacyAccountLifecycleStage = AccountLifecycleStage | "active";

export type AccountSubType =
  // Customer
  | "Founder / CEO"
  | "Operator"
  | "Professional Services"
  | "Technology"
  | "Install Program"
  | "Corporate Event"
  | "Brand Partnership"
  | "Academy"
  | "Open Play"
  | "Tournament"
  // Partner
  | "Referral Partner"
  | "Strategic Partner"
  | "Implementation Partner"
  | "Hospitality / Venue"
  | "Venue"
  | "Wellness Brand"
  | "F&B / CPG"
  | "Media / Influencer"
  | "Equipment"
  // Prospect
  | "Inbound Lead"
  | "Outbound Target"
  | "Referral"
  // Vendor
  | "Technology / Services"
  | "Contractor"
  | "Internal"
  | "Coaching Staff"
  | "Event Staff";

export type AccountCategory = string;

export type OperatingMarket = string;

export interface AccountAddress {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  venueName?: string;
}

export interface Account {
  id: string;
  name: string;
  aliases?: string[];
  recordType: AccountRecordType;
  type: AccountType;
  subType?: AccountSubType;
  category?: AccountCategory;
  operatingMarket: OperatingMarket;
  address?: AccountAddress;
  website?: string;
  notes?: string;
  industry?: string;
  linkedinUrl?: string;
  linkedinDescription?: string;
  employeeRange?: string;
  associatedMembers?: number;
  linkedinIndustry?: string;
  linkedinHeadquarters?: string;
  linkedinCompanyType?: string;
  enrichmentSource?: string;
  enrichmentConfidence?: "low" | "medium" | "high";
  enrichedAt?: string;
  revenueTier?: "Startup" | "SMB" | "Mid-Market" | "Enterprise";
  relationshipStage?: "Prospect" | "Active" | "Strategic" | "Dormant";
  geo?: string;
  domain?: string;
  owner?: "Alex" | "Morgan" | "Mission Agent";
  interests?: string[];
  tier?: "strategic" | "enterprise" | "growth" | "smb" | "community";
  lifecycleStage?: AccountLifecycleStage;
  createdAt: string;
  updatedAt: string;
  provenance: Provenance;
  deletedAt?: string;
  mergedInto?: string;
  convertedFromLeadId?: string;
  referralPartnerAccountId?: string;
  sourceRefs?: CRMSourceRef[];
  logoAssetId?: string;
  assets?: CRMRecordAsset[];
}

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  aliases: z.array(z.string()).optional(),
  recordType: z.enum(["company", "person_account"]),
  type: z.preprocess((value) => normalizeAccountType(value), z.enum(["Prospect", "Partner", "Client"])),
  subType: z.string().optional(),
  category: z.string().optional(),
  operatingMarket: z.string().min(1),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      venueName: z.string().optional(),
    })
    .optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
  industry: z.string().optional(),
  linkedinUrl: z.string().optional(),
  linkedinDescription: z.string().optional(),
  employeeRange: z.string().optional(),
  associatedMembers: z.number().optional(),
  linkedinIndustry: z.string().optional(),
  linkedinHeadquarters: z.string().optional(),
  linkedinCompanyType: z.string().optional(),
  enrichmentSource: z.string().optional(),
  enrichmentConfidence: z.enum(["low", "medium", "high"]).optional(),
  enrichedAt: z.string().optional(),
  revenueTier: z.enum(["Startup", "SMB", "Mid-Market", "Enterprise"]).optional(),
  relationshipStage: z.enum(["Prospect", "Active", "Strategic", "Dormant"]).optional(),
  geo: z.string().optional(),
  domain: z.string().min(1).optional(),
  owner: z.enum(["Alex", "Morgan", "Mission Agent"]).optional(),
  interests: z.array(z.string()).optional(),
  tier: z.enum(["strategic", "enterprise", "growth", "smb", "community"]).optional(),
  lifecycleStage: z
    .preprocess((value) => normalizeAccountLifecycleStage(value), z.enum(["new", "outreach", "engaged", "meeting", "opportunity", "nurture", "disqualified"]))
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  provenance: z.enum(["verified", "seeded", "manual", "inferred", "imported"]),
  deletedAt: z.string().optional(),
  mergedInto: z.string().optional(),
  convertedFromLeadId: z.string().optional(),
  referralPartnerAccountId: z.string().optional(),
  sourceRefs: z
    .array(
      z.object({
        system: z.string(),
        externalId: z.string().optional(),
        url: z.string().optional(),
        importBatchId: z.string().optional(),
        label: z.string().optional(),
        importedAt: z.string().optional(),
      })
    )
    .optional(),
  logoAssetId: z.string().optional(),
  assets: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        fileName: z.string(),
        url: z.string(),
        kind: z.enum(["logo", "image", "document", "link", "other"]),
        mimeType: z.string().optional(),
        source: z.enum(["Manual Upload", "Notion Import", "External Link", "AI Enrichment"]).optional(),
        sourceUrl: z.string().optional(),
        importBatchId: z.string().optional(),
        createdAt: z.string(),
      })
    )
    .optional(),
});

// Backfill helper for accounts read from disk that pre-date the recordType field.
// Mutates in place and returns the same array. Default is "company" because every
// account currently in the system is a real company; person accounts will only
// be minted by the Phase 2 Convert flow.
export function backfillAccountRecordType(accounts: Account[]): Account[] {
  for (const a of accounts) {
    if (!a.recordType) {
      (a as Account).recordType = "company";
    }
    a.type = normalizeAccountType(a.type);
    a.lifecycleStage = normalizeAccountLifecycleStage(a.lifecycleStage);
  }
  return accounts;
}

export const ACCOUNT_TYPE_SUBTYPES: Record<AccountType, AccountSubType[]> = {
  Prospect: ["Inbound Lead", "Outbound Target", "Referral"],
  Partner: ["Referral Partner", "Strategic Partner", "Implementation Partner", "Hospitality / Venue"],
  Client: ["Founder / CEO", "Operator", "Professional Services", "Technology"],
};

export const ACCOUNT_TYPES: AccountType[] = ["Prospect", "Partner", "Client"];
export const ACCOUNT_LIFECYCLE_STAGES: AccountLifecycleStage[] = ["new", "outreach", "engaged", "meeting", "opportunity", "nurture", "disqualified"];

export function normalizeAccountType(value: unknown): AccountType {
  if (value === "Client" || value === "Partner" || value === "Prospect") return value;
  if (value === "Customer") return "Client";
  return "Prospect";
}

export function normalizeAccountLifecycleStage(value: unknown): AccountLifecycleStage | undefined {
  if (value === "active") return "opportunity";
  if (
    value === "new" ||
    value === "outreach" ||
    value === "engaged" ||
    value === "meeting" ||
    value === "opportunity" ||
    value === "nurture" ||
    value === "disqualified"
  ) {
    return value;
  }
  return undefined;
}

/* ── SEEDED Accounts ── */

export const ACCOUNTS: Account[] = [
  {
    id: "acc-example-client-sample-customer",
    name: "Example Client Sample Customer",
    aliases: ["Example Customer"],
    recordType: "company",
    type: "Prospect",
    subType: "Founder / CEO",
    operatingMarket: "Remote",
    website: "https://example.com",
    domain: "example.com",
    notes: "Fictional seed account for Example Client Mission Control. Replace with Example Client's real customers, partners, and target accounts during discovery.",
    industry: "Technology",
    revenueTier: "SMB",
    relationshipStage: "Prospect",
    lifecycleStage: "new",
    owner: "Alex",
    interests: ["Mission Control", "Workflow automation", "Agentic systems"],
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    provenance: "seeded"
  },
  {
    id: "acc-example-client-implementation-partner",
    name: "Example Client Implementation Partner",
    recordType: "company",
    type: "Partner",
    subType: "Implementation Partner",
    operatingMarket: "Remote",
    notes: "Fictional partner placeholder for tracking implementation, integration, and referral relationships.",
    industry: "Services",
    owner: "Alex",
    relationshipStage: "Prospect",
    lifecycleStage: "new",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    provenance: "seeded"
  }
];
