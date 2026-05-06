## Why

`tokid` now has a real microkernel, but the package is still not safe to publish as an alpha. Profile artifacts are hand-frozen, the package boundary still includes research-only material, and the compatibility guarantees for early users are not yet explicit.

## What Changes

- Add a deterministic profile compiler flow that turns pinned study outputs plus profile recipes into embedded generated profile artifacts.
- Add a second embedded OpenAI-derived profile variant that proves the kernel supports different transport-decoding policies without changing the core runtime model.
- Tighten the publish surface so the alpha package ships runtime code, embedded profiles, and package docs instead of the full research repo.
- Document the alpha guarantees and non-goals for profile stability, envelope compatibility, checksum semantics, and tokenizer-optimization scope.

## Capabilities

### New Capabilities
- `profile-compilation`: Deterministically compile profile recipes and pinned study artifacts into embedded runtime manifests with reproducibility checks.
- `package-distribution`: Publish a runtime-focused alpha package with a constrained file/dependency surface and an explicit early-user compatibility contract.

### Modified Capabilities
- `versioned-profiles`: Expand embedded profile support from a single frozen manifest to a reproducible multi-profile set with variant-specific lineage and decoding policies.

## Impact

- Affected code: `src/profiles/*`, profile-loading surface, CLI/profile inspection output, build scripts, and package metadata.
- Affected systems: profile generation workflow, package publishing flow, and README/package-facing docs.
- Dependencies: move study-only dependencies out of the runtime package surface and add build-time profile compilation tooling.
- APIs: no intended breaking change to the existing kernel API, but the set of embedded profiles and documented guarantees will expand.
