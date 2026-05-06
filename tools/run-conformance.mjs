import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dotnetLocal = path.join(repoRoot, ".tooling", "dotnet", "dotnet");
const dotnet = fs.existsSync(dotnetLocal) ? dotnetLocal : "dotnet";

function runStep(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });

  const combined = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    throw new Error(`${name} failed\n${combined}`);
  }

  const jsonLine = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .at(-1);

  if (!jsonLine) {
    throw new Error(`${name} did not report a JSON result\n${combined}`);
  }

  return JSON.parse(jsonLine);
}

function compileJava() {
  const mainFiles = listFiles(path.join(repoRoot, "packages", "java", "src", "main", "java"));
  const testFiles = listFiles(path.join(repoRoot, "packages", "java", "src", "test", "java"));
  const outDir = path.join(repoRoot, "packages", "java", "out");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const result = spawnSync("javac", ["-d", outDir, ...mainFiles, ...testFiles], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`java build failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
}

function listFiles(root) {
  return fs
    .readdirSync(root, { recursive: true })
    .filter((entry) => entry.endsWith(".java"))
    .map((entry) => path.join(root, entry))
    .sort();
}

const results = [];

results.push(runStep("javascript", "node", [path.join("tools", "run-js-conformance.mjs")]));
results.push(runStep("python", "python3", [path.join("packages", "python", "scripts", "run_conformance.py")]));
results.push(runStep("go", "go", ["run", "./cmd/conformance"], { cwd: path.join(repoRoot, "packages", "go") }));
results.push(runStep("rust", "cargo", ["run", "--bin", "conformance"], { cwd: path.join(repoRoot, "packages", "rust") }));

compileJava();
results.push(runStep("java", "java", ["-cp", path.join("packages", "java", "out"), "io.tokid.ConformanceMain"]));
results.push(runStep("csharp", dotnet, ["run", "--project", path.join("packages", "dotnet", "Tokid.Tests", "Tokid.Tests.csproj")]));

for (const result of results) {
  if (!result.passed) {
    throw new Error(`${result.sdk} reported failure`);
  }
}

console.log(JSON.stringify({
  passed: true,
  sdks: results,
}, null, 2));
