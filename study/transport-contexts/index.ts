import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";

const ENCODINGS = ["cl100k_base", "o200k_base"] as const;
type ActiveEncoding = (typeof ENCODINGS)[number];

const DEFAULT_SAMPLE_COUNT = 1_000;
const DEFAULT_SEQUENCE_LENGTHS = [3, 5, 8, 10, 12] as const;
const DEFAULT_SEED = 0x5eedc0de;
const MIN_SCORE = 80;
const MAX_RANK = 8_192;
const SAMPLE_PREVIEW_COUNT = 2;

const SEPARATORS = [
  { label: "none", value: "", transportSafe: true },
  { label: "space", value: " ", transportSafe: false },
  { label: "hyphen", value: "-", transportSafe: true },
  { label: "underscore", value: "_", transportSafe: true },
  { label: "dot", value: ".", transportSafe: true },
  { label: "slash", value: "/", transportSafe: false },
  { label: "tilde", value: "~", transportSafe: true },
  { label: "colon", value: ":", transportSafe: false },
  { label: "double_colon", value: "::", transportSafe: false },
] as const;
type SeparatorLabel = (typeof SEPARATORS)[number]["label"];

const CONTEXTS = [
  { label: "bare", render: (id: string) => id },
  { label: "json_object", render: (id: string) => JSON.stringify({ id, type: "task_ref" }) },
  { label: "url_path", render: (id: string) => `https://api.example.com/v1/tasks/${encodeURIComponent(id)}` },
  {
    label: "url_query",
    render: (id: string) => `https://api.example.com/v1/tasks?task_id=${encodeURIComponent(id)}&view=summary`,
  },
  { label: "markdown_code", render: (id: string) => `Task reference: \`${id}\`` },
  {
    label: "logfmt",
    render: (id: string) => `ts=2026-05-06T12:00:00Z level=info task_id=${renderLogfmtValue(id)} event=lookup`,
  },
] as const;
type ContextLabel = (typeof CONTEXTS)[number]["label"];

type CandidateRow = {
  word: string;
  rank: number;
  compositeScore: number;
  pronounceable: boolean;
  sharedSingleToken: boolean;
};

type SequenceRecord = {
  sequenceId: number;
  length: number;
  words: string[];
};

type SummaryRow = {
  encoding: ActiveEncoding;
  context: ContextLabel;
  separator: SeparatorLabel;
  transportSafe: boolean;
  length: number;
  sampleCount: number;
  meanTokens: number;
  p05Tokens: number;
  p25Tokens: number;
  p50Tokens: number;
  p75Tokens: number;
  p95Tokens: number;
  minTokens: number;
  maxTokens: number;
  meanChars: number;
  meanTokensPerAtom: number;
  deltaVsSpace: number;
  deltaVsNone: number;
  deltaVsUnderscore: number;
};

type WinnerRow = {
  encoding: ActiveEncoding;
  context: ContextLabel;
  length: number;
  winner: SeparatorLabel;
  winnerMeanTokens: number;
  runnerUp: SeparatorLabel;
  runnerUpMeanTokens: number;
  deltaToRunnerUp: number;
};

type RenderedSampleRow = {
  context: ContextLabel;
  separator: SeparatorLabel;
  length: number;
  sequenceId: number;
  words: string;
  identifier: string;
  rendered: string;
};

type StudyOutput = {
  source: {
    scoredCandidatesCsv: string;
    minScore: number;
    maxRank: number;
    pronounceableOnly: boolean;
  };
  encodings: ActiveEncoding[];
  contexts: ContextLabel[];
  separators: Array<{
    label: SeparatorLabel;
    transportSafe: boolean;
  }>;
  sampleCountPerLength: number;
  sequenceLengths: number[];
  atomPoolSize: number;
  atomPoolPreview: string[];
  summary: SummaryRow[];
  transportSafeWinners: WinnerRow[];
};

type Quantiles = {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
};

type ObservationBucket = {
  tokenCounts: number[];
  charCounts: number[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKID_ROOT = join(__dirname, "..", "..", "..");
const SCORED_CANDIDATES_PATH = join(
  TOKID_ROOT,
  "study",
  "wordfreq-atom-ranking",
  "results",
  "scored_candidates.csv",
);
const RESULTS_DIR = join(TOKID_ROOT, "study", "transport-contexts", "results");

class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  nextInt(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

function renderLogfmtValue(value: string): string {
  if (/^[^\s"=]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function parseBoolean(value: string): boolean {
  return value.toLowerCase() === "true";
}

function parseScoredCandidates(filePath: string): CandidateRow[] {
  const lines = readFileSync(filePath, "utf8").trim().split(/\r?\n/);
  const header = lines[0]?.split(",");
  if (!header) {
    throw new Error(`Empty CSV: ${filePath}`);
  }

  const columnIndex = new Map(header.map((name, index) => [name, index]));
  const requiredColumns = ["word", "rank", "composite_score", "pronounceable", "shared_single_token"];
  for (const column of requiredColumns) {
    if (!columnIndex.has(column)) {
      throw new Error(`Missing required CSV column: ${column}`);
    }
  }

  return lines.slice(1).map((line) => {
    const columns = line.split(",");
    return {
      word: columns[columnIndex.get("word") as number],
      rank: Number(columns[columnIndex.get("rank") as number]),
      compositeScore: Number(columns[columnIndex.get("composite_score") as number]),
      pronounceable: parseBoolean(columns[columnIndex.get("pronounceable") as number]),
      sharedSingleToken: parseBoolean(columns[columnIndex.get("shared_single_token") as number]),
    };
  });
}

function buildAtomPool(filePath: string): string[] {
  return parseScoredCandidates(filePath)
    .filter(
      (row) =>
        row.sharedSingleToken &&
        row.pronounceable &&
        row.rank <= MAX_RANK &&
        row.compositeScore >= MIN_SCORE,
    )
    .map((row) => row.word);
}

function generateSequences(atomPool: string[], sampleCount: number): SequenceRecord[] {
  const rng = new Lcg(DEFAULT_SEED);
  const sequences: SequenceRecord[] = [];

  for (const length of DEFAULT_SEQUENCE_LENGTHS) {
    for (let sequenceId = 0; sequenceId < sampleCount; sequenceId += 1) {
      const words: string[] = [];
      for (let index = 0; index < length; index += 1) {
        words.push(atomPool[rng.nextInt(atomPool.length)]);
      }
      sequences.push({ sequenceId, length, words });
    }
  }

  return sequences;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 0) {
    throw new Error("Cannot calculate percentile of empty input");
  }

  const position = Math.min(sortedValues.length - 1, Math.max(0, Math.round((sortedValues.length - 1) * ratio)));
  return sortedValues[position];
}

function summarize(values: number[]): { mean: number; min: number; max: number; quantiles: Quantiles } {
  const sorted = [...values].sort((left, right) => left - right);
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    mean: sum / values.length,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    quantiles: {
      p05: percentile(sorted, 0.05),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p95: percentile(sorted, 0.95),
    },
  };
}

function formatCsvValue(value: string | number | boolean): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function formatIdentifier(words: string[], separator: string): string {
  return words.join(separator);
}

function getBucket(
  buckets: Map<string, ObservationBucket>,
  encoding: ActiveEncoding,
  context: ContextLabel,
  length: number,
  separator: SeparatorLabel,
): ObservationBucket {
  const key = `${encoding}|${context}|${length}|${separator}`;
  const existing = buckets.get(key);
  if (existing) {
    return existing;
  }

  const created: ObservationBucket = { tokenCounts: [], charCounts: [] };
  buckets.set(key, created);
  return created;
}

function collectMeasurements(
  sequences: SequenceRecord[],
): { buckets: Map<string, ObservationBucket>; renderedSamples: RenderedSampleRow[] } {
  const encoders = {
    cl100k_base: get_encoding("cl100k_base"),
    o200k_base: get_encoding("o200k_base"),
  } as const;

  const buckets = new Map<string, ObservationBucket>();
  const renderedSamples: RenderedSampleRow[] = [];

  try {
    for (const sequence of sequences) {
      for (const separator of SEPARATORS) {
        const identifier = formatIdentifier(sequence.words, separator.value);

        for (const context of CONTEXTS) {
          const rendered = context.render(identifier);

          if (sequence.sequenceId < SAMPLE_PREVIEW_COUNT) {
            renderedSamples.push({
              context: context.label,
              separator: separator.label,
              length: sequence.length,
              sequenceId: sequence.sequenceId,
              words: sequence.words.join(" "),
              identifier,
              rendered,
            });
          }

          for (const encoding of ENCODINGS) {
            const bucket = getBucket(buckets, encoding, context.label, sequence.length, separator.label);
            bucket.tokenCounts.push(encoders[encoding].encode(rendered).length);
            bucket.charCounts.push(rendered.length);
          }
        }
      }
    }
  } finally {
    for (const encoder of Object.values(encoders)) {
      encoder.free();
    }
  }

  return { buckets, renderedSamples };
}

function buildSummaryRows(buckets: Map<string, ObservationBucket>, sampleCount: number): SummaryRow[] {
  const rows: SummaryRow[] = [];

  for (const encoding of ENCODINGS) {
    for (const context of CONTEXTS) {
      for (const length of DEFAULT_SEQUENCE_LENGTHS) {
        const noneBucket = buckets.get(`${encoding}|${context.label}|${length}|none`);
        const spaceBucket = buckets.get(`${encoding}|${context.label}|${length}|space`);
        const underscoreBucket = buckets.get(`${encoding}|${context.label}|${length}|underscore`);
        if (!noneBucket || !spaceBucket || !underscoreBucket) {
          throw new Error(`Missing baseline buckets for ${encoding} ${context.label} length ${length}`);
        }

        const noneMean = summarize(noneBucket.tokenCounts).mean;
        const spaceMean = summarize(spaceBucket.tokenCounts).mean;
        const underscoreMean = summarize(underscoreBucket.tokenCounts).mean;

        for (const separator of SEPARATORS) {
          const bucket = buckets.get(`${encoding}|${context.label}|${length}|${separator.label}`);
          if (!bucket) {
            throw new Error(`Missing bucket for ${encoding} ${context.label} length ${length} ${separator.label}`);
          }

          const tokenStats = summarize(bucket.tokenCounts);
          const charStats = summarize(bucket.charCounts);

          rows.push({
            encoding,
            context: context.label,
            separator: separator.label,
            transportSafe: separator.transportSafe,
            length,
            sampleCount,
            meanTokens: tokenStats.mean,
            p05Tokens: tokenStats.quantiles.p05,
            p25Tokens: tokenStats.quantiles.p25,
            p50Tokens: tokenStats.quantiles.p50,
            p75Tokens: tokenStats.quantiles.p75,
            p95Tokens: tokenStats.quantiles.p95,
            minTokens: tokenStats.min,
            maxTokens: tokenStats.max,
            meanChars: charStats.mean,
            meanTokensPerAtom: tokenStats.mean / length,
            deltaVsSpace: tokenStats.mean - spaceMean,
            deltaVsNone: tokenStats.mean - noneMean,
            deltaVsUnderscore: tokenStats.mean - underscoreMean,
          });
        }
      }
    }
  }

  return rows;
}

function buildTransportSafeWinners(rows: SummaryRow[]): WinnerRow[] {
  const winners: WinnerRow[] = [];

  for (const encoding of ENCODINGS) {
    for (const context of CONTEXTS) {
      for (const length of DEFAULT_SEQUENCE_LENGTHS) {
        const candidates = rows
          .filter(
            (row) =>
              row.encoding === encoding &&
              row.context === context.label &&
              row.length === length &&
              row.transportSafe,
          )
          .sort((left, right) => {
            if (left.meanTokens !== right.meanTokens) {
              return left.meanTokens - right.meanTokens;
            }

            return left.meanChars - right.meanChars;
          });

        if (candidates.length < 2) {
          throw new Error(`Expected at least two transport-safe candidates for ${encoding} ${context.label} ${length}`);
        }

        const winner = candidates[0] as SummaryRow;
        const runnerUp = candidates[1] as SummaryRow;

        winners.push({
          encoding,
          context: context.label,
          length,
          winner: winner.separator,
          winnerMeanTokens: winner.meanTokens,
          runnerUp: runnerUp.separator,
          runnerUpMeanTokens: runnerUp.meanTokens,
          deltaToRunnerUp: runnerUp.meanTokens - winner.meanTokens,
        });
      }
    }
  }

  return winners;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeSummaryCsv(filePath: string, rows: SummaryRow[]): void {
  const header = [
    "encoding",
    "context",
    "separator",
    "transport_safe",
    "length",
    "sample_count",
    "mean_tokens",
    "p05_tokens",
    "p25_tokens",
    "p50_tokens",
    "p75_tokens",
    "p95_tokens",
    "min_tokens",
    "max_tokens",
    "mean_chars",
    "mean_tokens_per_atom",
    "delta_vs_space",
    "delta_vs_none",
    "delta_vs_underscore",
  ];

  const body = rows.map((row) =>
    [
      row.encoding,
      row.context,
      row.separator,
      row.transportSafe,
      row.length,
      row.sampleCount,
      row.meanTokens,
      row.p05Tokens,
      row.p25Tokens,
      row.p50Tokens,
      row.p75Tokens,
      row.p95Tokens,
      row.minTokens,
      row.maxTokens,
      row.meanChars,
      row.meanTokensPerAtom,
      row.deltaVsSpace,
      row.deltaVsNone,
      row.deltaVsUnderscore,
    ]
      .map(formatCsvValue)
      .join(","),
  );

  writeFileSync(filePath, `${header.join(",")}\n${body.join("\n")}\n`, "utf8");
}

function writeWinnerCsv(filePath: string, rows: WinnerRow[]): void {
  const header = [
    "encoding",
    "context",
    "length",
    "winner",
    "winner_mean_tokens",
    "runner_up",
    "runner_up_mean_tokens",
    "delta_to_runner_up",
  ];

  const body = rows.map((row) =>
    [
      row.encoding,
      row.context,
      row.length,
      row.winner,
      row.winnerMeanTokens,
      row.runnerUp,
      row.runnerUpMeanTokens,
      row.deltaToRunnerUp,
    ]
      .map(formatCsvValue)
      .join(","),
  );

  writeFileSync(filePath, `${header.join(",")}\n${body.join("\n")}\n`, "utf8");
}

function writeRenderedSamplesCsv(filePath: string, rows: RenderedSampleRow[]): void {
  const header = ["context", "separator", "length", "sequence_id", "words", "identifier", "rendered"];
  const body = rows.map((row) =>
    [row.context, row.separator, row.length, row.sequenceId, row.words, row.identifier, row.rendered]
      .map(formatCsvValue)
      .join(","),
  );

  writeFileSync(filePath, `${header.join(",")}\n${body.join("\n")}\n`, "utf8");
}

function printConsoleSummary(winners: WinnerRow[]): void {
  console.log("Transport-safe winners by context:");

  for (const context of CONTEXTS) {
    console.log(`\n${context.label}`);
    for (const encoding of ENCODINGS) {
      const relevant = winners.filter((row) => row.context === context.label && row.encoding === encoding);
      const compact = relevant
        .map(
          (row) =>
            `${row.length}w ${row.winner} (${row.winnerMeanTokens.toFixed(2)} tokens, +${row.deltaToRunnerUp.toFixed(2)} vs ${row.runnerUp})`,
        )
        .join(" | ");
      console.log(`  ${encoding}: ${compact}`);
    }
  }
}

function run(): void {
  const atomPool = buildAtomPool(SCORED_CANDIDATES_PATH);
  const sequences = generateSequences(atomPool, DEFAULT_SAMPLE_COUNT);
  const { buckets, renderedSamples } = collectMeasurements(sequences);
  const summary = buildSummaryRows(buckets, DEFAULT_SAMPLE_COUNT);
  const transportSafeWinners = buildTransportSafeWinners(summary);

  mkdirSync(RESULTS_DIR, { recursive: true });

  const output: StudyOutput = {
    source: {
      scoredCandidatesCsv: SCORED_CANDIDATES_PATH,
      minScore: MIN_SCORE,
      maxRank: MAX_RANK,
      pronounceableOnly: true,
    },
    encodings: [...ENCODINGS],
    contexts: CONTEXTS.map((context) => context.label),
    separators: SEPARATORS.map((separator) => ({
      label: separator.label,
      transportSafe: separator.transportSafe,
    })),
    sampleCountPerLength: DEFAULT_SAMPLE_COUNT,
    sequenceLengths: [...DEFAULT_SEQUENCE_LENGTHS],
    atomPoolSize: atomPool.length,
    atomPoolPreview: atomPool.slice(0, 25),
    summary,
    transportSafeWinners,
  };

  writeJson(join(RESULTS_DIR, "summary.json"), output);
  writeSummaryCsv(join(RESULTS_DIR, "summary.csv"), summary);
  writeWinnerCsv(join(RESULTS_DIR, "transport_safe_winners.csv"), transportSafeWinners);
  writeRenderedSamplesCsv(join(RESULTS_DIR, "rendered_samples.csv"), renderedSamples);
  printConsoleSummary(transportSafeWinners);
}

function printUsage(): void {
  console.log("Usage: node dist/study/transport-contexts/index.js run");
}

function main(): void {
  const command = process.argv[2] ?? "run";
  if (command === "run") {
    run();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
