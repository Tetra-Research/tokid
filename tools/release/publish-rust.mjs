import path from "node:path";

import { ensureCleanGit, parseReleaseArgs, repoRoot, run, runReleaseGate } from "./_common.mjs";

const { dryRun, skipCheck } = parseReleaseArgs();

if (!dryRun) {
  ensureCleanGit();
}

runReleaseGate({ skipCheck });

run("cargo", dryRun ? ["publish", "--dry-run"] : ["publish"], {
  cwd: path.join(repoRoot, "packages", "rust"),
});
