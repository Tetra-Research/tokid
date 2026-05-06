# Tokenizer Vocabulary Study

This study dumps and classifies the full `tiktoken` vocabulary surface for the encodings currently in scope:

- `cl100k_base`
- `o200k_base`

Current command:

```bash
npm run analyze:vocab
```

Current outputs:

- `study/tokenizer-vocabulary/results/summary.json`
- `study/tokenizer-vocabulary/results/token_inventory.csv`
- `study/tokenizer-vocabulary/results/encoding_summary.csv`
- `study/tokenizer-vocabulary/results/overlap_summary.csv`

This study is intentionally narrower than the ID benchmark. It does not generate any identifiers. It answers a different question: what shape of atoms do these tokenizers already contain?

## Method

This pass is exhaustive, not sampled.

- `cl100k_base`: `100,256` token entries
- `o200k_base`: `199,998` token entries
- combined inventory scanned: `300,254` token entries

For every token returned by `tiktoken` `token_byte_values()`, the study records:

- raw bytes
- UTF-8 decodability
- ASCII / printable ASCII status
- whitespace behavior
- identifier-oriented classes
- URL-segment-safe classes
- separator usage
- decoded length

The current classification rules are intentionally simple, and they classify token atoms rather than full standalone identifiers:

- `printable_atom`: printable ASCII without whitespace, `^[\x21-\x7e]+$`
- `identifier_safe`: conservative ASCII identifier charset, `^[A-Za-z0-9_]+$`
- `portable_code_safe`: starts with letter or underscore, then ASCII identifier chars, `^[A-Za-z_][A-Za-z0-9_]*$`
- `lower_snake_safe`: lowercase/digit/underscore atoms, `^[a-z0-9_]+$`
- `slug_safe`: lowercase/digit/hyphen atoms, `^[a-z0-9-]+$`
- `url_segment_safe`: URL segment charset, `^[A-Za-z0-9._~-]+$`
- `digit_only`: `^[0-9]+$`
- `hex_like`: `^[0-9a-f]+$`

## Inventory Snapshot

The first result is that `o200k_base` is much larger, but proportionally much less atom-dense for identifier use.

| encoding | total | printable ascii | printable atom | identifier safe | portable code safe | lower snake safe | slug safe | url segment safe |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `cl100k_base` | 100,256 | 91,781 (`91.5%`) | 49,315 (`49.2%`) | 33,869 (`33.8%`) | 32,759 (`32.7%`) | 21,210 (`21.2%`) | 19,504 (`19.5%`) | 41,541 (`41.4%`) |
| `o200k_base` | 199,998 | 125,643 (`62.8%`) | 56,438 (`28.2%`) | 43,128 (`21.6%`) | 42,018 (`21.0%`) | 29,513 (`14.8%`) | 28,618 (`14.3%`) | 49,572 (`24.8%`) |

What changed in practice:

- `o200k_base` adds `99,742` total tokens over `cl100k_base`
- only `33,862` of those additions are printable ASCII
- only `7,123` of those additions are `portable_code_safe`
- only `8,303` of those additions are `lower_snake_safe`
- only `9,114` of those additions are `slug_safe`
- only `9,259` of those additions are `identifier_safe`
- only `8,031` of those additions are `url_segment_safe`

So the newer vocabulary is not “twice as much identifier material.” It is mostly broader language and formatting coverage.

## Overlap

The two encodings share a large common core, but `o200k_base` has a much larger long tail.

| metric | count |
|---|---:|
| shared raw tokens | 85,033 |
| shared raw tokens as share of `cl100k_base` | `84.8%` |
| shared raw tokens as share of `o200k_base` | `42.5%` |
| shared printable ASCII tokens | 77,488 |
| shared printable atoms | 39,526 |
| shared identifier-safe tokens | 27,649 |
| shared portable-code-safe tokens | 26,539 |
| shared lower-snake-safe tokens | 18,133 |
| shared slug-safe tokens | 16,960 |
| shared URL-segment-safe tokens | 33,334 |
| `cl100k_base`-only raw tokens | 15,223 |
| `o200k_base`-only raw tokens | 114,965 |
| `cl100k_base`-only identifier-safe tokens | 6,220 |
| `o200k_base`-only identifier-safe tokens | 15,479 |

The unique tails are very different in character:

- `cl100k_base`-only tokens are relatively dense with ASCII-ish identifier material
- `o200k_base` adds far more raw tokens, but only `13.5%` of its unique tail is `identifier_safe`
- by contrast, `40.9%` of the `cl100k_base`-only tail is `identifier_safe`

Cross-encoding atom pool sizes, expressed as rough entropy ceilings per token choice:

| shared class | count | log2(count) |
|---|---:|---:|
| printable atom | 39,526 | `15.27` bits |
| URL-segment-safe | 33,334 | `15.02` bits |
| identifier-safe | 27,649 | `14.75` bits |
| portable-code-safe | 26,539 | `14.70` bits |
| lower-snake-safe | 18,133 | `14.15` bits |
| slug-safe | 16,960 | `14.05` bits |

Example shared identifier-safe atoms:

- `abcdefghijklmnopqrstuvwxyz`
- `ABCDEFGHIJKLMNOPQRSTUVWXYZ`
- `readystatechange`
- `Congratulations`
- `_authenticated`
- `Administration`

Example `cl100k_base`-only identifier-safe atoms:

- `NavigationItemSelectedListener`
- `DataGridViewTextBoxColumn`
- `InvalidOperationException`
- `IllegalArgumentException`
- `UIImagePickerController`
- `CppTypeDefinitionSizes`

Example `o200k_base`-only identifier-safe atoms:

- `Responsibilities`
- `Characteristics`
- `Instrumentation`
- `Recommendations`
- `Synchronization`
- `Qualifications`

Example shared lower-snake-safe atoms:

- `abcdefghijklmnopqrstuvwxyz`
- `readystatechange`
- `creativecommons`
- `_authenticated`
- `authentication`
- `implementation`

Example shared slug-safe atoms:

- `abcdefghijklmnopqrstuvwxyz`
- `readystatechange`
- `creativecommons`
- `authentication`
- `classification`
- long hyphen runs like `----------------`

## Integer Coverage

This is the most useful explanatory result for the earlier integer-ID benchmark.

Both encodings contain every decimal string from `0` to `999` as a single token:

| digit token length | `cl100k_base` | `o200k_base` |
|---|---:|---:|
| 1 | 10 | 10 |
| 2 | 100 | 100 |
| 3 | 1,000 | 1,000 |
| total | 1,110 | 1,110 |

That means the tokenizers have full direct coverage for all 1-digit, 2-digit, and 3-digit decimal chunks. This strongly explains why decimal integer IDs came out so cheap in the baseline study: long numbers can be assembled from a small number of 3-digit chunks.

There is no comparable deep coverage for longer standalone digit tokens in this inventory.

## Hex Coverage

Hex-like token coverage is much shallower than decimal coverage.

| hex-like token length | `cl100k_base` | `o200k_base` |
|---|---:|---:|
| 1 | 16 | 16 |
| 2 | 136 | 136 |
| 3 | 1,134 | 1,117 |
| 4 | 28 | 43 |
| 5 | 3 | 7 |
| 6 | 3 | 4 |
| 7 | 1 | 0 |
| 8 | 2 | 2 |
| total | 1,323 | 1,325 |

So the vocabularies do know a lot of short lowercase hex fragments, but coverage collapses quickly after length `3`. That lines up with the ID study result that `hex_32` remains expensive even though it is structurally simpler than a UUID.

## Shape Of Identifier Material

`cl100k_base` is denser with clean ASCII atoms:

| encoding | lower alpha | lower alnum | underscore-bearing | dot-bearing | slash-bearing | mixed case |
|---|---:|---:|---:|---:|---:|---:|
| `cl100k_base` | 16,795 | 17,905 | 5,694 | 6,503 | 1,607 | 25,948 |
| `o200k_base` | 25,790 | 26,900 | 4,421 | 5,083 | 1,522 | 29,860 |

Absolute counts are higher in `o200k_base`, but the ratios matter:

- `cl100k_base` is more ASCII-heavy and more URL/identifier-dense
- `o200k_base` adds more natural-language and multilingual surface than delimiter-rich ASCII surface
- both encodings contain very long repeated separator tokens, which helps explain why some punctuation-heavy strings compress unexpectedly well in specific spots

Longest lower-alpha examples:

- `cl100k_base`: `abcdefghijklmnopqrstuvwxyz`, `longleftrightarrow`, `htmlspecialchars`, `readystatechange`, `autoreleasepool`
- `o200k_base`: `abcdefghijklmnopqrstuvwxyz`, `readystatechange`, `creativecommons`, `rscheinlichkeit`, `authentication`

Longest identifier-safe examples:

- `cl100k_base`: `latesAutoresizingMaskIntoConstraints`, `NavigationItemSelectedListener`, `DataGridViewTextBoxColumn`
- `o200k_base`: `Responsibilities`, `Characteristics`, `Instrumentation`, `Synchronization`

Longest lower-snake-safe examples:

- `cl100k_base`: `abcdefghijklmnopqrstuvwxyz`, `longleftrightarrow`, `abcdefghijklmnop`, `htmlspecialchars`
- `o200k_base`: `abcdefghijklmnopqrstuvwxyz`, `readystatechange`, `informationen`, `sprechpartner`

Longest slug-safe examples:

- both encodings are dominated by very long hyphen runs before ordinary lexical atoms show up
- this is useful for compression analysis, but it means raw `slug_safe` counts overstate the supply of semantically clean slug words

## Current Read

- The baseline ID results were not just random behavior. The decimal advantage has a concrete vocabulary explanation: full `000`-through-`999` token coverage.
- `identifier_safe` was too coarse by itself. Breaking it into `portable_code_safe`, `lower_snake_safe`, and `slug_safe` shows a real drop as soon as you demand more practical formatting constraints.
- `o200k_base` is much bigger, but not proportionally better for identifier design. It broadens coverage more than it densifies portable identifier atoms.
- `cl100k_base` remains a better “shape model” for ASCII-ish identifiers than raw vocabulary size alone would suggest.
- `slug_safe` looks especially misleading if you just count matches, because long runs of `-` take up a lot of that budget.
- Hex-heavy formats are structurally disadvantaged because the vocabulary’s hex coverage is shallow relative to decimal coverage.
- The next useful follow-up is probably a context study for these atoms:
  bare token, JSON string, URL path segment, query parameter, markdown, and log line.
