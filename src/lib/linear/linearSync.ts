/**
 * linearSync.ts
 *
 * Syncs active Linear issues into the Mission Control action-items store.
 * Additive-only: items that exist in MC but not in Linear are never deleted.
 *
 * Conflict policy for linked engineering tasks:
 * - last-write-wins using timestamps when both sides have values
 * - never overwrite a populated local field with null/empty data from Linear
 * - never touch local-only non-engineering tasks
 *
 * Example Client-66 — Sprint 3: Linear Sync Engine
 */

import type { ActionItem, ActionItemRelation, Status, Priority } from "@/types/action-item";
import { readActionItems, writeActionItems, nextActionItemId } from "@/lib/action-items/store";
import { linearRequest, LINEAR_TEAM_ID } from "@/lib/linear/client";

interface LinearRelation {
  type: string;
  relatedIssue: { id: string; identifier: string };
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number;
  state: { name: string; type: string };
  assignee: { name: string } | null;
  project: { id: string; name: string } | null;
  parent: { id: string; identifier: string } | null;
  relations: { nodes: LinearRelation[] };
  createdAt: string;
  updatedAt: string;
}

function isEngineeringItem(item: Pick<ActionItem, "department" | "externalId">): boolean {
  return item.department === "Engineering" || Boolean(item.externalId);
}

function mapStatus(stateName: string): Status {
  const lower = stateName.toLowerCase();
  if (lower.includes("in progress")) return "in_progress";
  if (lower === "done" || lower === "cancelled" || lower === "canceled") return "complete";
  return "not_started";
}

function mapPriority(priority: number): Priority {
  if (priority === 1 || priority === 2) return "high";
  if (priority === 3) return "medium";
  return "low";
}

function mapRelations(nodes: LinearRelation[]): ActionItemRelation[] {
  return nodes
    .map((r): ActionItemRelation | null => {
      const t = r.type.toLowerCase();
      if (t === "blocks") return { type: "blocks", itemId: r.relatedIssue.identifier };
      if (t === "blocked_by" || t === "blocking") return { type: "blocked_by", itemId: r.relatedIssue.identifier };
      if (t === "related" || t === "duplicate") return { type: "related", itemId: r.relatedIssue.identifier };
      return null;
    })
    .filter((r): r is ActionItemRelation => r !== null);
}

function parseTime(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function preferLinearValue<T>(localValue: T | undefined, linearValue: T | undefined, localUpdatedAt?: string, linearUpdatedAt?: string): T | undefined {
  if (linearValue === undefined || linearValue === null || linearValue === "") return localValue;
  if (localValue === undefined || localValue === null || localValue === "") return linearValue;
  return parseTime(linearUpdatedAt) >= parseTime(localUpdatedAt) ? linearValue : localValue;
}

const QUERY = `
query {
  issues(filter: {
    team: { id: { eq: "${LINEAR_TEAM_ID}" } }
    state: { type: { nin: ["completed", "cancelled"] } }
  }) {
    nodes {
      id
      identifier
      title
      url
      priority
      state { name type }
      assignee { name }
      project { id name }
      parent { id identifier }
      relations { nodes { type relatedIssue { id identifier } } }
      createdAt
      updatedAt
    }
  }
}
`;

async function fetchLinearIssues(): Promise<LinearIssue[]> {
  const data = await linearRequest<{ issues?: { nodes: LinearIssue[] } }>(QUERY);
  return data.issues?.nodes ?? [];
}

export interface LinearSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  total: number;
  errors: string[];
}

export async function syncLinearIssues(): Promise<LinearSyncSummary> {
  const summary: LinearSyncSummary = { created: 0, updated: 0, unchanged: 0, total: 0, errors: [] };

  let issues: LinearIssue[];
  try {
    issues = await fetchLinearIssues();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    summary.errors.push(`Failed to fetch from Linear: ${message}`);
    return summary;
  }

  summary.total = issues.length;

  const items = readActionItems();
  const byExternalId = new Map<string, { item: ActionItem; index: number }>();
  items.forEach((item, index) => {
    if (item.externalId) byExternalId.set(item.externalId, { item, index });
  });

  for (const issue of issues) {
    try {
      const status = mapStatus(issue.state.name);
      const priority = mapPriority(issue.priority);
      const relations = mapRelations(issue.relations.nodes);
      const existing = byExternalId.get(issue.identifier);

      if (existing) {
        const prev = existing.item;
        if (!isEngineeringItem(prev)) {
          summary.unchanged++;
          continue;
        }

        const nextOwner = preferLinearValue(prev.owner, issue.assignee?.name ?? undefined, prev.updatedAt, issue.updatedAt) ?? "";
        const nextTitle = preferLinearValue(prev.title, issue.title, prev.updatedAt, issue.updatedAt) ?? prev.title;
        const nextStatus = preferLinearValue(prev.status, status, prev.updatedAt, issue.updatedAt) ?? prev.status;
        const nextPriority = preferLinearValue(prev.priority, priority, prev.updatedAt, issue.updatedAt) ?? prev.priority;
        const nextProjectId = preferLinearValue(prev.projectId, issue.project?.id ?? undefined, prev.updatedAt, issue.updatedAt);
        const nextProjectName = preferLinearValue(prev.projectName, issue.project?.name ?? undefined, prev.updatedAt, issue.updatedAt);
        const nextExternalUrl = preferLinearValue(prev.externalUrl, issue.url, prev.updatedAt, issue.updatedAt);
        const nextParentId = preferLinearValue(prev.parentId, issue.parent?.identifier ?? undefined, prev.updatedAt, issue.updatedAt);
        const nextRelations = relations.length > 0 ? relations : prev.relations;

        const changed =
          prev.title !== nextTitle ||
          prev.status !== nextStatus ||
          prev.priority !== nextPriority ||
          prev.owner !== nextOwner ||
          prev.projectId !== nextProjectId ||
          prev.projectName !== nextProjectName ||
          prev.parentId !== nextParentId ||
          prev.externalUrl !== nextExternalUrl ||
          JSON.stringify(prev.relations ?? []) !== JSON.stringify(nextRelations ?? []);

        if (changed) {
          items[existing.index] = {
            ...prev,
            title: nextTitle,
            status: nextStatus,
            priority: nextPriority,
            owner: nextOwner,
            externalUrl: nextExternalUrl,
            projectId: nextProjectId,
            projectName: nextProjectName,
            parentId: nextParentId,
            relations: nextRelations,
            updatedAt: issue.updatedAt,
            updatedBy: "Linear Sync",
          };
          summary.updated++;
        } else {
          summary.unchanged++;
        }
      } else {
        const newItem: ActionItem = {
          id: nextActionItemId(items),
          title: issue.title,
          owner: issue.assignee?.name ?? "",
          department: "Engineering",
          type: "Linear Issue",
          deadline: null,
          status,
          sourceMeeting: "",
          sourceDate: issue.createdAt.split("T")[0],
          sourceChannelId: "",
          sourceMessageId: "",
          relatedAccount: "",
          notes: "",
          priority,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          completedAt: null,
          createdBy: "Linear Sync",
          updatedBy: "Linear Sync",
          externalId: issue.identifier,
          externalUrl: issue.url,
          projectId: issue.project?.id,
          projectName: issue.project?.name,
          parentId: issue.parent?.identifier,
          relations: relations.length > 0 ? relations : undefined,
        };
        items.push(newItem);
        byExternalId.set(issue.identifier, { item: newItem, index: items.length - 1 });
        summary.created++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Failed to process ${issue.identifier}: ${message}`);
    }
  }

  writeActionItems(items);
  return summary;
}
