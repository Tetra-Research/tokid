import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { get_encoding } from "tiktoken";

const ENCODINGS = ["cl100k_base", "o200k_base"] as const;
type ActiveEncoding = (typeof ENCODINGS)[number];

const DEFAULT_SAMPLE_COUNT = 2_000;
const DEFAULT_SEQUENCE_LENGTHS = [3, 5, 8, 10, 12] as const;
const DEFAULT_SEED = 0x5eedc0de;
const MIN_SCORE = 80;
const MAX_RANK = 8_192;

const SEPARATORS = [
  { label: "none", value: "" },
  { label: "space", value: " " },
  { label: "hyphen", value: "-" },
  { label: "underscore", value: "_" },
  { label: "dot", value: "." },
  { label: "slash", value: "/" },
  { label: "tilde", value: "~" },
  { label: "colon", value: ":" },
  { label: "double_colon", value: "::" },
] as const;

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

type Observation = {
  encoding: ActiveEncoding;
  separator: string;
  length: number;
  tokens: number;
  chars: number;
};

type SummaryRow = {
  encoding: ActiveEncoding;
  separator: string;
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
};

type StudyOutput = {
  source: {
    scoredCandidatesCsv: string;
    minScore: number;
    maxRank: number;
    pronounceableOnly: boolean;
  };
  encodings: ActiveEncoding[];
  separators: string[];
  sampleCountPerLength: number;
  sequenceLengths: number[];
  atomPoolSize: number;
  atomPoolPreview: string[];
  summary: SummaryRow[];
};

type Quantiles = {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
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
const RESULTS_DIR = join(TOKID_ROOT, "study", "separator-effects", "results");

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

function formatCsvValue(value: string | number): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function buildSummaryRows(observations: Observation[]): SummaryRow[] {
  const groups = new Map<string, Observation[]>();

  for (const observation of observations) {
    const key = `${observation.encoding}|${observation.length}|${observation.separator}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(observation);
    } else {
      groups.set(key, [observation]);
    }
  }

  const rows: SummaryRow[] = [];

  for (const encoding of ENCODINGS) {
    for (const length of DEFAULT_SEQUENCE_LENGTHS) {
      const baselineNone = groups.get(`${encoding}|${length}|none`);
      const baselineSpace = groups.get(`${encoding}|${length}|space`);
      if (!baselineNone || !baselineSpace) {
        throw new Error(`Missing baseline observations for ${encoding} length ${length}`);
      }

      const noneMean = summarize(baselineNone.map((entry) => entry.tokens)).mean;
      const spaceMean = summarize(baselineSpace.map((entry) => entry.tokens)).mean;

      for (const separator of SEPARATORS) {
        const bucket = groups.get(`${encoding}|${length}|${separator.label}`);
        if (!bucket) {
          throw new Error(`Missing observations for ${encoding} length ${length} separator ${separator.label}`);
        }

        const tokenStats = summarize(bucket.map((entry) => entry.tokens));
        const charStats = summarize(bucket.map((entry) => entry.chars));

        rows.push({
          encoding,
          separator: separator.label,
          length,
          sampleCount: bucket.length,
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
        });
      }
    }
  }

  return rows;
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeCsv(filePath: string, rows: SummaryRow[]): void {
  const header = [
    "encoding",
    "separator",
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
  ];

  const body = rows.map((row) =>
    [
      row.encoding,
      row.separator,
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
    ]
      .map(formatCsvValue)
      .join(","),
  );

  writeFileSync(filePath, `${header.join(",")}\n${body.join("\n")}\n`, "utf8");
}

function writeSequenceSamples(filePath: string, sequences: SequenceRecord[]): void {
  const header = ["sequence_id", "length", "words"];
  const body = sequences.map((sequence) =>
    [sequence.sequenceId, sequence.length, sequence.words.join(" ")].map(formatCsvValue).join(","),
  );
  writeFileSync(filePath, `${header.join(",")}\n${body.join("\n")}\n`, "utf8");
}

function run(): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const atomPool = buildAtomPool(SCORED_CANDIDATES_PATH);
  const sequences = generateSequences(atomPool, DEFAULT_SAMPLE_COUNT);
  const tokenizers: Record<ActiveEncoding, ReturnType<typeof get_encoding>> = {
    cl100k_base: get_encoding("cl100k_base"),
    o200k_base: get_encoding("o200k_base"),
  };

  try {
    const observations: Observation[] = [];

    for (const sequence of sequences) {
      for (const separator of SEPARATORS) {
        const joined = sequence.words.join(separator.value);
        for (const encoding of ENCODINGS) {
          const tokens = tokenizers[encoding].encode(joined).length;
          observations.push({
            encoding,
            separator: separator.label,
            length: sequence.length,
            tokens,
            chars: joined.length,
          });
        }
      }
    }

    const summary = buildSummaryRows(observations);
    const output: StudyOutput = {
      source: {
        scoredCandidatesCsv: SCORED_CANDIDATES_PATH,
        minScore: MIN_SCORE,
        maxRank: MAX_RANK,
        pronounceableOnly: true,
      },
      encodings: [...ENCODINGS],
      separators: SEPARATORS.map((separator) => separator.label),
      sampleCountPerLength: DEFAULT_SAMPLE_COUNT,
      sequenceLengths: [...DEFAULT_SEQUENCE_LENGTHS],
      atomPoolSize: atomPool.length,
      atomPoolPreview: atomPool.slice(0, 24),
      summary,
    };

    writeJson(join(RESULTS_DIR, "summary.json"), output);
    writeCsv(join(RESULTS_DIR, "summary.csv"), summary);
    writeSequenceSamples(join(RESULTS_DIR, "sequence_samples.csv"), sequences.slice(0, 250));

    console.log(`separator study atom pool: ${atomPool.length}`);
    console.log(`generated sequences: ${sequences.length}`);
    console.log(`observations: ${observations.length}`);
  } finally {
    for (const encoding of ENCODINGS) {
      tokenizers[encoding].free();
    }
  }
}

const [, , command] = process.argv;

if (command === "run") {
  run();
} else {
  console.log("Usage:");
  console.log("  node dist/study/separator-effects/index.js run");
}
