# Sanity Check

This directory contains the first tokid proof-of-life harness.

It is intentionally narrow and handpicked. Its job is to answer:

- do tokenizer-friendly identifiers beat UUIDs on token count at all
- do separator choices materially change the result
- can a small curated set of words stay single-token across `cl100k_base` and `o200k_base`
- does a simple `tokurl` rewrite look promising enough to justify deeper work

What it does not do:

- generate large ID samples
- compare full baseline families like `uuid`, `ulid`, `nanoid`, and `cuid2`
- produce distributional results
- establish a production-ready vocabulary
- prove secure entropy claims

Use this directory as the baseline snapshot before broader generated studies are added elsewhere under `study/`.
