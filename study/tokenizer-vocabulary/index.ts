import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get_encoding, type Tiktoken, type TiktokenEncoding } from "tiktoken";

const ENCODINGS: TiktokenEncoding[] = ["cl100k_base", "o200k_base"];
const DEFAULT_RESULTS_DIR = "study/tokenizer-vocabulary/results";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

type TokenRecord = {
  encoding: TiktokenEncoding;
  tokenId: number;
  rawBytesBase64: string;
  utf8Text: string | null;
  displayText: string;
  byteLength: number;
  charLength: number | null;
  isUtf8: boolean;
  isAscii: boolean;
  isPrintableAscii: boolean;
  hasLeadingSpace: boolean;
  hasTrailingSpace: boolean;
  containsWhitespace: boolean;
  isLowerAlpha: boolean;
  isLowerAlnum: boolean;
  isUpperAlpha: boolean;
  isAlpha: boolean;
  isAlnum: boolean;
  isDigitOnly: boolean;
  isHexLike: boolean;
  isPrintableAtom: boolean;
  isIdentifierSafe: boolean;
  isPortableCodeSafe: boolean;
  isLowerSnakeSafe: boolean;
  isSlugSafe: boolean;
  isUrlSegmentSafe: boolean;
  containsHyphen: boolean;
  containsUnderscore: boolean;
  containsSlash: boolean;
  containsDot: boolean;
  containsMixedCase: boolean;
};

type CountByLength = Array<{
  length: number;
  count: number;
}>;

type ExampleRecord = {
  tokenId: number;
  text: string;
  charLength: number;
};

type EncodingSummary = {
  encoding: TiktokenEncoding;
  totalTokens: number;
  utf8Tokens: number;
  asciiTokens: number;
  printableAsciiTokens: number;
  leadingSpaceTokens: number;
  trailingSpaceTokens: number;
  whitespaceTokens: number;
  lowerAlphaTokens: number;
  lowerAlnumTokens: number;
  upperAlphaTokens: number;
  alphaTokens: number;
  alnumTokens: number;
  digitOnlyTokens: number;
  hexLikeTokens: number;
  printableAtomTokens: number;
  identifierSafeTokens: number;
  portableCodeSafeTokens: number;
  lowerSnakeSafeTokens: number;
  slugSafeTokens: number;
  urlSegmentSafeTokens: number;
  containsHyphenTokens: number;
  containsUnderscoreTokens: number;
  containsSlashTokens: number;
  containsDotTokens: number;
  mixedCaseTokens: number;
  maxPrintableAsciiChars: number;
  maxPrintableAtomChars: number;
  maxIdentifierSafeChars: number;
  maxPortableCodeSafeChars: number;
  maxLowerSnakeSafeChars: number;
  maxSlugSafeChars: number;
  maxUrlSegmentSafeChars: number;
  printableAsciiCharLength: CountByLength;
  digitOnlyCharLength: CountByLength;
  hexLikeCharLength: CountByLength;
  printableAtomCharLength: CountByLength;
  identifierSafeCharLength: CountByLength;
  portableCodeSafeCharLength: CountByLength;
  lowerSnakeSafeCharLength: CountByLength;
  slugSafeCharLength: CountByLength;
  longestPrintableAtom: ExampleRecord[];
  longestIdentifierSafe: ExampleRecord[];
  longestPortableCodeSafe: ExampleRecord[];
  longestLowerSnakeSafe: ExampleRecord[];
  longestSlugSafe: ExampleRecord[];
  longestUrlSegmentSafe: ExampleRecord[];
  longestLowerAlpha: ExampleRecord[];
  longestDigitOnly: ExampleRecord[];
};

type OverlapSummary = {
  totalSharedRawTokens: number;
  sharedUtf8Tokens: number;
  sharedPrintableAsciiTokens: number;
  sharedPrintableAtomTokens: number;
  sharedIdentifierSafeTokens: number;
  sharedPortableCodeSafeTokens: number;
  sharedLowerSnakeSafeTokens: number;
  sharedSlugSafeTokens: number;
  sharedUrlSegmentSafeTokens: number;
  sharedDigitOnlyTokens: number;
  sharedHexLikeTokens: number;
  cl100kOnlyRawTokens: number;
  o200kOnlyRawTokens: number;
  cl100kOnlyPrintableAtomTokens: number;
  o200kOnlyPrintableAtomTokens: number;
  cl100kOnlyIdentifierSafeTokens: number;
  cl100kOnlyPortableCodeSafeTokens: number;
  cl100kOnlyLowerSnakeSafeTokens: number;
  cl100kOnlySlugSafeTokens: number;
  o200kOnlyIdentifierSafeTokens: number;
  o200kOnlyPortableCodeSafeTokens: number;
  o200kOnlyLowerSnakeSafeTokens: number;
  o200kOnlySlugSafeTokens: number;
  cl100kOnlyUrlSegmentSafeTokens: number;
  o200kOnlyUrlSegmentSafeTokens: number;
  sharedPrintableAtomExamples: string[];
  sharedIdentifierSafeExamples: string[];
  sharedPortableCodeSafeExamples: string[];
  sharedLowerSnakeSafeExamples: string[];
  sharedSlugSafeExamples: string[];
  cl100kOnlyIdentifierSafeExamples: string[];
  cl100kOnlyPortableCodeSafeExamples: string[];
  cl100kOnlyLowerSnakeSafeExamples: string[];
  cl100kOnlySlugSafeExamples: string[];
  o200kOnlyIdentifierSafeExamples: string[];
  o200kOnlyPortableCodeSafeExamples: string[];
  o200kOnlyLowerSnakeSafeExamples: string[];
  o200kOnlySlugSafeExamples: string[];
};

type StudyOutput = {
  generatedAt: string;
  encodings: TiktokenEncoding[];
  summaries: EncodingSummary[];
  overlap: OverlapSummary;
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

function isAsciiBytes(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte < 0x80);
}

function isPrintableAsciiText(text: string): boolean {
  return /^[\x20-\x7e]+$/.test(text);
}

function countByLength(records: TokenRecord[], predicate: (record: TokenRecord) => boolean): CountByLength {
  const counts = new Map<number, number>();

  for (const record of records) {
    if (!predicate(record) || record.charLength === null) {
      continue;
    }

    counts.set(record.charLength, (counts.get(record.charLength) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([length, count]) => ({ length, count }));
}

function topExamples(records: TokenRecord[], predicate: (record: TokenRecord) => boolean, limit = 15): ExampleRecord[] {
  return records
    .filter((record) => predicate(record) && record.charLength !== null)
    .sort((left, right) => {
      const charDelta = (right.charLength ?? 0) - (left.charLength ?? 0);
      if (charDelta !== 0) {
        return charDelta;
      }

      return left.tokenId - right.tokenId;
    })
    .slice(0, limit)
    .map((record) => ({
      tokenId: record.tokenId,
      text: record.displayText,
      charLength: record.charLength ?? 0,
    }));
}

function buildTokenRecord(encoding: TiktokenEncoding, tokenId: number, bytes: Uint8Array): TokenRecord {
  const utf8Text = safeDecode(bytes);
  const displayText = utf8Text === null ? `<bytes:${Buffer.from(bytes).toString("base64")}>` : escapeDisplay(utf8Text);
  const isAscii = isAsciiBytes(bytes);
  const isUtf8 = utf8Text !== null;
  const isPrintableAscii = utf8Text !== null && isPrintableAsciiText(utf8Text);
  const charLength = utf8Text === null ? null : [...utf8Text].length;

  const hasLeadingSpace = utf8Text !== null && utf8Text.startsWith(" ");
  const hasTrailingSpace = utf8Text !== null && utf8Text.endsWith(" ");
  const containsWhitespace = utf8Text !== null && /\s/.test(utf8Text);
  const isLowerAlpha = utf8Text !== null && /^[a-z]+$/.test(utf8Text);
  const isLowerAlnum = utf8Text !== null && /^[a-z0-9]+$/.test(utf8Text);
  const isUpperAlpha = utf8Text !== null && /^[A-Z]+$/.test(utf8Text);
  const isAlpha = utf8Text !== null && /^[A-Za-z]+$/.test(utf8Text);
  const isAlnum = utf8Text !== null && /^[A-Za-z0-9]+$/.test(utf8Text);
  const isDigitOnly = utf8Text !== null && /^[0-9]+$/.test(utf8Text);
  const isHexLike = utf8Text !== null && /^[0-9a-f]+$/.test(utf8Text);
  const isPrintableAtom = utf8Text !== null && /^[\x21-\x7e]+$/.test(utf8Text);
  const isIdentifierSafe = utf8Text !== null && /^[A-Za-z0-9_]+$/.test(utf8Text);
  const isPortableCodeSafe = utf8Text !== null && /^[A-Za-z_][A-Za-z0-9_]*$/.test(utf8Text);
  const isLowerSnakeSafe = utf8Text !== null && /^[a-z0-9_]+$/.test(utf8Text);
  const isSlugSafe = utf8Text !== null && /^[a-z0-9-]+$/.test(utf8Text);
  const isUrlSegmentSafe = utf8Text !== null && /^[A-Za-z0-9._~-]+$/.test(utf8Text);
  const containsHyphen = utf8Text !== null && utf8Text.includes("-");
  const containsUnderscore = utf8Text !== null && utf8Text.includes("_");
  const containsSlash = utf8Text !== null && utf8Text.includes("/");
  const containsDot = utf8Text !== null && utf8Text.includes(".");
  const containsMixedCase =
    utf8Text !== null && /[a-z]/.test(utf8Text) && /[A-Z]/.test(utf8Text);

  return {
    encoding,
    tokenId,
    rawBytesBase64: Buffer.from(bytes).toString("base64"),
    utf8Text,
    displayText,
    byteLength: bytes.length,
    charLength,
    isUtf8,
    isAscii,
    isPrintableAscii,
    hasLeadingSpace,
    hasTrailingSpace,
    containsWhitespace,
    isLowerAlpha,
    isLowerAlnum,
    isUpperAlpha,
    isAlpha,
    isAlnum,
    isDigitOnly,
    isHexLike,
    isPrintableAtom,
    isIdentifierSafe,
    isPortableCodeSafe,
    isLowerSnakeSafe,
    isSlugSafe,
    isUrlSegmentSafe,
    containsHyphen,
    containsUnderscore,
    containsSlash,
    containsDot,
    containsMixedCase,
  };
}

function summarizeEncoding(encoding: TiktokenEncoding, records: TokenRecord[]): EncodingSummary {
  const printableAsciiCharLength = countByLength(records, (record) => record.isPrintableAscii);
  const digitOnlyCharLength = countByLength(records, (record) => record.isDigitOnly);
  const hexLikeCharLength = countByLength(records, (record) => record.isHexLike);
  const printableAtomCharLength = countByLength(records, (record) => record.isPrintableAtom);
  const identifierSafeCharLength = countByLength(records, (record) => record.isIdentifierSafe);
  const portableCodeSafeCharLength = countByLength(records, (record) => record.isPortableCodeSafe);
  const lowerSnakeSafeCharLength = countByLength(records, (record) => record.isLowerSnakeSafe);
  const slugSafeCharLength = countByLength(records, (record) => record.isSlugSafe);

  const printableAsciiLengths = printableAsciiCharLength.map((entry) => entry.length);
  const printableAtomLengths = printableAtomCharLength.map((entry) => entry.length);
  const identifierSafeLengths = identifierSafeCharLength.map((entry) => entry.length);
  const portableCodeSafeLengths = portableCodeSafeCharLength.map((entry) => entry.length);
  const lowerSnakeSafeLengths = lowerSnakeSafeCharLength.map((entry) => entry.length);
  const slugSafeLengths = slugSafeCharLength.map((entry) => entry.length);
  const urlSafeLengths = records
    .filter((record) => record.isUrlSegmentSafe && record.charLength !== null)
    .map((record) => record.charLength ?? 0);

  return {
    encoding,
    totalTokens: records.length,
    utf8Tokens: records.filter((record) => record.isUtf8).length,
    asciiTokens: records.filter((record) => record.isAscii).length,
    printableAsciiTokens: records.filter((record) => record.isPrintableAscii).length,
    leadingSpaceTokens: records.filter((record) => record.hasLeadingSpace).length,
    trailingSpaceTokens: records.filter((record) => record.hasTrailingSpace).length,
    whitespaceTokens: records.filter((record) => record.containsWhitespace).length,
    lowerAlphaTokens: records.filter((record) => record.isLowerAlpha).length,
    lowerAlnumTokens: records.filter((record) => record.isLowerAlnum).length,
    upperAlphaTokens: records.filter((record) => record.isUpperAlpha).length,
    alphaTokens: records.filter((record) => record.isAlpha).length,
    alnumTokens: records.filter((record) => record.isAlnum).length,
    digitOnlyTokens: records.filter((record) => record.isDigitOnly).length,
    hexLikeTokens: records.filter((record) => record.isHexLike).length,
    printableAtomTokens: records.filter((record) => record.isPrintableAtom).length,
    identifierSafeTokens: records.filter((record) => record.isIdentifierSafe).length,
    portableCodeSafeTokens: records.filter((record) => record.isPortableCodeSafe).length,
    lowerSnakeSafeTokens: records.filter((record) => record.isLowerSnakeSafe).length,
    slugSafeTokens: records.filter((record) => record.isSlugSafe).length,
    urlSegmentSafeTokens: records.filter((record) => record.isUrlSegmentSafe).length,
    containsHyphenTokens: records.filter((record) => record.containsHyphen).length,
    containsUnderscoreTokens: records.filter((record) => record.containsUnderscore).length,
    containsSlashTokens: records.filter((record) => record.containsSlash).length,
    containsDotTokens: records.filter((record) => record.containsDot).length,
    mixedCaseTokens: records.filter((record) => record.containsMixedCase).length,
    maxPrintableAsciiChars: printableAsciiLengths.length === 0 ? 0 : Math.max(...printableAsciiLengths),
    maxPrintableAtomChars: printableAtomLengths.length === 0 ? 0 : Math.max(...printableAtomLengths),
    maxIdentifierSafeChars: identifierSafeLengths.length === 0 ? 0 : Math.max(...identifierSafeLengths),
    maxPortableCodeSafeChars: portableCodeSafeLengths.length === 0 ? 0 : Math.max(...portableCodeSafeLengths),
    maxLowerSnakeSafeChars: lowerSnakeSafeLengths.length === 0 ? 0 : Math.max(...lowerSnakeSafeLengths),
    maxSlugSafeChars: slugSafeLengths.length === 0 ? 0 : Math.max(...slugSafeLengths),
    maxUrlSegmentSafeChars: urlSafeLengths.length === 0 ? 0 : Math.max(...urlSafeLengths),
    printableAsciiCharLength,
    digitOnlyCharLength,
    hexLikeCharLength,
    printableAtomCharLength,
    identifierSafeCharLength,
    portableCodeSafeCharLength,
    lowerSnakeSafeCharLength,
    slugSafeCharLength,
    longestPrintableAtom: topExamples(records, (record) => record.isPrintableAtom),
    longestIdentifierSafe: topExamples(records, (record) => record.isIdentifierSafe),
    longestPortableCodeSafe: topExamples(records, (record) => record.isPortableCodeSafe),
    longestLowerSnakeSafe: topExamples(records, (record) => record.isLowerSnakeSafe),
    longestSlugSafe: topExamples(records, (record) => record.isSlugSafe),
    longestUrlSegmentSafe: topExamples(records, (record) => record.isUrlSegmentSafe),
    longestLowerAlpha: topExamples(records, (record) => record.isLowerAlpha),
    longestDigitOnly: topExamples(records, (record) => record.isDigitOnly),
  };
}

function sharedExamples(values: string[], limit = 15): string[] {
  return values
    .sort((left, right) => {
      const lengthDelta = right.length - left.length;
      if (lengthDelta !== 0) {
        return lengthDelta;
      }

      return left.localeCompare(right);
    })
    .slice(0, limit)
    .map((value) => escapeDisplay(value));
}

function buildOverlapSummary(
  cl100kRecords: TokenRecord[],
  o200kRecords: TokenRecord[],
): OverlapSummary {
  const cl100kByBytes = new Map(cl100kRecords.map((record) => [record.rawBytesBase64, record]));
  const o200kByBytes = new Map(o200kRecords.map((record) => [record.rawBytesBase64, record]));

  const cl100kKeys = new Set(cl100kByBytes.keys());
  const o200kKeys = new Set(o200kByBytes.keys());
  const sharedKeys = [...cl100kKeys].filter((key) => o200kKeys.has(key));

  const sharedPairs = sharedKeys.map((key) => [cl100kByBytes.get(key)!, o200kByBytes.get(key)!] as const);
  const cl100kOnly = [...cl100kByBytes.values()].filter((record) => !o200kKeys.has(record.rawBytesBase64));
  const o200kOnly = [...o200kByBytes.values()].filter((record) => !cl100kKeys.has(record.rawBytesBase64));

  const sharedIdentifierTexts = sharedPairs
    .filter(([left, right]) => left.isIdentifierSafe && right.isIdentifierSafe && left.utf8Text !== null)
    .map(([left]) => left.utf8Text!);
  const sharedPortableCodeSafeTexts = sharedPairs
    .filter(([left, right]) => left.isPortableCodeSafe && right.isPortableCodeSafe && left.utf8Text !== null)
    .map(([left]) => left.utf8Text!);
  const sharedLowerSnakeSafeTexts = sharedPairs
    .filter(([left, right]) => left.isLowerSnakeSafe && right.isLowerSnakeSafe && left.utf8Text !== null)
    .map(([left]) => left.utf8Text!);
  const sharedSlugSafeTexts = sharedPairs
    .filter(([left, right]) => left.isSlugSafe && right.isSlugSafe && left.utf8Text !== null)
    .map(([left]) => left.utf8Text!);
  const sharedPrintableAtomTexts = sharedPairs
    .filter(([left, right]) => left.isPrintableAtom && right.isPrintableAtom && left.utf8Text !== null)
    .map(([left]) => left.utf8Text!);

  const cl100kOnlyIdentifierTexts = cl100kOnly
    .filter((record) => record.isIdentifierSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);
  const cl100kOnlyPortableCodeSafeTexts = cl100kOnly
    .filter((record) => record.isPortableCodeSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);
  const cl100kOnlyLowerSnakeSafeTexts = cl100kOnly
    .filter((record) => record.isLowerSnakeSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);
  const cl100kOnlySlugSafeTexts = cl100kOnly
    .filter((record) => record.isSlugSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);

  const o200kOnlyIdentifierTexts = o200kOnly
    .filter((record) => record.isIdentifierSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);
  const o200kOnlyPortableCodeSafeTexts = o200kOnly
    .filter((record) => record.isPortableCodeSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);
  const o200kOnlyLowerSnakeSafeTexts = o200kOnly
    .filter((record) => record.isLowerSnakeSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);
  const o200kOnlySlugSafeTexts = o200kOnly
    .filter((record) => record.isSlugSafe && record.utf8Text !== null)
    .map((record) => record.utf8Text!);

  return {
    totalSharedRawTokens: sharedPairs.length,
    sharedUtf8Tokens: sharedPairs.filter(([left, right]) => left.isUtf8 && right.isUtf8).length,
    sharedPrintableAsciiTokens: sharedPairs.filter(([left, right]) => left.isPrintableAscii && right.isPrintableAscii).length,
    sharedPrintableAtomTokens: sharedPairs.filter(([left, right]) => left.isPrintableAtom && right.isPrintableAtom).length,
    sharedIdentifierSafeTokens: sharedPairs.filter(([left, right]) => left.isIdentifierSafe && right.isIdentifierSafe).length,
    sharedPortableCodeSafeTokens: sharedPairs.filter(([left, right]) => left.isPortableCodeSafe && right.isPortableCodeSafe).length,
    sharedLowerSnakeSafeTokens: sharedPairs.filter(([left, right]) => left.isLowerSnakeSafe && right.isLowerSnakeSafe).length,
    sharedSlugSafeTokens: sharedPairs.filter(([left, right]) => left.isSlugSafe && right.isSlugSafe).length,
    sharedUrlSegmentSafeTokens: sharedPairs.filter(([left, right]) => left.isUrlSegmentSafe && right.isUrlSegmentSafe).length,
    sharedDigitOnlyTokens: sharedPairs.filter(([left, right]) => left.isDigitOnly && right.isDigitOnly).length,
    sharedHexLikeTokens: sharedPairs.filter(([left, right]) => left.isHexLike && right.isHexLike).length,
    cl100kOnlyRawTokens: cl100kOnly.length,
    o200kOnlyRawTokens: o200kOnly.length,
    cl100kOnlyPrintableAtomTokens: cl100kOnly.filter((record) => record.isPrintableAtom).length,
    o200kOnlyPrintableAtomTokens: o200kOnly.filter((record) => record.isPrintableAtom).length,
    cl100kOnlyIdentifierSafeTokens: cl100kOnly.filter((record) => record.isIdentifierSafe).length,
    cl100kOnlyPortableCodeSafeTokens: cl100kOnly.filter((record) => record.isPortableCodeSafe).length,
    cl100kOnlyLowerSnakeSafeTokens: cl100kOnly.filter((record) => record.isLowerSnakeSafe).length,
    cl100kOnlySlugSafeTokens: cl100kOnly.filter((record) => record.isSlugSafe).length,
    o200kOnlyIdentifierSafeTokens: o200kOnly.filter((record) => record.isIdentifierSafe).length,
    o200kOnlyPortableCodeSafeTokens: o200kOnly.filter((record) => record.isPortableCodeSafe).length,
    o200kOnlyLowerSnakeSafeTokens: o200kOnly.filter((record) => record.isLowerSnakeSafe).length,
    o200kOnlySlugSafeTokens: o200kOnly.filter((record) => record.isSlugSafe).length,
    cl100kOnlyUrlSegmentSafeTokens: cl100kOnly.filter((record) => record.isUrlSegmentSafe).length,
    o200kOnlyUrlSegmentSafeTokens: o200kOnly.filter((record) => record.isUrlSegmentSafe).length,
    sharedPrintableAtomExamples: sharedExamples(sharedPrintableAtomTexts),
    sharedIdentifierSafeExamples: sharedExamples(sharedIdentifierTexts),
    sharedPortableCodeSafeExamples: sharedExamples(sharedPortableCodeSafeTexts),
    sharedLowerSnakeSafeExamples: sharedExamples(sharedLowerSnakeSafeTexts),
    sharedSlugSafeExamples: sharedExamples(sharedSlugSafeTexts),
    cl100kOnlyIdentifierSafeExamples: sharedExamples(cl100kOnlyIdentifierTexts),
    cl100kOnlyPortableCodeSafeExamples: sharedExamples(cl100kOnlyPortableCodeSafeTexts),
    cl100kOnlyLowerSnakeSafeExamples: sharedExamples(cl100kOnlyLowerSnakeSafeTexts),
    cl100kOnlySlugSafeExamples: sharedExamples(cl100kOnlySlugSafeTexts),
    o200kOnlyIdentifierSafeExamples: sharedExamples(o200kOnlyIdentifierTexts),
    o200kOnlyPortableCodeSafeExamples: sharedExamples(o200kOnlyPortableCodeSafeTexts),
    o200kOnlyLowerSnakeSafeExamples: sharedExamples(o200kOnlyLowerSnakeSafeTexts),
    o200kOnlySlugSafeExamples: sharedExamples(o200kOnlySlugSafeTexts),
  };
}

function renderCsvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function renderInventoryCsv(records: TokenRecord[]): string {
  const header = [
    "encoding",
    "token_id",
    "raw_bytes_base64",
    "utf8_text",
    "display_text",
    "byte_length",
    "char_length",
    "is_utf8",
    "is_ascii",
    "is_printable_ascii",
    "has_leading_space",
    "has_trailing_space",
    "contains_whitespace",
    "is_lower_alpha",
    "is_lower_alnum",
    "is_upper_alpha",
    "is_alpha",
    "is_alnum",
    "is_digit_only",
    "is_hex_like",
    "is_printable_atom",
    "is_identifier_safe",
    "is_portable_code_safe",
    "is_lower_snake_safe",
    "is_slug_safe",
    "is_url_segment_safe",
    "contains_hyphen",
    "contains_underscore",
    "contains_slash",
    "contains_dot",
    "contains_mixed_case",
  ];

  const rows = records.map((record) =>
    [
      record.encoding,
      record.tokenId,
      record.rawBytesBase64,
      record.utf8Text,
      record.displayText,
      record.byteLength,
      record.charLength,
      record.isUtf8,
      record.isAscii,
      record.isPrintableAscii,
      record.hasLeadingSpace,
      record.hasTrailingSpace,
      record.containsWhitespace,
      record.isLowerAlpha,
      record.isLowerAlnum,
      record.isUpperAlpha,
      record.isAlpha,
      record.isAlnum,
      record.isDigitOnly,
      record.isHexLike,
      record.isPrintableAtom,
      record.isIdentifierSafe,
      record.isPortableCodeSafe,
      record.isLowerSnakeSafe,
      record.isSlugSafe,
      record.isUrlSegmentSafe,
      record.containsHyphen,
      record.containsUnderscore,
      record.containsSlash,
      record.containsDot,
      record.containsMixedCase,
    ]
      .map(renderCsvCell)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

function renderSummaryCsv(summaries: EncodingSummary[]): string {
  const header = [
    "encoding",
    "total_tokens",
    "utf8_tokens",
    "ascii_tokens",
    "printable_ascii_tokens",
    "leading_space_tokens",
    "trailing_space_tokens",
    "whitespace_tokens",
    "lower_alpha_tokens",
    "lower_alnum_tokens",
    "upper_alpha_tokens",
    "alpha_tokens",
    "alnum_tokens",
    "digit_only_tokens",
    "hex_like_tokens",
    "printable_atom_tokens",
    "identifier_safe_tokens",
    "portable_code_safe_tokens",
    "lower_snake_safe_tokens",
    "slug_safe_tokens",
    "url_segment_safe_tokens",
    "contains_hyphen_tokens",
    "contains_underscore_tokens",
    "contains_slash_tokens",
    "contains_dot_tokens",
    "mixed_case_tokens",
    "max_printable_ascii_chars",
    "max_printable_atom_chars",
    "max_identifier_safe_chars",
    "max_portable_code_safe_chars",
    "max_lower_snake_safe_chars",
    "max_slug_safe_chars",
    "max_url_segment_safe_chars",
  ];

  const rows = summaries.map((summary) =>
    [
      summary.encoding,
      summary.totalTokens,
      summary.utf8Tokens,
      summary.asciiTokens,
      summary.printableAsciiTokens,
      summary.leadingSpaceTokens,
      summary.trailingSpaceTokens,
      summary.whitespaceTokens,
      summary.lowerAlphaTokens,
      summary.lowerAlnumTokens,
      summary.upperAlphaTokens,
      summary.alphaTokens,
      summary.alnumTokens,
      summary.digitOnlyTokens,
      summary.hexLikeTokens,
      summary.printableAtomTokens,
      summary.identifierSafeTokens,
      summary.portableCodeSafeTokens,
      summary.lowerSnakeSafeTokens,
      summary.slugSafeTokens,
      summary.urlSegmentSafeTokens,
      summary.containsHyphenTokens,
      summary.containsUnderscoreTokens,
      summary.containsSlashTokens,
      summary.containsDotTokens,
      summary.mixedCaseTokens,
      summary.maxPrintableAsciiChars,
      summary.maxPrintableAtomChars,
      summary.maxIdentifierSafeChars,
      summary.maxPortableCodeSafeChars,
      summary.maxLowerSnakeSafeChars,
      summary.maxSlugSafeChars,
      summary.maxUrlSegmentSafeChars,
    ]
      .map(renderCsvCell)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

function renderOverlapCsv(overlap: OverlapSummary): string {
  const header = ["metric", "value"];
  const rows = Object.entries(overlap).map(([metric, value]) =>
    [renderCsvCell(metric), renderCsvCell(Array.isArray(value) ? value.join(" | ") : value)].join(","),
  );

  return [header.join(","), ...rows].join("\n");
}

function collectRecords(encoding: TiktokenEncoding): TokenRecord[] {
  const encoder: Tiktoken = get_encoding(encoding);

  try {
    return encoder
      .token_byte_values()
      .map((bytes, tokenId) => buildTokenRecord(encoding, tokenId, Uint8Array.from(bytes)));
  } finally {
    encoder.free();
  }
}

function parseArgs(argv: string[]): { command: string; resultsDir: string } {
  const [command = "run", maybeResultsDir] = argv;
  return {
    command,
    resultsDir: maybeResultsDir ?? DEFAULT_RESULTS_DIR,
  };
}

function groupRecordsByEncoding(records: TokenRecord[]): Record<TiktokenEncoding, TokenRecord[]> {
  return records.reduce<Record<TiktokenEncoding, TokenRecord[]>>(
    (groups, record) => {
      groups[record.encoding].push(record);
      return groups;
    },
    {
      cl100k_base: [],
      o200k_base: [],
      gpt2: [],
      p50k_base: [],
      p50k_edit: [],
      r50k_base: [],
    },
  );
}

function main(): void {
  const { command, resultsDir } = parseArgs(process.argv.slice(2));

  if (command !== "run") {
    throw new Error(`Unknown command: ${command}`);
  }

  const allRecords = ENCODINGS.flatMap((encoding) => collectRecords(encoding));
  const grouped = groupRecordsByEncoding(allRecords);

  const summaries = ENCODINGS.map((encoding) => summarizeEncoding(encoding, grouped[encoding]));
  const overlap = buildOverlapSummary(grouped.cl100k_base, grouped.o200k_base);

  const output: StudyOutput = {
    generatedAt: new Date().toISOString(),
    encodings: ENCODINGS,
    summaries,
    overlap,
  };

  const outputDir = resolve(resultsDir);
  mkdirSync(outputDir, { recursive: true });

  writeFileSync(resolve(outputDir, "summary.json"), JSON.stringify(output, null, 2) + "\n");
  writeFileSync(resolve(outputDir, "token_inventory.csv"), renderInventoryCsv(allRecords) + "\n");
  writeFileSync(resolve(outputDir, "encoding_summary.csv"), renderSummaryCsv(summaries) + "\n");
  writeFileSync(resolve(outputDir, "overlap_summary.csv"), renderOverlapCsv(overlap) + "\n");
}

main();
