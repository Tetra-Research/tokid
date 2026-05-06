import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { get_encoding, type Tiktoken, type TiktokenEncoding } from "tiktoken";

const ENCODINGS = ["cl100k_base", "o200k_base"] as const satisfies readonly TiktokenEncoding[];
const DATA_PATH = "study/external-vocabulary/data/wordfreq-large_en.msgpack.gz";
const DEFAULT_RESULTS_DIR = "study/wordfreq-atom-ranking/results";
const PREFIX_LIMITS = [2048, 4096, 8192, 16384];
const MAX_RANK = 16384;
const VOWELS = /[aeiouy]/g;
type ActiveEncoding = (typeof ENCODINGS)[number];

type RawEntry = {
  rawWord: string;
  rank: number;
  frequency: number;
  zipf: number;
};

type Candidate = {
  word: string;
  rank: number;
  frequency: number;
  zipf: number;
  charLength: number;
  vowelCount: number;
  maxRepeatedRun: number;
  maxConsonantRun: number;
  hasLongRepeat: boolean;
  confusableCount: number;
  confusableRatio: number;
  pronounceable: boolean;
  cl100kTokens: number;
  o200kTokens: number;
  sharedSingleToken: boolean;
  commonnessScore: number;
  tokenizerFitScore: number;
  readabilityScore: number;
  pronounceabilityScore: number;
  ambiguityPenalty: number;
  compositeScore: number;
};

type PrefixSummary = {
  prefixLimit: number;
  normalizedUnique: number;
  sharedSingleTokenCount: number;
  sharedCoverage: number;
  uniformBits: number;
  meanCompositeScore: number;
  p50CompositeScore: number;
  p90CompositeScore: number;
  meanCl100kTokens: number;
  meanO200kTokens: number;
  meanZipf: number;
  topExamples: string[];
};

type BandSummary = {
  bandLabel: string;
  startRank: number;
  endRank: number;
  normalizedUnique: number;
  sharedSingleTokenCount: number;
  sharedCoverage: number;
  uniformBits: number;
  meanCompositeScore: number;
  p50CompositeScore: number;
  p90CompositeScore: number;
  meanCl100kTokens: number;
  meanO200kTokens: number;
  meanZipf: number;
  topExamples: string[];
};

type TierSummary = {
  tier: "prime" | "strong" | "usable";
  minCompositeScore: number;
  sharedSingleTokenCount: number;
  uniformBits: number;
  topExamples: string[];
};

type StudyOutput = {
  generatedAt: string;
  encodings: ActiveEncoding[];
  source: string;
  normalization: {
    lowercase: boolean;
    asciiAlphaOnly: boolean;
    minLength: number;
    maxLength: number;
    maxRank: number;
  };
  candidateCount: number;
  sharedSingleTokenCount: number;
  sharedUniformBits: number;
  sharedScoreStats: {
    mean: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  prefixes: PrefixSummary[];
  bands: BandSummary[];
  tiers: TierSummary[];
  topCandidates: Array<{
    word: string;
    rank: number;
    zipf: number;
    compositeScore: number;
    commonnessScore: number;
    tokenizerFitScore: number;
    readabilityScore: number;
    pronounceabilityScore: number;
    ambiguityPenalty: number;
  }>;
};

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function quantile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index] ?? 0;
}

function toCsvRow(values: Array<string | number | null | boolean>): string {
  return values
    .map((value) => {
      if (value === null) {
        return "";
      }

      const text = String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }

      return text;
    })
    .join(",");
}

function normalizeWord(rawWord: string): string | null {
  const normalized = rawWord.trim().toLowerCase();
  if (!/^[a-z]+$/.test(normalized)) {
    return null;
  }

  if (normalized.length < 3 || normalized.length > 24) {
    return null;
  }

  return normalized;
}

function loadWordfreqEntries(path: string): RawEntry[] {
  const unpacked = decode(gunzipSync(readFileSync(path)));
  if (!Array.isArray(unpacked) || unpacked.length === 0) {
    throw new Error(`Unexpected wordfreq payload in ${path}`);
  }

  const header = unpacked[0];
  if (
    typeof header !== "object" ||
    header === null ||
    !("format" in header) ||
    !("version" in header) ||
    (header as { format: string }).format !== "cB" ||
    (header as { version: number }).version !== 1
  ) {
    throw new Error(`Unexpected wordfreq header in ${path}`);
  }

  const entries: RawEntry[] = [];
  let rank = 0;

  for (let bucketIndex = 1; bucketIndex < unpacked.length; bucketIndex += 1) {
    const bucket = unpacked[bucketIndex];
    if (!Array.isArray(bucket)) {
      continue;
    }

    const centibels = -(bucketIndex - 1);
    const frequency = 10 ** (centibels / 100);
    const zipf = (centibels + 900) / 100;

    for (const value of bucket) {
      if (typeof value !== "string") {
        continue;
      }

      entries.push({
        rawWord: value,
        rank,
        frequency,
        zipf,
      });
      rank += 1;
    }
  }

  return entries;
}

function buildCandidates(entries: RawEntry[], maxRank: number): Candidate[] {
  const seen = new Set<string>();
  const normalized: Array<Pick<Candidate, "word" | "rank" | "frequency" | "zipf">> = [];

  for (const entry of entries) {
    const word = normalizeWord(entry.rawWord);
    if (word === null || seen.has(word)) {
      continue;
    }

    seen.add(word);
    normalized.push({
      word,
      rank: normalized.length + 1,
      frequency: entry.frequency,
      zipf: entry.zipf,
    });

    if (normalized.length >= maxRank) {
      break;
    }
  }

  const encoders: Record<ActiveEncoding, Tiktoken> = {
    cl100k_base: get_encoding("cl100k_base"),
    o200k_base: get_encoding("o200k_base"),
  };

  try {
    return normalized.map((candidate) => buildCandidate(candidate, encoders));
  } finally {
    for (const encoder of Object.values(encoders)) {
      encoder.free();
    }
  }
}

function maxRepeatedRun(text: string): number {
  let best = 0;
  let current = 0;
  let previous = "";

  for (const char of text) {
    if (char === previous) {
      current += 1;
    } else {
      previous = char;
      current = 1;
    }

    best = Math.max(best, current);
  }

  return best;
}

function maxConsonantRun(text: string): number {
  let best = 0;
  let current = 0;

  for (const char of text) {
    if (/[a-z]/.test(char) && !/[aeiouy]/.test(char)) {
      current += 1;
    } else {
      current = 0;
    }

    best = Math.max(best, current);
  }

  return best;
}

function countConfusableChars(text: string): number {
  return [...text].filter((char) => /[ilo]/.test(char)).length;
}

function computeCommonnessScore(rank: number, maxRank: number): number {
  const minLog = Math.log2(2);
  const maxLog = Math.log2(maxRank + 1);
  const rankLog = Math.log2(rank + 1);
  const normalized = 1 - (rankLog - minLog) / (maxLog - minLog);
  return normalized * 45;
}

function computeTokenizerFitScore(cl100kTokens: number, o200kTokens: number): number {
  if (cl100kTokens === 1 && o200kTokens === 1) {
    return 30;
  }

  if (cl100kTokens === 1 || o200kTokens === 1) {
    return Math.max(8, 18 - 4 * (Math.max(cl100kTokens, o200kTokens) - 1));
  }

  const meanTokens = (cl100kTokens + o200kTokens) / 2;
  return Math.max(-20, 10 - 8 * (meanTokens - 2));
}

function computeReadabilityScore(charLength: number, hasLongRepeat: boolean, maxRepeated: number): number {
  let score = 0;

  if (charLength >= 4 && charLength <= 8) {
    score += 18;
  } else if (charLength >= 9 && charLength <= 12) {
    score += 12;
  } else if (charLength === 3 || (charLength >= 13 && charLength <= 16)) {
    score += 4;
  } else {
    score -= 8;
  }

  if (maxRepeated <= 2) {
    score += 6;
  } else if (hasLongRepeat) {
    score -= 8;
  }

  return score;
}

function computePronounceabilityScore(charLength: number, vowelCount: number, maxConsonants: number): number {
  let score = 0;

  if (vowelCount >= 1) {
    score += 8;
  } else {
    score -= 12;
  }

  if (maxConsonants <= 4) {
    score += 8;
  } else if (maxConsonants >= 6) {
    score -= 8;
  }

  if (charLength >= 4 && charLength <= 10) {
    score += 6;
  }

  return score;
}

function computeAmbiguityPenalty(charLength: number, confusableCount: number): number {
  const confusableRatio = charLength === 0 ? 0 : confusableCount / charLength;

  if (confusableRatio >= 0.8) {
    return -10;
  }

  if (charLength <= 4 && confusableRatio >= 0.5) {
    return -6;
  }

  if (charLength <= 5 && confusableRatio >= 0.4) {
    return -4;
  }

  return 0;
}

function buildCandidate(
  base: Pick<Candidate, "word" | "rank" | "frequency" | "zipf">,
  encoders: Record<ActiveEncoding, Tiktoken>,
): Candidate {
  const charLength = base.word.length;
  const vowelCount = [...base.word.matchAll(VOWELS)].length;
  const repeated = maxRepeatedRun(base.word);
  const consonants = maxConsonantRun(base.word);
  const confusableCount = countConfusableChars(base.word);
  const confusableRatio = charLength === 0 ? 0 : confusableCount / charLength;
  const cl100kTokens = encoders.cl100k_base.encode(base.word).length;
  const o200kTokens = encoders.o200k_base.encode(base.word).length;
  const sharedSingleToken = cl100kTokens === 1 && o200kTokens === 1;
  const hasLongRepeat = repeated >= 4;
  const pronounceable =
    vowelCount >= 1 && consonants <= 4 && !hasLongRepeat && charLength >= 4 && charLength <= 12;

  const commonnessScore = computeCommonnessScore(base.rank, MAX_RANK);
  const tokenizerFitScore = computeTokenizerFitScore(cl100kTokens, o200kTokens);
  const readabilityScore = computeReadabilityScore(charLength, hasLongRepeat, repeated);
  const pronounceabilityScore = computePronounceabilityScore(charLength, vowelCount, consonants);
  const ambiguityPenalty = computeAmbiguityPenalty(charLength, confusableCount);
  const compositeScore =
    commonnessScore + tokenizerFitScore + readabilityScore + pronounceabilityScore + ambiguityPenalty;

  return {
    word: base.word,
    rank: base.rank,
    frequency: base.frequency,
    zipf: base.zipf,
    charLength,
    vowelCount,
    maxRepeatedRun: repeated,
    maxConsonantRun: consonants,
    hasLongRepeat,
    confusableCount,
    confusableRatio,
    pronounceable,
    cl100kTokens,
    o200kTokens,
    sharedSingleToken,
    commonnessScore,
    tokenizerFitScore,
    readabilityScore,
    pronounceabilityScore,
    ambiguityPenalty,
    compositeScore,
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function pickExamples(candidates: Candidate[], count = 8): string[] {
  return [...candidates]
    .sort((left, right) => {
      if (right.compositeScore !== left.compositeScore) {
        return right.compositeScore - left.compositeScore;
      }

      return left.rank - right.rank;
    })
    .slice(0, count)
    .map((candidate) => candidate.word);
}

function buildPrefixSummary(candidates: Candidate[], prefixLimit: number): PrefixSummary {
  const prefix = candidates.filter((candidate) => candidate.rank <= prefixLimit);
  const shared = prefix.filter((candidate) => candidate.sharedSingleToken);
  const scores = shared.map((candidate) => candidate.compositeScore);

  return {
    prefixLimit,
    normalizedUnique: prefix.length,
    sharedSingleTokenCount: shared.length,
    sharedCoverage: round(shared.length / Math.max(prefix.length, 1)),
    uniformBits: round(Math.log2(Math.max(shared.length, 1))),
    meanCompositeScore: round(mean(scores)),
    p50CompositeScore: round(quantile(scores, 0.5)),
    p90CompositeScore: round(quantile(scores, 0.9)),
    meanCl100kTokens: round(mean(prefix.map((candidate) => candidate.cl100kTokens))),
    meanO200kTokens: round(mean(prefix.map((candidate) => candidate.o200kTokens))),
    meanZipf: round(mean(prefix.map((candidate) => candidate.zipf))),
    topExamples: pickExamples(shared),
  };
}

function buildBandSummary(candidates: Candidate[], startRank: number, endRank: number): BandSummary {
  const band = candidates.filter((candidate) => candidate.rank >= startRank && candidate.rank <= endRank);
  const shared = band.filter((candidate) => candidate.sharedSingleToken);
  const scores = shared.map((candidate) => candidate.compositeScore);

  return {
    bandLabel: `${startRank}-${endRank}`,
    startRank,
    endRank,
    normalizedUnique: band.length,
    sharedSingleTokenCount: shared.length,
    sharedCoverage: round(shared.length / Math.max(band.length, 1)),
    uniformBits: round(Math.log2(Math.max(shared.length, 1))),
    meanCompositeScore: round(mean(scores)),
    p50CompositeScore: round(quantile(scores, 0.5)),
    p90CompositeScore: round(quantile(scores, 0.9)),
    meanCl100kTokens: round(mean(band.map((candidate) => candidate.cl100kTokens))),
    meanO200kTokens: round(mean(band.map((candidate) => candidate.o200kTokens))),
    meanZipf: round(mean(band.map((candidate) => candidate.zipf))),
    topExamples: pickExamples(shared),
  };
}

function buildTierSummary(shared: Candidate[], tier: TierSummary["tier"], minCompositeScore: number): TierSummary {
  const tierCandidates = shared.filter((candidate) => candidate.compositeScore >= minCompositeScore);
  return {
    tier,
    minCompositeScore,
    sharedSingleTokenCount: tierCandidates.length,
    uniformBits: round(Math.log2(Math.max(tierCandidates.length, 1))),
    topExamples: pickExamples(tierCandidates),
  };
}

function renderCandidateCsv(candidates: Candidate[]): string {
  const header = [
    "word",
    "rank",
    "zipf",
    "frequency",
    "char_length",
    "vowel_count",
    "max_repeated_run",
    "max_consonant_run",
    "confusable_count",
    "confusable_ratio",
    "pronounceable",
    "cl100k_tokens",
    "o200k_tokens",
    "shared_single_token",
    "commonness_score",
    "tokenizer_fit_score",
    "readability_score",
    "pronounceability_score",
    "ambiguity_penalty",
    "composite_score",
  ];

  const rows = candidates.map((candidate) =>
    toCsvRow([
      candidate.word,
      candidate.rank,
      round(candidate.zipf),
      candidate.frequency,
      candidate.charLength,
      candidate.vowelCount,
      candidate.maxRepeatedRun,
      candidate.maxConsonantRun,
      candidate.confusableCount,
      round(candidate.confusableRatio),
      candidate.pronounceable,
      candidate.cl100kTokens,
      candidate.o200kTokens,
      candidate.sharedSingleToken,
      round(candidate.commonnessScore),
      round(candidate.tokenizerFitScore),
      round(candidate.readabilityScore),
      round(candidate.pronounceabilityScore),
      round(candidate.ambiguityPenalty),
      round(candidate.compositeScore),
    ]),
  );

  return [header.join(","), ...rows].join("\n");
}

function renderPrefixCsv(summaries: PrefixSummary[]): string {
  const header = [
    "prefix_limit",
    "normalized_unique",
    "shared_single_token_count",
    "shared_coverage",
    "uniform_bits",
    "mean_composite_score",
    "p50_composite_score",
    "p90_composite_score",
    "mean_cl100k_tokens",
    "mean_o200k_tokens",
    "mean_zipf",
    "top_examples",
  ];

  const rows = summaries.map((summary) =>
    toCsvRow([
      summary.prefixLimit,
      summary.normalizedUnique,
      summary.sharedSingleTokenCount,
      summary.sharedCoverage,
      summary.uniformBits,
      summary.meanCompositeScore,
      summary.p50CompositeScore,
      summary.p90CompositeScore,
      summary.meanCl100kTokens,
      summary.meanO200kTokens,
      summary.meanZipf,
      summary.topExamples.join(" "),
    ]),
  );

  return [header.join(","), ...rows].join("\n");
}

function renderBandCsv(summaries: BandSummary[]): string {
  const header = [
    "band_label",
    "start_rank",
    "end_rank",
    "normalized_unique",
    "shared_single_token_count",
    "shared_coverage",
    "uniform_bits",
    "mean_composite_score",
    "p50_composite_score",
    "p90_composite_score",
    "mean_cl100k_tokens",
    "mean_o200k_tokens",
    "mean_zipf",
    "top_examples",
  ];

  const rows = summaries.map((summary) =>
    toCsvRow([
      summary.bandLabel,
      summary.startRank,
      summary.endRank,
      summary.normalizedUnique,
      summary.sharedSingleTokenCount,
      summary.sharedCoverage,
      summary.uniformBits,
      summary.meanCompositeScore,
      summary.p50CompositeScore,
      summary.p90CompositeScore,
      summary.meanCl100kTokens,
      summary.meanO200kTokens,
      summary.meanZipf,
      summary.topExamples.join(" "),
    ]),
  );

  return [header.join(","), ...rows].join("\n");
}

function renderWordList(candidates: Candidate[]): string {
  return [...candidates]
    .sort((left, right) => {
      if (right.compositeScore !== left.compositeScore) {
        return right.compositeScore - left.compositeScore;
      }

      return left.rank - right.rank;
    })
    .map((candidate) => candidate.word)
    .join("\n");
}

function run(): void {
  const entries = loadWordfreqEntries(resolve(DATA_PATH));
  const candidates = buildCandidates(entries, MAX_RANK);
  const shared = candidates.filter((candidate) => candidate.sharedSingleToken);
  const sharedScores = shared.map((candidate) => candidate.compositeScore);

  const prefixes = PREFIX_LIMITS.map((prefixLimit) => buildPrefixSummary(candidates, prefixLimit));
  const bands = [
    buildBandSummary(candidates, 1, 2048),
    buildBandSummary(candidates, 2049, 4096),
    buildBandSummary(candidates, 4097, 8192),
    buildBandSummary(candidates, 8193, 16384),
  ];
  const tiers = [
    buildTierSummary(shared, "prime", 90),
    buildTierSummary(shared, "strong", 80),
    buildTierSummary(shared, "usable", 70),
  ];

  const topCandidates = [...shared]
    .sort((left, right) => {
      if (right.compositeScore !== left.compositeScore) {
        return right.compositeScore - left.compositeScore;
      }

      return left.rank - right.rank;
    })
    .slice(0, 250);

  const output: StudyOutput = {
    generatedAt: new Date().toISOString(),
    encodings: [...ENCODINGS],
    source: DATA_PATH,
    normalization: {
      lowercase: true,
      asciiAlphaOnly: true,
      minLength: 3,
      maxLength: 24,
      maxRank: MAX_RANK,
    },
    candidateCount: candidates.length,
    sharedSingleTokenCount: shared.length,
    sharedUniformBits: round(Math.log2(Math.max(shared.length, 1))),
    sharedScoreStats: {
      mean: round(mean(sharedScores)),
      p10: round(quantile(sharedScores, 0.1)),
      p25: round(quantile(sharedScores, 0.25)),
      p50: round(quantile(sharedScores, 0.5)),
      p75: round(quantile(sharedScores, 0.75)),
      p90: round(quantile(sharedScores, 0.9)),
      p95: round(quantile(sharedScores, 0.95)),
    },
    prefixes,
    bands,
    tiers,
    topCandidates: topCandidates.map((candidate) => ({
      word: candidate.word,
      rank: candidate.rank,
      zipf: round(candidate.zipf),
      compositeScore: round(candidate.compositeScore),
      commonnessScore: round(candidate.commonnessScore),
      tokenizerFitScore: round(candidate.tokenizerFitScore),
      readabilityScore: round(candidate.readabilityScore),
      pronounceabilityScore: round(candidate.pronounceabilityScore),
      ambiguityPenalty: round(candidate.ambiguityPenalty),
    })),
  };

  mkdirSync(resolve(DEFAULT_RESULTS_DIR), { recursive: true });
  writeFileSync(resolve(DEFAULT_RESULTS_DIR, "summary.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  writeFileSync(resolve(DEFAULT_RESULTS_DIR, "scored_candidates.csv"), `${renderCandidateCsv(candidates)}\n`, "utf8");
  writeFileSync(resolve(DEFAULT_RESULTS_DIR, "prefix_summary.csv"), `${renderPrefixCsv(prefixes)}\n`, "utf8");
  writeFileSync(resolve(DEFAULT_RESULTS_DIR, "band_summary.csv"), `${renderBandCsv(bands)}\n`, "utf8");
  writeFileSync(resolve(DEFAULT_RESULTS_DIR, "top_candidates.txt"), `${renderWordList(topCandidates)}\n`, "utf8");

  console.log(`analyzed ${candidates.length} normalized wordfreq words`);
  console.log(`shared single-token words: ${shared.length} (${round(shared.length / candidates.length) * 100}%)`);
  for (const prefix of prefixes) {
    console.log(
      `top ${prefix.prefixLimit}: ${prefix.sharedSingleTokenCount} shared single-token, ${prefix.uniformBits} bits, mean score ${prefix.meanCompositeScore}`,
    );
  }
}

const command = process.argv[2] ?? "run";
if (command !== "run") {
  throw new Error(`Unknown command: ${command}`);
}

run();
