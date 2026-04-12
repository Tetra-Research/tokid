import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { get_encoding, type TiktokenEncoding } from "tiktoken";

const ENCODINGS: TiktokenEncoding[] = ["cl100k_base", "o200k_base"];
const DEFAULT_WORDLIST_SIZE = 50_000;

type AnalysisSample = {
  label: string;
  value: string;
  kind: "identifier" | "url";
  notes?: string;
};

type TokenDetail = {
  id: number;
  text: string;
};

const SAMPLE_UUID = "550e8400-e29b-41d4-a716-446655440000";
const SAMPLE_HEX = "8f14e45fceea167a5a36dedd4bea2543";
const SAMPLE_INT = "1743696181";
const SHORT_WORDS = ["clock", "river", "orange"];
const SECURE_WORDS = ["clock", "river", "orange", "window", "forest", "signal", "planet", "rocket"];
const SAMPLE_TOKID_3 = SHORT_WORDS.join(" ");
const SAMPLE_TOKID_8 = SECURE_WORDS.join(" ");
const SAMPLE_TOKURL = "https://api.example.com/v1/tasks/550e8400-e29b-41d4-a716-446655440000?include=events&limit=50";
const SAMPLE_TOKURL_REWRITE = "api.example.com/tasks/clockriverorange?events";

const SAMPLES: AnalysisSample[] = [
  {
    label: "uuid_v4",
    value: SAMPLE_UUID,
    kind: "identifier",
    notes: "Baseline opaque ID",
  },
  {
    label: "hex_32",
    value: SAMPLE_HEX,
    kind: "identifier",
    notes: "Hex string without separators",
  },
  {
    label: "epoch_seconds",
    value: SAMPLE_INT,
    kind: "identifier",
    notes: "Simple numeric reference",
  },
  {
    label: "tokid_3_hyphen",
    value: SHORT_WORDS.join("-"),
    kind: "identifier",
    notes: "Separator tax on otherwise good words",
  },
  {
    label: "tokid_3_space",
    value: SAMPLE_TOKID_3,
    kind: "identifier",
    notes: "Short non-security candidate built from single-token words",
  },
  {
    label: "tokid_3_compact",
    value: SHORT_WORDS.join(""),
    kind: "identifier",
    notes: "No separators",
  },
  {
    label: "tokid_8_hyphen",
    value: SECURE_WORDS.join("-"),
    kind: "identifier",
    notes: "UUID-class entropy candidate with hyphen separator tax",
  },
  {
    label: "tokid_8_space",
    value: SAMPLE_TOKID_8,
    kind: "identifier",
    notes: "UUID-class entropy candidate if chosen from a large word list",
  },
  {
    label: "url_with_uuid",
    value: SAMPLE_TOKURL,
    kind: "url",
    notes: "Verbose URL carrying a UUID",
  },
  {
    label: "tokurl_candidate",
    value: SAMPLE_TOKURL_REWRITE,
    kind: "url",
    notes: "Minimal URL with tokid-style path segment",
  },
];

function encodeValue(encoding: TiktokenEncoding, value: string): TokenDetail[] {
  const enc = get_encoding(encoding);

  try {
    return Array.from(enc.encode(value), (id) => ({
      id,
      text: Buffer.from(enc.decode(new Uint32Array([id]))).toString("utf8"),
    }));
  } finally {
    enc.free();
  }
}

function entropyBits(wordCount: number, wordlistSize: number): number {
  return wordCount * Math.log2(wordlistSize);
}

function printDivider(): void {
  console.log("=".repeat(80));
}

function printSampleAnalysis(wordlistSize: number): void {
  console.log(`# tokid sample analysis`);
  console.log(`wordlist_size=${wordlistSize}`);
  console.log(`short_tokid_entropy_bits=${entropyBits(3, wordlistSize).toFixed(2)}`);
  console.log(`secure_tokid_entropy_bits=${entropyBits(8, wordlistSize).toFixed(2)}`);
  printDivider();

  for (const sample of SAMPLES) {
    console.log(`${sample.label} (${sample.kind})`);
    console.log(sample.value);
    if (sample.notes) {
      console.log(`notes: ${sample.notes}`);
    }

    for (const encoding of ENCODINGS) {
      const tokens = encodeValue(encoding, sample.value);
      const rendered = tokens
        .map((token) => `${token.id}:${JSON.stringify(token.text)}`)
        .join(" ");
      console.log(`  ${encoding}: ${tokens.length} tokens`);
      console.log(`    pieces: ${rendered}`);
    }

    printDivider();
  }
}

function normalizeWords(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function printWordAnalysis(filePath: string): void {
  const words = normalizeWords(readFileSync(filePath, "utf8"));
  const results = ENCODINGS.map((encoding) => {
    const analyzed = words.map((word) => {
      const tokens = encodeValue(encoding, word);
      return {
        word,
        tokenCount: tokens.length,
        pieces: tokens.map((token) => token.text),
      };
    });

    return {
      encoding,
      singleTokenWords: analyzed.filter((entry) => entry.tokenCount === 1).map((entry) => entry.word),
      analyzed,
    };
  });

  const shared = results.reduce<string[]>((acc, current, index) => {
    if (index === 0) {
      return [...current.singleTokenWords];
    }

    const currentSet = new Set(current.singleTokenWords);
    return acc.filter((word) => currentSet.has(word));
  }, []);

  console.log(`# tokid word analysis`);
  console.log(`file=${basename(filePath)}`);
  console.log(`input_words=${words.length}`);
  console.log(`single_token_in_all_encodings=${shared.length}`);
  console.log(`shared_words=${shared.join(", ")}`);
  printDivider();

  for (const result of results) {
    console.log(result.encoding);
    console.log(`single_token_words=${result.singleTokenWords.length}`);
    console.log(result.singleTokenWords.join(", "));
    printDivider();
  }
}

function parseWordlistSize(argv: string[]): number {
  const flagIndex = argv.findIndex((arg) => arg === "--wordlist-size");
  if (flagIndex === -1) {
    return DEFAULT_WORDLIST_SIZE;
  }

  const raw = argv[flagIndex + 1];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --wordlist-size value: ${raw}`);
  }
  return parsed;
}

function main(): void {
  const [, , command, maybeFilePath, ...rest] = process.argv;

  switch (command) {
    case "analyze-samples":
      printSampleAnalysis(parseWordlistSize(rest));
      return;
    case "analyze-words":
      if (!maybeFilePath) {
        throw new Error("Usage: tokid analyze-words <file>");
      }
      printWordAnalysis(maybeFilePath);
      return;
    default:
      console.log("Usage:");
      console.log("  tokid analyze-samples [--wordlist-size N]");
      console.log("  tokid analyze-words <file>");
  }
}

main();
