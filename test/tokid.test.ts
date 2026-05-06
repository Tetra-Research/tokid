import assert from "node:assert/strict";
import test from "node:test";

import {
  createTokidFactory,
  generate,
  isTokid,
  parse,
  toEnvelope,
  toPrompt,
  toTransport,
} from "../src/index.js";
import {
  createTokidKernel,
  embeddedProfiles,
  generateTokid,
  inspectProfile,
  inspectTokid,
  parseEnvelopeTokid,
  parsePromptTokid,
  parseTokid,
  parseTransportTokid,
  renderEnvelopeTokid,
  renderPromptTokid,
  renderTransportTokid,
  type RandomBytesFn,
  type TokidProfileManifest,
  validateProfileManifest,
} from "../src/advanced.js";

function scriptedRandomBytes(values: number[]): RandomBytesFn {
  let offset = 0;

  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = values[offset] ?? 0;
      offset += 1;
    }
    return bytes;
  };
}

function cloneProfile(overrides: Partial<TokidProfileManifest>): TokidProfileManifest {
  const base = embeddedProfiles[0] as TokidProfileManifest;
  return {
    ...base,
    ...overrides,
    vocabulary: {
      ...base.vocabulary,
      ...(overrides.vocabulary ?? {}),
    },
    entropy: {
      ...base.entropy,
      ...(overrides.entropy ?? {}),
    },
    sourceLineage: {
      ...base.sourceLineage,
      ...(overrides.sourceLineage ?? {}),
    },
    codecs: overrides.codecs ?? base.codecs,
  };
}

test("embedded profile loads without study artifacts and exposes lineage metadata", () => {
  const profile = inspectProfile();

  assert.equal(profile.profileId, "openai-cross-v1");
  assert.equal(profile.profileVersion, 1);
  assert.equal(profile.atomCount, 1444);
  assert.equal(profile.sourceLineage.recipe, "profiles/recipes/openai-cross-v1.json");
  assert.ok(profile.sourceLineage.artifacts.some((artifact) => artifact.path.includes("scored_candidates.csv")));
  assert.deepEqual(profile.supportedCodecs, ["prompt", "transport", "envelope"]);
});

test("embedded registry exposes both published profiles", () => {
  assert.deepEqual(
    embeddedProfiles.map((profile) => profile.profileId),
    ["openai-cross-v1", "openai-cross-underscore-v1"],
  );
});

test("root facade defaults to envelope strings and converts back to other formats", () => {
  const tokid = createTokidFactory({
    length: 4,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 0,
      0, 0, 0, 1,
      0, 0, 0, 2,
      0, 0, 0, 3,
    ]),
  });

  const envelope = tokid.generate();
  const prompt = tokid.prompt(envelope);
  const transport = tokid.transport(envelope);

  assert.equal(isTokid(envelope), true);
  assert.deepEqual(tokid.parse(envelope)?.atoms.length, 4);
  assert.equal(prompt.includes(" "), true);
  assert.equal(transport.includes("_"), false);
  assert.equal(tokid.envelope(prompt), envelope);
});

test("top-level helpers normalize values without exposing the kernel model first", () => {
  const envelope = generate({
    length: 4,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 9,
      0, 0, 0, 10,
      0, 0, 0, 11,
      0, 0, 0, 12,
    ]),
  });

  const logical = parse(envelope);
  assert.ok(logical);
  assert.equal(toEnvelope(envelope), envelope);
  assert.equal(toPrompt(envelope).includes(" "), true);
  assert.equal(toTransport(envelope).length > 0, true);
});

test("generated tokids are logical records with profile identity and ordered atoms", () => {
  const tokid = generateTokid({
    length: 4,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 0,
      0, 0, 0, 1,
      0, 0, 0, 2,
      0, 0, 0, 3,
    ]),
  });

  assert.equal(tokid.profileId, "openai-cross-v1");
  assert.equal(tokid.atoms.length, 4);
});

test("prompt, transport, and envelope renderings resolve back to the same logical tokid", () => {
  const tokid = generateTokid({
    length: 5,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 3,
      0, 0, 0, 4,
      0, 0, 0, 5,
      0, 0, 0, 6,
      0, 0, 0, 7,
    ]),
  });

  const prompt = renderPromptTokid(tokid);
  const transport = renderTransportTokid(tokid);
  const envelope = renderEnvelopeTokid(tokid);

  assert.deepEqual(parsePromptTokid(prompt)?.tokid, tokid);
  assert.deepEqual(parseTransportTokid(transport)?.tokid, tokid);
  assert.deepEqual(parseEnvelopeTokid(envelope)?.tokid, tokid);
  assert.deepEqual(parseTokid(envelope)?.tokid, tokid);
});

test("underscore transport profile round-trips with separator-decoded transport and distinct envelope framing", () => {
  const tokid = generateTokid({
    profileId: "openai-cross-underscore-v1",
    length: 4,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 3,
      0, 0, 0, 4,
      0, 0, 0, 5,
      0, 0, 0, 6,
    ]),
  });

  const prompt = renderPromptTokid(tokid);
  const transport = renderTransportTokid(tokid);
  const envelope = renderEnvelopeTokid(tokid);

  assert.equal(transport.includes("_"), true);
  assert.equal(envelope.includes("~"), true);
  assert.deepEqual(parsePromptTokid(prompt, "openai-cross-underscore-v1")?.tokid, tokid);
  assert.deepEqual(parseTransportTokid(transport, "openai-cross-underscore-v1")?.tokid, tokid);
  assert.deepEqual(parseTokid(envelope)?.tokid, tokid);
});

test("inspection reports codec support and entropy metadata for a logical tokid", () => {
  const tokid = generateTokid({
    length: 6,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 8,
      0, 0, 0, 13,
      0, 0, 0, 21,
      0, 0, 0, 34,
      0, 0, 0, 55,
      0, 0, 0, 89,
    ]),
  });

  const inspection = inspectTokid(tokid);
  assert.equal(inspection.profileId, tokid.profileId);
  assert.equal(inspection.atomCount, 6);
  assert.ok(inspection.estimatedEntropyBits > 60);
  assert.deepEqual(inspection.supportedCodecs, ["prompt", "transport", "envelope"]);
});

test("malformed custom profiles are rejected before use", () => {
  const duplicateAtomsProfile = cloneProfile({
    profileId: "bad-duplicate-v1",
    profileTag: "bd1",
    vocabulary: {
      ...embeddedProfiles[0].vocabulary,
      atoms: ["alpha", "alpha"],
    },
    entropy: {
      atomCount: 2,
      bitsPerAtom: 1,
      recommendedLength: 8,
      bitsAtRecommendedLength: 8,
    },
  });

  const ambiguousTransportProfile = cloneProfile({
    profileId: "bad-prefix-v1",
    profileTag: "bp1",
    vocabulary: {
      ...embeddedProfiles[0].vocabulary,
      atoms: ["alpha", "alphabet"],
    },
    entropy: {
      atomCount: 2,
      bitsPerAtom: 1,
      recommendedLength: 8,
      bitsAtRecommendedLength: 8,
    },
  });

  assert.throws(() => validateProfileManifest(duplicateAtomsProfile), /Duplicate atom/);
  assert.throws(
    () => createTokidKernel({ profiles: [ambiguousTransportProfile], defaultProfileId: "bad-prefix-v1" }),
    /prefix-free/,
  );
});

test("separator-decoded transport profiles can reuse prefix-overlapping atoms", () => {
  const separatorTransportProfile = cloneProfile({
    profileId: "separator-ok-v1",
    profileTag: "so1",
    vocabulary: {
      ...embeddedProfiles[1].vocabulary,
      atoms: ["alpha", "alphabet"],
    },
    codecs: [
      {
        id: "prompt",
        kind: "payload",
        description: "Prompt payload",
        separator: " ",
        normalization: "whitespace",
        transportSafe: false,
        decodability: {
          mode: "separator",
        },
      },
      {
        id: "transport",
        kind: "payload",
        description: "Transport payload",
        separator: "_",
        normalization: "literal",
        transportSafe: true,
        decodability: {
          mode: "separator",
        },
      },
      {
        id: "envelope",
        kind: "envelope",
        description: "Envelope payload",
        payloadCodecId: "transport",
        prefix: "tk1",
        separator: "~",
        formatVersion: 1,
        checksum: {
          algorithm: "sha256-base36",
          length: 5,
        },
      },
    ],
    entropy: {
      atomCount: 2,
      bitsPerAtom: 1,
      recommendedLength: 8,
      bitsAtRecommendedLength: 8,
    },
  });

  const kernel = createTokidKernel({
    profiles: [separatorTransportProfile],
    defaultProfileId: "separator-ok-v1",
  });

  const rendered = kernel.render({
    profileId: "separator-ok-v1",
    atoms: ["alpha", "alphabet"],
  });

  assert.equal(rendered, "alpha_alphabet");
  assert.deepEqual(kernel.parse(rendered)?.tokid.atoms, ["alpha", "alphabet"]);
});

test("durable envelopes reject altered payloads, altered checksums, and truncation", () => {
  const tokid = generateTokid({
    length: 4,
    randomBytes: scriptedRandomBytes([
      0, 0, 0, 9,
      0, 0, 0, 10,
      0, 0, 0, 11,
      0, 0, 0, 12,
    ]),
  });

  const envelope = renderEnvelopeTokid(tokid);
  const [prefix, profileTag, payload, checksum] = envelope.split("_");
  const alteredPayload = `${prefix}_${profileTag}_${payload}x_${checksum}`;
  const alteredChecksum = `${prefix}_${profileTag}_${payload}_${checksum.slice(0, -1)}0`;
  const truncated = `${prefix}_${profileTag}_${payload}`;

  assert.deepEqual(parseEnvelopeTokid(envelope)?.tokid, tokid);
  assert.equal(parseEnvelopeTokid(alteredPayload), null);
  assert.equal(parseEnvelopeTokid(alteredChecksum), null);
  assert.equal(parseEnvelopeTokid(truncated), null);
});
