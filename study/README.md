# Study

This directory contains the research and measurement work for `tokid`.

Current contents:

- `sanity-check/`: the initial handpicked proof-of-life harness
- `id-token-usage/`: generated identifier benchmark and result writer
- `tokenizer-vocabulary/`: exhaustive token inventory and classification across `tiktoken` encodings
- `token-atom-scoring/`: ranked shared-token candidate pools for future vocabulary design
- `external-vocabulary/`: external wordlist fit analysis against `tiktoken`
- `wordfreq-atom-ranking/`: frequency-aware ranking of realistic exact-word candidate pools
- `separator-effects/`: isolated separator benchmark across fixed word-like atom sequences
- `transport-contexts/`: context-aware transport benchmark for candidate delimiters and raw concatenation

Planned next contents:

- machine-readable result outputs

The intent is to keep exploratory measurement work here, separate from concept docs and any future library implementation.
