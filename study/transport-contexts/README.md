# Transport Contexts Study

This study evaluates delimiter behavior for word-like `tokid` candidates inside
real transport contexts, not just as bare identifiers.

Current command:

```bash
npm run analyze:transport
```

Current outputs:

- `study/transport-contexts/results/summary.json`
- `study/transport-contexts/results/summary.csv`
- `study/transport-contexts/results/transport_safe_winners.csv`
- `study/transport-contexts/results/rendered_samples.csv`

## Why This Study Exists

The earlier separator work established that:

- `space` is the best raw token separator
- `underscore` is the least bad compact fallback
- `none` beats most punctuation, but still loses to `space`

That was still only a bare-string study.

The next library decision is harder:

What should the *transport-safe* `tokid` representation be once the ID appears
in actual contexts like:

- JSON fields
- URL path segments
- query parameters
- markdown
- log lines

This study answers that by applying actual escaping and embedding rules instead
of pretending all delimiters are equally portable.

## Method

Atom pool source:

- `study/wordfreq-atom-ranking/results/scored_candidates.csv`

Pool filter:

- shared single-token in `cl100k_base` and `o200k_base`
- `pronounceable=true`
- `composite_score >= 80`
- `rank <= 8,192`

Delimiter set:

- `none`
- `space`
- `hyphen`
- `underscore`
- `dot`
- `slash`
- `tilde`
- `colon`
- `double_colon`

Contexts tested:

- `bare`
- `json_object`
- `url_path`
- `url_query`
- `markdown_code`
- `logfmt`

Important modeling detail:

- URL contexts use `encodeURIComponent`
- `logfmt` quotes values when whitespace requires it
- JSON uses real string escaping via `JSON.stringify`

That means `space`, `slash`, and `colon` pay their actual transport tax instead
of getting a free pass.

## Current Run

Run facts:

- atom pool size: `2,440`
- sequence lengths: `3`, `5`, `8`, `10`, `12`
- `1,000` sequences per length
- `9` delimiters
- `6` contexts
- `270,000` rendered strings
- `540,000` tokenizer observations across both encodings

## Transport-Safe Winners

This is the main result.

Across every tested context, length, and encoding in the current run:

- the best transport-safe separator is `none`
- the runner-up is always `underscore`
- `hyphen` trails `underscore`
- `dot` trails `hyphen`
- `tilde` is the weakest of the transport-safe set

The margin is not tiny. It widens as IDs get longer.

At `8` words:

| context | `cl100k` `space` | `cl100k` `none` | `cl100k` `_` | `o200k` `space` | `o200k` `none` | `o200k` `_` |
|---|---:|---:|---:|---:|---:|---:|
| `bare` | `8.04` | `9.56` | `11.34` | `8.02` | `9.54` | `11.92` |
| `json_object` | `17.05` | `18.56` | `20.34` | `17.03` | `18.55` | `20.92` |
| `url_path` | `30.86` | `18.35` | `20.20` | `30.84` | `18.37` | `20.80` |
| `url_query` | `36.96` | `24.49` | `26.30` | `37.93` | `25.49` | `27.89` |
| `markdown_code` | `13.05` | `14.56` | `16.34` | `13.03` | `14.54` | `16.92` |
| `logfmt` | `35.02` | `33.49` | `35.30` | `35.99` | `33.49` | `35.89` |

What this says:

- `space` is still the raw token winner where it can remain literal
- `space` collapses in URL contexts because `%20` expansion is brutal
- `space` also loses its edge in `logfmt` because quoting adds overhead
- once you restrict the problem to transport-safe forms, raw concatenation wins cleanly

## Current Read

- The current best transport-safe default is raw concatenation: no delimiter.
- `underscore` is the best fallback if visual segmentation matters more than token count.
- There is no evidence in this run that `hyphen`, `dot`, or `tilde` should be the canonical transport form.
- The strongest split now is not “which punctuation separator wins?”
  It is:
  - prompt-native form: `space`
  - transport-safe form: `none`
- That suggests the eventual library may want two views of the same atom sequence:
  a human / prompt form and a transport form.

## Files

- [summary.json](/Users/tylerobriant/code/tetra/tokid/study/transport-contexts/results/summary.json)
- [summary.csv](/Users/tylerobriant/code/tetra/tokid/study/transport-contexts/results/summary.csv)
- [transport_safe_winners.csv](/Users/tylerobriant/code/tetra/tokid/study/transport-contexts/results/transport_safe_winners.csv)
- [rendered_samples.csv](/Users/tylerobriant/code/tetra/tokid/study/transport-contexts/results/rendered_samples.csv)
