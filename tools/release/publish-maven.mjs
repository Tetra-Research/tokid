import path from "node:path";

import { ensureCleanGit, maven, parseReleaseArgs, repoRoot, run, runReleaseGate } from "./_common.mjs";

const { dryRun, skipCheck } = parseReleaseArgs();

if (!dryRun) {
  ensureCleanGit();
}

runReleaseGate({ skipCheck });

run(maven, dryRun ? ["-Pcentral", "-DskipTests", "-Dgpg.skip=true", "verify"] : ["-Pcentral", "-DskipTests", "deploy"], {
  cwd: path.join(repoRoot, "packages", "java"),
});
