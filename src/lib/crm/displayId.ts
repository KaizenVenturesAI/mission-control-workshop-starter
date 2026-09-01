// ── CRM display-ID helpers ──
// Storage IDs in the CRM use lowercase prefixes (e.g. `c-001`, `acc-123`,
// `opp-456`, `lead-789`). The Salesforce-style display format is single-letter
// uppercase prefix + dash + numeric portion, optionally zero-padded to 4
// digits when shorter. Storage stays as-is — these helpers are a render +
// URL-parsing concern only.

export type CRMEntityType = "lead" | "contact" | "account" | "opportunity";

const PREFIX_BY_ENTITY: Record<CRMEntityType, string> = {
  lead: "L",
  contact: "C",
  account: "A",
  opportunity: "O",
};

// Strip a leading "<letters>-" prefix and any leading zeros from the remainder.
// Falls back to the original id if the input doesn't match the expected shape.
function stripPrefixAndPad(rawId: string): string {
  const match = /^[A-Za-z]+-(.+)$/.exec(rawId);
  const tail = match ? match[1] : rawId;
  // Only zero-pad pure-numeric tails (real ids); leave timestamp/random
  // tails like `1714521600000-ab12cd` untouched.
  if (/^[0-9]+$/.test(tail)) {
    const n = tail.replace(/^0+/, "") || "0";
    return n.padStart(4, "0");
  }
  return tail;
}

export function toDisplayId(rawId: string, entityType: CRMEntityType): string {
  if (!rawId) return "";
  return `${PREFIX_BY_ENTITY[entityType]}-${stripPrefixAndPad(rawId)}`;
}

// Reverse: take a display id like `A-1234` and recover the storage id by
// looking it up in the provided list of raw ids. Returns the first raw id
// whose own display form matches. Falls back to the input if no match.
export function fromDisplayId(
  displayId: string,
  rawIds: string[],
  entityType: CRMEntityType,
): string {
  if (!displayId) return displayId;
  // Already a raw id (no leading single-letter+dash convention) → pass through.
  if (!/^[A-Z]-/.test(displayId)) return displayId;
  for (const raw of rawIds) {
    if (toDisplayId(raw, entityType) === displayId) return raw;
  }
  return displayId;
}
