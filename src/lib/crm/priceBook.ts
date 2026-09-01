import type { Opportunity, OpportunityType } from "@/data/opportunities";

export type OpportunityPricingUnit = "fixed" | "hour" | "seat";

export type PriceBookEntry = {
  type: OpportunityType;
  label: string;
  unit: OpportunityPricingUnit;
  unitLabel: string;
  unitPrice: number;
  defaultQuantity: number;
  valueType: Opportunity["valueType"];
};

export const CLIENT_PRICE_BOOK: Partial<Record<OpportunityType, PriceBookEntry>> = {
  "Half-Day Install": {
    type: "Half-Day Install",
    label: "Half-day install",
    unit: "fixed",
    unitLabel: "install",
    unitPrice: 2500,
    defaultQuantity: 1,
    valueType: "Project",
  },
  "Full-Day Install": {
    type: "Full-Day Install",
    label: "Full-day install",
    unit: "fixed",
    unitLabel: "install",
    unitPrice: 5000,
    defaultQuantity: 1,
    valueType: "Project",
  },
  "Hourly Consulting": {
    type: "Hourly Consulting",
    label: "Hourly consulting",
    unit: "hour",
    unitLabel: "hours",
    unitPrice: 512,
    defaultQuantity: 1,
    valueType: "Hourly",
  },
  "Event - General Admission": {
    type: "Event - General Admission",
    label: "Event - General Admission",
    unit: "seat",
    unitLabel: "GA seats",
    unitPrice: 297,
    defaultQuantity: 1,
    valueType: "Project",
  },
  "Event - VIP": {
    type: "Event - VIP",
    label: "Event - VIP",
    unit: "seat",
    unitLabel: "VIP seats",
    unitPrice: 497,
    defaultQuantity: 1,
    valueType: "Project",
  },
};

export function getPriceBookEntry(type: OpportunityType): PriceBookEntry | null {
  return CLIENT_PRICE_BOOK[type] ?? null;
}

export function computeOpportunityValue(type: OpportunityType, quantity?: number | null): number | null {
  const entry = getPriceBookEntry(type);
  if (!entry) return null;
  const safeQuantity = Number.isFinite(quantity) && Number(quantity) > 0 ? Number(quantity) : entry.defaultQuantity;
  return entry.unitPrice * safeQuantity;
}

export function pricingDetail(type: OpportunityType, quantity?: number | null): string | null {
  const entry = getPriceBookEntry(type);
  if (!entry) return null;
  const safeQuantity = Number.isFinite(quantity) && Number(quantity) > 0 ? Number(quantity) : entry.defaultQuantity;
  if (entry.unit === "fixed") return `${entry.label}: $${entry.unitPrice.toLocaleString()}`;
  return `${entry.label}: ${safeQuantity} ${entry.unitLabel} x $${entry.unitPrice.toLocaleString()}`;
}
