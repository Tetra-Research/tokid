export type RandomBytesFn = (length: number) => Uint8Array;

export type Tokid = {
  profileId: string;
  atoms: readonly string[];
};

export type TokidPayloadCodecManifest = {
  id: string;
  kind: "payload";
  description: string;
  separator: string;
  normalization: "literal" | "whitespace";
  transportSafe: boolean;
  decodability: {
    mode: "separator" | "prefix-free";
  };
};

export type TokidEnvelopeChecksumManifest = {
  algorithm: "sha256-base36";
  length: number;
};

export type TokidEnvelopeCodecManifest = {
  id: string;
  kind: "envelope";
  description: string;
  payloadCodecId: string;
  prefix: string;
  separator: string;
  formatVersion: number;
  checksum: TokidEnvelopeChecksumManifest;
};

export type TokidCodecManifest = TokidPayloadCodecManifest | TokidEnvelopeCodecManifest;

export type TokidProfileVocabularyManifest = {
  syntax: string;
  atoms: readonly string[];
};

export type TokidSourceArtifactLineage = {
  path: string;
  sha256: string;
};

export type TokidSourceLineage = {
  recipe: string;
  studies: readonly string[];
  artifacts: readonly TokidSourceArtifactLineage[];
  filters: readonly string[];
  notes?: readonly string[];
};

export type TokidEntropyMetadata = {
  atomCount: number;
  bitsPerAtom: number;
  recommendedLength: number;
  bitsAtRecommendedLength: number;
};

export type TokidProfileManifest = {
  profileId: string;
  profileVersion: number;
  profileTag: string;
  name: string;
  description: string;
  provider: string;
  vocabulary: TokidProfileVocabularyManifest;
  codecs: readonly TokidCodecManifest[];
  entropy: TokidEntropyMetadata;
  sourceLineage: TokidSourceLineage;
};

export type TokidGenerateOptions = {
  profileId?: string;
  length?: number;
  randomBytes?: RandomBytesFn;
};

export type TokidRenderOptions = {
  codecId?: string;
};

export type TokidParseOptions = {
  profileId?: string;
  codecId?: string | "auto";
};

export type TokidEnvelopeInfo = {
  formatVersion: number;
  prefix: string;
  profileTag: string;
  payloadCodecId: string;
  checksum: string;
  payload: string;
};

export type TokidParseResult = {
  tokid: Tokid;
  profile: TokidProfileManifest;
  codec: TokidCodecManifest;
  rendered: string;
  envelope?: TokidEnvelopeInfo;
};

export type TokidInspection = {
  profileId: string;
  profileVersion: number;
  profileTag: string;
  atomCount: number;
  estimatedEntropyBits: number;
  supportedCodecs: readonly string[];
  entropy: TokidEntropyMetadata;
};

export type TokidProfileInspection = {
  profileId: string;
  profileVersion: number;
  profileTag: string;
  name: string;
  description: string;
  provider: string;
  atomCount: number;
  entropy: TokidEntropyMetadata;
  supportedCodecs: readonly string[];
  sourceLineage: TokidSourceLineage;
};

export type TokidKernelOptions = {
  profiles?: readonly TokidProfileManifest[];
  defaultProfileId?: string;
};
