import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { get_encoding, type Tiktoken, type TiktokenEncoding } from "tiktoken";

const ENCODINGS: TiktokenEncoding[] = ["cl100k_base", "o200k_base"];
const DEFAULT_SAMPLE_COUNT = 5_000;
const DEFAULT_SEED = "tokid-id-token-usage-v1";
const DEFAULT_RESULTS_DIR = "study/id-token-usage/results";
const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const NANOID_ALPHABET = "_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BASE_TIMESTAMP_MS = Date.UTC(2026, 0, 1);

type FamilyClass = "reference" | "secure";

type EncodingSummary = {
  encoding: TiktokenEncoding;
  minTokens: number;
  maxTokens: number;
  meanTokens: number;
  p05Tokens: number;
  p25Tokens: number;
  medianTokens: number;
  p75Tokens: number;
  p95Tokens: number;
  p99Tokens: number;
  iqrTokens: number;
  stddevTokens: number;
  meanChars: number;
};

type FamilySummary = {
  name: string;
  familyClass: FamilyClass;
  format: string;
  sampleCount: number;
  randomBits: number;
  example: string;
  summaries: EncodingSummary[];
};

type StudyOutput = {
  generatedAt: string;
  seed: string;
  sampleCount: number;
  encodings: TiktokenEncoding[];
  families: FamilySummary[];
};

type SampleRecord = {
  family: string;
  familyClass: FamilyClass;
  format: string;
  sampleIndex: number;
  value: string;
  charCount: number;
  randomBits: number;
  encoding: TiktokenEncoding;
  tokenCount: number;
};

type FamilyDefinition = {
  name: string;
  familyClass: FamilyClass;
  format: string;
  randomBits: (context: StudyContext) => number;
  generate: (context: StudyContext) => string;
};

type StudyContext = {
  sampleIndex: number;
  bytes: DeterministicByteStream;
};

class DeterministicByteStream {
  private buffer = Buffer.alloc(0);
  private counter = 0;

  constructor(private readonly seed: string) {}

  nextBytes(length: number): Uint8Array {
    while (this.buffer.length < length) {
      const digest = createHash("sha256").update(`${this.seed}:${this.counter}`).digest();
      this.counter += 1;
      this.buffer = Buffer.concat([this.buffer, digest]);
    }

    const output = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return Uint8Array.from(output);
  }

  nextBigInt(bits: number): bigint {
    if (bits <= 0) {
      return 0n;
    }

    const byteLength = Math.ceil(bits / 8);
    const bytes = this.nextBytes(byteLength);
    const excessBits = byteLength * 8 - bits;
    if (excessBits > 0) {
      bytes[0] &= 0xff >>> excessBits;
    }

    return bytesToBigInt(bytes);
  }

  nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`Invalid maxExclusive: ${maxExclusive}`);
    }

    const bound = 0x1_0000_0000;
    const threshold = bound - (bound % maxExclusive);
    while (true) {
      const candidate = bytesToUint32(this.nextBytes(4));
      if (candidate < threshold) {
        return candidate % maxExclusive;
      }
    }
  }
}

function bytesToUint32(bytes: Uint8Array): number {
  return (
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0)
  ) >>> 0;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function encodeBaseN(value: bigint, alphabet: string, minLength = 1): string {
  const base = BigInt(alphabet.length);
  if (base < 2n) {
    throw new Error("Alphabet must have at least two characters");
  }

  let current = value;
  let output = "";
  while (current > 0n) {
    const remainder = Number(current % base);
    output = alphabet[remainder] + output;
    current /= base;
  }

  if (output.length === 0) {
    output = alphabet[0];
  }

  if (output.length < minLength) {
    output = alphabet[0].repeat(minLength - output.length) + output;
  }

  return output;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function generateUuidV4(context: StudyContext): string {
  const bytes = context.bytes.nextBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function generateUuidV7(context: StudyContext): string {
  const timestamp = BigInt(BASE_TIMESTAMP_MS + context.sampleIndex);
  const bytes = context.bytes.nextBytes(16);
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function generateUlid(context: StudyContext): string {
  const timestamp = BigInt(BASE_TIMESTAMP_MS + context.sampleIndex);
  const randomness = bytesToBigInt(context.bytes.nextBytes(10));
  const value = (timestamp << 80n) | randomness;
  return encodeBaseN(value, CROCKFORD_BASE32, 26);
}

function generateNanoid21(context: StudyContext): string {
  let output = "";
  for (let index = 0; index < 21; index += 1) {
    output += NANOID_ALPHABET[context.bytes.nextInt(NANOID_ALPHABET.length)];
  }
  return output;
}

function generateHex(byteLength: number, context: StudyContext): string {
  return Buffer.from(context.bytes.nextBytes(byteLength)).toString("hex");
}

function generateBase64Url(byteLength: number, context: StudyContext): string {
  return Buffer.from(context.bytes.nextBytes(byteLength)).toString("base64url");
}

function generateBase62(byteLength: number, context: StudyContext): string {
  return encodeBaseN(bytesToBigInt(context.bytes.nextBytes(byteLength)), BASE62_ALPHABET);
}

function generateDecimal(bits: number, context: StudyContext): string {
  return context.bytes.nextBigInt(bits).toString(10);
}

function generateSequentialDecimal(start: bigint, context: StudyContext): string {
  return (start + BigInt(context.sampleIndex)).toString(10);
}

function tokenizeLength(encoder: Tiktoken, value: string): number {
  return encoder.encode(value).length;
}

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function numberSummary(values: number[]): {
  min: number;
  max: number;
  mean: number;
  p05: number;
  p25: number;
  median: number;
  p75: number;
  p95: number;
  p99: number;
  iqr: number;
  stddev: number;
} {
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  const p25 = quantile(sorted, 0.25);
  const p75 = quantile(sorted, 0.75);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    p05: quantile(sorted, 0.05),
    p25,
    median: quantile(sorted, 0.5),
    p75,
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    iqr: p75 - p25,
    stddev: Math.sqrt(variance),
  };
}

function formatFixed(value: number): string {
  return value.toFixed(2);
}

function toCsvRow(values: Array<string | number>): string {
  return values
    .map((value) => {
      const text = String(value);
      if (/[",\n]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`;
      }
      return text;
    })
    .join(",");
}

function writeResults(resultsDir: string, output: StudyOutput, sampleRecords: SampleRecord[]): void {
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(resolve(resultsDir, "summary.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const summaryCsvLines = [
    toCsvRow([
      "family",
      "family_class",
      "format",
      "sample_count",
      "random_bits",
      "example",
      "encoding",
      "mean_tokens",
      "p05_tokens",
      "p25_tokens",
      "median_tokens",
      "p75_tokens",
      "p95_tokens",
      "p99_tokens",
      "min_tokens",
      "max_tokens",
      "iqr_tokens",
      "stddev_tokens",
      "mean_chars",
      "bits_per_mean_token",
    ]),
  ];

  for (const family of output.families) {
    for (const summary of family.summaries) {
      summaryCsvLines.push(
        toCsvRow([
          family.name,
          family.familyClass,
          family.format,
          family.sampleCount,
          formatFixed(family.randomBits),
          family.example,
          summary.encoding,
          formatFixed(summary.meanTokens),
          formatFixed(summary.p05Tokens),
          formatFixed(summary.p25Tokens),
          formatFixed(summary.medianTokens),
          formatFixed(summary.p75Tokens),
          formatFixed(summary.p95Tokens),
          formatFixed(summary.p99Tokens),
          summary.minTokens,
          summary.maxTokens,
          formatFixed(summary.iqrTokens),
          formatFixed(summary.stddevTokens),
          formatFixed(summary.meanChars),
          formatFixed(family.randomBits / summary.meanTokens),
        ]),
      );
    }
  }
  writeFileSync(resolve(resultsDir, "summary.csv"), `${summaryCsvLines.join("\n")}\n`, "utf8");

  const sampleCsvLines = [
    toCsvRow([
      "family",
      "family_class",
      "format",
      "sample_index",
      "value",
      "char_count",
      "random_bits",
      "encoding",
      "token_count",
    ]),
  ];

  for (const record of sampleRecords) {
    sampleCsvLines.push(
      toCsvRow([
        record.family,
        record.familyClass,
        record.format,
        record.sampleIndex,
        record.value,
        record.charCount,
        formatFixed(record.randomBits),
        record.encoding,
        record.tokenCount,
      ]),
    );
  }
  writeFileSync(resolve(resultsDir, "samples.csv"), `${sampleCsvLines.join("\n")}\n`, "utf8");
}

function familyDefinitions(): FamilyDefinition[] {
  return [
    {
      name: "uuid_v4",
      familyClass: "secure",
      format: "canonical",
      randomBits: () => 122,
      generate: generateUuidV4,
    },
    {
      name: "uuid_v7",
      familyClass: "secure",
      format: "canonical",
      randomBits: () => 74,
      generate: generateUuidV7,
    },
    {
      name: "ulid",
      familyClass: "secure",
      format: "crockford_base32",
      randomBits: () => 80,
      generate: generateUlid,
    },
    {
      name: "nanoid_21",
      familyClass: "secure",
      format: "url_alphabet",
      randomBits: () => 126,
      generate: generateNanoid21,
    },
    {
      name: "hex_16",
      familyClass: "reference",
      format: "hex",
      randomBits: () => 64,
      generate: (context) => generateHex(8, context),
    },
    {
      name: "hex_32",
      familyClass: "secure",
      format: "hex",
      randomBits: () => 128,
      generate: (context) => generateHex(16, context),
    },
    {
      name: "base64url_16",
      familyClass: "secure",
      format: "base64url",
      randomBits: () => 128,
      generate: (context) => generateBase64Url(16, context),
    },
    {
      name: "base62_16",
      familyClass: "secure",
      format: "base62",
      randomBits: () => 128,
      generate: (context) => generateBase62(16, context),
    },
    {
      name: "decimal_u64",
      familyClass: "reference",
      format: "decimal",
      randomBits: () => 64,
      generate: (context) => generateDecimal(64, context),
    },
    {
      name: "integer_auto_6d",
      familyClass: "reference",
      format: "decimal_sequential",
      randomBits: () => 0,
      generate: (context) => generateSequentialDecimal(100_000n, context),
    },
    {
      name: "integer_auto_9d",
      familyClass: "reference",
      format: "decimal_sequential",
      randomBits: () => 0,
      generate: (context) => generateSequentialDecimal(100_000_000n, context),
    },
    {
      name: "integer_auto_12d",
      familyClass: "reference",
      format: "decimal_sequential",
      randomBits: () => 0,
      generate: (context) => generateSequentialDecimal(100_000_000_000n, context),
    },
    {
      name: "integer_auto_15d",
      familyClass: "reference",
      format: "decimal_sequential",
      randomBits: () => 0,
      generate: (context) => generateSequentialDecimal(100_000_000_000_000n, context),
    },
    {
      name: "integer_auto_18d",
      familyClass: "reference",
      format: "decimal_sequential",
      randomBits: () => 0,
      generate: (context) => generateSequentialDecimal(100_000_000_000_000_000n, context),
    },
    {
      name: "decimal_u128",
      familyClass: "secure",
      format: "decimal",
      randomBits: () => 128,
      generate: (context) => generateDecimal(128, context),
    },
  ];
}

function parseFlag(args: string[], flag: string): string | undefined {
  const index = args.findIndex((value) => value === flag);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function parseOptions(args: string[]): {
  sampleCount: number;
  seed: string;
  resultsDir: string;
} {
  const rawSamples = parseFlag(args, "--samples");
  const sampleCount = rawSamples ? Number(rawSamples) : DEFAULT_SAMPLE_COUNT;
  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new Error(`Invalid --samples value: ${rawSamples}`);
  }

  return {
    sampleCount,
    seed: parseFlag(args, "--seed") ?? DEFAULT_SEED,
    resultsDir: parseFlag(args, "--results-dir") ?? DEFAULT_RESULTS_DIR,
  };
}

function printConsoleSummary(output: StudyOutput): void {
  console.log("# tokid id token usage study");
  console.log(`seed=${output.seed}`);
  console.log(`sample_count=${output.sampleCount}`);
  console.log("=".repeat(100));

  for (const family of output.families) {
    console.log(
      `${family.name} [${family.familyClass}] format=${family.format} random_bits=${formatFixed(family.randomBits)} example=${family.example}`,
    );
    for (const summary of family.summaries) {
      console.log(
        `  ${summary.encoding}: mean=${formatFixed(summary.meanTokens)} median=${formatFixed(summary.medianTokens)} p95=${formatFixed(summary.p95Tokens)} min=${summary.minTokens} max=${summary.maxTokens} mean_chars=${formatFixed(summary.meanChars)} bits_per_mean_token=${formatFixed(family.randomBits / summary.meanTokens)}`,
      );
    }
    console.log("-".repeat(100));
  }
}

function runStudy(sampleCount: number, seed: string, resultsDir: string): void {
  const encoders = new Map<TiktokenEncoding, Tiktoken>();
  for (const encoding of ENCODINGS) {
    encoders.set(encoding, get_encoding(encoding));
  }

  try {
    const families = familyDefinitions();
    const familyOutputs: FamilySummary[] = [];
    const sampleRecords: SampleRecord[] = [];

    for (const family of families) {
      const generatedValues: string[] = [];
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const context: StudyContext = {
          sampleIndex,
          bytes: new DeterministicByteStream(`${seed}:${family.name}:${sampleIndex}`),
        };
        generatedValues.push(family.generate(context));
      }

      const summaries = ENCODINGS.map((encoding) => {
        const tokenCounts = generatedValues.map((value, sampleIndex) => {
          const tokenCount = tokenizeLength(encoders.get(encoding)!, value);
          const randomBits = family.randomBits({
            sampleIndex,
            bytes: new DeterministicByteStream(`${seed}:${family.name}:${sampleIndex}`),
          });

          sampleRecords.push({
            family: family.name,
            familyClass: family.familyClass,
            format: family.format,
            sampleIndex,
            value,
            charCount: value.length,
            randomBits,
            encoding,
            tokenCount,
          });

          return tokenCount;
        });

        const tokenStats = numberSummary(tokenCounts);
        const charStats = numberSummary(generatedValues.map((value) => value.length));
        return {
          encoding,
          minTokens: tokenStats.min,
          maxTokens: tokenStats.max,
          meanTokens: tokenStats.mean,
          p05Tokens: tokenStats.p05,
          p25Tokens: tokenStats.p25,
          medianTokens: tokenStats.median,
          p75Tokens: tokenStats.p75,
          p95Tokens: tokenStats.p95,
          p99Tokens: tokenStats.p99,
          iqrTokens: tokenStats.iqr,
          stddevTokens: tokenStats.stddev,
          meanChars: charStats.mean,
        };
      });

      const familyRandomBits = family.randomBits({
        sampleIndex: 0,
        bytes: new DeterministicByteStream(`${seed}:${family.name}:0`),
      });

      familyOutputs.push({
        name: family.name,
        familyClass: family.familyClass,
        format: family.format,
        sampleCount,
        randomBits: familyRandomBits,
        example: generatedValues[0],
        summaries,
      });
    }

    const output: StudyOutput = {
      generatedAt: new Date().toISOString(),
      seed,
      sampleCount,
      encodings: ENCODINGS,
      families: familyOutputs,
    };

    writeResults(resultsDir, output, sampleRecords);
    printConsoleSummary(output);
    console.log(`results_dir=${resultsDir}`);
  } finally {
    for (const encoder of encoders.values()) {
      encoder.free();
    }
  }
}

function printUsage(): void {
  console.log("Usage:");
  console.log("  tokid run [--samples N] [--seed VALUE] [--results-dir PATH]");
}

function main(): void {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case "run": {
      const options = parseOptions(rest);
      runStudy(options.sampleCount, options.seed, options.resultsDir);
      return;
    }
    default:
      printUsage();
  }
}

main();
