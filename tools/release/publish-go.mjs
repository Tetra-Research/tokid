import { packageVersion, repoRoot, run } from "./_common.mjs";

const version = packageVersion("packages/js/package.json");
const tag = `packages/go/v${version}`;

run("git", ["tag", tag], { cwd: repoRoot });
console.log(`Created Go module tag ${tag}. Push it with: git push origin ${tag}`);
