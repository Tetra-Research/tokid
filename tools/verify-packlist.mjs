import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const requiredPaths = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/package/index.js",
  "dist/package/index.d.ts",
  "dist/package/cli.js",
  "dist/package/cli.d.ts",
  "dist/package/kernel.js",
  "dist/package/kernel.d.ts",
  "dist/package/types.js",
  "dist/package/types.d.ts",
  "dist/package/profiles/index.js",
  "dist/package/profiles/index.d.ts",
  "dist/package/profiles/generated-registry.js",
  "dist/package/profiles/generated-registry.d.ts",
];

const disallowedPrefixes = [
  ".claude/",
  ".codex/",
  "openspec/",
  "src/",
  "study/",
  "test/",
  "dist/dev/",
  "dist/index",
  "dist/sanity-check",
];

const allowedPatterns = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^dist\/package\/.+\.(js|d\.ts)$/,
];

function main() {
  const result = spawnSync("npm", ["pack", "--json", "--dry-run"], {
    cwd: repoRoot,
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
