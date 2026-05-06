import path from "node:path";

import { repoRoot, run } from "./_common.mjs";

run("cargo", ["publish"], {
  cwd: path.join(repoRoot, "packages", "rust"),
});
