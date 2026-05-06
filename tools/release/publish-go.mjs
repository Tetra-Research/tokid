import { ensureCleanGit, localTagExists, packageVersion, parseReleaseArgs, repoRoot, run, runReleaseGate } from "./_common.mjs";

const { dryRun, push, skipCheck } = parseReleaseArgs();
const version = packageVersion("packages/js/package.json");
const tag = `packages/go/v${version}`;

if (dryRun) {
  runReleaseGate({ skipCheck });
  console.log(`Go module release tag: ${tag}`);
  console.log(`Publish with: npm run release:go -- --push`);
  process.exit(0);
}

ensureCleanGit();
runReleaseGate({ skipCheck });

if (localTagExists(tag)) {
  throw new Error(`Go module tag "${tag}" already exists locally`);
}

run("git", ["tag", "-a", tag, "-m", `tokid Go SDK ${version}`], { cwd: repoRoot });

if (push) {
  run("git", ["push", "origin", tag], { cwd: repoRoot });
  console.log(`Created and pushed Go module tag ${tag}`);
} else {
  console.log(`Created Go module tag ${tag}. Push it with: git push origin ${tag}`);
}
