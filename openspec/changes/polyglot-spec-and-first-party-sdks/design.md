## Context

`tokid` currently has a solid TypeScript kernel, embedded profiles, deterministic profile compilation, and an alpha package workflow. That is enough for a Node-first release, but the current repo still makes TypeScript the canonical expression of the format:

- runtime semantics live in `src/kernel.ts`
- profile manifests are generated as `.ts` modules
- packaging and release automation only target npm

That shape does not scale cleanly to Python, Go, Rust, Java/Kotlin, and C#. The main risk is not algorithmic complexity. The main risk is semantic drift between ports if each implementation reverse-engineers behavior from the TypeScript runtime.

This change treats `tokid` as a format with first-party SDKs rather than as a TypeScript package with ports.

## Goals / Non-Goals

**Goals:**
- Define a language-neutral source of truth for published profiles and runtime semantics.
- Introduce shared conformance fixtures so every first-party SDK proves the same behavior.
- Establish the officially supported SDK matrix and the minimum API surface each SDK must ship.
- Restructure the repo so shared manifests, specs, and conformance assets sit above any single language implementation.
- Extend build and release workflows so multi-language SDKs can be validated and published coherently.

**Non-Goals:**
- Re-run tokenizer studies in every language.
- Force every SDK to expose identical naming or identical object shapes.
- Require every SDK to ship identical ergonomics or advanced helper depth in the first milestone.
- Replace native implementations with a single Rust core plus bindings.
- Add new tokenizer providers or new profile families as part of the same change.

## Decisions

### 1. Canonical runtime artifacts become portable JSON manifests plus conformance vectors

The compiler will continue to start from recipe files and pinned study artifacts, but its canonical output will no longer be TypeScript source modules alone. It will emit portable JSON manifests and shared conformance fixtures, and language-specific generated artifacts will be derived from those.

Why this over “keep TS as canonical and document it better”:
- JSON manifests are easy for every SDK to consume.
- conformance vectors make behavior testable outside the JS implementation.
- spec-first artifacts reduce the chance that later ports accidentally inherit JS quirks as undocumented behavior.

Alternative considered:
- Keep `.generated.ts` as the canonical artifact and ask other languages to import or re-encode it. Rejected because it keeps TypeScript as the actual source of truth and complicates every non-JS port.

### 2. Keep one shared compiler instead of one compiler per language

The existing compiler flow already captures the real derivation logic from recipes and study artifacts. That logic will stay centralized in this repo and emit portable artifacts for all SDKs.

Why this over “let each SDK compile its own profiles”:
- avoids six drifting implementations of recipe filtering and reduction
- keeps source lineage and hash recording centralized
- makes profile publication and review much easier

Alternative considered:
- Re-implement compilation in each language. Rejected because the work is duplicated and the compiler is a build-time concern, not a runtime concern.

### 3. First-party SDKs are native implementations, not bindings over a single foreign core

Each supported language will get a native implementation that consumes the same manifests and passes the same conformance suite.

Why this over “one Rust core + FFI/WASM everywhere”:
- the runtime algorithm is small enough to implement natively
- Python, Go, Java, and C# consumers generally expect native packaging and debugging behavior
- FFI would centralize code but would also add packaging and deployment friction in the ecosystems that matter most

Alternative considered:
- Rust core with bindings. Rejected for the first milestone because it would slow ecosystem adoption and complicate packaging more than it would reduce correctness risk.

### 4. SDK parity is semantic, not syntactic

All first-party SDKs must preserve the same generation, parsing, rendering, checksum, and validation behavior, but each SDK may expose an idiomatic public API.

Why this over “exact same API everywhere”:
- idiomatic APIs differ across languages
- parity should be measured by shared fixtures and outcomes, not method names

Alternative considered:
- enforce identical naming and shape everywhere. Rejected because it would make the non-JS SDKs feel unnatural without improving correctness.

### 5. Delivery is staged, but the contract covers the full matrix immediately

The supported language set for this change is:
- TypeScript / JavaScript
- Python
- Go
- Rust
- Java / Kotlin
- C#

The contract, manifests, and conformance assets will cover the whole set in one change, but implementation depth can be phased:
- full SDK target: JS/TS, Python, Go, Rust
- core SDK target: Java/Kotlin, C#

Why this over “ship one or two ports now and decide the rest later”:
- the repo structure and conformance model should be designed once for the full matrix
- the user intent is to support the default language set, not to keep revisiting the foundation

## Risks / Trade-offs

- Higher maintenance surface → Keep the runtime contract narrow and drive parity through shared vectors instead of manual review.
- Release complexity across six ecosystems → Separate “conformance passes” from “publish succeeds” so failures are diagnosable per language.
- Native SDK drift in edge cases → Promote conformance fixtures to a release gate for every first-party SDK.
- Repo restructuring churn → Treat current TS package paths as one package under a broader workspace rather than trying to preserve the current top-level layout forever.
- Uneven maturity across SDKs → Define explicit capability tiers so “core SDK” and “full SDK” mean something concrete.

## Migration Plan

1. Introduce portable manifest and conformance output directories alongside the existing TypeScript-generated artifacts.
2. Update the current TypeScript runtime to consume or verify against the portable artifacts so the JS package becomes the first conforming SDK rather than the implicit source of truth.
3. Restructure the repo into shared assets plus per-language package directories without deleting the study pipeline.
4. Add first-party SDK implementations in the target languages and wire each one into conformance validation.
5. Extend CI and release automation so manifest verification and per-language conformance become release gates.
6. Deprecate any TypeScript-only assumptions in docs and build flows once the portable artifact path is stable.

Rollback strategy:
- if the multi-language rollout stalls, keep the portable manifests and conformance assets as the durable outcome and continue shipping the JS package from the new foundation.

## Open Questions

- Should Java and Kotlin ship as one shared JVM artifact or as separate wrappers over one core JVM implementation?
- Should C# ship as a single .NET package with multi-targeting from the start, or as a narrower modern runtime target first?
- How much of the advanced kernel surface should be required for the first non-JS SDK releases versus left as optional later work?
- Do we want a repository split into language-specific subdirectories only, or separate publishable package roots with a thin top-level workspace?
