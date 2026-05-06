# tokid

Token-native IDs for LLM-facing systems.

`tokid` is a format plus a set of first-party SDKs. It is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

## What It Looks Like

One logical `tokid` can be rendered three ways:

```text
prompt:    straight course shirt height alter outer rapid verse
transport: straightcourseshirtheightalterouterrapidverse
envelope:  tk1_oa1_straightcourseshirtheightalterouterrapidverse_1oze8
```

The important distinction is:

- the token savings live in `prompt` first and `transport` second
- the `envelope` is the durable wrapper around that cheaper payload
- if you send the envelope straight through prompts all the time, you give back most of the win

## Why It Looks Different

`tokid` is not optimizing one string. It is optimizing one logical ID for three different jobs.

### `prompt`

This is the cheapest LLM-facing form.

- atoms stay separated by literal spaces
- the current profiles are built from tokenizer-friendly single-token word atoms
- in the measured OpenAI tokenizers, `8` prompt atoms are usually about `8` tokens

Use this when a human or model is reading the ID inside natural text.

### `transport`

This is the transport-safe payload form.

- spaces are great in prompts, but they get escaped or quoted in URLs, query strings, JSON, and logs
- once that happens, the raw prompt form stops being cheap
- for the measured transport-safe contexts, raw concatenation beat `_`, `-`, `.`, and `~`

At `8` atoms in the transport study, `url_path` averaged `30.86` tokens with spaces, `18.35` with raw concatenation, and `20.20` with underscores.

Use this when the ID must survive structured text without carrying extra envelope metadata.

### `envelope`

This is the durable external form.

- it wraps the transport payload with a format prefix
- it carries a profile tag so the payload can be decoded later
- it adds a checksum so truncation and mistypes fail validation

The envelope is not the cheapest form. It exists so stored and exchanged IDs are self-describing enough to survive across process and release boundaries.

## Why

Most ID libraries optimize for one of these goals:

| Library | Primary goal | Good default when | Not the same problem as `tokid` |
|---|---|---|---|
| `uuid` | standard opaque identifiers | you want a boring, durable, widely understood default | `tokid` is not trying to beat UUID on byte length or standardization |
| `ulid` | sortable opaque identifiers | you want time ordering plus readable-ish text | `tokid` does not optimize for sort order |
| `nanoid` | short random URL-safe identifiers | you want compact opaque IDs in public URLs or APIs | `tokid` is usually longer in characters |
| `sqids` / `hashids` | reversible public strings for numbers | you already have integers and want nicer handles | `tokid` is not an integer obfuscator |
| `tokid` | lower tokenizer cost for LLM-heavy paths | IDs show up inside prompts, tool calls, JSON, logs, or transport text | this is a tokenizer-aware format, not a general-purpose winner |

The motivating observation is simple:

- character length and token cost are not the same thing
- UUID-like strings are expensive under the tokenizers studied here
- delimiter choice matters once IDs appear inside real transport contexts

For the example above, measured locally against the current target tokenizers:

| form | chars | `cl100k_base` | `o200k_base` |
|---|---:|---:|---:|
| `prompt` | 52 | 8 | 8 |
| `transport` | 45 | 12 | 10 |
| `envelope` | 59 | 22 | 21 |
| `uuid_v4` | 36 | 18 | 18 |

That is the real trade:

- `prompt` is where the big tokenizer win lives
- `transport` keeps much of that win while staying machine-safe
- `envelope` pays a fixed metadata tax to become durable

Against the current baseline families in `cl100k_base`, the study means are:

- `uuid_v4`: `22.78`
- `uuid_v7`: `21.54`
- `ulid`: `16.45`
- `nanoid_21`: `15.13`
- `base64url_16`: `15.87`
- `base62_16`: `15.96`
- `decimal_u64`: `6.95`

## What Lives Here

This repo now has four layers:

- `profiles/manifests`: canonical portable profile manifests and registry
- `conformance/fixtures`: shared cross-language fixture set
- `packages/*`: first-party SDKs
- `study/*`: tokenizer and vocabulary research that produced the current published profiles

The runtime contract is driven by the portable manifests and the shared conformance suite, not by any single SDK implementation.

## Support Matrix

Current official first-party SDKs:

| SDK | Path | Channel | Tier | Wave | Readiness | Registry status |
|---|---|---|---|---|---|---|
| JavaScript / TypeScript | `packages/js` | npm `tokid` | `full` | 1 | `publish-now` | live on npm; `alpha` dist-tag is `0.1.0-alpha.3` |
| Python | `packages/python` | PyPI `tokid` | `core` | 2 | `publish-now` | live on PyPI as `0.1.0a3` |
| Go | `packages/go` | `github.com/Tetra-Research/tokid/packages/go` | `core` | 2 | `publish-now` | tag pushed as `packages/go/v0.1.0-alpha.3`; anonymous `go get` still depends on repo visibility |
| Rust | `packages/rust` | crates.io `tokid` | `full` | 2 | `publish-now` | live on crates.io as `0.1.0-alpha.3` |
| Java / Kotlin | `packages/java` | Maven Central `io.tetraresearch.tokid:tokid` | `core` | 3 | `publish-now` | todo: Sonatype still is not resolving the public signing key for first publish |
| C# | `packages/dotnet` | NuGet `Tokid` | `core` | 3 | `publish-now` | todo: publish after a nuget.org account and API key exist |

All first-party SDKs currently ship the same two built-in profiles:

- `openai-cross-v1`
- `openai-cross-underscore-v1`

Capability tiers:

- `core`: generate, parse, validate, choose a profile, and convert between prompt, transport, and envelope forms
- `full`: `core` plus advanced manifest/kernel validation and profile-aware runtime hooks

For the JVM and .NET releases specifically:

- Java / Kotlin is currently `core` and ships the two OpenAI-derived profiles only
- C# is currently `core` and ships the same two profiles only
- neither SDK is claiming advanced custom-kernel or custom-profile-loading parity yet

Maintainer release policy, readiness notes, version mapping, and publish commands live in [RELEASING.md](RELEASING.md).

## Current Profiles

The current alpha ships two OpenAI-derived profiles:

- `openai-cross-v1`
  - prompt: atoms joined by spaces
  - transport: raw concatenation
  - envelope: `tk1_oa1_<payload>_<checksum>`
  - vocabulary reduced to a prefix-free set for delimiterless decoding
  - recommended length `8` is about `83.97` bits

- `openai-cross-underscore-v1`
  - prompt: atoms joined by spaces
  - transport: `_` separated
  - envelope: `tk1~oa1u~<payload>~<checksum>`
  - vocabulary can be larger because transport decoding is separator-based
  - recommended length `8` is about `86.30` bits

## Guarantees

The current contract is intentionally narrow:

- published `profileId` values are immutable
- changing atoms, payload rules, or envelope semantics requires a new published profile id
- canonical portable manifests in `profiles/manifests` are the source of truth
- official SDKs must pass `conformance/fixtures/suite.json` before release
- durable envelopes for published profiles remain parseable across future releases of a conforming SDK
- checksums detect accidental corruption and truncation only

## When To Use It

Use `tokid` when most of these are true:

- your application regularly sends IDs through prompts or tool calls
- you care about token cost inside JSON, logs, URLs, or text-heavy transports
- you want a stable external envelope plus alternate prompt and transport renderings
- you are comfortable pinning an explicit profile in your application

Do not use it when minimal byte length, ecosystem standardization, sortable IDs, browser-first runtime support, or authentication-grade secrets matter more than token behavior.

## How To Think About It

The shortest way to reason about `tokid` is:

1. Pick a logical atom sequence.
2. Render it as `prompt` when the model reads it.
3. Render it as `transport` when structured text has to carry it cheaply.
4. Store and exchange it as `envelope` when you need a durable contract.

The payload is the optimization.
The envelope is the wrapper that makes the payload usable as a real ID.

## Development

Common repo commands:

```bash
npm install
npm test
npm run conformance
npm run verify:profiles
npm run verify:pack
npm run smoke:pack
```

Release dry-runs:

```bash
npm run release:npm:dry-run
npm run release:pypi:dry-run
npm run release:go:dry-run
npm run release:rust:dry-run
npm run release:maven:dry-run
npm run release:nuget:dry-run
```

Study commands still live at the repo root:

```bash
npm run analyze:ids
npm run analyze:vocab
npm run analyze:transport
```

Package-specific READMEs:

- [JavaScript / TypeScript](packages/js/README.md)
- [Python](packages/python/README.md)
- [Go](packages/go/README.md)
- [Rust](packages/rust/README.md)
- [Java / Kotlin](packages/java/README.md)
- [C# / .NET](packages/dotnet/README.md)
