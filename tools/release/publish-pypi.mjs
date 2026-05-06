import path from "node:path";

import { repoRoot, run } from "./_common.mjs";

const packageRoot = path.join(repoRoot, "packages", "python");
run("python3", ["-m", "build"], { cwd: packageRoot });
run("python3", ["-m", "twine", "upload", "dist/*"], { cwd: packageRoot, shell: true });
