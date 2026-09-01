import { fetchGitHubDevLogEntries, resolveGitHubConfig } from "@/lib/devlog/github";
import { recordFailedDevLogSyncRun, upsertDevLogEntries } from "@/lib/devlog/store";
import type { DevLogSyncRun } from "@/lib/devlog/sourceRefs";

function newRun(repo: string, branch: string): DevLogSyncRun {
  return {
    id: `github-${Date.now()}`,
    sourceSystem: "github",
    sourceRepo: repo,
    sourceBranch: branch,
    status: "running",
    startedAt: new Date().toISOString(),
    created: 0,
    updated: 0,
    unchanged: 0,
    total: 0,
  };
}

export async function syncGitHubDevLog(): Promise<DevLogSyncRun> {
  const { config, missing } = await resolveGitHubConfig();
  const repo = `${config.owner}/${config.repo}`;
  const run = newRun(repo, config.branch);
  if (missing.length) {
    return recordFailedDevLogSyncRun(run, new Error(`Missing GitHub sync configuration: ${missing.join(", ")}`));
  }

  try {
    const entries = await fetchGitHubDevLogEntries(config);
    return await upsertDevLogEntries(entries, run);
  } catch (error) {
    return recordFailedDevLogSyncRun(run, error);
  }
}
