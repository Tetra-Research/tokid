## Why

`tokid` now has a real multi-language SDK surface, but only the npm package is close to registry-ready. We need a deliberate publishing plan so early releases are credible, sequenced, and gated by the same verification contract rather than pushing half-prepared packages into six ecosystems at once.

## What Changes

- Define an official first-party publishing rollout across npm, PyPI, Go modules, crates.io, Maven Central, and NuGet.
- Add release readiness levels so maintainers can distinguish “publish now”, “publish after metadata hardening”, and “not ready yet” per ecosystem.
- Require registry-facing package metadata and release commands to meet the minimum contract for each supported ecosystem before that SDK is considered publishable.
- Document the release order, tag/version conventions, and verification gates that apply before any first-party SDK is published.
- **BREAKING**: official first-party publishing claims will become explicit and per-registry instead of implied by the existence of code under `packages/*`.

## Capabilities

### New Capabilities
- `registry-publishing`: defines the supported first-party registry rollout, readiness levels, release order, publish commands, and verification gates for each ecosystem

### Modified Capabilities
- `package-distribution`: package distribution requirements now extend beyond “packaged correctly” to “publishable with registry-required metadata and documented release status”

## Impact

- Affected code: `tools/release/*`, CI/release workflows, root documentation, and per-SDK package metadata
- Affected systems: npm, PyPI, Go module tagging, crates.io, Maven Central, and NuGet release flows
- Affected process: release sequencing, version/tag policy, and the definition of what counts as an official published SDK
