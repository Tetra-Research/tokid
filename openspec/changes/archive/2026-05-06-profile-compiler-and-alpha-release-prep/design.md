## Context

`tokid` already has a profile-aware runtime microkernel, but the first embedded profile was frozen by hand and the package surface is still shaped like a research repo. The next milestone is not a new runtime model. It is a release-prep pass that makes profile artifacts reproducible, proves the kernel with a second embedded profile, and constrains what an alpha package actually ships.

The current evidence base is still OpenAI-local. The repo has strong measurements for:

- common-word candidate ranking from `wordfreq`
- transport-safe delimiter behavior across `cl100k_base` and `o200k_base`
- the current delimiterless profile recipe and its prefix-free reduction

It does not yet have equivalent evidence for Anthropic, Gemini, or generic SentencePiece/BPE portability. That means the next profile should prove variant handling inside the measured OpenAI family rather than claim new tokenizer-family coverage.

## Goals / Non-Goals

**Goals:**

- Make embedded profile generation deterministic from pinned study artifacts and explicit profile recipes.
- Add a second embedded profile that differs materially from `openai-cross-v1` without requiring new tokenizer research.
- Split the runtime package surface from the repo/study surface so an alpha publish ships only supported runtime artifacts.
- State the early-user compatibility contract clearly enough that package consumers know what is stable and what is still experimental.

**Non-Goals:**

- Prove cross-provider tokenizer optimality.
- Introduce a public profile-compiler API for external consumers.
- Finalize semantic vocabulary curation, profanity filtering, or a long-term 1.0 naming scheme for every future profile family.
- Rework the kernel around a new identifier model or envelope format.

## Decisions

### 1. Profiles become recipe-compiled artifacts

Add a build-time profile compiler that consumes:

- a recipe file per profile variant
- pinned study artifacts already committed in the repo
- deterministic sort/filter/reduction rules

The compiler emits `src/profiles/*.generated.ts` plus any generated index metadata needed by the runtime.

Why this approach:

- It keeps runtime behavior file-free and deterministic.
- It turns the current manual freeze step into an auditable build product.
- It lets the same candidate source produce multiple profile variants cleanly.

Alternatives considered:

- Keep hand-maintained generated files: rejected because drift becomes invisible and unreproducible.
- Derive profiles at runtime from `study/`: rejected because the published package must not depend on mutable research outputs.
- Compile directly from live tokenizer APIs during package build: rejected because the repo already has pinned study outputs and the alpha goal is determinism, not re-measurement.

### 2. The second profile is an underscore transport variant, not a new provider family

Add a second embedded profile that uses the same OpenAI-derived candidate frontier but a separator-decoded transport codec with `_` instead of delimiterless prefix-free decoding.

The alpha variant will stay conservative:

- same shared-single-token / pronounceable / score / rank frontier as the transport study
- same `5..8` character word window as the current profile family
- no prefix-free reduction requirement for transport decoding

Why this approach:

- It proves the kernel can host different transport-decoding policies without new architecture.
- It stays inside measured repo evidence: `none` wins, `_` is the consistent runner-up.
- It recovers meaningful vocabulary surface relative to the prefix-free transport profile without widening into the rougher tail immediately.

Alternatives considered:

- Anthropic or Gemini second profile: rejected because the repo does not yet contain the evidence needed to defend those claims.
- A broader 2,440-atom underscore profile immediately: deferred because it mixes the profile-variant proof with a larger semantic-quality expansion.
- No second profile: rejected because the kernel abstraction remains under-proven if the package only ships one manifest.

### 3. Package build and repo build become separate concerns

Split packaging into:

- a runtime build that emits only publishable library/CLI artifacts
- a repo/study workflow that continues to build studies and tests for local development

The published tarball should include:

- runtime JS and `.d.ts`
- embedded generated profiles
- package-facing docs and metadata

It should exclude:

- `study/`
- `test/`
- OpenSpec and agent integration files
- raw TypeScript sources not intended for the package surface
- study-only dependencies

Why this approach:

- The current package surface would publish the research repo almost wholesale.
- Alpha users need a small, predictable install shape.
- It avoids making runtime consumers pay for tokenizer-analysis dependencies they do not use.

Alternatives considered:

- Keep one build and rely on ignore files: rejected because stale `dist/` artifacts and broad default pack behavior are too easy to get wrong.
- Publish the repo as-is because it is “just alpha”: rejected because the first outside-user failure mode would be packaging noise, not product value.

### 4. The alpha contract is profile-first, not universal

Document the guarantees in terms of published profiles and durable envelopes:

- published `profileId`s are immutable
- a changed atom set or decoding rule gets a new profile id/versioned manifest
- durable envelopes for published profiles remain parseable across future alpha releases
- checksums detect accidental corruption only
- optimization claims are limited to the recorded tokenizer studies named in profile lineage

Why this approach:

- It gives early users a clear production boundary without over-claiming.
- It matches the current runtime architecture, which is already profile-aware and envelope-aware.

Alternatives considered:

- Market the alpha as a generic better-ID package: rejected because the repo does not yet support that promise.
- Treat bare transport payloads as the stable external contract: rejected because payloads are not self-describing.

## Risks / Trade-offs

- [Profile compiler becomes too coupled to current CSV column shapes] → Keep recipes explicit about expected inputs and fail fast on missing/changed columns.
- [Second profile name or variant semantics age poorly] → Keep the alpha variant narrowly scoped and document that profile ids, once published, are immutable.
- [Package split adds build complexity] → Use a minimal two-path build with explicit verification, including a packlist check.
- [Docs over-promise security or portability] → State entropy and tokenizer-scope claims as measured profile metadata, not universal guarantees.
- [Compiler recipes fossilize weak vocabulary choices] → Keep the compiler internal to the repo workflow and treat future profile additions as new manifests, not silent rewrites.

## Migration Plan

1. Introduce profile recipe files and a deterministic `build:profiles` flow.
2. Regenerate `openai-cross-v1` through the compiler and add the second underscore variant.
3. Add verification that generated profile artifacts are up to date.
4. Split runtime packaging from repo/study build output and verify the packlist.
5. Update package metadata and docs for alpha publication.

No runtime migration is required for existing repo users because the package has not been published yet. If the current default profile remains the default, existing examples keep working unchanged.

## Open Questions

- Whether the second profile should become the default in the alpha package or remain opt-in.
- Whether the compatibility contract belongs entirely in `README.md` or also in a dedicated package policy document.
