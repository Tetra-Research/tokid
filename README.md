# tokid

`tokid` starts here as a measurement harness, not a claims document.

The first job is to prove:

- whether tokenizer-friendly IDs can materially beat UUIDs on token count
- how much entropy fits into a small number of single-token words
- which separator styles are cheapest in `tiktoken`
- what a plausible `tokurl` win looks like when UUID-heavy URLs are rewritten

## Commands

```bash
npm install
npm run analyze
npm run analyze:words
```

## Initial scope

- `analyze-samples`: compare UUIDs, hex, integers, candidate word IDs, and URL variants
- `analyze-words <file>`: inspect a word list and report which entries are single-token across encodings

## Current focus

OpenAI-style tokenization via `tiktoken`, using `cl100k_base` and `o200k_base`.

## First measurements

Using the current sample harness:

- UUID v4: `18` tokens in both `cl100k_base` and `o200k_base`
- 32-char hex string: `19` tokens
- Epoch seconds: `4` tokens
- Curated 3-word `tokid` with spaces (`clock river orange`): `3` tokens
- Same 3 words with hyphens: `4` tokens
- Curated 8-word `tokid` with spaces: `8` tokens
- Same 8 words with hyphens: `13` tokens
- UUID-heavy URL sample: `35` tokens
- `tokurl`-style rewrite sample: `10` tokens

Early conclusions:

- Curated vocabulary matters more than aesthetics.
- Hyphens are expensive enough that they need to justify themselves.
- URL path context can change tokenization, so `tokurl` needs its own measurements instead of assuming raw `tokid` behavior carries over.
