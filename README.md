# tokid

Token-native IDs for LLM-facing systems.

`tokid` is a format plus a set of first-party SDKs. It is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

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
| JavaScript / TypeScript | `packages/js` | npm `tokid` | `full` | 1 | `publish-now` | live on npm as `0.1.0-alpha.1` |
| Python | `packages/python` | PyPI `tokid` | `core` | 2 | `publish-now` | not yet published |
| Go | `packages/go` | `github.com/Tetra-Research/tokid/packages/go` | `core` | 2 | `publish-now` | not yet tagged |
| Rust | `packages/rust` | crates.io `tokid` | `full` | 2 | `publish-now` | not yet published |
| Java / Kotlin | `packages/java` | Maven Central `io.tokid:tokid` | `core` | 3 | `publish-now` | not yet published |
| C# | `packages/dotnet` | NuGet `Tokid` | `core` | 3 | `publish-now` | not yet published |

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
