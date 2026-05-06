export { DEFAULT_PROFILE_ID, DEFAULT_TOKID_LENGTH, getProfile, listProfiles } from "./advanced.js";
export type { RandomBytesFn, Tokid, TokidProfileManifest } from "./advanced.js";

import {
  DEFAULT_ENVELOPE_CODEC_ID,
  DEFAULT_PROFILE_ID,
  DEFAULT_PROMPT_CODEC_ID,
  DEFAULT_TOKID_LENGTH,
  DEFAULT_TRANSPORT_CODEC_ID,
  generateTokid,
  getProfile,
  parseTokid,
  renderTokid,
  validateTokid,
} from "./advanced.js";
import type { RandomBytesFn, Tokid, TokidProfileManifest } from "./advanced.js";

export type TokidFormat =
  | typeof DEFAULT_PROMPT_CODEC_ID
  | typeof DEFAULT_TRANSPORT_CODEC_ID
  | typeof DEFAULT_ENVELOPE_CODEC_ID;

export type TokidFactoryOptions = {
  profile?: string;
  length?: number;
  randomBytes?: RandomBytesFn;
};

export type GenerateOptions = TokidFactoryOptions & {
  format?: TokidFormat;
};

export type ParseOptions = {
  profile?: string;
};

type TokidInput = string | Tokid;

export type TokidFactory = {
  readonly profileId: string;
  readonly length: number;
  generate(options?: { length?: number; format?: TokidFormat }): string;
  parse(value: string): Tokid | null;
  is(value: string): boolean;
  prompt(value: TokidInput): string;
  transport(value: TokidInput): string;
  envelope(value: TokidInput): string;
  profile(): TokidProfileManifest;
};

function resolveTokid(value: TokidInput, profileId?: string): Tokid {
  if (typeof value !== "string") {
    return value;
  }

  const parsed = parseTokid(value, profileId ? { profileId } : {});
  if (!parsed) {
    throw new Error("Invalid tokid value");
  }

  return parsed.tokid;
}

export function createTokidFactory(options: TokidFactoryOptions = {}): TokidFactory {
  const profileId = options.profile ?? DEFAULT_PROFILE_ID;
  const length = options.length ?? getProfile(profileId).entropy.recommendedLength;
  const randomBytes = options.randomBytes;

  return Object.freeze({
    profileId,
    length,
    generate(generateOptions = {}) {
      const tokid = generateTokid({
        profileId,
        length: generateOptions.length ?? length,
        randomBytes,
      });
      return renderTokid(tokid, {
        codecId: generateOptions.format ?? DEFAULT_ENVELOPE_CODEC_ID,
      });
    },
    parse(value: string) {
      return parseTokid(value, { profileId })?.tokid ?? null;
    },
    is(value: string) {
      return validateTokid(value, { profileId });
    },
    prompt(value: TokidInput) {
      return renderTokid(resolveTokid(value, profileId), { codecId: DEFAULT_PROMPT_CODEC_ID });
    },
    transport(value: TokidInput) {
      return renderTokid(resolveTokid(value, profileId), { codecId: DEFAULT_TRANSPORT_CODEC_ID });
    },
    envelope(value: TokidInput) {
      return renderTokid(resolveTokid(value, profileId), { codecId: DEFAULT_ENVELOPE_CODEC_ID });
    },
    profile() {
      return getProfile(profileId);
    },
  });
}

export function generate(options: GenerateOptions = {}): string {
  return createTokidFactory(options).generate(options);
}

export function parse(value: string, options: ParseOptions = {}): Tokid | null {
  return parseTokid(value, options.profile ? { profileId: options.profile } : {})?.tokid ?? null;
}

export function isTokid(value: string, options: ParseOptions = {}): boolean {
  return validateTokid(value, options.profile ? { profileId: options.profile } : {});
}

export function toPrompt(value: TokidInput, options: ParseOptions = {}): string {
  return renderTokid(resolveTokid(value, options.profile), { codecId: DEFAULT_PROMPT_CODEC_ID });
}

export function toTransport(value: TokidInput, options: ParseOptions = {}): string {
  return renderTokid(resolveTokid(value, options.profile), { codecId: DEFAULT_TRANSPORT_CODEC_ID });
}

export function toEnvelope(value: TokidInput, options: ParseOptions = {}): string {
  return renderTokid(resolveTokid(value, options.profile), { codecId: DEFAULT_ENVELOPE_CODEC_ID });
}
