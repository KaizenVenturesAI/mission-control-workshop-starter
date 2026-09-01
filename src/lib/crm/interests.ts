export const CRM_INTEREST_CATEGORIES = [
  {
    category: "Segments",
    tags: ["Consulting", "Agentic Installs", "Events"],
  },
  {
    category: "Source",
    tags: ["Form", "Instagram", "Referral", "Walk-in", "Partner", "Press"],
  },
  {
    category: "Player Level",
    tags: ["Beginner", "Intermediate", "Advanced", "Pro"],
  },
] as const;

export type CRMInterestCategory = (typeof CRM_INTEREST_CATEGORIES)[number]["category"];
export type CRMInterest = (typeof CRM_INTEREST_CATEGORIES)[number]["tags"][number];

export const CRM_INTERESTS = CRM_INTEREST_CATEGORIES.flatMap((group) => group.tags) as CRMInterest[];

export function isCRMInterest(value: unknown): value is CRMInterest {
  return typeof value === "string" && (CRM_INTERESTS as readonly string[]).includes(value);
}

export function normalizeInterests(values: unknown): CRMInterest[] {
  if (!Array.isArray(values)) return [];
  const legacyTagMap: Record<string, CRMInterest> = {
    "Install Ops": "Agentic Installs",
    "Open Play": "Events",
    "Example Client FIT": "Events",
    League: "Events",
    Tournaments: "Events",
    Camps: "Events",
    "Private Lessons": "Events",
  };
  return Array.from(new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .map((value) => legacyTagMap[value] ?? value)
      .filter(Boolean),
  )) as CRMInterest[];
}
