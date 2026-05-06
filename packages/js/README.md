# tokid JavaScript SDK

JavaScript / TypeScript SDK for the `tokid` portable profile format.

`tokid` is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

It is a different trade:

- longer strings in characters
- fewer tokens in the tokenizer families this project currently targets
- one logical ID with three useful renderings: prompt, transport, and durable envelope

Status: early alpha.
Registry readiness: `publish-now`.
Registry status: live on npm as `0.1.0-alpha.1`.
Current runtime target: Node.js `20+`, ESM, server-side usage.
Other first-party SDKs live in the main repo under `packages/python`, `packages/go`, `packages/rust`, `packages/java`, and `packages/dotnet`.

## Why It Exists

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
- UUID-like strings are expensive under the OpenAI tokenizers studied here
- delimiter choice matters once IDs appear inside real transport contexts

In the current baseline measurements:

- UUID v4 averages about `22.78` tokens in `cl100k_base`
- UUID v7 averages about `21.54`
- `decimal_u64` averages about `6.95`
- raw concatenation beats `_`, `-`, `.`, and `~` for transport-safe forms in the measured OpenAI contexts

That is the niche `tokid` is built for.

## Install

```bash
npm install tokid
```

For local development against a checkout:

```bash
npm install ./packages/js
```

## Quick Start

If you want the shortest path, use the root API.

```ts
import { generate, isTokid, toPrompt, toTransport } from "tokid";

const id = generate();
// "tk1_oa1_..."

if (!isTokid(id)) {
  throw new Error("invalid tokid");
}

const prompt = toPrompt(id);
const transport = toTransport(id);
```

The default `generate()` result is the durable envelope form. That is the form you should store, exchange, and pass across boundaries unless you have a strong reason not to.

## The Simple API

The root package is string-first.

```ts
import { createTokidFactory } from "tokid";

const tokid = createTokidFactory({
  profile: "openai-cross-v1",
  length: 8,
});

const id = tokid.generate();
const prompt = tokid.prompt(id);
const transport = tokid.transport(id);
const logical = tokid.parse(id);
```

The simple API is built around two ideas:

- `generate()` returns an envelope string by default
- profile choice is bound once on an instance instead of being passed into every call

`createTokidFactory()` returns a configured helper, not a collection of existing IDs.

Available root helpers:

- `generate()` generates one envelope string using the default profile
- `createTokidFactory()` creates a profile-bound helper instance
- `parse()` returns the logical `{ profileId, atoms }` record or `null`
- `isTokid()` checks whether a value decodes
- `toPrompt()`, `toTransport()`, and `toEnvelope()` normalize between renderings

## Prompt, Transport, Envelope

Every `tokid` has one logical identity and three useful renderings:

- `prompt`: best when a human or LLM reads the ID in natural text
- `transport`: best when the ID must survive URLs, JSON, logs, or APIs
- `envelope`: best when the ID must be stored, exchanged, validated, and parsed later

If you only remember one rule, use this one:

- use `envelope` at persistence and network boundaries

Bare prompt and transport payloads are useful, but they are not self-describing.

## Which Profile Should I Use?

The current alpha ships two OpenAI-derived profiles.

### `openai-cross-v1`

Default profile.

- prompt uses spaces
- transport uses raw concatenation
- envelope looks like `tk1_oa1_<payload>_<checksum>`
- transport decoding works because the vocabulary is reduced to a prefix-free set
- recommended length `8` gives about `83.97` bits
- best when token cost is the main concern

### `openai-cross-underscore-v1`

Opt-in profile.

- prompt still uses spaces
- transport uses `_`
- envelope uses `~` as its field separator to avoid ambiguity
- vocabulary is larger because transport decoding is separator-based instead of prefix-free
- recommended length `8` gives about `86.30` bits
- best when visual segmentation matters more than the last bit of transport efficiency

Example:

```ts
import { createTokidFactory } from "tokid";

const tokid = createTokidFactory({
  profile: "openai-cross-underscore-v1",
});

const id = tokid.generate();
const transport = tokid.transport(id);
// "usage_approval_edges_files"
```

## When To Use `tokid`

Use it when most of these are true:

- your application regularly sends IDs through prompts or tool calls
- you care about token cost inside JSON, logs, URLs, or text-heavy transports
- you want a stable external envelope plus alternate prompt and transport renderings
- you are comfortable pinning an explicit profile in your application
- you are fine with an early alpha package that is honest about its limits

Good early use cases:

- LLM-facing internal entity IDs
- workflow, job, and run IDs that appear in prompts and structured tool responses
- application resources that need both a prompt-friendly view and a durable stored view
- systems where identifier text is part of the model-context budget

## When Not To Use `tokid`

Do not use it just because it looks interesting.

Choose something else when any of these are more important:

- minimal byte length
- ecosystem standardization
- sortable IDs
- browser-first runtime support
- profanity-free public handles
- authentication secrets, bearer tokens, or tamper-proof capabilities

In practice:

- use `uuid` when you want the standard default
- use `ulid` when you want sortable opaque IDs
- use `nanoid` when you want short random public IDs
- use `sqids` or `hashids` when you want reversible public wrappers for integers
- use `tokid` when tokenizer behavior is a first-class constraint

## Advanced API

If you need the logical ID model, profile manifests, kernel, or custom profile validation, use the advanced entrypoint:

```ts
import {
  generateTokid,
  parseTokid,
  renderTokid,
  createTokidKernel,
} from "tokid/advanced";
```

Use the advanced path when you need:

- direct access to logical `{ profileId, atoms }` records
- explicit format selection at render time
- profile inspection and manifest-level tooling
- custom kernels or custom profiles

The root package is for day-to-day use.
`tokid/advanced` is the escape hatch.

## CLI

The CLI now follows the same shape as the root API:

```bash
tokid
tokid --format prompt
tokid prompt tk1_oa1_...
tokid transport tk1_oa1_...
tokid inspect tk1_oa1_...
tokid profiles
tokid profile openai-cross-v1
```

## Guarantees

The alpha contract is narrow on purpose:

- published `profileId` values are immutable
- changing atoms, format rules, or envelope semantics requires a new published profile id
- durable envelopes for published profiles remain parseable across future alpha releases
- checksums detect accidental corruption and truncation only
- optimization claims are pinned to the tokenizer studies recorded in each profile lineage

## Non-Goals

This alpha does not promise:

- cross-provider tokenizer optimality
- universal readability
- profanity-free vocabularies
- that bare payloads are stable interchange formats
- that current OpenAI-derived profiles are the final long-term vocabulary families
- that `tokid` should replace UUIDs everywhere

## Runtime Notes

- Node.js `20+`
- ESM package
- current built-in profiles are OpenAI-derived
- server-side alpha first; browser and edge support are not the current target

## Development

Useful commands:

```bash
npm run build:profiles
npm run verify:profiles
npm run build
npm test
npm run verify:pack
npm run smoke:pack
npm run release:check
```

Maintainer release flow:

```bash
npm run release:npm:dry-run
git tag v0.1.0-alpha.3
git push origin v0.1.0-alpha.3
```

`publish.yml` is the preferred live path. `npm run release:npm` remains as a manual fallback.

Research and benchmarking commands remain in the repo as well:

```bash
npm run analyze:ids
npm run analyze:vocab
npm run analyze:atoms
npm run analyze:wordfreq-atoms
npm run analyze:transport
```

## Read This As An Alpha

The mature ID libraries already do their jobs very well:

- `uuid` is the standard default
- `ulid` is great when sortability matters
- `nanoid` is great when compact opaque strings matter
- `sqids` is great when you want reversible wrappers around integers

`tokid` is for the much narrower case where tokenizer behavior is part of the problem.

That is why the root API is now simple and string-first, while the deeper profile and kernel model still exists behind `tokid/advanced`.
