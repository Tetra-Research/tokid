import path from "node:path";

import { dotnet, repoRoot, run } from "./_common.mjs";

const projectRoot = path.join(repoRoot, "packages", "dotnet", "Tokid");
run(dotnet, ["pack", "Tokid.csproj", "-c", "Release"], { cwd: projectRoot });
run(dotnet, ["nuget", "push", "bin/Release/*.nupkg"], { cwd: projectRoot, shell: true });
