// ── Example Client Mission Control CRM Email Thread Data ──

export interface EmailParty {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  filename: string;
  url?: string;
}

export interface EmailThread {
  id: string;             // Gmail thread id; CRMActivity.externalRef points here
  subject: string;
  from: EmailParty;
  to: EmailParty[];
  cc?: EmailParty[];
  sentAt: string;         // ISO timestamp
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
  threadUrl?: string;     // Gmail permalink
}

export const EMAIL_THREADS: EmailThread[] = [];
