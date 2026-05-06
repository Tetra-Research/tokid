# Token Atom Scoring Study

This study takes the shared `tiktoken` atom surface from:

- `cl100k_base`
- `o200k_base`

and turns it into ranked candidate pools for future `tokid` vocabulary work.

Current command:

```bash
npm run analyze:atoms
```

Current outputs:

- `study/token-atom-scoring/results/summary.json`
- `study/token-atom-scoring/results/scored_candidates.csv`
- `study/token-atom-scoring/results/word_first.txt`
- `study/token-atom-scoring/results/balanced.txt`
- `study/token-atom-scoring/results/max_density.txt`

This study does not generate IDs. It only scores candidate token atoms.

## Method

This pass starts from the shared UTF-8 token surface across:

- `cl100k_base`
- `o200k_base`

Run facts:

- shared UTF-8 token atoms scanned: `84,374`
- local dictionary signal: `/usr/share/dict/words`
- dictionary use is a soft heuristic, not a correctness guarantee

Each shared atom is scored on:

- syntax safety
- readability
- pronounceability
- ambiguity penalties
- simple technical-fragment penalties

The study then emits three candidate pools:

1. `word_first`
   - exact lowercase dictionary words only
   - length and readability guardrails
   - intended to model the cleanest possible `tokid` vocabulary

2. `balanced`
   - readable lowercase atoms, including some subwords and snake/slug-style pieces
   - no dots, slashes, mixed case, or heavy ambiguity
   - intended to model a practical middle ground

3. `max_density`
   - broader URL-safe printable atoms with syntax guardrails
   - allows more tokenizer-native surface area
   - intended to model the upper end of usable entropy density without going fully wild

## Pool Sizes

| pool | count | log2(count) |
|---|---:|---:|
| `word_first` | 2,713 | `11.41` bits |
| `balanced` | 11,168 | `13.45` bits |
| `max_density` | 22,697 | `14.47` bits |

This is the main result.

If `tokid` truly prioritizes word-like atoms, the usable pool is much smaller than the raw tokenizer vocabulary suggests.

## What The Pools Actually Contain

### `word_first`

This pool is intentionally strict.

- `100%` exact dictionary matches
- `100%` lowercase alphabetic atoms
- `100%` pronounceable by the current heuristic
- no digits
- no underscores
- no hyphens

Example atoms:

- `abama`
- `abby`
- `abet`
- `abort`
- `about`
- `abstract`
- `academic`
- `according`
- `activation`
- `accuracy`

What this means:

- this is the cleanest product-feel pool
- it is nowhere near enough per-token entropy for short secure IDs
- an `8`-token ID from this pool only gets about `91.2` bits

### `balanced`

This is the most realistic “word-first but not word-only” pool.

- `24.4%` exact dictionary words
- `76.1%` lowercase alphabetic atoms
- `91.6%` lower-snake-safe
- `84.5%` slug-safe
- `75.7%` pronounceable
- still no digits by the current filter

Example atoms near the top of the pool:

- `about`
- `abstract`
- `academic`
- `account`
- `accuracy`
- `activate`
- `activity`
- `adapt`

What this means:

- this is a plausible vocabulary shape for readable `tokid`s
- it still only yields about `13.45` bits per token
- an `8`-token ID from this pool gets about `107.6` bits

### `max_density`

This is the broadest pool that still keeps some syntax discipline.

- `15.1%` exact dictionary words
- `46.7%` lowercase alphabetic atoms
- `57.7%` lower-snake-safe
- `53.6%` slug-safe
- `37.2%` pronounceable
- `2.3%` include digits

Example atoms:

- `activation`
- `annotation`
- `appearance`
- `assessment`
- `assignment`
- `associated`
- `attachment`
- `conference`
- `dependency`
- `generation`

What this means:

- this is the strongest currently measured shared pool
- it still lands at about `14.47` bits per token
- an `8`-token ID from this pool gets about `115.8` bits

## Current Read

- The pool size collapses fast when you insist on words rather than arbitrary tokenizer atoms.
- Exact-word `tokid` vocabularies are likely too small for UUID-class entropy at short lengths.
- A readable but broader pool looks viable for non-secure IDs and maybe moderate-strength opaque IDs.
- Even the current `max_density` pool does not clear UUIDv4-class entropy in `8` tokens when restricted to shared cross-encoding atoms.
- This supports the product framing you were leaning toward:
  `tokid` should probably optimize for word-like legibility first, not chase a perfect `8`-token secure target.

## Limitations

- `/usr/share/dict/words` is a blunt instrument; it includes archaic and odd entries, and it is not frequency-ranked
- semantic cleanliness is only lightly approximated
- there is no profanity / brand / ambiguity curation yet
- no context study yet; these are bare-token atoms, not JSON/URL/log embeddings

## Next Follow-Up

The next useful pass is probably to improve the atom quality model, not widen the charset immediately:

- frequency or commonness signal for English words
- better fragment detection
- ambiguity blacklist
- offensive / noisy token blacklist
- context behavior in JSON, URL paths, and logs
