import { existsSync, readFileSync } from "fs";
import path from "path";

const LINEAR_API_URL = "https://api.linear.app/graphql";
const LINEAR_TEAM_ID = "02090171-57ba-42e7-bdf1-ebef2f981277";

interface LinearGraphQLError {
  message: string;
}

interface LinearResponse<T> {
  data?: T;
  errors?: LinearGraphQLError[];
}

export type MissionControlStatus = "not_started" | "in_progress" | "complete";

export interface LinearIssueRef {
  id: string;
  identifier: string;
  title: string;
  url: string;
  team?: { id: string; key?: string | null } | null;
  state?: { id: string; name: string; type: string } | null;
  assignee?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  priority?: number | null;
  updatedAt?: string;
}

export interface LinearUserRef {
  id: string;
  name: string;
  displayName?: string | null;
  email?: string | null;
  active?: boolean | null;
}

export interface LinearProjectRef {
  id: string;
  name: string;
}

interface LinearWorkflowState {
  id: string;
  name: string;
  type: string;
}

function loadApiKey(): string {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  const envFile = path.resolve(process.cwd(), ".env.linear");
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, "utf-8");
    const match = content.match(/^LINEAR_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  }
  throw new Error("LINEAR_API_KEY not found in environment or .env.linear");
}

export async function linearRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: loadApiKey(),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linear API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as LinearResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((err) => err.message).join("; "));
  }
  if (!json.data) {
    throw new Error("Linear API returned no data");
  }

  return json.data;
}

export async function findIssueByIdentifier(identifier: string): Promise<LinearIssueRef | null> {
  const data = await linearRequest<{
    issues: { nodes: LinearIssueRef[] };
  }>(
    `query FindIssueByIdentifier($identifier: String!, $teamId: String!) {
      issues(first: 1, filter: {
        identifier: { eq: $identifier }
        team: { id: { eq: $teamId } }
      }) {
        nodes {
          id
          identifier
          title
          url
          team { id key }
          state { id name type }
          assignee { id name }
          project { id name }
          priority
          updatedAt
        }
      }
    }`,
    { identifier, teamId: LINEAR_TEAM_ID }
  );

  return data.issues.nodes[0] ?? null;
}

export async function listLinearUsers(teamId = LINEAR_TEAM_ID): Promise<LinearUserRef[]> {
  const data = await linearRequest<{
    team: { memberships: { nodes: Array<{ user: LinearUserRef | null }> } } | null;
  }>(
    `query TeamUsers($teamId: String!) {
      team(id: $teamId) {
        memberships {
          nodes {
            user {
              id
              name
              displayName
              email
              active
            }
          }
        }
      }
    }`,
    { teamId }
  );

  return (data.team?.memberships.nodes ?? [])
    .map((membership) => membership.user)
    .filter((user): user is LinearUserRef => Boolean(user?.id));
}

export async function listLinearProjects(teamId = LINEAR_TEAM_ID): Promise<LinearProjectRef[]> {
  const data = await linearRequest<{
    team: { projects: { nodes: LinearProjectRef[] } } | null;
  }>(
    `query TeamProjects($teamId: String!) {
      team(id: $teamId) {
        projects {
          nodes {
            id
            name
          }
        }
      }
    }`,
    { teamId }
  );

  return data.team?.projects.nodes ?? [];
}

async function getWorkflowStates(teamId: string): Promise<LinearWorkflowState[]> {
  const data = await linearRequest<{
    team: { states: { nodes: LinearWorkflowState[] } } | null;
  }>(
    `query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }`,
    { teamId }
  );

  return data.team?.states.nodes ?? [];
}

function chooseState(states: LinearWorkflowState[], status: MissionControlStatus): LinearWorkflowState | null {
  const preferredTypes: Record<MissionControlStatus, string[]> = {
    not_started: ["unstarted", "backlog", "triage"],
    in_progress: ["started"],
    complete: ["completed"],
  };

  const ranked = preferredTypes[status];
  for (const type of ranked) {
    const match = states.find((state) => state.type === type);
    if (match) return match;
  }

  if (status === "not_started") {
    return states.find((state) => state.type !== "completed" && state.type !== "canceled") ?? null;
  }

  return null;
}

export async function updateLinearIssueStatus(identifier: string, status: MissionControlStatus): Promise<{
  issue: LinearIssueRef;
  state: { id: string; name: string; type: string };
}> {
  const issue = await findIssueByIdentifier(identifier);
  if (!issue) {
    throw new Error(`Linear issue ${identifier} not found`);
  }

  const teamId = issue.team?.id ?? LINEAR_TEAM_ID;
  const states = await getWorkflowStates(teamId);
  const targetState = chooseState(states, status);

  if (!targetState) {
    throw new Error(`No Linear workflow state available for Mission Control status ${status}`);
  }

  if (issue.state?.id === targetState.id) {
    return { issue, state: targetState };
  }

  const data = await linearRequest<{
    issueUpdate: {
      success: boolean;
      issue: LinearIssueRef;
    };
  }>(
    `mutation UpdateIssueState($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue {
          id
          identifier
          title
          url
          team { id key }
          state { id name type }
        }
      }
    }`,
    { id: issue.id, stateId: targetState.id }
  );

  if (!data.issueUpdate.success) {
    throw new Error(`Linear issue update failed for ${identifier}`);
  }

  return {
    issue: data.issueUpdate.issue,
    state: data.issueUpdate.issue.state ?? targetState,
  };
}

export async function updateLinearIssueFields(input: {
  identifier: string;
  title?: string;
  status?: MissionControlStatus;
  assigneeId?: string | null;
  projectId?: string | null;
  priority?: number;
}): Promise<{
  issue: LinearIssueRef;
  state?: { id: string; name: string; type: string } | null;
}> {
  const issue = await findIssueByIdentifier(input.identifier);
  if (!issue) {
    throw new Error(`Linear issue ${input.identifier} not found`);
  }

  const updateInput: Record<string, unknown> = {};
  let targetState: LinearWorkflowState | null = null;

  if (typeof input.title === "string" && input.title.trim() && input.title.trim() !== issue.title) {
    updateInput.title = input.title.trim();
  }

  if (typeof input.priority === "number") {
    updateInput.priority = input.priority;
  }

  if (input.assigneeId !== undefined) {
    updateInput.assigneeId = input.assigneeId;
  }

  if (input.projectId !== undefined) {
    updateInput.projectId = input.projectId;
  }

  if (input.status) {
    const teamId = issue.team?.id ?? LINEAR_TEAM_ID;
    const states = await getWorkflowStates(teamId);
    targetState = chooseState(states, input.status);
    if (!targetState) {
      throw new Error(`No Linear workflow state available for Mission Control status ${input.status}`);
    }
    if (issue.state?.id !== targetState.id) {
      updateInput.stateId = targetState.id;
    }
  }

  if (Object.keys(updateInput).length === 0) {
    return { issue, state: issue.state ?? targetState };
  }

  const data = await linearRequest<{
    issueUpdate: {
      success: boolean;
      issue: LinearIssueRef;
    };
  }>(
    `mutation UpdateIssueFields($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          team { id key }
          state { id name type }
          assignee { id name }
          project { id name }
          priority
          updatedAt
        }
      }
    }`,
    { id: issue.id, input: updateInput }
  );

  if (!data.issueUpdate.success) {
    throw new Error(`Linear issue update failed for ${input.identifier}`);
  }

  return {
    issue: data.issueUpdate.issue,
    state: data.issueUpdate.issue.state ?? targetState,
  };
}

export async function createLinearIssueDraft(input: {
  title: string;
  description?: string;
  teamId?: string;
  projectId?: string;
  assigneeId?: string;
  priority?: number;
}): Promise<{ id: string; identifier: string; title: string; url: string }> {
  const data = await linearRequest<{
    issueCreate: {
      success: boolean;
      issue: { id: string; identifier: string; title: string; url: string };
    };
  }>(
    `mutation CreateIssueDraft($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }`,
    {
      input: {
        teamId: input.teamId ?? LINEAR_TEAM_ID,
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        assigneeId: input.assigneeId,
        priority: input.priority,
      },
    }
  );

  if (!data.issueCreate.success) {
    throw new Error("Linear issue draft creation failed");
  }

  return data.issueCreate.issue;
}

export { LINEAR_TEAM_ID };
