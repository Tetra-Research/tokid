# Separator Effects Study

This study isolates separator behavior for word-like token atoms.

Current command:

```bash
npm run analyze:separators
```

Current outputs:

- `study/separator-effects/results/summary.json`
- `study/separator-effects/results/summary.csv`
- `study/separator-effects/results/sequence_samples.csv`

## Why This Study Exists

The earlier work established that atom choice matters, but separator choice
clearly matters too.

This pass isolates that variable:

- fixed atom pool
- fixed sequence lengths
- many generated sequences
- multiple basic separators
- direct comparison against `none` and `space`

This is still a bare-identifier study. It does not yet test JSON, URLs, logs,
or markdown contexts.

## Method

Atom pool source:

- `study/wordfreq-atom-ranking/results/scored_candidates.csv`

Pool filter:

- shared single-token in `cl100k_base` and `o200k_base`
- `pronounceable=true`
- `composite_score >= 80`
- `rank <= 8,192`

Current pool size:

- `2,440` atoms

Sequence generation:

- lengths: `3`, `5`, `8`, `10`, `12`
- `2,000` sequences per length
- fixed seed for reproducibility

Separators tested:

- `none`
- `space`
- `hyphen`
- `underscore`
- `dot`
- `slash`
- `tilde`
- `colon`
- `double_colon`

## Current Read

- `space` is the strongest default separator in this study.
- `none` is not competitive for word-like IDs; concatenation destroys token
  boundaries and inflates cost fast.
- `none` is still materially better than most punctuation separators.
- `hyphen` and `underscore` are materially worse than `space`.
- `slash`, `colon`, `tilde`, and `double_colon` impose the heaviest separator
  tax.
- The separator penalty compounds with sequence length, so “looks compact in
  characters” is not a good proxy for tokenizer efficiency.

## `cl100k_base`

| length | separator | mean | p50 | p95 | delta vs space | delta vs none |
|---|---|---:|---:|---:|---:|---:|
| 3 | space | 3.02 | 3 | 3 | 0.00 | -0.47 |
| 3 | none | 3.49 | 3 | 5 | 0.47 | 0.00 |
| 3 | underscore | 3.93 | 4 | 5 | 0.92 | 0.44 |
| 3 | dot | 4.17 | 4 | 5 | 1.16 | 0.69 |
| 3 | hyphen | 4.35 | 4 | 5 | 1.33 | 0.86 |
| 3 | slash | 4.75 | 5 | 5 | 1.73 | 1.26 |
| 3 | colon | 4.95 | 5 | 5 | 1.94 | 1.46 |
| 3 | tilde | 5.00 | 5 | 5 | 1.98 | 1.51 |
| 3 | double_colon | 5.00 | 5 | 5 | 1.98 | 1.51 |
| 8 | space | 8.04 | 8 | 8 | 0.00 | -1.58 |
| 8 | none | 9.62 | 9 | 12 | 1.58 | 0.00 |
| 8 | underscore | 11.24 | 11 | 13 | 3.20 | 1.62 |
| 8 | dot | 12.05 | 12 | 14 | 4.01 | 2.43 |
| 8 | hyphen | 12.72 | 13 | 15 | 4.68 | 3.10 |
| 8 | slash | 14.11 | 14 | 16 | 6.07 | 4.49 |
| 8 | colon | 14.84 | 15 | 15 | 6.80 | 5.21 |
| 8 | tilde | 15.00 | 15 | 15 | 6.96 | 5.38 |
| 8 | double_colon | 15.00 | 15 | 15 | 6.96 | 5.38 |
| 12 | space | 12.09 | 12 | 13 | 0.00 | -2.51 |
| 12 | none | 14.59 | 14 | 18 | 2.51 | 0.00 |
| 12 | underscore | 17.08 | 17 | 20 | 4.99 | 2.49 |
| 12 | dot | 18.36 | 18 | 21 | 6.27 | 3.76 |
| 12 | hyphen | 19.38 | 19 | 22 | 7.29 | 4.78 |
| 12 | slash | 21.62 | 22 | 24 | 9.53 | 7.02 |
| 12 | colon | 22.74 | 23 | 23 | 10.65 | 8.15 |
| 12 | tilde | 23.00 | 23 | 23 | 10.91 | 8.41 |
| 12 | double_colon | 23.00 | 23 | 23 | 10.91 | 8.41 |

## `o200k_base`

| length | separator | mean | p50 | p95 | delta vs space | delta vs none |
|---|---|---:|---:|---:|---:|---:|
| 3 | space | 3.01 | 3 | 3 | 0.00 | -0.47 |
| 3 | none | 3.48 | 3 | 5 | 0.47 | 0.00 |
| 3 | underscore | 4.11 | 4 | 5 | 1.10 | 0.63 |
| 3 | dot | 4.17 | 4 | 5 | 1.16 | 0.69 |
| 3 | hyphen | 4.38 | 4 | 5 | 1.38 | 0.91 |
| 3 | slash | 4.76 | 5 | 5 | 1.75 | 1.29 |
| 3 | colon | 4.97 | 5 | 5 | 1.96 | 1.49 |
| 3 | tilde | 5.00 | 5 | 5 | 1.99 | 1.52 |
| 3 | double_colon | 5.00 | 5 | 5 | 1.99 | 1.52 |
| 8 | space | 8.02 | 8 | 8 | 0.00 | -1.59 |
| 8 | none | 9.61 | 9 | 12 | 1.59 | 0.00 |
| 8 | underscore | 11.81 | 12 | 14 | 3.79 | 2.19 |
| 8 | dot | 12.05 | 12 | 14 | 4.02 | 2.43 |
| 8 | hyphen | 12.81 | 13 | 15 | 4.79 | 3.20 |
| 8 | slash | 14.20 | 14 | 15 | 6.18 | 4.58 |
| 8 | colon | 14.87 | 15 | 15 | 6.84 | 5.25 |
| 8 | tilde | 15.00 | 15 | 15 | 6.98 | 5.39 |
| 8 | double_colon | 15.00 | 15 | 15 | 6.98 | 5.39 |
| 12 | space | 12.05 | 12 | 12 | 0.00 | -2.51 |
| 12 | none | 14.55 | 14 | 18 | 2.51 | 0.00 |
| 12 | underscore | 18.02 | 18 | 21 | 5.97 | 3.47 |
| 12 | dot | 18.35 | 18 | 21 | 6.30 | 3.79 |
| 12 | hyphen | 19.55 | 20 | 22 | 7.50 | 4.99 |
| 12 | slash | 21.75 | 22 | 23 | 9.70 | 7.19 |
| 12 | colon | 22.79 | 23 | 23 | 10.75 | 8.24 |
| 12 | tilde | 23.00 | 23 | 23 | 10.95 | 8.45 |
| 12 | double_colon | 23.00 | 23 | 23 | 10.95 | 8.45 |

## Practical Takeaways

- If the format wants a separator, use `space` first.
- If spaces are unacceptable for transport, `underscore` is the least bad
  compact fallback in this run.
- `hyphen` is visually familiar but clearly tokenizer-expensive.
- `underscore`, `tilde`, `colon`, and `double_colon` are poor choices for a
  tokenizer-first ID format once sequences get longer.
- “No separator” is better than punctuation-heavy joins, but still substantially
  worse than `space` for this word-like pool.

## Files

- [summary.json](/Users/tylerobriant/code/tetra/tokid/study/separator-effects/results/summary.json)
- [summary.csv](/Users/tylerobriant/code/tetra/tokid/study/separator-effects/results/summary.csv)
- [sequence_samples.csv](/Users/tylerobriant/code/tetra/tokid/study/separator-effects/results/sequence_samples.csv)
