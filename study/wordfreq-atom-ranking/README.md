# Wordfreq Atom Ranking Study

This study takes the exact-word surface from the `wordfreq` top-`16k` English
zone and merges it with the atom-quality heuristics from the tokenizer atom
study.

Current command:

```bash
npm run analyze:wordfreq-atoms
```

Current outputs:

- `study/wordfreq-atom-ranking/results/summary.json`
- `study/wordfreq-atom-ranking/results/scored_candidates.csv`
- `study/wordfreq-atom-ranking/results/prefix_summary.csv`
- `study/wordfreq-atom-ranking/results/band_summary.csv`
- `study/wordfreq-atom-ranking/results/top_candidates.txt`

This study is intentionally narrower than the raw atom census.

It only looks at:

- exact lowercase ASCII words
- deduplicated from `wordfreq en large`
- first `16,384` normalized words

Then it scores them on:

- commonness
- single-token stability in `cl100k_base` and `o200k_base`
- readability
- pronounceability
- ambiguity penalties

## Why This Study Exists

The last two studies established two things:

- raw tokenizer atoms give better entropy than exact words
- `wordfreq` gives a much cleaner ranking signal than blunt dictionaries

The natural next step is to merge those ideas and ask a more practical question:

If we restrict ourselves to common exact words, how good is the usable shared
single-token pool once we also care about readability and ambiguity?

This is still not a final `tokid` vocabulary.

It is a ranking pass over a realistic candidate frontier.

## Method

Source:

- `study/external-vocabulary/data/wordfreq-large_en.msgpack.gz`

Normalization:

- lowercase
- ASCII alphabetic only: `^[a-z]+$`
- length `3..24`
- deduplicated in source order
- truncated at `16,384` normalized unique words

Scoring components:

- `commonness_score`
  - favors earlier `wordfreq` ranks inside the `16k` window
- `tokenizer_fit_score`
  - strongly favors words that are exactly one token in both `cl100k_base`
    and `o200k_base`
- `readability_score`
  - length and repetition guardrails
- `pronounceability_score`
  - simple vowel / consonant-shape heuristic
- `ambiguity_penalty`
  - penalizes unusually confusable short words

## Current Run

Run facts:

- normalized candidates scored: `16,384`
- shared single-token exact words: `4,139`
- shared single-token coverage: `25.3%`
- uniform entropy ceiling over the shared pool: `12.02` bits / word

Score distribution over shared single-token words:

| metric | score |
|---|---:|
| mean | `80.82` |
| p10 | `63.56` |
| p25 | `76.85` |
| p50 | `81.88` |
| p75 | `87.33` |
| p90 | `92.64` |
| p95 | `96.04` |

The full shared pool is still much smaller than the earlier tokenizer-native
`balanced` and `max_density` atom pools. The benefit here is quality and
commonness, not a higher entropy ceiling.

## Prefix Growth

This is the cleanest way to see the tradeoff curve.

| prefix | shared single-token | coverage | uniform bits | mean score | p50 score | p90 score | `cl100k` mean | `o200k` mean |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| top `2,048` | `1,494` | `72.9%` | `10.54` | `89.11` | `89.35` | `97.69` | `1.26` | `1.26` |
| top `4,096` | `2,316` | `56.5%` | `11.18` | `86.32` | `86.57` | `95.51` | `1.44` | `1.43` |
| top `8,192` | `3,228` | `39.4%` | `11.66` | `83.62` | `84.19` | `93.83` | `1.65` | `1.63` |
| top `16,384` | `4,139` | `25.3%` | `12.02` | `80.82` | `81.88` | `92.64` | `1.86` | `1.84` |

Interpretation:

- the top `2k` common-word zone survives extremely well
- every expansion step adds entropy, but quality decays steadily
- moving from top `8k` to top `16k` only adds `911` shared single-token words
  and only `0.36` more bits

That last point matters. The back half of the `8k-16k` window adds real
surface area, but not a dramatic amount of entropy.

## Rank Bands

The cumulative prefix table hides where the quality drop actually happens.

| band | shared single-token | coverage | uniform bits | mean score | p50 score | p90 score | `cl100k` mean | `o200k` mean | example atoms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `1-2k` | `1,494` | `72.9%` | `10.54` | `89.11` | `89.35` | `97.69` | `1.26` | `1.26` | `that`, `with`, `this`, `have` |
| `2k-4k` | `822` | `40.1%` | `9.68` | `81.24` | `83.89` | `85.84` | `1.62` | `1.60` | `requires`, `route`, `saved`, `schedule` |
| `4k-8k` | `912` | `22.3%` | `9.83` | `76.76` | `80.38` | `82.40` | `1.86` | `1.84` | `agenda`, `calendar`, `craft`, `hardware` |
| `8k-16k` | `911` | `11.1%` | `9.83` | `70.90` | `76.56` | `78.87` | `2.08` | `2.04` | `consume`, `filters`, `geometry`, `imports` |

Interpretation:

- `1-2k` is the highest-confidence quality zone, but it is entropy-poor
- `2k-8k` looks like the practical expansion band
- `8k-16k` still contributes usable words, but the token-fit and quality drop is
  obvious

If the goal is a common-word-first vocabulary, the real sweet spot looks closer
to top `4k-8k` than “use the whole tail.”

## Quality Tiers

The score threshold view is useful because it shows how much of the shared
single-token pool survives even after applying quality pressure.

| tier | min score | shared single-token | uniform bits | 8-word ceiling | example atoms |
|---|---:|---:|---:|---:|---|
| `prime` | `90` | `669` | `9.39` | `75.12` | `that`, `with`, `this`, `have` |
| `strong` | `80` | `2,478` | `11.27` | `90.16` | `about`, `time`, `people`, `other` |
| `usable` | `70` | `3,592` | `11.81` | `94.48` | `around`, `between`, `always`, `better` |

This is the clearest statement of the current constraint:

- exact common words produce a very clean candidate pool
- they still do not produce anything close to a UUID-class `8`-word space

Even the full shared top-`16k` pool only yields about `96.16` bits at `8`
words.

## What The Top Of The List Looks Like

The highest-scoring candidates are exactly what you would expect from this
objective:

- very common
- short
- readable
- shared single-token

Current top-ranked examples:

- `that`
- `with`
- `this`
- `have`
- `from`
- `your`
- `they`
- `just`
- `about`
- `what`
- `when`
- `more`

That is informative, but it also exposes the next problem.

This scoring system currently over-rewards function words and stopword-like
forms because commonness is strong and semantic desirability is not modeled yet.

So this study improves the candidate frontier, but it is not yet a final
product vocabulary ranking.

## Current Read

- Merging `wordfreq` with atom scoring does improve the realism of the candidate
  pool.
- The top `2k-8k` wordfreq region is the real high-quality zone for exact-word
  work.
- The entropy ceiling still stays tight: common exact words are better for
  product feel than for secure density.
- The score distribution is healthy, but the current ranking is semantically too
  “stopword-heavy” to use directly.
- The next refinement should probably not be “download more vocabularies.”
  It should be:
  - semantic filtering or stopword penalties
  - diversity constraints so the top of the list is not dominated by pronouns,
    determiners, and auxiliaries
  - maybe a split between “human-nice vocabulary” and “max common readable
    vocabulary”

## Files

- [summary.json](/Users/tylerobriant/code/tetra/tokid/study/wordfreq-atom-ranking/results/summary.json)
- [scored_candidates.csv](/Users/tylerobriant/code/tetra/tokid/study/wordfreq-atom-ranking/results/scored_candidates.csv)
- [prefix_summary.csv](/Users/tylerobriant/code/tetra/tokid/study/wordfreq-atom-ranking/results/prefix_summary.csv)
- [band_summary.csv](/Users/tylerobriant/code/tetra/tokid/study/wordfreq-atom-ranking/results/band_summary.csv)
- [top_candidates.txt](/Users/tylerobriant/code/tetra/tokid/study/wordfreq-atom-ranking/results/top_candidates.txt)
