## Why

`tokid` is no longer just a TypeScript experiment. The core value now lives in the profile format, envelope rules, and tokenizer-aware decoding semantics, and that contract needs to work the same way in the languages people actually build LLM systems with.

The current Node-first package is enough for a JS alpha, but it is not enough for a real format. Supporting Python, Go, Rust, Java/Kotlin, and C# requires turning the repo into a spec-first source of truth with shared manifests, conformance vectors, and first-party SDK parity.

## What Changes

- Introduce a language-neutral compiled profile manifest artifact that becomes the canonical runtime input for every first-party SDK.
- Add a shared conformance suite with deterministic fixtures for profile validation, payload parsing, envelope parsing, checksum generation, and deterministic generation from scripted random bytes.
- Define the minimum first-party SDK contract for TypeScript/JavaScript, Python, Go, Rust, Java/Kotlin, and C#.
- Restructure the repo around shared specs, manifests, conformance assets, and per-language packages rather than a single TypeScript runtime package with research tooling attached.
- Extend release and packaging requirements from npm-only distribution to first-party multi-ecosystem distribution across the supported language set.
- **BREAKING**: change the repository layout and build flow so language-neutral manifests and conformance assets become canonical, with generated language bindings treated as consumers of those artifacts instead of the primary source of runtime behavior.

## Capabilities

### New Capabilities
- `portable-profile-manifests`: language-neutral compiled profile artifacts and registry metadata that every first-party SDK can consume.
- `sdk-conformance`: shared fixtures and parity requirements that every first-party SDK must pass before release.
- `first-party-sdks`: the supported language matrix, minimum runtime API surface, and delivery expectations for official SDKs.

### Modified Capabilities
- `tokid-kernel`: define runtime semantics as language-neutral kernel behavior rather than TypeScript-owned behavior.
- `format-integrity`: require identical durable envelope behavior and checksum validation across first-party SDKs.
- `profile-compilation`: extend profile compilation from TS-generated artifacts to canonical portable manifests plus generated SDK-specific outputs.
- `versioned-profiles`: require published profiles to preserve the same manifest identity and behavior across all first-party SDKs.
- `package-distribution`: extend distribution requirements from the npm package to the supported multi-ecosystem package set.

## Impact

- Affected code:
  - `src/`
  - `profiles/recipes/`
  - `tools/profile-compiler.mjs`
  - build, test, and release automation
- New systems:
  - canonical manifest output
  - conformance fixture generation and validation
  - per-language package directories and release workflows
- Affected APIs:
  - the runtime contract must be documented independently of the TypeScript API
  - each first-party SDK must expose an idiomatic surface while preserving shared parsing, rendering, and validation semantics
- Affected process:
  - releases must verify cross-language conformance, not just TypeScript package checks
