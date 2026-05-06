import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get_encoding, type Tiktoken, type TiktokenEncoding } from "tiktoken";

const ENCODINGS: TiktokenEncoding[] = ["cl100k_base", "o200k_base"];
const DEFAULT_RESULTS_DIR = "study/token-atom-scoring/results";
const DEFAULT_DICTIONARY_PATH = "/usr/share/dict/words";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const AMBIGUOUS_CHARS = /[0OIl1]/;
const VOWELS = /[aeiouy]/;

type SharedAtomRecord = {
  rawBytesBase64: string;
  utf8Text: string;
  displayText: string;
  byteLength: number;
  charLength: number;
  isPrintableAtom: boolean;
  isIdentifierSafe: boolean;
  isPortableCodeSafe: boolean;
  isLowerSnakeSafe: boolean;
  isSlugSafe: boolean;
  isUrlSegmentSafe: boolean;
  isLowerAlpha: boolean;
  isLowerAlnum: boolean;
  isDigitOnly: boolean;
  containsDigit: boolean;
  containsUnderscore: boolean;
  containsHyphen: boolean;
  containsDot: boolean;
  containsSlash: boolean;
  containsMixedCase: boolean;
  isSeparatorRun: boolean;
  hasAmbiguousChars: boolean;
  hasLongRepeat: boolean;
  maxRepeatedRun: number;
  maxConsonantRun: number;
  vowelCount: number;
  pronounceable: boolean;
  dictionaryExact: boolean;
  dictionaryCompoundSnake: boolean;
  dictionaryCompoundSlug: boolean;
  looksTechnical: boolean;
  readabilityScore: number;
  syntaxScore: number;
  pronounceabilityScore: number;
  ambiguityPenalty: number;
  wordFirstScore: number;
  balancedScore: number;
  maxDensityScore: number;
  includeWordFirst: boolean;
  includeBalanced: boolean;
  includeMaxDensity: boolean;
};

type PoolSummary = {
  name: "word_first" | "balanced" | "max_density";
  count: number;
  bitsPerToken: number;
  topExamples: string[];
};

type StudyOutput = {
  generatedAt: string;
  encodings: TiktokenEncoding[];
  dictionaryPath: string | null;
  dictionaryLoaded: boolean;
  sharedTokenCount: number;
  pools: PoolSummary[];
};

function safeDecode(bytes: Uint8Array): string | null {
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

function escapeDisplay(text: string): string {
  return JSON.stringify(text).slice(1, -1);
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
    if (/[a-z]/.test(char) && !VOWELS.test(char)) {
      current += 1;
    } else {
      current = 0;
    }

    best = Math.max(best, current);
  }

  return best;
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern, "g"))].length;
}

function loadDictionary(path: string): Set<string> {
  if (!existsSync(path)) {
    return new Set<string>();
  }

  const words = new Set<string>();
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const value = line.trim().toLowerCase();
    if (!/^[a-z]+$/.test(value)) {
      continue;
    }

    if (value.length < 3 || value.length > 24) {
      continue;
    }

    words.add(value);
  }

  return words;
}

function isDictionaryCompound(text: string, separator: "_" | "-", dictionary: Set<string>): boolean {
  const parts = text.split(separator);
  if (parts.length < 2) {
    return false;
  }

  return parts.every((part) => dictionary.has(part));
}

function computeReadabilityScore(record: {
  charLength: number;
  isLowerAlpha: boolean;
  isLowerSnakeSafe: boolean;
  isSlugSafe: boolean;
  containsDigit: boolean;
  containsUnderscore: boolean;
  containsHyphen: boolean;
  containsMixedCase: boolean;
  containsDot: boolean;
  containsSlash: boolean;
  isSeparatorRun: boolean;
  hasLongRepeat: boolean;
  dictionaryExact: boolean;
  dictionaryCompoundSnake: boolean;
  dictionaryCompoundSlug: boolean;
  looksTechnical: boolean;
}): number {
  let score = 0;

  if (record.dictionaryExact) {
    score += 30;
  } else if (record.dictionaryCompoundSnake || record.dictionaryCompoundSlug) {
    score += 18;
  }

  if (record.isLowerAlpha) {
    score += 16;
  } else if (record.isLowerSnakeSafe || record.isSlugSafe) {
    score += 8;
  }

  if (record.charLength >= 4 && record.charLength <= 10) {
    score += 14;
  } else if (record.charLength >= 3 && record.charLength <= 14) {
    score += 8;
  } else {
    score -= 8;
  }

  if (record.containsDigit) {
    score -= 8;
  }

  if (record.containsUnderscore || record.containsHyphen) {
    score -= 4;
  }

  if (record.containsMixedCase) {
    score -= 12;
  }

  if (record.containsDot || record.containsSlash) {
    score -= 12;
  }

  if (record.isSeparatorRun) {
    score -= 30;
  }

  if (record.hasLongRepeat) {
    score -= 12;
  }

  if (record.looksTechnical) {
    score -= 10;
  }

  return score;
}

function computeSyntaxScore(record: {
  isPrintableAtom: boolean;
  isIdentifierSafe: boolean;
  isPortableCodeSafe: boolean;
  isLowerSnakeSafe: boolean;
  isSlugSafe: boolean;
  isUrlSegmentSafe: boolean;
  containsDot: boolean;
  containsSlash: boolean;
  containsMixedCase: boolean;
}): number {
  let score = 0;

  if (record.isPrintableAtom) {
    score += 10;
  }

  if (record.isIdentifierSafe) {
    score += 12;
  }

  if (record.isPortableCodeSafe) {
    score += 10;
  }

  if (record.isLowerSnakeSafe) {
    score += 10;
  }

  if (record.isSlugSafe) {
    score += 8;
  }

  if (record.isUrlSegmentSafe) {
    score += 10;
  }

  if (record.containsDot || record.containsSlash) {
    score -= 12;
  }

  if (record.containsMixedCase) {
    score -= 8;
  }

  return score;
}

function computePronounceabilityScore(record: {
  isLowerAlpha: boolean;
  vowelCount: number;
  maxConsonantRun: number;
  charLength: number;
}): number {
  if (!record.isLowerAlpha) {
    return 0;
  }

  let score = 0;

  if (record.vowelCount >= 1) {
    score += 8;
  } else {
    score -= 12;
  }

  if (record.maxConsonantRun <= 4) {
    score += 8;
  } else {
    score -= 8;
  }

  if (record.charLength >= 4 && record.charLength <= 10) {
    score += 6;
  }

  return score;
}

function buildSharedAtomRecord(
  rawBytesBase64: string,
  text: string,
  dictionary: Set<string>,
): SharedAtomRecord {
  const charLength = [...text].length;
  const isPrintableAtom = /^[\x21-\x7e]+$/.test(text);
  const isIdentifierSafe = /^[A-Za-z0-9_]+$/.test(text);
  const isPortableCodeSafe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
  const isLowerSnakeSafe = /^[a-z0-9_]+$/.test(text);
  const isSlugSafe = /^[a-z0-9-]+$/.test(text);
  const isUrlSegmentSafe = /^[A-Za-z0-9._~-]+$/.test(text);
  const isLowerAlpha = /^[a-z]+$/.test(text);
  const isLowerAlnum = /^[a-z0-9]+$/.test(text);
  const isDigitOnly = /^[0-9]+$/.test(text);
  const containsDigit = /[0-9]/.test(text);
  const containsUnderscore = text.includes("_");
  const containsHyphen = text.includes("-");
  const containsDot = text.includes(".");
  const containsSlash = text.includes("/");
  const containsMixedCase = /[a-z]/.test(text) && /[A-Z]/.test(text);
  const isSeparatorRun = /^[-_.~]+$/.test(text);
  const repeatedRun = maxRepeatedRun(text);
  const hasLongRepeat = repeatedRun >= 4;
  const consonantRun = maxConsonantRun(text);
  const vowelCount = countMatches(text, /[aeiouy]/);
  const dictionaryExact = isLowerAlpha && dictionary.has(text);
  const dictionaryCompoundSnake = isLowerSnakeSafe && containsUnderscore && isDictionaryCompound(text, "_", dictionary);
  const dictionaryCompoundSlug = isSlugSafe && containsHyphen && isDictionaryCompound(text, "-", dictionary);
  const looksTechnical =
    containsMixedCase ||
    /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(text) ||
    /^_?[A-Z_]{4,}$/.test(text);
  const pronounceable =
    isLowerAlpha && vowelCount >= 1 && consonantRun <= 4 && !hasLongRepeat && charLength >= 4 && charLength <= 12;

  const readabilityScore = computeReadabilityScore({
    charLength,
    isLowerAlpha,
    isLowerSnakeSafe,
    isSlugSafe,
    containsDigit,
    containsUnderscore,
    containsHyphen,
    containsMixedCase,
    containsDot,
    containsSlash,
    isSeparatorRun,
    hasLongRepeat,
    dictionaryExact,
    dictionaryCompoundSnake,
    dictionaryCompoundSlug,
    looksTechnical,
  });

  const syntaxScore = computeSyntaxScore({
    isPrintableAtom,
    isIdentifierSafe,
    isPortableCodeSafe,
    isLowerSnakeSafe,
    isSlugSafe,
    isUrlSegmentSafe,
    containsDot,
    containsSlash,
    containsMixedCase,
  });

  const pronounceabilityScore = computePronounceabilityScore({
    isLowerAlpha,
    vowelCount,
    maxConsonantRun: consonantRun,
    charLength,
  });

  const ambiguityPenalty = AMBIGUOUS_CHARS.test(text) ? -10 : 0;

  const wordFirstScore =
    readabilityScore +
    syntaxScore +
    pronounceabilityScore +
    ambiguityPenalty +
    (dictionaryExact ? 25 : 0) +
    (isLowerAlpha ? 15 : -25) +
    (!containsDigit ? 5 : -10);

  const balancedScore =
    readabilityScore +
    syntaxScore +
    pronounceabilityScore +
    ambiguityPenalty +
    (isLowerSnakeSafe ? 12 : 0) +
    (isLowerAlnum ? 6 : 0) +
    (!containsDot && !containsSlash ? 6 : -8) +
    (!containsMixedCase ? 6 : -10);

  const maxDensityScore =
    readabilityScore +
    syntaxScore +
    ambiguityPenalty +
    (isUrlSegmentSafe ? 12 : 0) +
    Math.min(charLength, 12) +
    (!isSeparatorRun ? 8 : -20) +
    (!containsSlash ? 4 : -12);

  const includeWordFirst =
    dictionaryExact &&
    isLowerAlpha &&
    charLength >= 4 &&
    charLength <= 12 &&
    !hasLongRepeat &&
    !AMBIGUOUS_CHARS.test(text);

  const includeBalanced =
    (isLowerAlpha || isLowerSnakeSafe || isSlugSafe || isLowerAlnum) &&
    charLength >= 4 &&
    charLength <= 14 &&
    !containsDot &&
    !containsSlash &&
    !containsMixedCase &&
    !isSeparatorRun &&
    !hasLongRepeat &&
    !AMBIGUOUS_CHARS.test(text);

  const includeMaxDensity =
    isUrlSegmentSafe &&
    charLength >= 3 &&
    charLength <= 16 &&
    !containsSlash &&
    !isSeparatorRun &&
    !hasLongRepeat &&
    !AMBIGUOUS_CHARS.test(text);

  return {
    rawBytesBase64,
    utf8Text: text,
    displayText: escapeDisplay(text),
    byteLength: Buffer.from(text, "utf8").length,
    charLength,
    isPrintableAtom,
    isIdentifierSafe,
    isPortableCodeSafe,
    isLowerSnakeSafe,
    isSlugSafe,
    isUrlSegmentSafe,
    isLowerAlpha,
    isLowerAlnum,
    isDigitOnly,
    containsDigit,
    containsUnderscore,
    containsHyphen,
    containsDot,
    containsSlash,
    containsMixedCase,
    isSeparatorRun,
    hasAmbiguousChars: AMBIGUOUS_CHARS.test(text),
    hasLongRepeat,
    maxRepeatedRun: repeatedRun,
    maxConsonantRun: consonantRun,
    vowelCount,
    pronounceable,
    dictionaryExact,
    dictionaryCompoundSnake,
    dictionaryCompoundSlug,
    looksTechnical,
    readabilityScore,
    syntaxScore,
    pronounceabilityScore,
    ambiguityPenalty,
    wordFirstScore,
    balancedScore,
    maxDensityScore,
    includeWordFirst,
    includeBalanced,
    includeMaxDensity,
  };
}

function collectEncodingMap(encoding: TiktokenEncoding): Map<string, string> {
  const encoder: Tiktoken = get_encoding(encoding);

  try {
    return new Map(
      encoder
        .token_byte_values()
        .map((bytes) => Uint8Array.from(bytes))
        .map((bytes) => [Buffer.from(bytes).toString("base64"), safeDecode(bytes)] as const)
        .filter((entry): entry is [string, string] => entry[1] !== null),
    );
  } finally {
    encoder.free();
  }
}

function renderCsvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function renderCandidatesCsv(records: SharedAtomRecord[]): string {
  const header = [
    "utf8_text",
    "display_text",
    "raw_bytes_base64",
    "byte_length",
    "char_length",
    "is_printable_atom",
    "is_identifier_safe",
    "is_portable_code_safe",
    "is_lower_snake_safe",
    "is_slug_safe",
    "is_url_segment_safe",
    "is_lower_alpha",
    "is_lower_alnum",
    "is_digit_only",
    "contains_digit",
    "contains_underscore",
    "contains_hyphen",
    "contains_dot",
    "contains_slash",
    "contains_mixed_case",
    "is_separator_run",
    "has_ambiguous_chars",
    "has_long_repeat",
    "max_repeated_run",
    "max_consonant_run",
    "vowel_count",
    "pronounceable",
    "dictionary_exact",
    "dictionary_compound_snake",
    "dictionary_compound_slug",
    "looks_technical",
    "readability_score",
    "syntax_score",
    "pronounceability_score",
    "ambiguity_penalty",
    "word_first_score",
    "balanced_score",
    "max_density_score",
    "include_word_first",
    "include_balanced",
    "include_max_density",
  ];

  const rows = records.map((record) =>
    [
      record.utf8Text,
      record.displayText,
      record.rawBytesBase64,
      record.byteLength,
      record.charLength,
      record.isPrintableAtom,
      record.isIdentifierSafe,
      record.isPortableCodeSafe,
      record.isLowerSnakeSafe,
      record.isSlugSafe,
      record.isUrlSegmentSafe,
      record.isLowerAlpha,
      record.isLowerAlnum,
      record.isDigitOnly,
      record.containsDigit,
      record.containsUnderscore,
      record.containsHyphen,
      record.containsDot,
      record.containsSlash,
      record.containsMixedCase,
      record.isSeparatorRun,
      record.hasAmbiguousChars,
      record.hasLongRepeat,
      record.maxRepeatedRun,
      record.maxConsonantRun,
      record.vowelCount,
      record.pronounceable,
      record.dictionaryExact,
      record.dictionaryCompoundSnake,
      record.dictionaryCompoundSlug,
      record.looksTechnical,
      record.readabilityScore,
      record.syntaxScore,
      record.pronounceabilityScore,
      record.ambiguityPenalty,
      record.wordFirstScore,
      record.balancedScore,
      record.maxDensityScore,
      record.includeWordFirst,
      record.includeBalanced,
      record.includeMaxDensity,
    ]
      .map(renderCsvCell)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

function topPoolExamples(records: SharedAtomRecord[], scoreKey: keyof SharedAtomRecord, includeKey: keyof SharedAtomRecord, limit = 25): string[] {
  return records
    .filter((record) => record[includeKey] === true)
    .sort((left, right) => {
      const scoreDelta = Number(right[scoreKey]) - Number(left[scoreKey]);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      const lengthDelta = left.charLength - right.charLength;
      if (lengthDelta !== 0) {
        return lengthDelta;
      }

      return left.utf8Text.localeCompare(right.utf8Text);
    })
    .slice(0, limit)
    .map((record) => record.utf8Text);
}

function buildPoolSummary(
  name: PoolSummary["name"],
  records: SharedAtomRecord[],
  includeKey: keyof SharedAtomRecord,
  scoreKey: keyof SharedAtomRecord,
): PoolSummary {
  const included = records.filter((record) => record[includeKey] === true);

  return {
    name,
    count: included.length,
    bitsPerToken: included.length === 0 ? 0 : Math.log2(included.length),
    topExamples: topPoolExamples(records, scoreKey, includeKey),
  };
}

function parseArgs(argv: string[]): { command: string; resultsDir: string; dictionaryPath: string } {
  const [command = "run", maybeResultsDir, maybeDictionaryPath] = argv;
  return {
    command,
    resultsDir: maybeResultsDir ?? DEFAULT_RESULTS_DIR,
    dictionaryPath: maybeDictionaryPath ?? DEFAULT_DICTIONARY_PATH,
  };
}

function main(): void {
  const { command, resultsDir, dictionaryPath } = parseArgs(process.argv.slice(2));

  if (command !== "run") {
    throw new Error(`Unknown command: ${command}`);
  }

  const dictionary = loadDictionary(dictionaryPath);
  const encodingMaps = ENCODINGS.map((encoding) => collectEncodingMap(encoding));
  const sharedKeys = [...encodingMaps[0].keys()].filter((key) => encodingMaps.every((map) => map.has(key)));

  const records = sharedKeys
    .map((key) => {
      const text = encodingMaps[0].get(key);
      return text === undefined ? null : buildSharedAtomRecord(key, text, dictionary);
    })
    .filter((record): record is SharedAtomRecord => record !== null);

  records.sort((left, right) => left.utf8Text.localeCompare(right.utf8Text));

  const pools: PoolSummary[] = [
    buildPoolSummary("word_first", records, "includeWordFirst", "wordFirstScore"),
    buildPoolSummary("balanced", records, "includeBalanced", "balancedScore"),
    buildPoolSummary("max_density", records, "includeMaxDensity", "maxDensityScore"),
  ];

  const output: StudyOutput = {
    generatedAt: new Date().toISOString(),
    encodings: ENCODINGS,
    dictionaryPath: dictionary.size === 0 ? null : dictionaryPath,
    dictionaryLoaded: dictionary.size > 0,
    sharedTokenCount: records.length,
    pools,
  };

  const outputDir = resolve(resultsDir);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(resolve(outputDir, "summary.json"), JSON.stringify(output, null, 2) + "\n");
  writeFileSync(resolve(outputDir, "scored_candidates.csv"), renderCandidatesCsv(records) + "\n");

  for (const pool of pools) {
    const scoreKey =
      pool.name === "word_first" ? "wordFirstScore" : pool.name === "balanced" ? "balancedScore" : "maxDensityScore";
    const includeKey =
      pool.name === "word_first" ? "includeWordFirst" : pool.name === "balanced" ? "includeBalanced" : "includeMaxDensity";

    const poolList = records
      .filter((record) => record[includeKey] === true)
      .sort((left, right) => {
        const scoreDelta = Number(right[scoreKey]) - Number(left[scoreKey]);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        return left.utf8Text.localeCompare(right.utf8Text);
      })
      .map((record) => record.utf8Text)
      .join("\n");

    writeFileSync(resolve(outputDir, `${pool.name}.txt`), poolList + "\n");
  }
}

main();
