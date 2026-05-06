import path from "node:path";
import { rmSync } from "node:fs";

import { dotnet, ensureCleanGit, parseReleaseArgs, repoRoot, run, runReleaseGate } from "./_common.mjs";

const { dryRun, skipCheck } = parseReleaseArgs();
const projectRoot = path.join(repoRoot, "packages", "dotnet", "Tokid");
const outputDir = path.join(projectRoot, "artifacts", "nuget");

if (!dryRun) {
  ensureCleanGit();
}

runReleaseGate({ skipCheck });

rmSync(outputDir, { force: true, recursive: true });
run(dotnet, ["pack", "Tokid.csproj", "-c", "Release", "-o", outputDir], { cwd: projectRoot });

if (dryRun) {
  process.exit(0);
}

run(dotnet, ["nuget", "push", `${outputDir}/*.nupkg`, "--source", "https://api.nuget.org/v3/index.json"], {
  cwd: projectRoot,
  shell: true,
});
