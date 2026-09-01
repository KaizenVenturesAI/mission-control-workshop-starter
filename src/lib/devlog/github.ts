import { normalizeDevOwner } from "@/lib/devlog/attribution";
import type { DevLogLedgerEntry } from "@/lib/devlog/sourceRefs";

const DEFAULT_OWNER = "mission-control-starter";
const DEFAULT_REPO = "example-client-mission-control";
const DEFAULT_BRANCH = "main";
const DEFAULT_LOOKBACK = 100;

export interface DevLogGitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  lookback: number;
  token: string;
}

interface GitHubUser {
  login?: string | null;
  html_url?: string | null;
}

interface GitHubCommitListItem {
  sha: string;
  html_url: string;
  author?: GitHubUser | null;
  committer?: GitHubUser | null;
  commit: {
    message: string;
    author?: { name?: string | null; email?: string | null; date?: string | null } | null;
    committer?: { name?: string | null; email?: string | null; date?: string | null } | null;
  };
}

interface GitHubCommitDetail extends GitHubCommitListItem {
  stats?: { additions?: number; deletions?: number; total?: number };
  files?: Array<{ filename: string; status?: string; additions?: number; deletions?: number; changes?: number }>;
}

interface GitHubPullRef {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user?: GitHubUser | null;
  merged_at?: string | null;
}

export function getGitHubConfig(): { config: DevLogGitHubConfig; missing: string[] } {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  const repoSlug = process.env.DEVLOG_GITHUB_REPO ?? `${DEFAULT_OWNER}/${DEFAULT_REPO}`;
  const [owner = DEFAULT_OWNER, repo = DEFAULT_REPO] = repoSlug.split("/");
  const lookbackRaw = Number(process.env.DEVLOG_GITHUB_LOOKBACK ?? DEFAULT_LOOKBACK);
  const config: DevLogGitHubConfig = {
    owner,
    repo,
    branch: process.env.DEVLOG_GITHUB_BRANCH ?? DEFAULT_BRANCH,
    lookback: Number.isFinite(lookbackRaw) ? Math.min(Math.max(lookbackRaw, 1), 100) : DEFAULT_LOOKBACK,
    token,
  };
  return { config, missing: token ? [] : ["GITHUB_TOKEN"] };
}

export async function resolveGitHubConfig(): Promise<{ config: DevLogGitHubConfig; missing: string[] }> {
  const fallback = getGitHubConfig();
  const repoSlug = process.env.DEVLOG_GITHUB_REPO ?? `${DEFAULT_OWNER}/${DEFAULT_REPO}`;
  const [owner = DEFAULT_OWNER, repo = DEFAULT_REPO] = repoSlug.split("/");
  const lookbackRaw = Number(process.env.DEVLOG_GITHUB_LOOKBACK ?? DEFAULT_LOOKBACK);
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
  const config: DevLogGitHubConfig = {
    ...fallback.config,
    owner,
    repo,
    branch: process.env.DEVLOG_GITHUB_BRANCH ?? DEFAULT_BRANCH,
    lookback: Number.isFinite(lookbackRaw) ? Math.min(Math.max(lookbackRaw, 1), 100) : DEFAULT_LOOKBACK,
    token,
  };
  return { config, missing: token ? [] : ["GITHUB_TOKEN"] };
}

async function githubRequest<T>(config: DevLogGitHubConfig, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "User-Agent": "example-client-mission-control-devlog",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${response.status}: ${text.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

function titleFromMessage(message: string): string {
  return message.split(/\r?\n/)[0]?.trim() || "Untitled commit";
}

function bodyFromMessage(message: string): string {
  return message.split(/\r?\n/).slice(1).join("\n").trim();
}

function tagFromFile(filename: string): string {
  const [first, second] = filename.split("/");
  if (first === "src" && second) return second;
  return first || "repo";
}

function compactFiles(files: GitHubCommitDetail["files"] = []): string[] {
  const names = files.map((file) => file.filename).filter(Boolean);
  if (names.length <= 8) return names;
  return [...names.slice(0, 8), `+${names.length - 8} more files`];
}

function entryFromCommit(config: DevLogGitHubConfig, commit: GitHubCommitDetail, pulls: GitHubPullRef[]): DevLogLedgerEntry {
  const now = new Date().toISOString();
  const author = {
    name: commit.commit.author?.name ?? null,
    email: commit.commit.author?.email ?? null,
    login: commit.author?.login ?? null,
  };
  const committer = {
    name: commit.commit.committer?.name ?? null,
    email: commit.commit.committer?.email ?? null,
    login: commit.committer?.login ?? null,
  };
  const owner = normalizeDevOwner(author, committer);
  const title = titleFromMessage(commit.commit.message);
  const body = bodyFromMessage(commit.commit.message);
  const files = commit.files ?? [];
  const occurredAt = commit.commit.author?.date ?? commit.commit.committer?.date ?? now;
  const sha = commit.sha;
  const shortSha = sha.slice(0, 7);
  const repo = `${config.owner}/${config.repo}`;
  const primaryPull = pulls[0];

  return {
    id: `github-commit-${sha}`,
    title,
    summary: body || `Commit ${shortSha} changed ${files.length || "repository"} file${files.length === 1 ? "" : "s"} in ${repo}.`,
    occurredAt,
    status: primaryPull?.state === "open" ? "review" : "completed",
    sources: [
      {
        system: "github",
        id: sha,
        label: `commit ${shortSha}`,
        url: commit.html_url,
        type: "commit",
      },
      ...pulls.map((pull) => ({
        system: "github" as const,
        id: String(pull.number),
        label: `PR #${pull.number}`,
        url: pull.html_url,
        type: "pull_request" as const,
      })),
    ],
    owners: [owner],
    tags: Array.from(new Set(files.slice(0, 12).map((file) => tagFromFile(file.filename)))),
    createdAt: now,
    updatedAt: now,
    payload: {
      sourceSystem: "github",
      repo,
      branch: config.branch,
      sha,
      shortSha,
      message: commit.commit.message,
      author,
      committer,
      githubAuthorUrl: commit.author?.html_url ?? null,
      githubCommitterUrl: commit.committer?.html_url ?? null,
      canonicalOwner: owner,
      files: compactFiles(files),
      fileCount: files.length,
      stats: {
        additions: commit.stats?.additions ?? 0,
        deletions: commit.stats?.deletions ?? 0,
        total: commit.stats?.total ?? 0,
      },
      pulls: pulls.map((pull) => ({
        number: pull.number,
        title: pull.title,
        state: pull.state,
        url: pull.html_url,
        authorLogin: pull.user?.login ?? null,
        mergedAt: pull.merged_at ?? null,
      })),
    },
  };
}

export async function fetchGitHubDevLogEntries(config: DevLogGitHubConfig): Promise<DevLogLedgerEntry[]> {
  const commits = await githubRequest<GitHubCommitListItem[]>(
    config,
    `/repos/${config.owner}/${config.repo}/commits?sha=${encodeURIComponent(config.branch)}&per_page=${config.lookback}`,
  );

  const entries: DevLogLedgerEntry[] = [];
  for (const item of commits) {
    const [detail, pulls] = await Promise.all([
      githubRequest<GitHubCommitDetail>(config, `/repos/${config.owner}/${config.repo}/commits/${item.sha}`),
      githubRequest<GitHubPullRef[]>(config, `/repos/${config.owner}/${config.repo}/commits/${item.sha}/pulls`).catch(() => []),
    ]);
    entries.push(entryFromCommit(config, detail, pulls));
  }
  return entries;
}
