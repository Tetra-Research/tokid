# Context-First: Designing Systems for LLM Users

## The Hook

A UUID like `550e8400-e29b-41d4-a716-446655440000` costs ~15-20 tokens. It's random bytes rendered as hex — maximally hostile to a tokenizer. But the LLM's vocabulary has ~100k tokens. Two vocabulary tokens give you 10 billion combinations. Three give you a quadrillion. That's more than enough for most ID use cases, at 2-3 tokens instead of 15-20.

You've been designing for the wrong user.

## The Paradigm Shift

We went through "mobile-first." This is "context-first." Same energy: a different primary consumer with different constraints forces you to rethink everything. Mobile had small screens and touch targets. LLMs have token windows and in-distribution reasoning.

The question: **what happens when I'm building systems where the majority of my users are LLMs, not humans?**

## The Redesign, Layer by Layer

### Identifiers

Vocab-token IDs. The opening example, made concrete.

Docker stumbled into this with container names like `angry_darwin`. What3words does it for coordinates. But nobody's done it intentionally for token efficiency.

The address space math:
- 2 vocab tokens = 100k^2 = 10 billion combinations
- 3 vocab tokens = 100k^3 = 10^15 combinations
- UUIDs give 2^128 ~ 3.4 x 10^38

For non-security-critical IDs (trace IDs, DB keys, internal refs), this is more than enough. For anything where unpredictability matters, you'd still want the randomness — but could encode it as vocab tokens rather than hex.

This isn't just about cost — it's about cognition. An LLM reasoning over a context window full of `marble-clock-river` references can probably track those references better than `8f14e45f` ones, because the tokens are in-distribution.

### Error Responses

Stop returning error codes and stack traces. Return natural language diagnosis and suggested next action. Your user can't visit a docs page. It reasons in-context.

### Pagination

Cursor-based pagination with hex cursors is a token disaster. But also: does your LLM user even want pages? Maybe it wants a streaming reduction. Or a query language that lets it say what it actually needs.

### Response Shape

JSON's structural overhead is ~30% tokens on a typical response. What if LLM-facing endpoints returned something denser? Or what if the response was shaped to front-load the information the LLM is most likely to need, pushing details to the tail where they might get truncated?

### Authentication

Bearer tokens are opaque hex strings carried through every request. Same vocab-token encoding idea, but also: maybe the auth model itself changes when your user is an agent with a different trust model than a human with a browser.

### Documentation

Here's the inversion: for human users, docs are separate from the API. For LLM users, the API *is* the docs. The schema, the field names, the error messages — that's all the LLM reads. Every field name is a tiny piece of documentation. `created_at` is self-documenting; `ca_ts` isn't.

### Rate Limiting / Pricing

You're charging per-request, but your user's actual scarce resource is context window. A chatty API that requires 5 round-trips to do one thing is "bad UX" in a totally new way — it's not slow, it's expensive in tokens.

## Other LLM-Hostile Encodings

IDs are one case, but the question generalizes: what other encodings are we using that are maximally hostile to tokenizers?

- **Base64** — catastrophic. Every base64 blob an agent touches is shredded into fragments.
- **Hex anything** — hashes, colors (#a3f2c1), MAC addresses.
- **ISO timestamps** — `2026-04-02T14:23:01.000Z` is ~7 tokens. `wednesday afternoon` is 2 and often carries equivalent information.
- **Regex** — a dense regex is a tokenizer nightmare. Possibly unsolvable.
- **JSON structure tax** — all those `{`, `"`, `:` tokens are overhead.

## Where Vocab-Token IDs Apply

Anywhere an LLM has to read, pass through, or reason about opaque identifiers:

- URLs / API routes
- Correlation IDs in traces/logs
- Database primary keys (especially in agentic workflows)
- Git refs / commit hashes
- Error codes
- API keys / session tokens
- CSS class names (generated names from CSS-in-JS)
- Content-addressable storage keys

## The Kicker

The accessibility parallel. When we designed for screen readers, we got semantic HTML, which made the web better for everyone. When we designed for mobile, we got responsive design, which made desktop better. The prediction: designing for LLM users will produce APIs that are also better for humans — clearer naming, better errors, less ceremony, denser information. The LLM's constraints are a forcing function for good design.

We made human-readable formats (JSON, YAML) to replace machine-efficient ones (binary, protobuf). Now we need LLM-legible formats. The wheel turns again.

## Naming

### Settled: **tokid** for the ID library

Checked availability (April 2026): free on npm, PyPI, crates.io.

Rejected alternatives:
- **TUID** — great for the essay concept, but taken everywhere (npm, PyPI, crates.io, Go, Mozilla). Universally means "time-based unique ID." Concept collision, not just name squatting.
- **lexid** — taken on PyPI (lexical ID incrementer), also taken on GitHub (anyproto/lexid in Go).
- **callsign** — taken on npm (ham radio lookup). Free on PyPI/crates.io but radio-adjacent namespace.
- **toid** — taken on npm (string normalizer) and crates.io (Rust live coding tool).
- **vocid** — free but sounds medical (COVID adjacent).

### The library family

The umbrella idea is **token-native encoding** — every library answers "how do I represent X so it costs the fewest tokens while remaining lossless?"

| Library | Encodes | Replaces |
|---------|---------|----------|
| **tokid** | unique identifiers | UUIDs, hex hashes |
| **tokurl** | URLs/routes | long URL strings with embedded IDs and ceremony |
| **tokon** | structured data (objects, arrays) | JSON (rename of promptbuf) |

**tokon** (token object notation) is the rename of **promptbuf** (existing library at `~/code/tetra/promptbuf`, published on npm and PyPI). promptbuf is schema-aware JSON minification — strips keys, quotes, colons, uses positional encoding. Same insight as TOON but built independently and earlier. The rename positions it properly within the family.

**tokurl** — interesting as a URL shortener where the short code is vocab tokens instead of random chars. Also: URLs have structure (scheme, host, path, query params) plus embedded IDs. The win is partly using tokids *within* URLs, partly stripping ceremony (`https://`, trailing slashes, redundant params).

### Open questions for the family

**Timestamps** — need empirical measurement. ISO 8601 `2026-04-02T14:23:01.000Z` is claimed ~7 tokens but this depends heavily on the model/tokenizer. Each `-`, `:`, `T`, `.`, `Z` may or may not be separate tokens. Epoch seconds (`1743696181`) might already be efficient at 2-3 tokens. Need to actually run strings through cl100k_base, o200k_base, etc. before claiming savings. Might be advice ("use epoch seconds") rather than a library.

**Hex/binary** — base64, hashes, MAC addresses, color codes. A generic "hex to vocab tokens" encoder could cover all of these. Maybe that's tokid generalized — `tokid.encode(hex_string)` rather than `tokid.generate()`.

For the broader concept: **context-first design**, with **LLM-legible** as the property you're optimizing for.

## Prior Art & Landscape (as of April 2026)

### People who've identified the problem

**BAML — "Using UUIDs in prompts is bad"** (https://boundaryml.com/blog/uuid-swap)
Benchmarked the cost: UUIDs are 24 tokens each, cause ~50% error rates on aggregation tasks. Their solution: remap UUIDs to integers before the LLM call, remap back after. 20%+ accuracy improvement. Practical but a workaround, not a rethink.

**"ID Token Nicer" by Jens Tonberg Larsson** (https://anddata.substack.com/p/id-token-nicer)
The closest to this idea. A toolkit that includes word-based UUID encoding where each word is chosen to be a single token in common tokenizers. e.g. `550e8400-e29b-41d4-a716-446655440000` → `all-ecize-vejovis-minos-abb-allseed-heretic-signum-archhead`. Also covers placeholder substitution (`${UUID_1}`) and pattern obfuscation for sequential IDs. Published Feb 2026.

**LLMs and UUIDs — community gist** (https://gist.github.com/thomasdavis/c236d6a9b48a0d8c8e851e3d9f4310b8)
Documents the hallucination problem with UUIDs in LLM contexts.

### Adjacent work on token-efficient formats

**TOON (Token-Oriented Object Notation)** (https://toonformat.dev/)
Tackles JSON's structural token overhead. Claims 30-60% token reduction. Has a real spec, TypeScript/Python/Go/Rust SDKs. Got InfoQ coverage (https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/). This is the "response shape" section of this piece, already built.

**"Context-First Architecture"** (https://lirik.io/blogs/context-first-architecture-designing-token-efficient-llm-powered-solutions/)
Uses the exact phrase "context-first" but means something narrower: compress/curate data before sending to the LLM. Pipeline optimization, not system design philosophy.

### Exists but isn't framed this way

These all use words or readable strings as identifiers, but none are solving the same problem. The design constraint for each is different:

**What3words** — maps coordinates to 3 words. The goal is *human memorability* for a spatial address. The word list is curated for being easy to say on a phone call — pronunciation, cross-language clarity, avoiding offensive combinations. Doesn't care about tokenizers at all. Cares about human mouths.

**Docker container names** (`angry_darwin`) — *temporary human-readable labels* so you don't have to copy-paste container hashes in terminal output. A UX convenience. Accidental token efficiency — nobody at Docker was thinking about LLMs. The word list is curated for being amusing, not for tokenizer coverage.

**Sqids/Hashids** (https://sqids.org/) — encode integers into short URL-safe strings. The goal is *obfuscation* — hide auto-increment DB IDs so users can't enumerate resources. Output (`Bn3x8`) is still hex-ish gibberish, just shorter. Not token-efficient at all — optimizing for URL length, not tokenizer alignment.

**Nanoid / human-id** — generate short or word-based IDs for human readability. Same axis as Docker names: "can a human glance at this and tell two IDs apart?" Not: "does the tokenizer encode this in 2 tokens vs 20?"

**What tokid does differently:** the design constraint is *the tokenizer itself*. The word list isn't curated for pronunciation (what3words), amusement (Docker), obfuscation (sqids), or human readability (nanoid). It's curated for **being in-distribution for the model that will consume it**. Each word is chosen because it's a single token in the LLM's vocabulary. That's a fundamentally different axis of optimization.

The analogy: sqids is like minifying CSS for file size. What3words is like naming CSS classes for human readability. Tokid is like naming CSS classes so a screen reader can parse them — designing for a *different consumer's perception system*.

### The gap — what's new here

The existing work is:
- Problem-specific (UUIDs are bad → remap to ints)
- Format-specific (JSON is wasteful → use TOON)
- Tactical (swap IDs before/after the call)

What doesn't exist:
1. **The design philosophy piece** — "context-first design" as a coherent paradigm, the way "mobile-first" was.
2. **An ID library that generates native vocab-token IDs from the start** — not remapping UUIDs to words, but generating identifiers that are *born* as vocabulary tokens. ID Token Nicer encodes existing UUIDs into words (lossy, long). This would be: just generate 3 vocab tokens. That's the ID. No encoding/decoding layer.
3. **The full stack rethink** — IDs + errors + pagination + response format + auth, all through the same lens. Nobody's connected these dots.

The BAML and ID Token Nicer pieces actually *strengthen* the essay — cite them as evidence that the problem is real and practitioners are already reaching for ad-hoc solutions, then argue that what's missing is the coherent design philosophy.
