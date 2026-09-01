export type AccessLevel = "none" | "read" | "write" | "elevated" | "unknown";
export type VerificationSource =
  | "verified"
  | "config"
  | "oauth"
  | "inferred"
  | "manual"
  | "unknown";

export type LifecycleHealth = "healthy" | "expiring-soon" | "expired" | "stale-review" | "unknown";

export type SubAccount = {
  account: string;
  level: AccessLevel;
  source: VerificationSource;
  authState?: "healthy" | "expired" | "missing" | "n/a";
  connectedAt?: string;
  nextRefresh?: string;
  lastRefreshedAt?: string;
  expiresAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  lifecycleHealth?: LifecycleHealth;
  notes?: string;
};

export type PermissionEntry = {
  tool: string;
  level: AccessLevel;
  scope?: string;
  detail?: string;
  source: VerificationSource;
  authState?: "healthy" | "expired" | "missing" | "n/a";
  connectedAt?: string;
  lastRefreshedAt?: string;
  expiresAt?: string;
  refreshCadence?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  lifecycleHealth?: LifecycleHealth;
  notes?: string;
  subAccounts?: SubAccount[];
};

export type AgentPermissions = {
  agentId: string;
  agentName: string;
  permissions: PermissionEntry[];
};

export const TOOL_FAMILIES = [
  "Discord",
  "Gmail",
  "Drive",
  "Sheets",
  "Calendar",
  "Canva",
  "Shopify",
  "Shell",
  "Browser",
  "Fireflies",
  "Klaviyo",
  "Notion",
  "QuickBooks",
  "File System",
] as const;

export type ToolFamily = (typeof TOOL_FAMILIES)[number];

/*
 * ═══════════════════════════════════════════════════════════════
 * Starter permissions template. Connect real Example Client tools after deployment.
 */

// Helper: standard elevated shell + browser + filesystem for all active agents
function standardInfraPermissions(isParked = false): PermissionEntry[] {
  if (isParked) {
    return [
      { tool: "Shell", level: "elevated", scope: "Local exec", detail: "Full local shell — agent is PARKED", source: "config", authState: "missing", lifecycleHealth: "expired", notes: "Agent is PARKED — credentials stale" },
      { tool: "Browser", level: "none", source: "config", authState: "n/a", notes: "Agent is PARKED" },
      { tool: "File System", level: "none", source: "config", authState: "n/a", notes: "Agent is PARKED" },
    ];
  }
  return [
    { tool: "Shell", level: "elevated", scope: "Local exec — unrestricted", detail: "exec.security=full, exec.ask=off — can run any command without approval", source: "verified", authState: "n/a", notes: "Verified from openclaw.json: tools.profile=full, exec.security=full, exec.ask=off" },
    { tool: "Browser", level: "write", scope: "Full browser automation", detail: "Playwright-based browser control via OpenClaw browser tool", source: "verified", authState: "n/a", notes: "Part of tools.profile=full" },
    { tool: "File System", level: "write", scope: "Agent workspace read/write", detail: "Read/write access to agent workspace directory", source: "verified", authState: "n/a", notes: "Part of tools.profile=full" },
  ];
}

// Helper: no access entry
function noAccess(tool: string): PermissionEntry {
  return { tool, level: "none", source: "verified", authState: "n/a", notes: "No API key, OAuth, or config found" };
}

export const agentPermissions: AgentPermissions[] = [
  {
    "agentId": "missionAgent-chief-of-staff",
    "agentName": "Example Client Mission Agent",
    "permissions": []
  },
  { "agentId": "executive-assistant-agent", "agentName": "Executive Assistant Agent", "permissions": [] },
  { "agentId": "sales-operations-agent", "agentName": "Sales Operations Agent", "permissions": [] },
  { "agentId": "business-development-agent", "agentName": "Business Development Agent", "permissions": [] },
  { "agentId": "marketing-agent", "agentName": "Marketing Agent", "permissions": [] },
  { "agentId": "deployment-agent", "agentName": "Deployment Agent", "permissions": [] },
  { "agentId": "engineering-agent", "agentName": "Engineering Agent", "permissions": [] }
];

/* ─── Audit event types & seeded data ─── */
export type AuditSeverity = "info" | "elevated" | "critical";

export type AuditReasonTag = "sensitive" | "auth" | "elevated" | "verified" | "needs review";

export type AuditEvent = {
  date: string;
  description: string;
  severity: AuditSeverity;
  agentName: string;
  reasonTag: AuditReasonTag;
};

export const GLOBAL_AUDIT_EVENTS: AuditEvent[] = [];

export type AgentAuditEvent = {
  date: string;
  description: string;
  severity: AuditSeverity;
};

export const AGENT_AUDIT_HISTORY: Record<string, AgentAuditEvent[]> = {};

/* ─── Recommended permissions per agent ─── */
export const RECOMMENDED_PERMISSIONS: Record<string, ToolFamily[]> = {
  "missionAgent-chief-of-staff": ["Gmail", "Calendar", "Drive", "Sheets"],
  "executive-assistant-agent": ["Gmail", "Calendar"],
  "sales-operations-agent": ["Gmail", "Sheets"],
  "business-development-agent": ["Gmail", "Drive"],
  "marketing-agent": ["Drive", "Canva"],
  "deployment-agent": ["Drive", "Sheets"],
  "engineering-agent": ["Shell", "Browser", "File System"],
};

/** Agent canonical email address (for GWS setup instructions) */
export const AGENT_EMAIL_MAP: Record<string, string> = {};

/** Agent workspace directory names */
export const AGENT_WORKSPACE_MAP: Record<string, string> = {
  "missionAgent-chief-of-staff": "workspace",
  "executive-assistant-agent": "workspace-ea",
  "sales-operations-agent": "workspace-sales-ops",
  "business-development-agent": "workspace-bd",
  "marketing-agent": "workspace-marketing",
  "deployment-agent": "workspace-deployment",
  "engineering-agent": "workspace-engineering"
};

/** Per-tool setup guides shown in the cell flyout for unconnected tools */
export const TOOL_SETUP_GUIDES: Record<string, {
  title: string;
  method: string;
  steps: string[];
  command?: string;
  configPath?: string;
  notes?: string;
}> = {
  Gmail: {
    title: "Connect Gmail via isclientted GWS auth",
    method: "OAuth 2.0 (Google Workspace)",
    steps: [
      "Open OpenClaw and ask: 'Run the gws-isclientted-auth skill'",
      "Specify the agent email for the Example Client workspace",
      "Follow the OAuth flow to authorize the agent's Gmail",
      "Verify: gws --config [agent-workspace]/.gws gmail list",
    ],
    configPath: "[agent-workspace]/.gws/",
    notes: "Requires a Google Workspace account assigned to this agent.",
  },
  Sheets: {
    title: "Connect Google Sheets via isclientted GWS auth",
    method: "OAuth 2.0 (Google Workspace)",
    steps: [
      "Run gws-isclientted-auth skill for this agent's Google account",
      "Sheets access is granted alongside Gmail in the same OAuth flow",
      "Verify: gws --config [agent-workspace]/.gws sheets list",
    ],
    configPath: "[agent-workspace]/.gws/",
    notes: "Sheets and Drive are included in the standard GWS OAuth scope.",
  },
  Drive: {
    title: "Connect Google Drive via isclientted GWS auth",
    method: "OAuth 2.0 (Google Workspace)",
    steps: [
      "Run gws-isclientted-auth skill for this agent's Google account",
      "Drive access is granted alongside Gmail in the same OAuth flow",
      "Verify: gws --config [agent-workspace]/.gws drive list",
    ],
    configPath: "[agent-workspace]/.gws/",
    notes: "Drive is included in the standard GWS OAuth scope.",
  },
  Calendar: {
    title: "Connect Google Calendar via isclientted GWS auth",
    method: "OAuth 2.0 (Google Workspace)",
    steps: [
      "Run gws-isclientted-auth skill for this agent's Google account",
      "Calendar access requires the calendar.readonly or calendar scope",
      "Verify: gws --config [agent-workspace]/.gws calendar list",
    ],
    configPath: "[agent-workspace]/.gws/",
    notes: "Calendar scope must be explicitly included in the OAuth consent.",
  },
  Klaviyo: {
    title: "Add Klaviyo API key",
    method: "API Key (Private Key)",
    steps: [
      "Log into Klaviyo → Account → Settings → API Keys",
      "Create a new Private API Key for this agent",
      "Store the new secret in the deployment secret manager or local .env file",
    ],
    configPath: "[secret-store]/KLAVIYO_PRIVATE_API_KEY",
    notes: "Create a new key for this business. Do not reuse credentials from another workspace.",
  },
  Notion: {
    title: "Add Notion integration token",
    method: "API Key (Integration Token)",
    steps: [
      "Go to https://www.notion.so/my-integrations",
      "Create a new integration for this agent",
      "Store the integration token in the deployment secret manager or local .env file",
    ],
    configPath: "[secret-store]/NOTION_TOKEN",
    notes: "Also share relevant Notion pages with the integration.",
  },
  Fireflies: {
    title: "Enable Fireflies access",
    method: "API Key",
    steps: [
      "Create or retrieve a Fireflies API key for this business",
      "Store FIREFLIES_API_KEY in the deployment secret manager or local .env file",
      "Verify access with a read-only test before enabling automations",
    ],
    configPath: "[secret-store]/FIREFLIES_API_KEY",
    notes: "Do not reuse credentials from another workspace.",
  },
  Canva: {
    title: "Complete Canva OAuth setup",
    method: "OAuth 2.0 (Canva Connect)",
    steps: [
      "Create a Canva app for this business",
      "Complete the OAuth flow in the new environment",
      "Verify token is saved and refresh schedule is set",
    ],
    configPath: "[secret-store]/CANVA_*",
    notes: "Connection status starts unconfigured in the neutral template.",
  },
  Shopify: {
    title: "Set up Shopify integration",
    method: "API Key + Webhook",
    steps: [
      "Create a Shopify private app or custom app in your Shopify admin",
      "Copy Admin API access token",
      "Add to agent workspace: SHOPIFY_API_KEY and SHOPIFY_STORE_URL in .env",
      "Configure webhook endpoints if needed",
    ],
    notes: "No Shopify integration is currently configured anywhere in the system.",
  },
  QuickBooks: {
    title: "Set up QuickBooks integration",
    method: "OAuth 2.0 (Intuit)",
    steps: [
      "Create a QuickBooks app at developer.intuit.com",
      "Complete the OAuth flow to get access and refresh tokens",
      "Store tokens in agent workspace .env",
    ],
    notes: "No QuickBooks integration is currently configured.",
  },
};

export const SENSITIVE_TOOLS: ToolFamily[] = [
  "Gmail", "Drive", "Sheets", "Calendar", "Canva", "Shopify", "Shell", "Fireflies", "Klaviyo", "Notion", "QuickBooks", "File System",
];

/** Compute lifecycle metrics across all agents */
export function computeLifecycleMetrics() {
  let expiringSoon = 0;
  let expired = 0;
  let neverReviewed = 0;
  let refreshedRecently = 0;
  let unknownLifecycle = 0;

  for (const agent of agentPermissions) {
    for (const p of agent.permissions) {
      if (p.level === "none") continue;
      if (p.subAccounts && p.subAccounts.length > 0) {
        for (const sa of p.subAccounts) {
          if (sa.lifecycleHealth === "expiring-soon") expiringSoon++;
          if (sa.lifecycleHealth === "expired") expired++;
          if (sa.lifecycleHealth === "unknown") unknownLifecycle++;
          if (sa.lifecycleHealth === "stale-review" || sa.lastReviewedAt === "Never") neverReviewed++;
          if (sa.lastRefreshedAt && (sa.lastRefreshedAt.includes("ago") || sa.lastRefreshedAt === "Just now")) refreshedRecently++;
        }
      } else {
        if (p.lifecycleHealth === "expiring-soon") expiringSoon++;
        if (p.lifecycleHealth === "expired") expired++;
        if (p.lifecycleHealth === "unknown") unknownLifecycle++;
        if (p.lifecycleHealth === "stale-review" || p.lastReviewedAt === "Never") neverReviewed++;
        if (p.lastRefreshedAt && (p.lastRefreshedAt.includes("ago") || p.lastRefreshedAt === "Just now")) refreshedRecently++;
      }
    }
  }
  return { expiringSoon, expired, neverReviewed, refreshedRecently, unknownLifecycle };
}

/** Get the highest access level for a given agent + tool family */
export function getAccessLevel(agentId: string, tool: string): AccessLevel {
  const agent = agentPermissions.find((a) => a.agentId === agentId);
  if (!agent) return "unknown";
  const entries = agent.permissions.filter((p) => p.tool === tool);
  if (entries.length === 0) return "none";
  const priority: AccessLevel[] = ["elevated", "write", "read", "none", "unknown"];

  for (const entry of entries) {
    if (entry.subAccounts && entry.subAccounts.length > 0) {
      for (const level of priority) {
        if (entry.subAccounts.some((s) => s.level === level)) return level;
      }
    }
  }

  for (const level of priority) {
    if (entries.some((e) => e.level === level)) return level;
  }
  return "none";
}

/** Get the permission entries for a given agent + tool (for sub-account lookup) */
export function getPermissionEntries(agentId: string, tool: string): PermissionEntry[] {
  const agent = agentPermissions.find((a) => a.agentId === agentId);
  if (!agent) return [];
  return agent.permissions.filter((p) => p.tool === tool);
}
