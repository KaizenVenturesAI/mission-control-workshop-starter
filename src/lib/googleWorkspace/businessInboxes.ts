export type WorkspaceAutomationPosture =
  | "human-only"
  | "draft-assist"
  | "selective-context"
  | "chief-of-staff";

export interface BusinessInbox {
  email: string;
  label: string;
  humanOperators: string[];
  assistingAgent?: string;
  googleConfigDir?: string;
  includeInCrmSync: boolean;
  market?: string;
  automationPosture: WorkspaceAutomationPosture;
  notes: string;
}

export const BUSINESS_INBOXES: BusinessInbox[] = [
  {
    "email": "primary@example.invalid",
    "label": "Alex - Example Client",
    "humanOperators": [
      "Alex"
    ],
    "assistingAgent": "chief-of-staff",
    "includeInCrmSync": false,
    "automationPosture": "draft-assist",
    "notes": "Starter inbox for local development. Add team inboxes only after they exist in Google Workspace."
  }
];

export const CRM_SYNC_INBOXES = BUSINESS_INBOXES
  .filter((inbox) => inbox.includeInCrmSync)
  .map((inbox) => inbox.email);

export function getBusinessInbox(email: string): BusinessInbox | undefined {
  const normalized = email.toLowerCase();
  return BUSINESS_INBOXES.find((inbox) => inbox.email === normalized);
}
