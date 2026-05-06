import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");
export const dotnet =
  process.env.DOTNET ??
  (existsSync(path.join(repoRoot, ".tooling", "dotnet", "dotnet"))
    ? path.join(repoRoot, ".tooling", "dotnet", "dotnet")
    : "dotnet");

export function packageVersion(relativePackageJsonPath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePackageJsonPath), "utf8")).version;
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? -1}`);
  }
}
