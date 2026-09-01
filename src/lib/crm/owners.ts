export const CRM_OWNERS = ["Alex", "Morgan", "Mission Agent"] as const;

export type CRMOwner = (typeof CRM_OWNERS)[number];

export const CRM_OWNER_PROFILES: Record<CRMOwner, { firstName: CRMOwner; fullName: string; imageSrc: string }> = {
  Alex: {
    firstName: "Alex",
    fullName: "Alex",
    imageSrc: "/assets/team-example-client-rose.jpeg",
  },
  "Morgan": {
    firstName: "Morgan",
    fullName: "Example Client Morgan",
    imageSrc: "/assets/team-secondary-mignone.jpeg",
  },
  "Mission Agent": {
    firstName: "Mission Agent",
    fullName: "Example Client Mission Agent",
    imageSrc: "/assets/team-operations-agent.jpg",
  },
};

export function isCRMOwner(value: unknown): value is CRMOwner {
  return typeof value === "string" && (CRM_OWNERS as readonly string[]).includes(value);
}
