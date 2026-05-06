import path from "node:path";

import { ensureCleanGit, parseReleaseArgs, repoRoot, run, runReleaseGate } from "./_common.mjs";

const { dryRun, skipCheck } = parseReleaseArgs();

if (!dryRun) {
  ensureCleanGit();
}

runReleaseGate({ skipCheck });

const args = ["publish", "--access", "public", "--tag", "alpha"];
if (dryRun) {
  args.push("--dry-run");
}

run("npm", args, {
  cwd: path.join(repoRoot, "packages", "js"),
});
