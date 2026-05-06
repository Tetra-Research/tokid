import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(repoRoot, "packages", "js");

const requiredPaths = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/cli.js",
  "dist/cli.d.ts",
  "dist/kernel.js",
  "dist/kernel.d.ts",
  "dist/types.js",
  "dist/types.d.ts",
  "dist/profiles/index.js",
  "dist/profiles/index.d.ts",
  "dist/profiles/generated-registry.js",
  "dist/profiles/generated-registry.d.ts",
];

const disallowedPrefixes = [
  ".claude/",
  ".codex/",
  "openspec/",
  "src/",
  "study/",
  "test/",
  "dist/dev/",
];

const allowedPatterns = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^dist\/.+\.(js|d\.ts)$/,
];

function main() {
  const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
    cwd: packageRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "npm pack --dry-run failed");
  }

  const payload = JSON.parse(result.stdout);
  const fileEntries = payload[0]?.files ?? [];
  const paths = fileEntries.map((entry) => entry.path).sort((left, right) => left.localeCompare(right));

  for (const filePath of paths) {
    if (disallowedPrefixes.some((prefix) => filePath.startsWith(prefix))) {
      throw new Error(`Packlist contains disallowed path "${filePath}"`);
    }

    if (!allowedPatterns.some((pattern) => pattern.test(filePath))) {
      throw new Error(`Packlist contains unsupported path "${filePath}"`);
    }
  }

  for (const requiredPath of requiredPaths) {
    if (!paths.includes(requiredPath)) {
      throw new Error(`Packlist is missing required runtime artifact "${requiredPath}"`);
    }
  }

  console.log(`Packlist verified (${paths.length} files)`);
}

main();
