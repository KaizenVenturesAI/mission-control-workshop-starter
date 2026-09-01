import type { InboundLeadRecord, InboundLeadType } from "@/modules/revenue/inboundLeadsTypes";

export const ASSIGNMENT_ROUTING: Record<InboundLeadType, { assignee: string; role: string; email: string; cc?: string }> = {
  "academy-la": { assignee: "Alex", role: "Founder", email: "primary@example.invalid" },
  "academy-miami": { assignee: "Alex", role: "Founder", email: "primary@example.invalid" },
  corporate: { assignee: "Alex", role: "Founder", email: "primary@example.invalid" },
  partnership: { assignee: "Alex", role: "Founder", email: "primary@example.invalid" },
};

export function getDefaultAssignee(lead: InboundLeadRecord): string {
  return ASSIGNMENT_ROUTING[lead.type].assignee;
}
