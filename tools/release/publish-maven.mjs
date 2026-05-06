import path from "node:path";

import { repoRoot, run } from "./_common.mjs";

run("mvn", ["deploy"], {
  cwd: path.join(repoRoot, "packages", "java"),
});
