import { syncGitHubDevLog } from "../src/lib/devlog/sync";

syncGitHubDevLog()
  .then((run) => {
    console.log(JSON.stringify(run, null, 2));
    process.exit(run.status === "completed" ? 0 : 1);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

