import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");
export const dotnet =
  process.env.DOTNET ??
  (existsSync(path.join(repoRoot, ".tooling", "dotnet", "dotnet"))
    ? path.join(repoRoot, ".tooling", "dotnet", "dotnet")
    : "dotnet");
export const maven =
  process.env.MAVEN ??
  (existsSync(path.join(repoRoot, ".tooling", "maven", "bin", "mvn"))
    ? path.join(repoRoot, ".tooling", "maven", "bin", "mvn")
    : "mvn");

export function packageVersion(relativePackageJsonPath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePackageJsonPath), "utf8")).version;
}

export function parseReleaseArgs(argv = process.argv.slice(2)) {
  const flags = new Set(argv);
  return {
    dryRun: flags.has("--dry-run"),
    push: flags.has("--push"),
    skipCheck: flags.has("--skip-check"),
  };
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

export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() || result.stdout?.trim() || `${command} ${args.join(" ")} failed with exit code ${result.status ?? -1}`,
    );
  }

  return result.stdout.trim();
}

export function runReleaseGate({ skipCheck = false } = {}) {
  if (!skipCheck) {
    run("npm", ["run", "release:check"]);
  }
}

export function ensureCleanGit() {
  const status = capture("git", ["status", "--porcelain"]);
  if (status.length > 0) {
    throw new Error("Release commands require a clean git working tree");
  }
}

export function localTagExists(tag) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  return result.status === 0;
}

export function withTempDir(prefix, callback) {
  const tempDir = mkdtempSync(path.join(tmpdir(), prefix));
  try {
    return callback(tempDir);
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}
