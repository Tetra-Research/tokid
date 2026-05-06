# ID Token Usage Study

This study isolates generated identifier families and measures their token usage in `tiktoken`.

Current scope:

- reproducible generation from a fixed seed
- multiple baseline identifier families
- per-family token distributions across both encodings
- JSON and CSV outputs under `results/`

Current command:

```bash
npm run analyze:ids
```

The default run writes:

- `study/id-token-usage/results/summary.json`
- `study/id-token-usage/results/summary.csv`
- `study/id-token-usage/results/samples.csv`

Methodology notes:

- generation is deterministic so runs are comparable
- token summaries report distributions rather than anecdotal best cases
- the study currently measures bare identifier strings only

What this still does not cover:

- IDs embedded in JSON, logs, prompts, or URLs
- provider families outside `tiktoken`

## Baseline Run

The first generated run was executed across the existing baseline families:

- `uuid_v4`
- `uuid_v7`
- `ulid`
- `nanoid_21`
- `hex_16`
- `hex_32`
- `base64url_16`
- `base62_16`
- `decimal_u64`
- `integer_auto_6d`
- `integer_auto_9d`
- `integer_auto_12d`
- `integer_auto_15d`
- `integer_auto_18d`
- `decimal_u128`

Run size for the baseline families:

- default run target: `5,000` generated identifiers per family
- `15` baseline families
- `2` tokenizer encodings: `cl100k_base` and `o200k_base`
- `75,000` unique baseline identifiers generated
- `150,000` tokenizer observations across both encodings
- `1,742,153` total tokens processed across the baseline observations

## Baseline Analysis

This study is now baseline-only. There are no `tokid` control families in the result set.

### Shape Notes

- canonical UUIDs are the heaviest baseline family in both encodings
- `uuid_v7` is slightly cheaper than `uuid_v4`, but the overall shape is still UUID-like: wide spread and heavy tails
- `ULID` reduces token cost materially, but not enough to compete with shorter random alphabets
- `nanoid_21`, `base64url_16`, and `base62_16` form the strongest compact secure baseline cluster
- `hex_32` remains expensive despite being shorter than canonical UUID text
- random decimal integers are much cheaper than most opaque string encodings
- sequential decimal auto IDs are extremely cheap and almost perfectly deterministic by digit length

### Baseline Table: `cl100k_base`

| family | mean | p05 | p25 | p50 | p75 | p95 | p99 | min | max | stddev |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uuid_v4 | 22.78 | 19.00 | 21.00 | 23.00 | 24.00 | 26.00 | 28.00 | 17 | 31 | 2.08 |
| uuid_v7 | 21.54 | 19.00 | 20.00 | 21.00 | 23.00 | 25.00 | 26.00 | 16 | 28 | 1.79 |
| ulid | 16.45 | 14.00 | 16.00 | 16.00 | 17.00 | 19.00 | 20.00 | 12 | 22 | 1.33 |
| nanoid_21 | 15.13 | 13.00 | 14.00 | 15.00 | 16.00 | 17.00 | 19.00 | 10 | 21 | 1.43 |
| hex_16 | 9.36 | 7.00 | 8.00 | 9.00 | 10.00 | 12.00 | 13.00 | 6 | 15 | 1.42 |
| hex_32 | 18.50 | 15.00 | 17.00 | 18.00 | 20.00 | 22.00 | 23.00 | 12 | 26 | 2.02 |
| base64url_16 | 15.87 | 14.00 | 15.00 | 16.00 | 17.00 | 18.00 | 19.00 | 11 | 21 | 1.45 |
| base62_16 | 15.96 | 14.00 | 15.00 | 16.00 | 17.00 | 18.00 | 19.00 | 11 | 22 | 1.46 |
| decimal_u64 | 6.95 | 6.00 | 7.00 | 7.00 | 7.00 | 7.00 | 7.00 | 6 | 7 | 0.22 |
| decimal_u128 | 13.00 | 13.00 | 13.00 | 13.00 | 13.00 | 13.00 | 13.00 | 12 | 13 | 0.06 |

### Baseline Table: `o200k_base`

| family | mean | p05 | p25 | p50 | p75 | p95 | p99 | min | max | stddev |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| uuid_v4 | 22.76 | 20.00 | 21.00 | 23.00 | 24.00 | 26.00 | 28.00 | 17 | 31 | 2.09 |
| uuid_v7 | 21.41 | 19.00 | 20.00 | 21.00 | 23.00 | 24.00 | 26.00 | 16 | 28 | 1.80 |
| ulid | 16.18 | 14.00 | 15.00 | 16.00 | 17.00 | 18.00 | 19.00 | 12 | 21 | 1.31 |
| nanoid_21 | 14.40 | 12.00 | 13.00 | 14.00 | 15.00 | 17.00 | 18.00 | 10 | 19 | 1.38 |
| hex_16 | 9.39 | 7.00 | 8.00 | 9.00 | 10.00 | 12.00 | 13.00 | 6 | 15 | 1.42 |
| hex_32 | 18.56 | 15.00 | 17.00 | 18.00 | 20.00 | 22.00 | 23.00 | 13 | 26 | 2.02 |
| base64url_16 | 15.06 | 13.00 | 14.00 | 15.00 | 16.00 | 17.00 | 18.00 | 11 | 21 | 1.37 |
| base62_16 | 15.20 | 13.00 | 14.00 | 15.00 | 16.00 | 18.00 | 18.00 | 10 | 20 | 1.40 |
| decimal_u64 | 6.95 | 6.00 | 7.00 | 7.00 | 7.00 | 7.00 | 7.00 | 6 | 7 | 0.22 |
| decimal_u128 | 13.00 | 13.00 | 13.00 | 13.00 | 13.00 | 13.00 | 13.00 | 12 | 13 | 0.06 |

### Sequential Integer Auto IDs

These runs answer the specific “big auto ID” question more directly than `decimal_u64`, because they model sequential decimal identifiers rather than random integers.

For the `5,000`-sample window used here, the auto-ID families are essentially degenerate distributions: token count is determined almost entirely by digit length, not sample-to-sample variation.

#### `cl100k_base`

| family | mean | p05 | p25 | p50 | p75 | p95 | p99 | min | max | mean_chars |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| integer_auto_6d | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2 | 2 | 6.00 |
| integer_auto_9d | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3 | 3 | 9.00 |
| integer_auto_12d | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4 | 4 | 12.00 |
| integer_auto_15d | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 | 5 | 5 | 15.00 |
| integer_auto_18d | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 | 6 | 6 | 18.00 |

#### `o200k_base`

| family | mean | p05 | p25 | p50 | p75 | p95 | p99 | min | max | mean_chars |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| integer_auto_6d | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2.00 | 2 | 2 | 6.00 |
| integer_auto_9d | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3.00 | 3 | 3 | 9.00 |
| integer_auto_12d | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4.00 | 4 | 4 | 12.00 |
| integer_auto_15d | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 | 5.00 | 5 | 5 | 15.00 |
| integer_auto_18d | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 | 6.00 | 6 | 6 | 18.00 |

### Takeaways

- UUID-family identifiers are both expensive and variable; the heavy tail matters, not just the mean
- `uuid_v7` is only a modest tokenizer improvement over `uuid_v4`
- `ULID` is a real improvement, but still clearly above the compact baseline cluster
- `NanoID`, `base64url`, and `base62` are the strongest compact secure baselines in this run
- random decimal integers compress unusually well under these tokenizers
- sequential decimal auto IDs are extremely token-efficient: an 18-digit auto ID is still only `6` tokens in both encodings in this sample window
