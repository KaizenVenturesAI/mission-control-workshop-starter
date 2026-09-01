// This file is the single source of truth for Discord member identity mapping.
// Currently maintained manually. Future: replace with live guild member API fetch.
// sourceClass: CONFIG (manually maintained, not live-fetched)

export interface GuildMember {
  id: string;
  name: string;
  username: string;
  role: "Admin" | "Standard" | "Integration";
  source: "config" | "api"; // where this mapping came from
}

// Neutral starter member directory. Replace IDs with live workspace data after setup.
// TODO: Replace with live guild member fetch when available
export const MEMBER_DIRECTORY: Record<string, Omit<GuildMember, "id">> = {
  "placeholder-founder": { name: "Founder", username: "@founder", role: "Admin", source: "config" },
  "placeholder-operator-agent": { name: "Operator Agent", username: "@operator-agent", role: "Standard", source: "config" },
  "placeholder-engineering-agent": { name: "Engineering Agent", username: "@engineering-agent", role: "Integration", source: "config" },
  "placeholder-crm-agent": { name: "CRM Hygiene Agent", username: "@crm-agent", role: "Integration", source: "config" },
};

export const ALL_GUILD_MEMBERS: GuildMember[] = Object.entries(MEMBER_DIRECTORY).map(
  ([id, info]) => ({ id, ...info })
);

export function resolveMember(id: string): GuildMember | null {
  const info = MEMBER_DIRECTORY[id];
  if (!info) return null;
  return { id, ...info };
}
