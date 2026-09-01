import type { InboundLeadsStore } from "@/modules/revenue/inboundLeadsTypes";

export const EMPTY_INBOUND_LEADS_STORE: InboundLeadsStore = {
  version: 1,
  leads: [],
  lastSync: {},
};
