import { NextResponse } from "next/server";
import type { ActionItem, Priority } from "@/types/action-item";
import { readActionItems, writeActionItems, nextActionItemId } from "@/lib/action-items/store";
import { listLinearProjects, listLinearUsers, updateLinearIssueFields } from "@/lib/linear/client";
import { actorFromRequest, safeAppendAuditEntry } from "@/lib/audit/store";
import type { AuditFieldChange } from "@/types/audit-log";

export const dynamic = "force-dynamic";

// Action-item fields the audit log diffs on PATCH. Excludes immutable
// (id, createdAt) and ever-changing (updatedAt) fields. New fields added to
// ActionItem can be appended here without changing the diff machinery.
const ACTION_ITEM_AUDIT_FIELDS: readonly string[] = [
  "title",
  "owner",
  "department",
  "type",
  "deadline",
  "status",
  "sourceMeeting",
  "sourceDate",
  "sourceChannelId",
  "sourceMessageId",
  "relatedAccount",
  "notes",
  "priority",
  "completedAt",
  "createdBy",
  "updatedBy",
  "autoCompletable",
  "completionSignalType",
  "completionSignalRef",
  "completionCheckHint",
  "projectId",
  "projectName",
  "parentId",
  "externalId",
  "externalUrl",
  "relations",
  "relatedAccountId",
  "relatedContactId",
];

function diffActionItem(before: ActionItem, after: ActionItem): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  for (const field of ACTION_ITEM_AUDIT_FIELDS) {
    const av = a[field];
    const bv = b[field];
    if (av === bv) continue;
    if (av == null && bv == null) continue;
    try {
      if (JSON.stringify(av) === JSON.stringify(bv)) continue;
    } catch {
      // fall through to record the change
    }
    changes.push({ field, before: av, after: bv });
  }
  return changes;
}

const CANONICAL_OWNERS = ["Alex", "Morgan", "Mission Agent"] as const;
const OWNER_NORMALIZATION: Record<string, (typeof CANONICAL_OWNERS)[number]> = {
  "": "Alex",
  "Alex + Brian": "Alex",
  "Alex + Glenda": "Alex",
  "Alex / Ops": "Alex",
  "Example Client Admin": "Mission Agent",
  "Example Client Mission Agent": "Mission Agent",
  "Example Client Morgan": "Morgan",
};

function normalizeOwner(owner: unknown): string {
  const value = typeof owner === "string" ? owner.trim() : "";
  if (value in OWNER_NORMALIZATION) return OWNER_NORMALIZATION[value];
  return CANONICAL_OWNERS.includes(value as (typeof CANONICAL_OWNERS)[number]) ? value : value;
}

function isEngineeringLinkedItem(item: Pick<ActionItem, "department" | "externalId">): boolean {
  return item.department === "Engineering" && Boolean(item.externalId);
}

function mapPriorityToLinear(priority: Priority): number {
  if (priority === "high") return 2;
  if (priority === "medium") return 3;
  return 4;
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function resolveLinearAssigneeId(owner: string): Promise<string | null> {
  const normalizedOwner = normalizeComparable(owner);
  if (!normalizedOwner) return null;
  const users = await listLinearUsers();
  const exact = users.find((user) => {
    const candidates = [user.name, user.displayName, user.email].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.some((candidate) => normalizeComparable(candidate) === normalizedOwner);
  });
  return exact?.id ?? null;
}

async function resolveLinearProject(input: { projectId?: string; projectName?: string }): Promise<{ projectId?: string | null; projectName?: string } | null> {
  if (input.projectId) {
    return { projectId: input.projectId, projectName: input.projectName };
  }

  const projectName = input.projectName?.trim();
  if (!projectName) return null;

  const projects = await listLinearProjects();
  const match = projects.find((project) => normalizeComparable(project.name) === normalizeComparable(projectName));
  if (!match) return null;
  return { projectId: match.id, projectName: match.name };
}

export async function GET() {
  const items = readActionItems();
  return NextResponse.json(items, {
    headers: { "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, owner, department, type, deadline, sourceMeeting, sourceDate, sourceChannelId, sourceMessageId, relatedAccount, notes, priority, createdBy, autoCompletable, completionSignalType, completionSignalRef, completionCheckHint, projectId, projectName, parentId, externalId, externalUrl, relations, relatedAccountId, relatedContactId } = body;
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const items = readActionItems();
    const now = new Date().toISOString();
    const newItem: ActionItem = {
      id: nextActionItemId(items),
      title,
      owner: normalizeOwner(owner),
      department: department ?? "",
      type: type ?? "",
      deadline: deadline ?? null,
      status: "not_started",
      sourceMeeting: sourceMeeting ?? "",
      sourceDate: sourceDate ?? now.split("T")[0],
      sourceChannelId: sourceChannelId ?? "",
      sourceMessageId: sourceMessageId ?? "",
      relatedAccount: relatedAccount ?? "",
      notes: notes ?? "",
      priority: priority ?? "medium",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      createdBy: createdBy ?? "",
      updatedBy: createdBy ?? "",
      ...(autoCompletable !== undefined && { autoCompletable }),
      ...(completionSignalType !== undefined && { completionSignalType }),
      ...(completionSignalRef !== undefined && { completionSignalRef }),
      ...(completionCheckHint !== undefined && { completionCheckHint }),
      ...(projectId !== undefined && { projectId }),
      ...(projectName !== undefined && { projectName }),
      ...(parentId !== undefined && { parentId }),
      ...(externalId !== undefined && { externalId }),
      ...(externalUrl !== undefined && { externalUrl }),
      ...(relations !== undefined && { relations }),
      ...(relatedAccountId !== undefined && { relatedAccountId }),
      ...(relatedContactId !== undefined && { relatedContactId }),
    };

    items.push(newItem);
    writeActionItems(items);
    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "action-item",
      entityId: newItem.id,
      action: "create",
      changes: [],
      context: { route: "/api/action-items", method: "POST" },
    });
    return NextResponse.json(newItem, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const items = readActionItems();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    items.splice(idx, 1);
    writeActionItems(items);
    safeAppendAuditEntry({
      actor: actorFromRequest(request),
      entityType: "action-item",
      entityId: id,
      action: "delete",
      changes: [],
      context: { route: "/api/action-items", method: "DELETE" },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const items = readActionItems();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const previous = items[idx];
    const now = new Date().toISOString();
    const updatedFields = "owner" in fields ? { ...fields, owner: normalizeOwner(fields.owner) } : fields;
    const updated: ActionItem = { ...previous, ...updatedFields, updatedAt: now };

    const nextStatus = updatedFields.status as ActionItem["status"] | undefined;
    if (nextStatus === "complete" && !previous.completedAt) {
      updated.completedAt = now;
    }
    if (nextStatus && nextStatus !== "complete") {
      updated.completedAt = null;
    }

    items[idx] = updated;
    writeActionItems(items);

    let linearSync:
      | {
          synced: boolean;
          issueIdentifier?: string;
          linearState?: string;
          assigneeMatched?: boolean;
          projectMatched?: boolean;
          error?: string;
        }
      | undefined;

    if (isEngineeringLinkedItem(updated)) {
      try {
        const assigneeId = "owner" in updatedFields ? await resolveLinearAssigneeId(updated.owner) : undefined;
        const resolvedProject = ("projectId" in updatedFields || "projectName" in updatedFields)
          ? await resolveLinearProject({ projectId: updated.projectId, projectName: updated.projectName })
          : null;

        if (resolvedProject?.projectId) {
          updated.projectId = resolvedProject.projectId;
          updated.projectName = resolvedProject.projectName ?? updated.projectName;
          items[idx] = updated;
          writeActionItems(items);
        }

        const result = await updateLinearIssueFields({
          identifier: updated.externalId!,
          ...(typeof updated.title === "string" ? { title: updated.title } : {}),
          ...(updated.status ? { status: updated.status } : {}),
          ...(updated.priority ? { priority: mapPriorityToLinear(updated.priority) } : {}),
          ...("owner" in updatedFields && assigneeId ? { assigneeId } : {}),
          ...(resolvedProject?.projectId ? { projectId: resolvedProject.projectId } : {}),
        });

        updated.externalUrl = result.issue.url;
        updated.projectId = result.issue.project?.id ?? updated.projectId;
        updated.projectName = result.issue.project?.name ?? updated.projectName;
        updated.owner = result.issue.assignee?.name ?? updated.owner;
        updated.updatedAt = result.issue.updatedAt ?? updated.updatedAt;
        items[idx] = updated;
        writeActionItems(items);

        linearSync = {
          synced: true,
          issueIdentifier: result.issue.identifier,
          linearState: result.state?.name,
          assigneeMatched: "owner" in updatedFields ? Boolean(assigneeId) : undefined,
          projectMatched: ("projectId" in updatedFields || "projectName" in updatedFields) ? Boolean(resolvedProject?.projectId) : undefined,
          error:
            ("owner" in updatedFields && !assigneeId)
              ? `No exact Linear assignee match for ${updated.owner}`
              : (("projectId" in updatedFields || "projectName" in updatedFields) && !resolvedProject?.projectId)
              ? `No exact Linear project match for ${updated.projectName ?? updated.projectId ?? "project"}`
              : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        linearSync = {
          synced: false,
          issueIdentifier: updated.externalId,
          error: message,
        };
      }
    }

    const changes = diffActionItem(previous, updated);
    if (changes.length > 0) {
      safeAppendAuditEntry({
        actor: actorFromRequest(request),
        entityType: "action-item",
        entityId: id,
        action: "patch",
        changes,
        context: { route: "/api/action-items", method: "PATCH" },
      });
    }
    return NextResponse.json(linearSync ? { ...updated, linearSync } : updated);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
