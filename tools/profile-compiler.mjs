import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const recipesDir = path.join(repoRoot, "profiles", "recipes");
const portableManifestsDir = path.join(repoRoot, "profiles", "manifests");
const portableProfilesDir = path.join(portableManifestsDir, "profiles");
const jsProfilesDir = path.join(repoRoot, "packages", "js", "src", "profiles");
const generatedRegistryPath = path.join(jsProfilesDir, "generated-registry.ts");
const conformanceSuitePath = path.join(repoRoot, "conformance", "fixtures", "suite.json");
const javaGeneratedSourcePath = path.join(
  repoRoot,
  "packages",
  "java",
  "src",
  "main",
  "java",
  "io",
  "tokid",
  "GeneratedProfiles.java",
);
const dotnetGeneratedSourcePath = path.join(
  repoRoot,
  "packages",
  "dotnet",
  "Tokid",
  "GeneratedProfiles.cs",
);

const derivedJsonTargets = [
  path.join(repoRoot, "packages", "python", "src", "tokid", "generated"),
  path.join(repoRoot, "packages", "go", "tokid", "generated"),
  path.join(repoRoot, "packages", "rust", "generated"),
  path.join(repoRoot, "packages", "java", "src", "main", "resources", "tokid"),
  path.join(repoRoot, "packages", "dotnet", "Tokid", "Generated"),
];

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
  const portableRegistry = buildPortableRegistry(compiledProfiles);
  const conformanceSuite = buildConformanceSuite(compiledProfiles, portableRegistry);
  const outputs = [];

  for (const compiledProfile of compiledProfiles) {
    outputs.push({
      outputPath: path.join(portableProfilesDir, manifestFileName(compiledProfile.recipe.profileId)),
      content: `${JSON.stringify(compiledProfile.manifest, null, 2)}\n`,
    });
  }

  outputs.push({
    outputPath: path.join(portableManifestsDir, "registry.json"),
    content: `${JSON.stringify(portableRegistry, null, 2)}\n`,
  });

  outputs.push({
    outputPath: conformanceSuitePath,
    content: `${JSON.stringify(conformanceSuite, null, 2)}\n`,
  });

  for (const compiledProfile of compiledProfiles) {
    outputs.push({
      outputPath: path.join(jsProfilesDir, compiledProfile.recipe.outputFile),
      content: renderProfileSource(compiledProfile),
    });
  }

  outputs.push({
    outputPath: generatedRegistryPath,
    content: renderRegistrySource(compiledProfiles),
  });

  for (const targetDir of derivedJsonTargets) {
    outputs.push({
      outputPath: path.join(targetDir, "registry.json"),
      content: `${JSON.stringify(portableRegistry, null, 2)}\n`,
    });

    for (const compiledProfile of compiledProfiles) {
      outputs.push({
        outputPath: path.join(targetDir, "profiles", manifestFileName(compiledProfile.recipe.profileId)),
        content: `${JSON.stringify(compiledProfile.manifest, null, 2)}\n`,
      });
    }
  }

  outputs.push({
    outputPath: javaGeneratedSourcePath,
    content: renderJavaGeneratedProfiles(compiledProfiles, portableRegistry.defaultProfileId),
  });

  outputs.push({
    outputPath: dotnetGeneratedSourcePath,
    content: renderDotnetGeneratedProfiles(compiledProfiles, portableRegistry.defaultProfileId),
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

  const sourceArtifacts = [recipe.candidateSource.path, recipe.transportEvidence.path];
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

function manifestFileName(profileId) {
  return `${profileId}.json`;
}

function sortCompiledProfiles(compiledProfiles) {
  return [...compiledProfiles].sort((left, right) => {
    if (left.recipe.default && !right.recipe.default) {
      return -1;
    }
    if (!left.recipe.default && right.recipe.default) {
      return 1;
    }
    return left.recipe.profileId.localeCompare(right.recipe.profileId);
  });
}

function buildPortableRegistry(compiledProfiles) {
  const sortedProfiles = sortCompiledProfiles(compiledProfiles);
  const defaultProfile = sortedProfiles.find((profile) => profile.recipe.default);

  return {
    schemaVersion: 1,
    defaultProfileId: defaultProfile.recipe.profileId,
    profiles: sortedProfiles.map((profile) => ({
      profileId: profile.manifest.profileId,
      profileTag: profile.manifest.profileTag,
      profileVersion: profile.manifest.profileVersion,
      manifest: `profiles/${manifestFileName(profile.manifest.profileId)}`,
      default: profile.recipe.default === true,
    })),
  };
}

function getPayloadCodec(manifest, codecId) {
  const codec = manifest.codecs.find((candidate) => candidate.kind === "payload" && candidate.id === codecId);
  if (!codec) {
    throw new Error(`Missing payload codec "${codecId}" in profile "${manifest.profileId}"`);
  }
  return codec;
}

function getEnvelopeCodec(manifest, codecId = "envelope") {
  const codec = manifest.codecs.find((candidate) => candidate.kind === "envelope" && candidate.id === codecId);
  if (!codec) {
    throw new Error(`Missing envelope codec "${codecId}" in profile "${manifest.profileId}"`);
  }
  return codec;
}

function renderPayload(manifest, codecId, atoms) {
  const codec = getPayloadCodec(manifest, codecId);
  return atoms.join(codec.separator);
}

function encodeBase36(bytes) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return value.toString(36);
}

function computeEnvelopeChecksum(codec, profileTag, payload) {
  const digest = createHash("sha256")
    .update(`${codec.prefix}|${codec.formatVersion}|${profileTag}|${payload}`)
    .digest()
    .subarray(0, 6);

  return encodeBase36(digest).padStart(codec.checksum.length, "0").slice(0, codec.checksum.length);
}

function renderEnvelope(manifest, atoms) {
  const codec = getEnvelopeCodec(manifest);
  const payload = renderPayload(manifest, codec.payloadCodecId, atoms);
  const checksum = computeEnvelopeChecksum(codec, manifest.profileTag, payload);
  return [codec.prefix, manifest.profileTag, payload, checksum].join(codec.separator);
}

function randomHexForIndices(indices) {
  return indices
    .flatMap((index) => [(index >>> 24) & 0xff, (index >>> 16) & 0xff, (index >>> 8) & 0xff, index & 0xff])
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function buildRoundTripCase(id, manifest, atoms) {
  return {
    id,
    logical: {
      profileId: manifest.profileId,
      atoms,
    },
    renderings: {
      prompt: renderPayload(manifest, "prompt", atoms),
      transport: renderPayload(manifest, "transport", atoms),
      envelope: renderEnvelope(manifest, atoms),
    },
  };
}

function mutateLastCharacter(value, replacement) {
  return `${value.slice(0, -1)}${replacement}`;
}

function buildConformanceSuite(compiledProfiles, portableRegistry) {
  const profilesById = new Map(compiledProfiles.map((profile) => [profile.manifest.profileId, profile.manifest]));
  const defaultManifest = profilesById.get(portableRegistry.defaultProfileId);

  const deterministicGeneration = sortCompiledProfiles(compiledProfiles).map((profile) => {
    const indices = [0, 1, 2, 3];
    const atoms = indices.map((index) => profile.manifest.vocabulary.atoms[index]);
    return {
      id: `${profile.manifest.profileId}-generate-4`,
      profileId: profile.manifest.profileId,
      length: atoms.length,
      randomHex: randomHexForIndices(indices),
      logical: {
        profileId: profile.manifest.profileId,
        atoms,
      },
      renderings: {
        prompt: renderPayload(profile.manifest, "prompt", atoms),
        transport: renderPayload(profile.manifest, "transport", atoms),
        envelope: renderEnvelope(profile.manifest, atoms),
      },
    };
  });

  const roundTrips = [
    ...deterministicGeneration.map((entry) => ({
      id: `${entry.profileId}-roundtrip`,
      logical: entry.logical,
      renderings: entry.renderings,
    })),
    buildRoundTripCase(
      "openai-cross-v1-alt",
      defaultManifest,
      [5, 8, 13, 21].map((index) => defaultManifest.vocabulary.atoms[index]),
    ),
  ];

  const invalidProfiles = [
    {
      id: "duplicate-atom-profile",
      errorContains: "Duplicate atom",
      manifest: {
        ...defaultManifest,
        profileId: "invalid-duplicate-v1",
        profileTag: "dup1",
        vocabulary: {
          ...defaultManifest.vocabulary,
          atoms: ["alpha", "alpha"],
        },
        entropy: {
          atomCount: 2,
          bitsPerAtom: 1,
          recommendedLength: 8,
          bitsAtRecommendedLength: 8,
        },
      },
    },
    {
      id: "prefix-ambiguous-profile",
      errorContains: "prefix-free",
      manifest: {
        ...defaultManifest,
        profileId: "invalid-prefix-v1",
        profileTag: "pfx1",
        vocabulary: {
          ...defaultManifest.vocabulary,
          atoms: ["alpha", "alphabet"],
        },
        entropy: {
          atomCount: 2,
          bitsPerAtom: 1,
          recommendedLength: 8,
          bitsAtRecommendedLength: 8,
        },
      },
    },
  ];

  const invalidPayloads = [
    {
      id: "empty-prompt",
      profileId: defaultManifest.profileId,
      codecId: "prompt",
      value: "",
      reason: "empty payload",
    },
    {
      id: "invalid-prefix-transport",
      profileId: defaultManifest.profileId,
      codecId: "transport",
      value: `${defaultManifest.vocabulary.atoms[0]}zzz`,
      reason: "unknown atom suffix",
    },
  ];

  for (const profile of sortCompiledProfiles(compiledProfiles)) {
    if (getPayloadCodec(profile.manifest, "transport").separator.length > 0) {
      invalidPayloads.push({
        id: `${profile.manifest.profileId}-double-separator`,
        profileId: profile.manifest.profileId,
        codecId: "transport",
        value: `${profile.manifest.vocabulary.atoms[0]}__${profile.manifest.vocabulary.atoms[1]}`,
        reason: "empty separated atom",
      });
    }
  }

  const invalidEnvelopes = deterministicGeneration.flatMap((entry) => {
    const profileManifest = profilesById.get(entry.profileId);
    const envelopeCodec = getEnvelopeCodec(profileManifest);
    const envelope = entry.renderings.envelope;
    const badChecksum = mutateLastCharacter(
      envelope,
      envelope.endsWith("0") ? "1" : "0",
    );
    const separatorIndex = envelope.indexOf(envelopeCodec.separator);
    const badPrefix = `zz1${envelope.slice(separatorIndex)}`;

    return [
      {
        id: `${entry.profileId}-bad-checksum`,
        profileId: entry.profileId,
        value: badChecksum,
        reason: "checksum mismatch",
      },
      {
        id: `${entry.profileId}-bad-prefix`,
        profileId: entry.profileId,
        value: badPrefix,
        reason: "unexpected prefix",
      },
    ];
  });

  return {
    schemaVersion: 1,
    registry: portableRegistry,
    validProfiles: portableRegistry.profiles.map((profile) => ({
      profileId: profile.profileId,
      profileTag: profile.profileTag,
      profileVersion: profile.profileVersion,
      codecs: profilesById.get(profile.profileId).codecs.map((codec) => codec.id),
    })),
    invalidProfiles,
    roundTrips,
    invalidPayloads,
    invalidEnvelopes,
    deterministicGeneration,
  };
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
  const sortedProfiles = sortCompiledProfiles(compiledProfiles);
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

function renderJavaGeneratedProfiles(compiledProfiles, defaultProfileId) {
  const sortedProfiles = sortCompiledProfiles(compiledProfiles);
  const profileMethods = sortedProfiles.map((profile) => renderJavaProfileMethod(profile.manifest)).join("\n\n");
  const builders = sortedProfiles.map((profile) => `${toJavaMethodName(profile.manifest.profileId)}()`).join(",\n      ");

  return `package io.tokid;

import java.util.List;

// Generated by tools/profile-compiler.mjs. Do not edit by hand.
public final class GeneratedProfiles {
  public static final String DEFAULT_PROFILE_ID = ${toJavaStringLiteral(defaultProfileId)};
  public static final List<TokidProfileManifest> EMBEDDED_PROFILES = List.of(
      ${builders}
  );

  private GeneratedProfiles() {}

  private static List<String> splitLines(String value) {
    return value.isEmpty() ? List.of() : List.of(value.split("\\n"));
  }

${profileMethods}
}
`;
}

function renderJavaProfileMethod(manifest) {
  const codecs = manifest.codecs.map((codec) => renderJavaCodec(codec)).join(",\n        ");
  const artifacts = manifest.sourceLineage.artifacts
    .map(
      (artifact) =>
        `new TokidSourceArtifactLineage(${toJavaStringLiteral(artifact.path)}, ${toJavaStringLiteral(artifact.sha256)})`,
    )
    .join(",\n            ");
  const notes = manifest.sourceLineage.notes ?? [];

  return `  private static TokidProfileManifest ${toJavaMethodName(manifest.profileId)}() {
    return new TokidProfileManifest(
        ${toJavaStringLiteral(manifest.profileId)},
        ${manifest.profileVersion},
        ${toJavaStringLiteral(manifest.profileTag)},
        ${toJavaStringLiteral(manifest.name)},
        ${toJavaStringLiteral(manifest.description)},
        ${toJavaStringLiteral(manifest.provider)},
        new TokidProfileVocabularyManifest(
            ${toJavaStringLiteral(manifest.vocabulary.syntax)},
            splitLines(${toJavaTextBlock(manifest.vocabulary.atoms)})
        ),
        List.of(
        ${codecs}
        ),
        new TokidEntropyMetadata(
            ${manifest.entropy.atomCount},
            ${manifest.entropy.bitsPerAtom},
            ${manifest.entropy.recommendedLength},
            ${manifest.entropy.bitsAtRecommendedLength}
        ),
        new TokidSourceLineage(
            ${toJavaStringLiteral(manifest.sourceLineage.recipe)},
            List.of(
                ${manifest.sourceLineage.studies.map((study) => toJavaStringLiteral(study)).join(",\n                ")}
            ),
            List.of(
            ${artifacts}
            ),
            List.of(
                ${manifest.sourceLineage.filters.map((filter) => toJavaStringLiteral(filter)).join(",\n                ")}
            ),
            List.of(
                ${notes.map((note) => toJavaStringLiteral(note)).join(",\n                ")}
            )
        )
    );
  }`;
}

function renderJavaCodec(codec) {
  if (codec.kind === "payload") {
    return `new TokidPayloadCodecManifest(
            ${toJavaStringLiteral(codec.id)},
            ${toJavaStringLiteral(codec.description)},
            ${toJavaStringLiteral(codec.separator)},
            TokidPayloadNormalization.${codec.normalization.toUpperCase()},
            ${codec.transportSafe},
            TokidDecodabilityMode.${codec.decodability.mode.toUpperCase().replace("-", "_")}
        )`;
  }

  return `new TokidEnvelopeCodecManifest(
            ${toJavaStringLiteral(codec.id)},
            ${toJavaStringLiteral(codec.description)},
            ${toJavaStringLiteral(codec.payloadCodecId)},
            ${toJavaStringLiteral(codec.prefix)},
            ${toJavaStringLiteral(codec.separator)},
            ${codec.formatVersion},
            new TokidEnvelopeChecksumManifest(
                ${toJavaStringLiteral(codec.checksum.algorithm)},
                ${codec.checksum.length}
            )
        )`;
}

function renderDotnetGeneratedProfiles(compiledProfiles, defaultProfileId) {
  const sortedProfiles = sortCompiledProfiles(compiledProfiles);
  const profileFactories = sortedProfiles.map((profile) => renderDotnetProfileFactory(profile.manifest)).join("\n\n");
  const builders = sortedProfiles.map((profile) => `${toCSharpMethodName(profile.manifest.profileId)}()`).join(",\n            ");

  return `using System.Collections.Generic;

namespace Tokid
{
// Generated by tools/profile-compiler.mjs. Do not edit by hand.
internal static class GeneratedProfiles
{
    internal static readonly string DefaultProfileId = ${toCSharpStringLiteral(defaultProfileId)};

    internal static readonly IReadOnlyList<TokidProfileManifest> EmbeddedProfiles = new List<TokidProfileManifest>
    {
            ${builders}
    };

    private static List<string> SplitLines(string value)
    {
        return value.Length == 0 ? new List<string>() : new List<string>(value.Split('\\n'));
    }

${profileFactories}
}
}
`;
}

function renderDotnetProfileFactory(manifest) {
  const codecs = manifest.codecs.map((codec) => renderDotnetCodec(codec)).join(",\n                ");
  const artifacts = manifest.sourceLineage.artifacts
    .map(
      (artifact) =>
        `new TokidSourceArtifactLineage(${toCSharpStringLiteral(artifact.path)}, ${toCSharpStringLiteral(artifact.sha256)})`,
    )
    .join(",\n                    ");
  const notes = manifest.sourceLineage.notes ?? [];

  return `    private static TokidProfileManifest ${toCSharpMethodName(manifest.profileId)}()
    {
        return new TokidProfileManifest(
            ${toCSharpStringLiteral(manifest.profileId)},
            ${manifest.profileVersion},
            ${toCSharpStringLiteral(manifest.profileTag)},
            ${toCSharpStringLiteral(manifest.name)},
            ${toCSharpStringLiteral(manifest.description)},
            ${toCSharpStringLiteral(manifest.provider)},
            new TokidProfileVocabularyManifest(
                ${toCSharpStringLiteral(manifest.vocabulary.syntax)},
                SplitLines(${toCSharpMultilineString(manifest.vocabulary.atoms)})
            ),
            new List<TokidCodecManifest>
            {
                ${codecs}
            },
            new TokidEntropyMetadata(
                ${manifest.entropy.atomCount},
                ${manifest.entropy.bitsPerAtom},
                ${manifest.entropy.recommendedLength},
                ${manifest.entropy.bitsAtRecommendedLength}
            ),
            new TokidSourceLineage(
                ${toCSharpStringLiteral(manifest.sourceLineage.recipe)},
                new List<string>
                {
                    ${manifest.sourceLineage.studies.map((study) => toCSharpStringLiteral(study)).join(",\n                    ")}
                },
                new List<TokidSourceArtifactLineage>
                {
                    ${artifacts}
                },
                new List<string>
                {
                    ${manifest.sourceLineage.filters.map((filter) => toCSharpStringLiteral(filter)).join(",\n                    ")}
                },
                new List<string>
                {
                    ${notes.map((note) => toCSharpStringLiteral(note)).join(",\n                    ")}
                }
            )
        );
    }`;
}

function renderDotnetCodec(codec) {
  if (codec.kind === "payload") {
    return `new TokidPayloadCodecManifest(
                    ${toCSharpStringLiteral(codec.id)},
                    ${toCSharpStringLiteral(codec.description)},
                    ${toCSharpStringLiteral(codec.separator)},
                    TokidPayloadNormalization.${toCSharpEnumMember(codec.normalization)},
                    ${codec.transportSafe.toString()},
                    TokidDecodabilityMode.${toCSharpEnumMember(codec.decodability.mode)}
                )`;
  }

  return `new TokidEnvelopeCodecManifest(
                    ${toCSharpStringLiteral(codec.id)},
                    ${toCSharpStringLiteral(codec.description)},
                    ${toCSharpStringLiteral(codec.payloadCodecId)},
                    ${toCSharpStringLiteral(codec.prefix)},
                    ${toCSharpStringLiteral(codec.separator)},
                    ${codec.formatVersion},
                    new TokidEnvelopeChecksumManifest(
                        ${toCSharpStringLiteral(codec.checksum.algorithm)},
                        ${codec.checksum.length}
                    )
                )`;
}

function toJavaMethodName(profileId) {
  return `profile${profileId
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")}`;
}

function toCSharpMethodName(profileId) {
  return `Profile${profileId
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")}`;
}

function toEnumConstant(value) {
  return value.toUpperCase().replaceAll("-", "_");
}

function toCSharpEnumMember(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function toJavaStringLiteral(value) {
  return JSON.stringify(value)
    .replace(/\\u2028/g, "\\\\u2028")
    .replace(/\\u2029/g, "\\\\u2029");
}

function toJavaTextBlock(lines) {
  if (lines.length === 0) {
    return '""';
  }

  const content = lines.map((line) => `${line}`).join("\n");
  return `"""
${content}
"""`;
}

function toCSharpStringLiteral(value) {
  return `@"${String(value).replaceAll('"', '""')}"`;
}

function toCSharpMultilineString(lines) {
  if (lines.length === 0) {
    return '""';
  }

  return `@"${lines.join("\n").replaceAll('"', '""')}"`;
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
