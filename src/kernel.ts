import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";

import { DEFAULT_PROFILE_ID, embeddedProfiles } from "./profiles/index.js";
import type {
  RandomBytesFn,
  Tokid,
  TokidCodecManifest,
  TokidEnvelopeCodecManifest,
  TokidGenerateOptions,
  TokidInspection,
  TokidKernelOptions,
  TokidParseOptions,
  TokidParseResult,
  TokidPayloadCodecManifest,
  TokidProfileInspection,
  TokidProfileManifest,
  TokidRenderOptions,
} from "./types.js";

export const DEFAULT_PAYLOAD_CODEC_ID = "transport";
export const DEFAULT_PROMPT_CODEC_ID = "prompt";
export const DEFAULT_TRANSPORT_CODEC_ID = "transport";
export const DEFAULT_ENVELOPE_CODEC_ID = "envelope";

type TrieNode = {
  atom: string | null;
  children: Map<string, TrieNode>;
};

type ProfileRuntime = {
  manifest: TokidProfileManifest;
  syntax: RegExp;
  atomSet: ReadonlySet<string>;
  payloadCodecs: ReadonlyMap<string, TokidPayloadCodecManifest>;
  envelopeCodecs: ReadonlyMap<string, TokidEnvelopeCodecManifest>;
  delimiterlessTries: ReadonlyMap<string, TrieNode>;
};

function createTrieNode(): TrieNode {
  return {
    atom: null,
    children: new Map<string, TrieNode>(),
  };
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function buildTransportTrie(atoms: readonly string[]): TrieNode {
  const root = createTrieNode();

  for (const atom of atoms) {
    let node = root;
    for (let index = 0; index < atom.length; index += 1) {
      if (node.atom !== null) {
        throw new Error(`Vocabulary is not prefix-free: "${node.atom}" is a prefix of "${atom}"`);
      }

      const char = atom[index] as string;
      let next = node.children.get(char);
      if (!next) {
        next = createTrieNode();
        node.children.set(char, next);
      }
      node = next;
    }

    if (node.atom !== null) {
      throw new Error(`Duplicate atom in vocabulary: "${atom}"`);
    }

    if (node.children.size > 0) {
      throw new Error(`Vocabulary is not prefix-free: "${atom}" is a prefix of another atom`);
    }

    node.atom = atom;
  }

  return root;
}

function pickUniformIndex(maxExclusive: number, randomBytes: RandomBytesFn): number {
  assertPositiveInteger(maxExclusive, "Vocabulary size");

  const bound = 0x1_0000_0000;
  const threshold = bound - (bound % maxExclusive);

  while (true) {
    const bytes = randomBytes(4);
    if (bytes.length < 4) {
      throw new Error("randomBytes must return the requested number of bytes");
    }

    const candidate =
      (((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0)) >>> 0;

    if (candidate < threshold) {
      return candidate % maxExclusive;
    }
  }
}

function freezeTokid(profileId: string, atoms: readonly string[]): Tokid {
  return Object.freeze({
    profileId,
    atoms: Object.freeze([...atoms]),
  });
}

function encodeBase36(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return value.toString(36);
}

function computeEnvelopeChecksum(
  codec: TokidEnvelopeCodecManifest,
  profileTag: string,
  payload: string,
): string {
  const digest = createHash("sha256")
    .update(`${codec.prefix}|${codec.formatVersion}|${profileTag}|${payload}`)
    .digest()
    .subarray(0, 6);

  return encodeBase36(digest).padStart(codec.checksum.length, "0").slice(0, codec.checksum.length);
}

function isPayloadCodec(codec: TokidCodecManifest): codec is TokidPayloadCodecManifest {
  return codec.kind === "payload";
}

function isEnvelopeCodec(codec: TokidCodecManifest): codec is TokidEnvelopeCodecManifest {
  return codec.kind === "envelope";
}

function normalizePromptAtoms(value: string, separator: string, normalization: TokidPayloadCodecManifest["normalization"]): string[] | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (normalization === "whitespace" && separator === " ") {
    return trimmed.split(/\s+/);
  }

  const atoms = trimmed.split(separator);
  return atoms.every((atom) => atom.length > 0) ? atoms : null;
}

function nearlyEqual(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) <= epsilon;
}

export function validateProfileManifest(manifest: TokidProfileManifest): void {
  if (!/^[a-z0-9-]+$/.test(manifest.profileId)) {
    throw new Error(`Invalid profile id "${manifest.profileId}". Profile ids must be lowercase ASCII slugs.`);
  }

  if (!/^[a-z0-9]+$/.test(manifest.profileTag)) {
    throw new Error(`Invalid profile tag "${manifest.profileTag}". Profile tags must be lowercase base36-safe text.`);
  }

  if (!Number.isInteger(manifest.profileVersion) || manifest.profileVersion <= 0) {
    throw new Error(`Invalid profile version for "${manifest.profileId}"`);
  }

  if (manifest.vocabulary.atoms.length === 0) {
    throw new Error(`Profile "${manifest.profileId}" must contain at least one atom`);
  }

  if (manifest.sourceLineage.recipe.length === 0) {
    throw new Error(`Profile "${manifest.profileId}" must declare a source recipe`);
  }

  if (manifest.sourceLineage.artifacts.length === 0) {
    throw new Error(`Profile "${manifest.profileId}" must declare at least one source artifact`);
  }

  for (const artifact of manifest.sourceLineage.artifacts) {
    if (artifact.path.length === 0) {
      throw new Error(`Profile "${manifest.profileId}" contains an empty source artifact path`);
    }
    if (!/^[0-9a-f]{64}$/.test(artifact.sha256)) {
      throw new Error(
        `Profile "${manifest.profileId}" contains invalid source artifact digest for "${artifact.path}"`,
      );
    }
  }

  if (manifest.codecs.length === 0) {
    throw new Error(`Profile "${manifest.profileId}" must declare at least one codec`);
  }

  let syntax: RegExp;
  try {
    syntax = new RegExp(manifest.vocabulary.syntax);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid syntax pattern for profile "${manifest.profileId}": ${message}`);
  }

  const atomSet = new Set<string>();
  for (const atom of manifest.vocabulary.atoms) {
    if (atomSet.has(atom)) {
      throw new Error(`Duplicate atom in profile "${manifest.profileId}": "${atom}"`);
    }
    if (!syntax.test(atom)) {
      throw new Error(`Atom "${atom}" violates syntax constraints for profile "${manifest.profileId}"`);
    }
    atomSet.add(atom);
  }

  const codecIds = new Set<string>();
  const payloadCodecs = new Map<string, TokidPayloadCodecManifest>();
  const envelopeCodecs = new Map<string, TokidEnvelopeCodecManifest>();
  let requiresPrefixFree = false;

  for (const codec of manifest.codecs) {
    if (!/^[a-z0-9-]+$/.test(codec.id)) {
      throw new Error(`Invalid codec id "${codec.id}" in profile "${manifest.profileId}"`);
    }
    if (codecIds.has(codec.id)) {
      throw new Error(`Duplicate codec id "${codec.id}" in profile "${manifest.profileId}"`);
    }
    codecIds.add(codec.id);

    if (isPayloadCodec(codec)) {
      if (codec.decodability.mode === "prefix-free") {
        if (codec.separator.length !== 0) {
          throw new Error(
            `Profile "${manifest.profileId}" declares prefix-free decoding for codec "${codec.id}" but also sets a separator`,
          );
        }
        requiresPrefixFree = true;
      } else if (codec.separator.length === 0) {
        throw new Error(
          `Profile "${manifest.profileId}" declares separator decoding for codec "${codec.id}" but does not define a separator`,
        );
      }

      payloadCodecs.set(codec.id, codec);
      continue;
    }

    if (!/^[a-z0-9]+$/.test(codec.prefix)) {
      throw new Error(`Invalid envelope prefix "${codec.prefix}" in profile "${manifest.profileId}"`);
    }
    if (codec.separator.length === 0) {
      throw new Error(`Envelope codec "${codec.id}" in profile "${manifest.profileId}" must use a separator`);
    }
    if (!Number.isInteger(codec.formatVersion) || codec.formatVersion <= 0) {
      throw new Error(`Invalid envelope format version for codec "${codec.id}" in profile "${manifest.profileId}"`);
    }
    if (codec.checksum.algorithm !== "sha256-base36") {
      throw new Error(`Unsupported checksum algorithm "${codec.checksum.algorithm}" in profile "${manifest.profileId}"`);
    }
    if (!Number.isInteger(codec.checksum.length) || codec.checksum.length <= 0) {
      throw new Error(`Invalid checksum length for codec "${codec.id}" in profile "${manifest.profileId}"`);
    }

    envelopeCodecs.set(codec.id, codec);
  }

  for (const codec of envelopeCodecs.values()) {
    if (!payloadCodecs.has(codec.payloadCodecId)) {
      throw new Error(
        `Envelope codec "${codec.id}" in profile "${manifest.profileId}" references missing payload codec "${codec.payloadCodecId}"`,
      );
    }
  }

  if (requiresPrefixFree) {
    buildTransportTrie(manifest.vocabulary.atoms);
  }

  if (manifest.entropy.atomCount !== manifest.vocabulary.atoms.length) {
    throw new Error(`Entropy atom count mismatch for profile "${manifest.profileId}"`);
  }

  const expectedBitsPerAtom = Math.log2(manifest.vocabulary.atoms.length);
  if (!nearlyEqual(manifest.entropy.bitsPerAtom, expectedBitsPerAtom)) {
    throw new Error(`Entropy bits-per-atom mismatch for profile "${manifest.profileId}"`);
  }

  const expectedBitsAtRecommendedLength = manifest.entropy.bitsPerAtom * manifest.entropy.recommendedLength;
  if (!nearlyEqual(manifest.entropy.bitsAtRecommendedLength, expectedBitsAtRecommendedLength)) {
    throw new Error(`Entropy recommended-length mismatch for profile "${manifest.profileId}"`);
  }
}

function buildProfileRuntime(manifest: TokidProfileManifest): ProfileRuntime {
  validateProfileManifest(manifest);

  const syntax = new RegExp(manifest.vocabulary.syntax);
  const payloadCodecs = new Map<string, TokidPayloadCodecManifest>();
  const envelopeCodecs = new Map<string, TokidEnvelopeCodecManifest>();
  const delimiterlessTries = new Map<string, TrieNode>();

  for (const codec of manifest.codecs) {
    if (isPayloadCodec(codec)) {
      payloadCodecs.set(codec.id, codec);
      if (codec.decodability.mode === "prefix-free" && codec.separator.length === 0) {
        delimiterlessTries.set(codec.id, buildTransportTrie(manifest.vocabulary.atoms));
      }
    } else {
      envelopeCodecs.set(codec.id, codec);
    }
  }

  return {
    manifest,
    syntax,
    atomSet: new Set(manifest.vocabulary.atoms),
    payloadCodecs,
    envelopeCodecs,
    delimiterlessTries,
  };
}

function parseDelimiterlessPayload(value: string, trie: TrieNode): string[] | null {
  if (value.length === 0) {
    return null;
  }

  const atoms: string[] = [];
  let index = 0;

  while (index < value.length) {
    let node = trie;
    let cursor = index;
    let matchedAtom: string | null = null;

    while (cursor < value.length) {
      const char = value[cursor] as string;
      const next = node.children.get(char);
      if (!next) {
        break;
      }

      node = next;
      cursor += 1;

      if (node.atom !== null) {
        matchedAtom = node.atom;
        break;
      }
    }

    if (matchedAtom === null) {
      return null;
    }

    atoms.push(matchedAtom);
    index += matchedAtom.length;
  }

  return atoms;
}

export class TokidKernel {
  readonly defaultProfileId: string;

  private readonly runtimes: readonly ProfileRuntime[];
  private readonly runtimesById: ReadonlyMap<string, ProfileRuntime>;
  private readonly runtimesByTag: ReadonlyMap<string, ProfileRuntime>;

  constructor(options: TokidKernelOptions = {}) {
    const profiles = options.profiles ?? embeddedProfiles;
    if (profiles.length === 0) {
      throw new Error("TokidKernel requires at least one profile");
    }

    const runtimes = profiles.map((profile) => buildProfileRuntime(profile));
    const runtimesById = new Map<string, ProfileRuntime>();
    const runtimesByTag = new Map<string, ProfileRuntime>();

    for (const runtime of runtimes) {
      if (runtimesById.has(runtime.manifest.profileId)) {
        throw new Error(`Duplicate profile id in kernel: "${runtime.manifest.profileId}"`);
      }
      if (runtimesByTag.has(runtime.manifest.profileTag)) {
        throw new Error(`Duplicate profile tag in kernel: "${runtime.manifest.profileTag}"`);
      }
      runtimesById.set(runtime.manifest.profileId, runtime);
      runtimesByTag.set(runtime.manifest.profileTag, runtime);
    }

    const defaultProfileId = options.defaultProfileId ?? profiles[0]?.profileId;
    if (!defaultProfileId || !runtimesById.has(defaultProfileId)) {
      throw new Error(`Unknown default profile "${defaultProfileId ?? "<missing>"}"`);
    }

    this.defaultProfileId = defaultProfileId;
    this.runtimes = Object.freeze(runtimes);
    this.runtimesById = runtimesById;
    this.runtimesByTag = runtimesByTag;
  }

  private getRuntime(profileId: string): ProfileRuntime {
    const runtime = this.runtimesById.get(profileId);
    if (!runtime) {
      throw new Error(`Unsupported tokid profile "${profileId}"`);
    }
    return runtime;
  }

  private getPayloadCodec(runtime: ProfileRuntime, codecId: string): TokidPayloadCodecManifest {
    const codec = runtime.payloadCodecs.get(codecId);
    if (!codec) {
      throw new Error(`Unsupported payload codec "${codecId}" for profile "${runtime.manifest.profileId}"`);
    }
    return codec;
  }

  private getCodec(runtime: ProfileRuntime, codecId: string): TokidCodecManifest {
    return runtime.payloadCodecs.get(codecId) ?? runtime.envelopeCodecs.get(codecId) ?? (() => {
      throw new Error(`Unsupported codec "${codecId}" for profile "${runtime.manifest.profileId}"`);
    })();
  }

  private assertLogicalTokid(tokid: Tokid, runtime: ProfileRuntime): void {
    if (tokid.profileId !== runtime.manifest.profileId) {
      throw new Error(
        `Tokid profile mismatch: record uses "${tokid.profileId}" but runtime is "${runtime.manifest.profileId}"`,
      );
    }
    if (tokid.atoms.length === 0) {
      throw new Error("Tokid values must contain at least one atom");
    }
    for (const atom of tokid.atoms) {
      if (!runtime.atomSet.has(atom) || !runtime.syntax.test(atom)) {
        throw new Error(`Tokid contains atom "${atom}" outside profile "${runtime.manifest.profileId}"`);
      }
    }
  }

  private renderPayload(tokid: Tokid, runtime: ProfileRuntime, codec: TokidPayloadCodecManifest): string {
    this.assertLogicalTokid(tokid, runtime);
    return tokid.atoms.join(codec.separator);
  }

  private parsePayload(value: string, runtime: ProfileRuntime, codec: TokidPayloadCodecManifest): TokidParseResult | null {
    const atoms =
      codec.decodability.mode === "prefix-free"
        ? parseDelimiterlessPayload(value, runtime.delimiterlessTries.get(codec.id) as TrieNode)
        : normalizePromptAtoms(value, codec.separator, codec.normalization);

    if (!atoms || atoms.length === 0 || !atoms.every((atom) => runtime.atomSet.has(atom))) {
      return null;
    }

    return {
      tokid: freezeTokid(runtime.manifest.profileId, atoms),
      profile: runtime.manifest,
      codec,
      rendered: value,
    };
  }

  private renderEnvelope(tokid: Tokid, runtime: ProfileRuntime, codec: TokidEnvelopeCodecManifest): string {
    const payloadCodec = this.getPayloadCodec(runtime, codec.payloadCodecId);
    const payload = this.renderPayload(tokid, runtime, payloadCodec);
    const checksum = computeEnvelopeChecksum(codec, runtime.manifest.profileTag, payload);
    return [codec.prefix, runtime.manifest.profileTag, payload, checksum].join(codec.separator);
  }

  private parseEnvelope(
    value: string,
    requestedProfileId?: string,
    requestedCodecId?: string,
  ): TokidParseResult | null {
    for (const runtime of this.runtimes) {
      if (requestedProfileId && runtime.manifest.profileId !== requestedProfileId) {
        continue;
      }

      for (const codec of runtime.envelopeCodecs.values()) {
        if (requestedCodecId && codec.id !== requestedCodecId) {
          continue;
        }

        const parts = value.split(codec.separator);
        if (parts.length !== 4) {
          continue;
        }

        const [prefix, profileTag, payload, checksum] = parts;
        if (prefix !== codec.prefix || profileTag !== runtime.manifest.profileTag || payload.length === 0) {
          continue;
        }
        if (!new RegExp(`^[0-9a-z]{${codec.checksum.length}}$`).test(checksum)) {
          continue;
        }

        const expectedChecksum = computeEnvelopeChecksum(codec, profileTag, payload);
        if (checksum !== expectedChecksum) {
          return null;
        }

        const payloadCodec = this.getPayloadCodec(runtime, codec.payloadCodecId);
        const parsedPayload = this.parsePayload(payload, runtime, payloadCodec);
        if (!parsedPayload) {
          return null;
        }

        return {
          tokid: parsedPayload.tokid,
          profile: runtime.manifest,
          codec,
          rendered: value,
          envelope: {
            formatVersion: codec.formatVersion,
            prefix: codec.prefix,
            profileTag,
            payloadCodecId: codec.payloadCodecId,
            checksum,
            payload,
          },
        };
      }
    }

    return null;
  }

  private isEnvelopeCodecId(codecId: string, profileId?: string): boolean {
    if (profileId) {
      return this.getRuntime(profileId).envelopeCodecs.has(codecId);
    }

    return this.runtimes.some((runtime) => runtime.envelopeCodecs.has(codecId));
  }

  listProfiles(): readonly TokidProfileManifest[] {
    return this.runtimes.map((runtime) => runtime.manifest);
  }

  getProfile(profileId = this.defaultProfileId): TokidProfileManifest {
    return this.getRuntime(profileId).manifest;
  }

  inspectProfile(profileId = this.defaultProfileId): TokidProfileInspection {
    const runtime = this.getRuntime(profileId);
    return {
      profileId: runtime.manifest.profileId,
      profileVersion: runtime.manifest.profileVersion,
      profileTag: runtime.manifest.profileTag,
      name: runtime.manifest.name,
      description: runtime.manifest.description,
      provider: runtime.manifest.provider,
      atomCount: runtime.manifest.vocabulary.atoms.length,
      entropy: runtime.manifest.entropy,
      supportedCodecs: runtime.manifest.codecs.map((codec) => codec.id),
      sourceLineage: runtime.manifest.sourceLineage,
    };
  }

  inspectTokid(tokid: Tokid): TokidInspection {
    const runtime = this.getRuntime(tokid.profileId);
    this.assertLogicalTokid(tokid, runtime);

    return {
      profileId: runtime.manifest.profileId,
      profileVersion: runtime.manifest.profileVersion,
      profileTag: runtime.manifest.profileTag,
      atomCount: tokid.atoms.length,
      estimatedEntropyBits: runtime.manifest.entropy.bitsPerAtom * tokid.atoms.length,
      supportedCodecs: runtime.manifest.codecs.map((codec) => codec.id),
      entropy: runtime.manifest.entropy,
    };
  }

  generate(options: TokidGenerateOptions = {}): Tokid {
    const profileId = options.profileId ?? this.defaultProfileId;
    const runtime = this.getRuntime(profileId);
    const length = options.length ?? runtime.manifest.entropy.recommendedLength;
    assertPositiveInteger(length, "Tokid length");

    const randomBytes = options.randomBytes ?? cryptoRandomBytes;
    const atoms: string[] = [];

    for (let index = 0; index < length; index += 1) {
      atoms.push(runtime.manifest.vocabulary.atoms[pickUniformIndex(runtime.manifest.vocabulary.atoms.length, randomBytes)] as string);
    }

    return freezeTokid(profileId, atoms);
  }

  render(tokid: Tokid, options: TokidRenderOptions = {}): string {
    const codecId = options.codecId ?? DEFAULT_PAYLOAD_CODEC_ID;
    const runtime = this.getRuntime(tokid.profileId);
    const codec = this.getCodec(runtime, codecId);

    return isPayloadCodec(codec) ? this.renderPayload(tokid, runtime, codec) : this.renderEnvelope(tokid, runtime, codec);
  }

  parse(value: string, options: TokidParseOptions = {}): TokidParseResult | null {
    const codecId = options.codecId ?? "auto";

    if (codecId === "auto") {
      const envelope = this.parseEnvelope(value, options.profileId);
      if (envelope) {
        return envelope;
      }

      const runtime = this.getRuntime(options.profileId ?? this.defaultProfileId);
      const payloadCodecId = /\s/.test(value) ? DEFAULT_PROMPT_CODEC_ID : DEFAULT_TRANSPORT_CODEC_ID;
      return this.parsePayload(value, runtime, this.getPayloadCodec(runtime, payloadCodecId));
    }

    if (this.isEnvelopeCodecId(codecId, options.profileId)) {
      return this.parseEnvelope(value, options.profileId, codecId);
    }

    const runtime = this.getRuntime(options.profileId ?? this.defaultProfileId);
    return this.parsePayload(value, runtime, this.getPayloadCodec(runtime, codecId));
  }

  validate(value: string, options: TokidParseOptions = {}): boolean {
    return this.parse(value, options) !== null;
  }
}

export function createTokidKernel(options: TokidKernelOptions = {}): TokidKernel {
  return new TokidKernel(options);
}

export const defaultKernel = createTokidKernel({
  profiles: embeddedProfiles,
  defaultProfileId: DEFAULT_PROFILE_ID,
});
