# External Vocabulary Study

This study evaluates external open-source vocabularies as candidate sources for
word-like `tokid` atoms.

Current command:

```bash
npm run analyze:external-vocab
```

Current outputs:

- `study/external-vocabulary/results/summary.json`
- `study/external-vocabulary/results/source_summary.csv`
- `study/external-vocabulary/results/prefix_summary.csv`

Data sources used in this run:

- `SCOWL en_US`
- `SCOWL en_US large`
- `wordfreq en small`
- `wordfreq en large`

Normalization for this first pass:

- lowercase
- ASCII alphabetic only: `^[a-z]+$`
- length `3..24`
- deduplicated while preserving source order

This study is intentionally narrow. It does not score readability or
pronounceability. It answers a more basic question:

How many clean external words survive as single tokens in both `cl100k_base`
and `o200k_base`?

## Why This Study Exists

External vocabularies do not create new tokenizer atoms.

What they can do is help identify better candidate subsets of the atoms that
already exist:

- cleaner words
- more common words
- less garbage than raw tokenizer vocabulary mining
- a better estimate of the real entropy ceiling for word-first IDs

So the question here is not "can SCOWL or wordfreq beat the tokenizer?"

It is:

How many usable words from these sources are already single-token in both
 target encodings?

## Current Run

This run used:

- `4` source vocabularies
- `2` `tiktoken` encodings
- strict normalized word candidates only

Normalization:

- lowercase
- ASCII alphabetic only
- `^[a-z]+$`
- length `3..24`

## Source Summary

| source | raw entries | normalized unique | shared single-token | shared coverage | uniform bits | weighted bits | `cl100k` mean | `o200k` mean |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `SCOWL en_US` | 109,009 | 88,770 | 5,180 | 5.8% | 12.34 | n/a | 2.49 | 2.43 |
| `SCOWL en_US large` | 170,008 | 143,821 | 5,599 | 3.9% | 12.45 | n/a | 2.66 | 2.59 |
| `wordfreq en small` | 28,917 | 27,476 | 4,901 | 17.8% | 12.26 | 9.09 | 2.01 | 1.97 |
| `wordfreq en large` | 321,180 | 288,316 | 9,466 | 3.3% | 13.21 | 9.11 | 2.52 | 2.41 |

Interpretation:

- `wordfreq small` has the best survival rate by far because it is frequency-ranked and much cleaner.
- `wordfreq large` has the best absolute pool size, but the long tail is expensive and mostly does not stay single-token.
- `SCOWL large` adds a lot of words, but very little additional entropy under this strict normalization.

## Prefix Analysis For `wordfreq`

The frequency-ranked lists are more useful when you look at prefixes instead of
the full tail.

### `wordfreq`

| prefix | shared single-token | shared coverage | uniform bits | weighted bits | `cl100k` mean | `o200k` mean |
|---|---:|---:|---:|---:|---:|---:|
| top `2,048` | 1,494 | 72.9% | 10.54 | 8.48 | 1.26 | 1.26 |
| top `4,096` | 2,316 | 56.5% | 11.18 | 8.82 | 1.44 | 1.43 |
| top `8,192` | 3,228 | 39.4% | 11.66 | 8.99 | 1.65 | 1.63 |
| top `16,384` | 4,139 | 25.3% | 12.02 | 9.06 | 1.86 | 1.84 |
| top `32,768` | 5,207 | 15.9% | 12.35 | 9.09 | 2.06 | 2.02 |
| top `65,536` | 6,557 | 10.0% | 12.68 | 9.11 | 2.24 | 2.17 |

The `small` and `large` wordfreq lists have identical prefix behavior through
`16,384`, so one table is enough for the important part of the curve.

Interpretation:

- the first few thousand common words survive very well
- the entropy ceiling grows slowly after that
- weighted entropy flattens near `9.1` bits, which means frequency-weighted sampling is bad for secure IDs
- uniform sampling from a curated pool is the only sensible path for secure `tokid`s

## What This Says About The Retargeted Goal

This is the main result:

- external vocabularies help a lot with curation
- they do not unlock a dramatically larger strict-alpha shared pool

Under this normalization, the best current source is `wordfreq en large`:

- `9,466` shared single-token words
- about `13.21` uniform bits per chosen word

That is useful, but it is still below the earlier `balanced` atom pool from the
token-atom study, and well below what would make an `8`-word secure ID easy.

What the sources do give us:

- a much better ranking signal than `/usr/share/dict/words`
- a much cleaner word-first vocabulary candidate set
- a clear commonness vs entropy tradeoff curve

What they do not give us:

- a clean strict-alpha pool large enough to make short secure IDs easy
- a reason to believe exact words alone are sufficient

## Current Read

- If `tokid` wants exact lowercase words only, the entropy ceiling is still tight.
- `wordfreq` is the better source for word-first vocabulary work because it gives frequency order, not just dictionary membership.
- The top `2k` to `16k` `wordfreq` ranges look like the highest-quality zone for future curation.
- The long tail in both SCOWL and wordfreq is real, but it contributes less entropy than its raw size suggests.
- The likely next move is not "download bigger dictionaries forever". It is to combine:
  - `wordfreq` ranking
  - tokenizer-fit checks
  - readability / ambiguity scoring
  - and then decide where to allow readable subwords beyond exact words

## Files

- [summary.json](/Users/tylerobriant/code/tetra/tokid/study/external-vocabulary/results/summary.json)
- [source_summary.csv](/Users/tylerobriant/code/tetra/tokid/study/external-vocabulary/results/source_summary.csv)
- [prefix_summary.csv](/Users/tylerobriant/code/tetra/tokid/study/external-vocabulary/results/prefix_summary.csv)
