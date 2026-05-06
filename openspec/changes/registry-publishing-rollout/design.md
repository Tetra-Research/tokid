## Context

`tokid` now has first-party SDKs for JavaScript, Python, Go, Rust, Java/Kotlin, and C#. The runtime contract, manifest compiler, and conformance suite exist, but the registry story is uneven: npm is close to publishable, PyPI and crates.io are near-ready, Go depends mostly on tag discipline, and Maven Central / NuGet still need package-metadata and release-process hardening.

The main constraint is credibility. Publishing every SDK at once would create a weak first release because the least-ready registries would define the quality bar. The design therefore needs to preserve one shared release contract while allowing staged registry rollout.

## Goals / Non-Goals

**Goals:**
- Define a first-party registry rollout that is explicit about which ecosystems are publishable now versus later
- Require a shared release gate before any official package is published
- Define the minimum registry metadata and release plumbing required before an SDK is considered publishable
- Document versioning, tagging, and release order so maintainers can publish consistently

**Non-Goals:**
- Achieve full feature-parity across every SDK before the first public release
- Publish every registry in the same change
- Redesign the runtime contract, profile manifests, or conformance suite
- Add new SDK languages or new tokenizer profiles as part of release hardening

## Decisions

### Decision: Use a staged registry rollout instead of simultaneous publication

The release plan will be broken into waves:

- Wave 1: npm
- Wave 2: PyPI, crates.io, Go module tagging
- Wave 3: Maven Central and NuGet after metadata hardening

Why:
- npm is already closest to publishable
- Python, Rust, and Go are mechanically close but still need explicit release metadata and policy
- Java and .NET require more registry-specific packaging work than the other SDKs

Alternatives considered:
- Publish everything immediately: rejected because it would force low-quality registry metadata and brittle release steps into the first launch
- Publish npm only and ignore the rest: rejected because the repo now claims a first-party SDK matrix and needs an explicit plan for the rest

### Decision: Keep one shared release gate, then add registry-specific checks on top

Every official publish command will continue to depend on the same core gate:

- manifest verification
- JS test suite
- polyglot conformance suite
- packaged-artifact verification for the JS package

Registry-specific publishability will then add local checks such as:

- npm: publishable tarball and package metadata
- PyPI: buildable sdist/wheel and PyPI metadata
- crates.io: crate metadata completeness and publishable crate build
- Go: semver tag creation and documented module path policy
- Maven Central: required POM metadata, signing-ready deploy flow, and source/javadoc artifacts
- NuGet: package metadata completeness and pack/push readiness

Why:
- the shared release gate keeps runtime behavior trustworthy across ecosystems
- registry-specific checks prevent us from pretending ecosystems have identical packaging needs

Alternatives considered:
- Separate release gates per ecosystem: rejected because it would weaken the single contract for official SDK behavior

### Decision: Make readiness a documented state, not an implicit judgment

Each first-party SDK will be assigned a release readiness level:

- `publish-now`
- `publish-after-hardening`
- `not-ready`

This status will be documented in the root README and any release-planning documentation.

Why:
- maintainers need a durable way to talk about release state without conflating “code exists” with “package is ready”
- users evaluating the repo need to know whether a package is truly available versus only planned

Alternatives considered:
- Binary ready/not-ready labeling: rejected because it hides meaningful sequencing for ecosystems that are close but still blocked on registry details

### Decision: Treat registry metadata as part of the supported package contract

A first-party SDK is not considered publishable just because it builds. Publishable means:

- registry-required metadata is present
- package naming and versioning are coherent with the repo’s alpha policy
- the release command is documented and repeatable
- the registry artifact is consistent with the documented support matrix

Why:
- the missing work is now mostly package metadata and release discipline, not runtime implementation
- this aligns the docs with what a consumer actually sees in a registry

Alternatives considered:
- Leave metadata cleanup as ad hoc follow-up work: rejected because it would make the publishing plan non-executable

## Risks / Trade-offs

- [Staged rollout creates temporary ecosystem imbalance] → Mitigation: document readiness levels and release order explicitly so unsupported registries are not implied to be live
- [Shared release gate may feel heavy for single-registry publishes] → Mitigation: keep the core gate stable and automate it through release scripts rather than relaxing the contract
- [Registry-specific metadata requirements may change] → Mitigation: encode the minimum current release contract in docs and release scripts, then iterate as registries impose stricter requirements
- [Go release flow differs from package registries] → Mitigation: document Go tagging as a first-class release path instead of forcing it into npm/PyPI mental models

## Migration Plan

1. Record the official readiness matrix and release order
2. Harden npm to be the first public package
3. Add missing metadata and dry-run release validation for Python, Rust, and Go
4. Add Maven Central and NuGet packaging metadata and release plumbing
5. Publish registries in wave order, updating docs as each ecosystem becomes live

Rollback strategy:
- if a registry-specific rollout fails, keep the SDK in its prior readiness state and do not mark it as officially published
- do not weaken the shared release gate to rescue a blocked registry

## Open Questions

- Whether the repository should archive the completed polyglot change before release execution starts
- Whether npm, PyPI, crates.io, and NuGet names are all still available exactly as planned at publish time
- Whether Java should publish from this repo directly or move to a more Central-friendly release toolchain before first release
