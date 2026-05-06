import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(rootDir, "packages", "js");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

const tempDir = mkdtempSync(join(tmpdir(), "tokid-pack-smoke-"));

let tarballPath = "";

try {
  const packOutput = run("npm", ["pack", "--json"]);
  const packEntries = JSON.parse(packOutput);
  const tarballName = packEntries[0]?.filename;

  if (!tarballName) {
    throw new Error("npm pack did not produce a tarball");
  }

  tarballPath = join(packageRoot, tarballName);

  writeFileSync(
    join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "tokid-pack-smoke",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );

  execFileSync("npm", ["install", "--silent", tarballPath], {
    cwd: tempDir,
    stdio: "inherit",
  });

  execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `
        import { createTokidFactory, generate, isTokid, toPrompt, toTransport } from "tokid";

        const id = generate();
        if (!isTokid(id)) {
          throw new Error("Packed tokid import generated an invalid id");
        }

        const factory = createTokidFactory({ profile: "openai-cross-v1", length: 4 });
        const scoped = factory.generate();
        if (!scoped.startsWith("tk1_")) {
          throw new Error("Factory did not generate the expected envelope form");
        }

        const prompt = toPrompt(id);
        const transport = toTransport(id);
        if (prompt.length === 0 || transport.length === 0) {
          throw new Error("Packed tokid format helpers returned empty strings");
        }
      `,
    ],
    {
      cwd: tempDir,
      stdio: "inherit",
    },
  );

  execFileSync("npx", ["--no-install", "tokid"], {
    cwd: tempDir,
    stdio: "inherit",
  });

  console.log(`Pack smoke test passed (${tarballName})`);
} finally {
  rmSync(tempDir, { force: true, recursive: true });
  if (tarballPath && existsSync(tarballPath)) {
    unlinkSync(tarballPath);
  }
}
