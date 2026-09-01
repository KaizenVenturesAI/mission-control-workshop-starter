import type { ActionItem } from "@/types/action-item";

const STALE_DAYS = 14;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function ageDays(iso: string | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function isStale(item: ActionItem): boolean {
  return Date.now() - new Date(item.updatedAt).getTime() >= STALE_MS;
}

function resolveRelatedItem(itemId: string, items: ActionItem[]): ActionItem | undefined {
  return items.find((candidate) => candidate.id === itemId || candidate.externalId === itemId);
}

export interface StaleDigest {
  generatedAt: string;
  staleNoStatusChange: ActionItem[];
  assignedNoActivity: ActionItem[];
  blockedButBlockerComplete: Array<{ item: ActionItem; blocker: ActionItem }>;
  markdown: string;
}

export function buildStaleTicketDigest(items: ActionItem[]): StaleDigest {
  const activeItems = items.filter((item) => item.status !== "complete");

  const staleNoStatusChange = activeItems
    .filter((item) => isStale(item))
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const assignedNoActivity = activeItems
    .filter((item) => Boolean(item.owner?.trim()) && isStale(item))
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const blockedButBlockerComplete = activeItems
    .flatMap((item) => (item.relations ?? [])
      .filter((relation) => relation.type === "blocked_by")
      .map((relation) => {
        const blocker = resolveRelatedItem(relation.itemId, items);
        return blocker?.status === "complete" ? { item, blocker } : null;
      }))
    .filter((entry): entry is { item: ActionItem; blocker: ActionItem } => entry !== null);

  const lines: string[] = [
    "# Engineering stale ticket digest",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  const pushSection = (title: string, body: string[]) => {
    lines.push(`## ${title}`);
    if (body.length === 0) {
      lines.push("- None");
    } else {
      lines.push(...body);
    }
    lines.push("");
  };

  pushSection(
    `No status change in ${STALE_DAYS}+ days`,
    staleNoStatusChange.map((item) => `- ${item.externalId ?? item.id} (${item.status}) — ${item.title} [owner: ${item.owner || "unassigned"}, last update: ${ageDays(item.updatedAt)}d ago]`)
  );

  pushSection(
    "Assigned owner, no activity",
    assignedNoActivity.map((item) => `- ${item.externalId ?? item.id} — ${item.owner} has no recent activity on ${item.title} (${ageDays(item.updatedAt)}d stale)`) 
  );

  pushSection(
    "Blocked items whose blocker is already complete",
    blockedButBlockerComplete.map(({ item, blocker }) => `- ${item.externalId ?? item.id} is still blocked, but blocker ${blocker.externalId ?? blocker.id} is complete`) 
  );

  return {
    generatedAt: new Date().toISOString(),
    staleNoStatusChange,
    assignedNoActivity,
    blockedButBlockerComplete,
    markdown: lines.join("\n").trim() + "\n",
  };
}
