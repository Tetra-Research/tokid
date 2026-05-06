import path from "node:path";
import { rmSync } from "node:fs";

import { ensureCleanGit, parseReleaseArgs, repoRoot, run, runReleaseGate, withTempDir } from "./_common.mjs";

const { dryRun, skipCheck } = parseReleaseArgs();
const packageRoot = path.join(repoRoot, "packages", "python");

if (!dryRun) {
  ensureCleanGit();
}

runReleaseGate({ skipCheck });

rmSync(path.join(packageRoot, "dist"), { force: true, recursive: true });

withTempDir("tokid-pypi-", (venvDir) => {
  run("python3", ["-m", "venv", venvDir]);

  const python = path.join(venvDir, "bin", "python");
  run(python, ["-m", "pip", "install", "--upgrade", "pip", "build", "twine"]);
  run(python, ["-m", "build"], { cwd: packageRoot });
  run(python, ["-m", "twine", "check", "dist/*"], { cwd: packageRoot, shell: true });

  if (dryRun) {
    return;
  }

  run(python, ["-m", "twine", "upload", "dist/*"], { cwd: packageRoot, shell: true });
});
