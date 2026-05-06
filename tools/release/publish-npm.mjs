import path from "node:path";

import { repoRoot, run } from "./_common.mjs";

run("npm", ["publish", "--provenance", "--access", "public"], {
  cwd: path.join(repoRoot, "packages", "js"),
});
