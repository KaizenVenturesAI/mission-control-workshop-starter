import type { InboundLeadRecord } from "@/modules/revenue/inboundLeadsTypes";

/**
 * Score an inbound lead 0–100 based on type, source, recency, contact
 * completeness, and Example Client-specific business signals.
 *
 * Weights:
 *   Lead type:         corporate=30, partnership=25, academy-la=15, academy-miami=15
 *   Source:            referral=+15, partner=+10, event=+8, website=+5, dm=+3, other=+2, undefined=0
 *   Age (receivedAt):  <1h=+15, 1–4h=+10, 4–24h=+5, >24h=0
 *   Has email:         +10
 *   Has phone:         +5
 *   Has expectedValue: +5
 *   Group size:        20+=+10, 10–19=+5, <10 or unknown=0
 *   Company recognition (HIGH_VALUE_COMPANIES): +15
 *   Time urgency:      high=+10, medium=+5, none=0
 *   Repeat inquirer:   +10 (requires allLeads)
 *   Cap: 100
 */

/** Known high-value companies/brands. Case-insensitive partial match. */
export const HIGH_VALUE_COMPANIES = [
  "Alo Yoga",
  "Equinox",
  "Lululemon",
  "Barry's",
  "Nike",
  "Adidas",
  "Google",
  "Meta",
  "Apple",
  "Amazon",
  "Netflix",
  "Spotify",
  "Goldman Sachs",
  "JP Morgan",
  "Morgan Stanley",
  "McKinsey",
  "BCG",
  "Deloitte",
  "PwC",
];

const HIGH_URGENCY = ["next week", "this week", "asap", "urgent", "tomorrow"];
const MEDIUM_URGENCY = ["this month", "next month"];

/**
 * Check whether the same email address appears on an earlier lead.
 * Returns true if at least one other lead with a matching email was
 * received before this one.
 */
export function isRepeatInquirer(
  lead: InboundLeadRecord,
  allLeads: InboundLeadRecord[],
): boolean {
  if (!lead.email) return false;
  const email = lead.email.toLowerCase();
  const receivedAt = new Date(lead.receivedAt).getTime();
  return allLeads.some(
    (other) =>
      other.id !== lead.id &&
      other.email?.toLowerCase() === email &&
      new Date(other.receivedAt).getTime() < receivedAt,
  );
}

export function scoreLead(
  lead: InboundLeadRecord,
  allLeads?: InboundLeadRecord[],
): number {
  let score = 0;

  // Lead type
  switch (lead.type) {
    case "corporate":
      score += 30;
      break;
    case "partnership":
      score += 25;
      break;
    case "academy-la":
      score += 15;
      break;
    case "academy-miami":
      score += 15;
      break;
  }

  // Source
  switch (lead.source) {
    case "referral":
      score += 15;
      break;
    case "partner":
      score += 10;
      break;
    case "event":
      score += 8;
      break;
    case "website":
      score += 5;
      break;
    case "dm":
      score += 3;
      break;
    case "other":
      score += 2;
      break;
    // undefined → 0
  }

  // Age since receivedAt
  const ageMs = Date.now() - new Date(lead.receivedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 1) {
    score += 15;
  } else if (ageHours < 4) {
    score += 10;
  } else if (ageHours < 24) {
    score += 5;
  }
  // > 24h → 0

  // Contact completeness
  if (lead.email) score += 10;
  if (lead.phone) score += 5;
  if (lead.expectedValue !== undefined) score += 5;

  // --- Example Client-specific signals ---

  // Group size (corp events form populates metadata.numberOfPeople or metadata.groupSize)
  const groupSize = Number(
    lead.metadata?.numberOfPeople ?? lead.metadata?.groupSize ?? 0,
  );
  if (groupSize >= 20) {
    score += 10;
  } else if (groupSize >= 10) {
    score += 5;
  }

  // Company recognition
  if (lead.companyName) {
    const company = lead.companyName.toLowerCase();
    if (
      HIGH_VALUE_COMPANIES.some((hv) => company.includes(hv.toLowerCase()))
    ) {
      score += 15;
    }
  }

  // Time urgency — scan notes and content
  const text = `${lead.notes ?? ""} ${lead.content ?? ""}`.toLowerCase();
  if (HIGH_URGENCY.some((kw) => text.includes(kw))) {
    score += 10;
  } else if (MEDIUM_URGENCY.some((kw) => text.includes(kw))) {
    score += 5;
  }

  // Repeat inquirer
  if (allLeads && isRepeatInquirer(lead, allLeads)) {
    score += 10;
  }

  return Math.min(score, 100);
}
