import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const recipesDir = path.join(repoRoot, "profiles", "recipes");
const profilesDir = path.join(repoRoot, "src", "profiles");
const generatedRegistryPath = path.join(profilesDir, "generated-registry.ts");

function main() {
  const mode = process.argv[2] ?? "build";
  if (mode !== "build" && mode !== "verify") {
    throw new Error(`Unsupported mode "${mode}". Use "build" or "verify".`);
  }

  const compiledOutputs = compileOutputs();
  if (mode === "build") {
    writeOutputs(compiledOutputs);
    return;
  }

  verifyOutputs(compiledOutputs);
}

function compileOutputs() {
  const recipes = loadRecipes();
  const compiledProfiles = recipes.map((recipe) => compileRecipe(recipe));
  const outputs = compiledProfiles.map((profile) => ({
    outputPath: path.join(profilesDir, profile.recipe.outputFile),
    content: renderProfileSource(profile),
  }));

  outputs.push({
    outputPath: generatedRegistryPath,
    content: renderRegistrySource(compiledProfiles),
  });

  return outputs;
}

function loadRecipes() {
  const recipeFiles = fs
    .readdirSync(recipesDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));

  if (recipeFiles.length === 0) {
    throw new Error(`No profile recipes found in ${path.relative(repoRoot, recipesDir)}`);
  }

  const recipes = recipeFiles.map((fileName) => {
    const recipePath = path.join(recipesDir, fileName);
    const recipe = JSON.parse(fs.readFileSync(recipePath, "utf8"));
    return {
      ...recipe,
      recipePath: path.relative(repoRoot, recipePath).replaceAll(path.sep, "/"),
    };
  });

  const defaultRecipes = recipes.filter((recipe) => recipe.default === true);
  if (defaultRecipes.length !== 1) {
    throw new Error(`Expected exactly one default profile recipe, found ${defaultRecipes.length}`);
  }

  return recipes;
}

function compileRecipe(recipe) {
  validateRecipe(recipe);

  const candidateRows = readCsv(recipe.candidateSource.path);
  const transportEvidenceRows = readCsv(recipe.transportEvidence.path);

  validateTransportEvidence(recipe, transportEvidenceRows);

  const eligibleRows = candidateRows
    .filter((row) => recipe.candidateSource.filters.every((filter) => matchesFilter(row, filter)))
    .sort((left, right) => compareRows(left, right, recipe.candidateSource.sort));

  const atoms =
    recipe.candidateSource.reduction.type === "prefix-free"
      ? reducePrefixFree(eligibleRows.map((row) => row[recipe.candidateSource.wordColumn]))
      : eligibleRows.map((row) => row[recipe.candidateSource.wordColumn]);

  if (atoms.length === 0) {
    throw new Error(`Recipe "${recipe.profileId}" produced an empty vocabulary`);
  }

  const uniqueAtoms = new Set(atoms);
  if (uniqueAtoms.size !== atoms.length) {
    throw new Error(`Recipe "${recipe.profileId}" produced duplicate atoms`);
  }

  const sourceArtifacts = [
    recipe.candidateSource.path,
    recipe.transportEvidence.path,
  ];

  const sourceLineage = {
    recipe: recipe.recipePath,
    studies: recipe.sourceLineage.studies,
    artifacts: sourceArtifacts.map((artifactPath) => ({
      path: artifactPath,
      sha256: hashFile(artifactPath),
    })),
    filters: [
      ...recipe.candidateSource.filters.map((filter) => filter.label),
      recipe.candidateSource.sortLabel,
      recipe.candidateSource.reduction.label,
    ],
    notes: recipe.sourceLineage.notes,
  };

  const entropy = {
    atomCount: atoms.length,
    bitsPerAtom: Math.log2(atoms.length),
    recommendedLength: recipe.entropy.recommendedLength,
    bitsAtRecommendedLength: Math.log2(atoms.length) * recipe.entropy.recommendedLength,
  };

  return {
    recipe,
    exportName: toExportName(recipe.profileId),
    manifest: {
      profileId: recipe.profileId,
      profileVersion: recipe.profileVersion,
      profileTag: recipe.profileTag,
      name: recipe.name,
      description: recipe.description,
      provider: recipe.provider,
      vocabulary: {
        syntax: recipe.vocabulary.syntax,
        atoms,
      },
      codecs: recipe.codecs,
      entropy,
      sourceLineage,
    },
  };
}

function validateRecipe(recipe) {
  const requiredTopLevelKeys = [
    "profileId",
    "outputFile",
    "profileVersion",
    "profileTag",
    "name",
    "description",
    "provider",
    "vocabulary",
    "entropy",
    "candidateSource",
    "transportEvidence",
    "sourceLineage",
    "codecs",
  ];

  for (const key of requiredTopLevelKeys) {
    if (!(key in recipe)) {
      throw new Error(`Recipe "${recipe.recipePath}" is missing required key "${key}"`);
    }
  }

  if (!Array.isArray(recipe.candidateSource.filters) || recipe.candidateSource.filters.length === 0) {
    throw new Error(`Recipe "${recipe.profileId}" must declare candidate filters`);
  }

  if (!Array.isArray(recipe.candidateSource.sort) || recipe.candidateSource.sort.length === 0) {
    throw new Error(`Recipe "${recipe.profileId}" must declare candidate sort rules`);
  }

  if (!Array.isArray(recipe.codecs) || recipe.codecs.length === 0) {
    throw new Error(`Recipe "${recipe.profileId}" must declare at least one codec`);
  }
}

function readCsv(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8").trim();
  const lines = source.split(/\r?\n/);
  const headers = lines[0]?.split(",");
  if (!headers || headers.length === 0) {
    throw new Error(`CSV file "${relativePath}" is empty`);
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split(",");
    if (values.length !== headers.length) {
      throw new Error(
        `CSV file "${relativePath}" has ${values.length} columns on row ${index + 2}; expected ${headers.length}`,
      );
    }

    return Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? ""]));
  });
}

function validateTransportEvidence(recipe, rows) {
  for (const [index, row] of rows.entries()) {
    if (row.winner !== recipe.transportEvidence.expectedWinner) {
      throw new Error(
        `Transport evidence mismatch for "${recipe.profileId}" at row ${index + 2}: expected winner "${recipe.transportEvidence.expectedWinner}", found "${row.winner}"`,
      );
    }

    if (row.runner_up !== recipe.transportEvidence.expectedRunnerUp) {
      throw new Error(
        `Transport evidence mismatch for "${recipe.profileId}" at row ${index + 2}: expected runner_up "${recipe.transportEvidence.expectedRunnerUp}", found "${row.runner_up}"`,
      );
    }
  }
}

function matchesFilter(row, filter) {
  const value = row[filter.column];
  if (value === undefined) {
    throw new Error(`Missing column "${filter.column}" in candidate source`);
  }

  if (Object.prototype.hasOwnProperty.call(filter, "equals") && value !== String(filter.equals)) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(filter, "min") && Number(value) < Number(filter.min)) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(filter, "max") && Number(value) > Number(filter.max)) {
    return false;
  }

  return true;
}

function compareRows(left, right, sortRules) {
  for (const rule of sortRules) {
    const leftValue = left[rule.column];
    const rightValue = right[rule.column];

    if (leftValue === undefined || rightValue === undefined) {
      throw new Error(`Missing sort column "${rule.column}" in candidate source`);
    }

    const comparison =
      rule.type === "number"
        ? Number(leftValue) - Number(rightValue)
        : leftValue.localeCompare(rightValue);

    if (comparison !== 0) {
      return rule.direction === "asc" ? comparison : -comparison;
    }
  }

  return 0;
}

function reducePrefixFree(atoms) {
  const selected = [];

  for (const atom of atoms) {
    if (selected.some((existing) => existing.startsWith(atom) || atom.startsWith(existing))) {
      continue;
    }
    selected.push(atom);
  }

  return selected;
}

function hashFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex");
}

function toExportName(profileId) {
  return `${profileId.toUpperCase().replaceAll("-", "_")}_PROFILE`;
}

function renderProfileSource(compiledProfile) {
  const { exportName, manifest, recipe } = compiledProfile;
  const serializedManifest = JSON.stringify(manifest, null, 2);

  return `import type { TokidProfileManifest } from "../types.js";

// Generated by tools/profile-compiler.mjs from ${recipe.recipePath}. Do not edit by hand.
export const ${exportName}: TokidProfileManifest = ${serializedManifest};
`;
}

function renderRegistrySource(compiledProfiles) {
  const sortedProfiles = [...compiledProfiles].sort((left, right) => {
    if (left.recipe.default && !right.recipe.default) {
      return -1;
    }
    if (!left.recipe.default && right.recipe.default) {
      return 1;
    }
    return left.recipe.profileId.localeCompare(right.recipe.profileId);
  });

  const imports = sortedProfiles
    .map(
      (profile) =>
        `import { ${profile.exportName} } from "./${profile.recipe.outputFile.replace(/\.ts$/, ".js")}";`,
    )
    .join("\n");

  const exportsList = sortedProfiles.map((profile) => profile.exportName).join(",\n  ");
  const defaultProfile = sortedProfiles.find((profile) => profile.recipe.default);

  return `import type { TokidProfileManifest } from "../types.js";
${imports}

// Generated by tools/profile-compiler.mjs. Do not edit by hand.
export const DEFAULT_PROFILE_ID = "${defaultProfile.recipe.profileId}";
export {
  ${exportsList},
};
export const embeddedProfiles: readonly TokidProfileManifest[] = Object.freeze([
  ${exportsList},
]);
`;
}

function writeOutputs(outputs) {
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output.outputPath), { recursive: true });
    fs.writeFileSync(output.outputPath, output.content);
  }
}

function verifyOutputs(outputs) {
  const staleOutputs = [];

  for (const output of outputs) {
    const current = fs.existsSync(output.outputPath) ? fs.readFileSync(output.outputPath, "utf8") : null;
    if (current !== output.content) {
      staleOutputs.push(path.relative(repoRoot, output.outputPath));
    }
  }

  if (staleOutputs.length > 0) {
    throw new Error(
      `Generated profile artifacts are stale. Regenerate them with "npm run build:profiles".\n${staleOutputs.join("\n")}`,
    );
  }
}

main();
