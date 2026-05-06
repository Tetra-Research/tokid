import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";
import { get_encoding, type Tiktoken, type TiktokenEncoding } from "tiktoken";

const ENCODINGS: TiktokenEncoding[] = ["cl100k_base", "o200k_base"];
const DEFAULT_RESULTS_DIR = "study/external-vocabulary/results";
const DATA_DIR = "study/external-vocabulary/data";
const PREFIX_SIZES = [2048, 4096, 8192, 16384, 32768, 65536];

type RawEntry = {
  rawWord: string;
  rank: number;
  frequency: number | null;
  zipf: number | null;
};

type SourceConfig = {
  id: string;
  label: string;
  sourceType: "scowl" | "wordfreq";
  path: string;
  hasFrequency: boolean;
  notes: string;
};

type SourceCandidate = {
  word: string;
  rank: number;
  frequency: number | null;
  zipf: number | null;
};

type TokenStats = {
  mean: number;
  p50: number;
  p95: number;
  min: number;
  max: number;
};

type EncodingSummary = {
  encoding: TiktokenEncoding;
  meanTokens: number;
  p50Tokens: number;
  p95Tokens: number;
  singleTokenCount: number;
  singleTokenCoverage: number;
};

type SourceSummary = {
  sourceId: string;
  label: string;
  sourceType: "scowl" | "wordfreq";
  notes: string;
  rawEntries: number;
  normalizedUnique: number;
  sharedSingleTokenCount: number;
  sharedSingleTokenCoverage: number;
  sharedUniformBits: number;
  sharedWeightedEntropyBits: number | null;
  encodingSummaries: EncodingSummary[];
  topSharedExamples: string[];
};

type PrefixSummary = {
  sourceId: string;
  label: string;
  prefixSize: number;
  normalizedUnique: number;
  sharedSingleTokenCount: number;
  sharedSingleTokenCoverage: number;
  sharedUniformBits: number;
  sharedWeightedEntropyBits: number | null;
  cl100kMeanTokens: number;
  o200kMeanTokens: number;
};

type StudyOutput = {
  generatedAt: string;
  encodings: TiktokenEncoding[];
  normalization: {
    lowercase: boolean;
    asciiAlphaOnly: boolean;
    minLength: number;
    maxLength: number;
  };
  sources: SourceSummary[];
  prefixes: PrefixSummary[];
};

const SOURCES: SourceConfig[] = [
  {
    id: "scowl_en_us",
    label: "SCOWL en_US",
    sourceType: "scowl",
    path: `${DATA_DIR}/scowl-en_US.txt`,
    hasFrequency: false,
    notes: "Generated SCOWL American English word list",
  },
  {
    id: "scowl_en_us_large",
    label: "SCOWL en_US large",
    sourceType: "scowl",
    path: `${DATA_DIR}/scowl-en_US-large.txt`,
    hasFrequency: false,
    notes: "Larger generated SCOWL American English word list",
  },
  {
    id: "wordfreq_en_small",
    label: "wordfreq en small",
    sourceType: "wordfreq",
    path: `${DATA_DIR}/wordfreq-small_en.msgpack.gz`,
    hasFrequency: true,
    notes: "wordfreq small English list with centibel-ranked frequencies",
  },
  {
    id: "wordfreq_en_large",
    label: "wordfreq en large",
    sourceType: "wordfreq",
    path: `${DATA_DIR}/wordfreq-large_en.msgpack.gz`,
    hasFrequency: true,
    notes: "wordfreq large English list with centibel-ranked frequencies",
  },
];

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

function buildTokenStats(values: number[]): TokenStats {
  if (values.length === 0) {
    return { mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }
  }

  return {
    mean: mean(values),
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    min,
    max,
  };
}

function toCsvRow(values: Array<string | number | null>): string {
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

function loadScowlEntries(path: string): RawEntry[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const entries: RawEntry[] = [];
  let rank = 0;

  for (const line of lines) {
    const rawWord = line.trim();
    if (rawWord.length === 0) {
      continue;
    }

    entries.push({
      rawWord,
      rank,
      frequency: null,
      zipf: null,
    });
    rank += 1;
  }

  return entries;
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

function loadSourceEntries(config: SourceConfig): RawEntry[] {
  if (config.sourceType === "scowl") {
    return loadScowlEntries(resolve(config.path));
  }

  return loadWordfreqEntries(resolve(config.path));
}

function buildCandidates(entries: RawEntry[]): SourceCandidate[] {
  const seen = new Set<string>();
  const candidates: SourceCandidate[] = [];

  for (const entry of entries) {
    const word = normalizeWord(entry.rawWord);
    if (word === null || seen.has(word)) {
      continue;
    }

    seen.add(word);
    candidates.push({
      word,
      rank: entry.rank,
      frequency: entry.frequency,
      zipf: entry.zipf,
    });
  }

  return candidates;
}

function weightedEntropyBits(candidates: SourceCandidate[], sharedSingleToken: Set<string>): number | null {
  const weighted = candidates.filter(
    (candidate) => sharedSingleToken.has(candidate.word) && candidate.frequency !== null,
  );
  if (weighted.length === 0) {
    return null;
  }

  const totalWeight = weighted.reduce((total, candidate) => total + (candidate.frequency ?? 0), 0);
  if (totalWeight <= 0) {
    return null;
  }

  let entropy = 0;
  for (const candidate of weighted) {
    const probability = (candidate.frequency ?? 0) / totalWeight;
    if (probability > 0) {
      entropy -= probability * Math.log2(probability);
    }
  }

  return entropy;
}

function buildSharedSingleTokenSet(
  candidates: Iterable<string>,
  tokenCountsByEncoding: Map<TiktokenEncoding, Map<string, number>>,
): Set<string> {
  const shared = new Set<string>();

  for (const candidate of candidates) {
    const isSharedSingleToken = ENCODINGS.every(
      (encoding) => tokenCountsByEncoding.get(encoding)?.get(candidate) === 1,
    );

    if (isSharedSingleToken) {
      shared.add(candidate);
    }
  }

  return shared;
}

function pickExampleWords(candidates: SourceCandidate[], sharedSingleToken: Set<string>, limit = 15): string[] {
  const allShared = candidates
    .filter((candidate) => sharedSingleToken.has(candidate.word))
    .map((candidate) => candidate.word);
  const preferred = allShared.filter(
    (word) => word.length >= 4 && word.length <= 12 && /[aeiouy]/.test(word),
  );

  return [...new Set([...preferred, ...allShared])].slice(0, limit);
}

function tokenizeAllWords(words: string[]): Map<TiktokenEncoding, Map<string, number>> {
  const encoders = new Map<TiktokenEncoding, Tiktoken>();
  const results = new Map<TiktokenEncoding, Map<string, number>>();

  try {
    for (const encoding of ENCODINGS) {
      const encoder = get_encoding(encoding);
      encoders.set(encoding, encoder);
      const counts = new Map<string, number>();

      for (const word of words) {
        counts.set(word, encoder.encode(word).length);
      }

      results.set(encoding, counts);
    }

    return results;
  } finally {
    for (const encoder of encoders.values()) {
      encoder.free();
    }
  }
}

function printSourceSummary(summary: SourceSummary): void {
  const sharedBits = summary.sharedUniformBits.toFixed(2);
  const sharedCoverage = (summary.sharedSingleTokenCoverage * 100).toFixed(1);
  const weighted =
    summary.sharedWeightedEntropyBits === null ? "n/a" : summary.sharedWeightedEntropyBits.toFixed(2);

  console.log(
    `${summary.label}: ${summary.sharedSingleTokenCount}/${summary.normalizedUnique} shared single-token words (${sharedCoverage}%), uniform ${sharedBits} bits, weighted ${weighted}`,
  );
}

function run(resultsDirArg?: string): void {
  const resultsDir = resolve(resultsDirArg ?? DEFAULT_RESULTS_DIR);
  mkdirSync(resultsDir, { recursive: true });

  const rawBySource = new Map<string, RawEntry[]>();
  const candidatesBySource = new Map<string, SourceCandidate[]>();

  for (const source of SOURCES) {
    const rawEntries = loadSourceEntries(source);
    rawBySource.set(source.id, rawEntries);
    candidatesBySource.set(source.id, buildCandidates(rawEntries));
  }

  const uniqueWords = [...new Set(
    SOURCES.flatMap((source) => candidatesBySource.get(source.id)?.map((candidate) => candidate.word) ?? []),
  )].sort();
  const tokenCountsByEncoding = tokenizeAllWords(uniqueWords);
  const globalSharedSingleToken = buildSharedSingleTokenSet(uniqueWords, tokenCountsByEncoding);

  const sourceSummaries: SourceSummary[] = [];
  const prefixSummaries: PrefixSummary[] = [];

  for (const source of SOURCES) {
    const candidates = candidatesBySource.get(source.id) ?? [];
    const rawEntries = rawBySource.get(source.id) ?? [];
    const sharedSingleToken = new Set(candidates.map((candidate) => candidate.word).filter((word) => globalSharedSingleToken.has(word)));

    const encodingSummaries = ENCODINGS.map((encoding) => {
      const counts = candidates.map((candidate) => tokenCountsByEncoding.get(encoding)?.get(candidate.word) ?? 0);
      const stats = buildTokenStats(counts);
      const singleTokenCount = counts.filter((count) => count === 1).length;

      return {
        encoding,
        meanTokens: stats.mean,
        p50Tokens: stats.p50,
        p95Tokens: stats.p95,
        singleTokenCount,
        singleTokenCoverage: candidates.length === 0 ? 0 : singleTokenCount / candidates.length,
      };
    });

    const sharedSingleTokenCount = sharedSingleToken.size;
    const sharedSingleTokenCoverage = candidates.length === 0 ? 0 : sharedSingleTokenCount / candidates.length;

    const summary: SourceSummary = {
      sourceId: source.id,
      label: source.label,
      sourceType: source.sourceType,
      notes: source.notes,
      rawEntries: rawEntries.length,
      normalizedUnique: candidates.length,
      sharedSingleTokenCount,
      sharedSingleTokenCoverage,
      sharedUniformBits: sharedSingleTokenCount > 0 ? Math.log2(sharedSingleTokenCount) : 0,
      sharedWeightedEntropyBits: source.hasFrequency ? weightedEntropyBits(candidates, sharedSingleToken) : null,
      encodingSummaries,
      topSharedExamples: pickExampleWords(candidates, sharedSingleToken),
    };

    sourceSummaries.push(summary);
    printSourceSummary(summary);

    if (source.hasFrequency) {
      for (const prefixSize of PREFIX_SIZES) {
        const prefixCandidates = candidates.slice(0, prefixSize);
        if (prefixCandidates.length < prefixSize) {
          continue;
        }

        const prefixSharedSingleToken = new Set(
          prefixCandidates.map((candidate) => candidate.word).filter((word) => globalSharedSingleToken.has(word)),
        );

        prefixSummaries.push({
          sourceId: source.id,
          label: source.label,
          prefixSize,
          normalizedUnique: prefixCandidates.length,
          sharedSingleTokenCount: prefixSharedSingleToken.size,
          sharedSingleTokenCoverage:
            prefixCandidates.length === 0 ? 0 : prefixSharedSingleToken.size / prefixCandidates.length,
          sharedUniformBits:
            prefixSharedSingleToken.size > 0 ? Math.log2(prefixSharedSingleToken.size) : 0,
          sharedWeightedEntropyBits: weightedEntropyBits(prefixCandidates, prefixSharedSingleToken),
          cl100kMeanTokens: mean(
            prefixCandidates.map(
              (candidate) => tokenCountsByEncoding.get("cl100k_base")?.get(candidate.word) ?? 0,
            ),
          ),
          o200kMeanTokens: mean(
            prefixCandidates.map(
              (candidate) => tokenCountsByEncoding.get("o200k_base")?.get(candidate.word) ?? 0,
            ),
          ),
        });
      }
    }
  }

  const output: StudyOutput = {
    generatedAt: new Date().toISOString(),
    encodings: ENCODINGS,
    normalization: {
      lowercase: true,
      asciiAlphaOnly: true,
      minLength: 3,
      maxLength: 24,
    },
    sources: sourceSummaries,
    prefixes: prefixSummaries,
  };

  writeFileSync(resolve(resultsDir, "summary.json"), JSON.stringify(output, null, 2));

  const sourceCsv = [
    toCsvRow([
      "source_id",
      "label",
      "source_type",
      "raw_entries",
      "normalized_unique",
      "shared_single_token_count",
      "shared_single_token_coverage",
      "shared_uniform_bits",
      "shared_weighted_entropy_bits",
      "cl100k_mean_tokens",
      "cl100k_p50_tokens",
      "cl100k_p95_tokens",
      "cl100k_single_token_count",
      "cl100k_single_token_coverage",
      "o200k_mean_tokens",
      "o200k_p50_tokens",
      "o200k_p95_tokens",
      "o200k_single_token_count",
      "o200k_single_token_coverage",
    ]),
    ...sourceSummaries.map((summary) => {
      const cl100k = summary.encodingSummaries.find((encodingSummary) => encodingSummary.encoding === "cl100k_base");
      const o200k = summary.encodingSummaries.find((encodingSummary) => encodingSummary.encoding === "o200k_base");

      return toCsvRow([
        summary.sourceId,
        summary.label,
        summary.sourceType,
        summary.rawEntries,
        summary.normalizedUnique,
        summary.sharedSingleTokenCount,
        summary.sharedSingleTokenCoverage,
        summary.sharedUniformBits,
        summary.sharedWeightedEntropyBits,
        cl100k?.meanTokens ?? null,
        cl100k?.p50Tokens ?? null,
        cl100k?.p95Tokens ?? null,
        cl100k?.singleTokenCount ?? null,
        cl100k?.singleTokenCoverage ?? null,
        o200k?.meanTokens ?? null,
        o200k?.p50Tokens ?? null,
        o200k?.p95Tokens ?? null,
        o200k?.singleTokenCount ?? null,
        o200k?.singleTokenCoverage ?? null,
      ]);
    }),
  ].join("\n");
  writeFileSync(resolve(resultsDir, "source_summary.csv"), `${sourceCsv}\n`);

  const prefixCsv = [
    toCsvRow([
      "source_id",
      "label",
      "prefix_size",
      "normalized_unique",
      "shared_single_token_count",
      "shared_single_token_coverage",
      "shared_uniform_bits",
      "shared_weighted_entropy_bits",
      "cl100k_mean_tokens",
      "o200k_mean_tokens",
    ]),
    ...prefixSummaries.map((summary) =>
      toCsvRow([
        summary.sourceId,
        summary.label,
        summary.prefixSize,
        summary.normalizedUnique,
        summary.sharedSingleTokenCount,
        summary.sharedSingleTokenCoverage,
        summary.sharedUniformBits,
        summary.sharedWeightedEntropyBits,
        summary.cl100kMeanTokens,
        summary.o200kMeanTokens,
      ]),
    ),
  ].join("\n");
  writeFileSync(resolve(resultsDir, "prefix_summary.csv"), `${prefixCsv}\n`);
}

function main(): void {
  const [, , command, resultsDir] = process.argv;

  if (command === "run") {
    run(resultsDir);
    return;
  }

  console.error("Usage: node dist/study/external-vocabulary/index.js run [resultsDir]");
  process.exitCode = 1;
}

main();
