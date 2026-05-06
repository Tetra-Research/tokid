import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const suite = JSON.parse(fs.readFileSync(path.join(repoRoot, "conformance", "fixtures", "suite.json"), "utf8"));

const root = await import(path.join(repoRoot, "packages", "js", "dist", "index.js"));
const advanced = await import(path.join(repoRoot, "packages", "js", "dist", "advanced.js"));

function scriptedRandomBytes(hex) {
  const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
  let offset = 0;
  return (length) => {
    const chunk = bytes.slice(offset, offset + length);
    offset += length;
    return chunk;
  };
}

function logicalTuple(tokid) {
  return [tokid.profileId, [...tokid.atoms]];
}

assert.equal(root.DEFAULT_PROFILE_ID, suite.registry.defaultProfileId);
assert.deepEqual(root.listProfiles().map((profile) => profile.profileId), suite.registry.profiles.map((profile) => profile.profileId));

for (const profileCase of suite.validProfiles) {
  const profile = root.getProfile(profileCase.profileId);
  assert.equal(profile.profileTag, profileCase.profileTag);
  assert.equal(profile.profileVersion, profileCase.profileVersion);
}

for (const invalidCase of suite.invalidProfiles) {
  assert.throws(
    () => advanced.validateProfileManifest(invalidCase.manifest),
    new RegExp(invalidCase.errorContains, "i"),
  );
}

for (const roundTrip of suite.roundTrips) {
  const logical = {
    profileId: roundTrip.logical.profileId,
    atoms: roundTrip.logical.atoms,
  };
  assert.deepEqual(logicalTuple(root.parse(roundTrip.renderings.prompt, { profile: logical.profileId })), logicalTuple(logical));
  assert.deepEqual(logicalTuple(root.parse(roundTrip.renderings.transport, { profile: logical.profileId })), logicalTuple(logical));
  assert.deepEqual(logicalTuple(root.parse(roundTrip.renderings.envelope, { profile: logical.profileId })), logicalTuple(logical));
  assert.equal(root.toPrompt(logical), roundTrip.renderings.prompt);
  assert.equal(root.toTransport(logical), roundTrip.renderings.transport);
  assert.equal(root.toEnvelope(logical), roundTrip.renderings.envelope);
}

for (const invalidPayload of suite.invalidPayloads) {
  assert.equal(
    advanced.parseTokid(invalidPayload.value, {
      profileId: invalidPayload.profileId,
      codecId: invalidPayload.codecId,
    }),
    null,
  );
}

for (const invalidEnvelope of suite.invalidEnvelopes) {
  assert.equal(root.parse(invalidEnvelope.value, { profile: invalidEnvelope.profileId }), null);
}

for (const deterministic of suite.deterministicGeneration) {
  const tokid = advanced.generateTokid({
    profileId: deterministic.profileId,
    length: deterministic.length,
    randomBytes: scriptedRandomBytes(deterministic.randomHex),
  });
  assert.deepEqual(logicalTuple(tokid), [deterministic.logical.profileId, deterministic.logical.atoms]);
  assert.equal(root.toPrompt(tokid), deterministic.renderings.prompt);
  assert.equal(root.toTransport(tokid), deterministic.renderings.transport);
  assert.equal(root.toEnvelope(tokid), deterministic.renderings.envelope);
}

console.log(JSON.stringify({
  sdk: "javascript",
  capability: "full",
  passed: true,
}));
