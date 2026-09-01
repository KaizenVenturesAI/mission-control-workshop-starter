// Shared ActionItem type — used by API route and UI components

export type Status = "not_started" | "in_progress" | "complete";
export type Priority = "low" | "medium" | "high";

export interface ActionItemRelation {
  type: "blocks" | "blocked_by" | "related";
  itemId: string;
}

export interface ActionItem {
  id: string;
  title: string;
  owner: string;
  department: string;
  type: string;
  deadline: string | null;
  status: Status;
  sourceMeeting: string;
  sourceDate: string;
  sourceChannelId: string;
  sourceMessageId: string;
  relatedAccount: string;
  notes: string;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string;
  updatedBy: string;
  // Traceable-completion fields (optional, backward-compatible)
  autoCompletable?: boolean;
  completionSignalType?: string; // e.g. "email-sent", "webhook", "manual"
  completionSignalRef?: string;  // e.g. email subject, thread ID, URL
  completionCheckHint?: string;  // free-text hint for the monitor agent
  // Linear integration fields (optional, backward-compatible)
  projectId?: string;
  projectName?: string;
  parentId?: string;
  externalId?: string;      // Linear issue ID e.g. "Example Client-61"
  externalUrl?: string;     // Linear issue URL
  relations?: ActionItemRelation[];
  // CRM linkage (optional, backward-compatible) — set when a chip is created from inside
  // an account/contact drawer so the action item shows source CRM context on the action board.
  relatedAccountId?: string;
  relatedContactId?: string;
}
