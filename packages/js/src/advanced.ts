export { DEFAULT_PROFILE_ID, embeddedProfiles } from "./profiles/index.js";
export {
  TokidKernel,
  createTokidKernel,
  defaultKernel,
  validateProfileManifest,
} from "./kernel.js";
export type {
  RandomBytesFn,
  Tokid,
  TokidCodecManifest,
  TokidEnvelopeChecksumManifest,
  TokidEnvelopeCodecManifest,
  TokidEnvelopeInfo,
  TokidEntropyMetadata,
  TokidGenerateOptions,
  TokidInspection,
  TokidKernelOptions,
  TokidParseOptions,
  TokidParseResult,
  TokidPayloadCodecManifest,
  TokidProfileInspection,
  TokidProfileManifest,
  TokidProfileVocabularyManifest,
  TokidRenderOptions,
  TokidSourceArtifactLineage,
  TokidSourceLineage,
} from "./types.js";

import { DEFAULT_PROFILE_ID } from "./profiles/index.js";
import {
  DEFAULT_ENVELOPE_CODEC_ID,
  DEFAULT_PAYLOAD_CODEC_ID,
  DEFAULT_PROMPT_CODEC_ID,
  DEFAULT_TRANSPORT_CODEC_ID,
  defaultKernel,
} from "./kernel.js";
import type {
  RandomBytesFn,
  Tokid,
  TokidGenerateOptions,
  TokidInspection,
  TokidParseOptions,
  TokidParseResult,
  TokidProfileInspection,
  TokidProfileManifest,
  TokidRenderOptions,
} from "./types.js";

export const DEFAULT_TOKID_LENGTH = defaultKernel.getProfile(DEFAULT_PROFILE_ID).entropy.recommendedLength;

export function listProfiles(): readonly TokidProfileManifest[] {
  return defaultKernel.listProfiles();
}

export function getProfile(profileId = DEFAULT_PROFILE_ID): TokidProfileManifest {
  return defaultKernel.getProfile(profileId);
}

export function inspectProfile(profileId = DEFAULT_PROFILE_ID): TokidProfileInspection {
  return defaultKernel.inspectProfile(profileId);
}

export function generateTokid(options: TokidGenerateOptions = {}): Tokid {
  return defaultKernel.generate(options);
}

export function renderTokid(tokid: Tokid, options: TokidRenderOptions = {}): string {
  return defaultKernel.render(tokid, options);
}

export function parseTokid(value: string, options: TokidParseOptions = {}): TokidParseResult | null {
  return defaultKernel.parse(value, options);
}

export function validateTokid(value: string, options: TokidParseOptions = {}): boolean {
  return defaultKernel.validate(value, options);
}

export function inspectTokid(tokid: Tokid): TokidInspection {
  return defaultKernel.inspectTokid(tokid);
}

export function renderPromptTokid(tokid: Tokid): string {
  return renderTokid(tokid, { codecId: DEFAULT_PROMPT_CODEC_ID });
}

export function renderTransportTokid(tokid: Tokid): string {
  return renderTokid(tokid, { codecId: DEFAULT_TRANSPORT_CODEC_ID });
}

export function renderEnvelopeTokid(tokid: Tokid): string {
  return renderTokid(tokid, { codecId: DEFAULT_ENVELOPE_CODEC_ID });
}

export function parsePromptTokid(value: string, profileId = DEFAULT_PROFILE_ID): TokidParseResult | null {
  return parseTokid(value, { profileId, codecId: DEFAULT_PROMPT_CODEC_ID });
}

export function parseTransportTokid(value: string, profileId = DEFAULT_PROFILE_ID): TokidParseResult | null {
  return parseTokid(value, { profileId, codecId: DEFAULT_TRANSPORT_CODEC_ID });
}

export function parseEnvelopeTokid(value: string, profileId?: string): TokidParseResult | null {
  return parseTokid(value, { profileId, codecId: DEFAULT_ENVELOPE_CODEC_ID });
}

export {
  DEFAULT_ENVELOPE_CODEC_ID as DEFAULT_CODEC_ID,
  DEFAULT_PROMPT_CODEC_ID,
  DEFAULT_TRANSPORT_CODEC_ID,
  DEFAULT_ENVELOPE_CODEC_ID,
  DEFAULT_PAYLOAD_CODEC_ID,
};
