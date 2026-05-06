# Releasing

`tokid` now has multiple first-party SDKs, but they do not all ship on the same timeline.

This file is the maintainer-facing release contract:

- one shared verification gate for every official release
- explicit release waves
- explicit readiness states
- explicit per-ecosystem publish commands

## Shared Gate

Every official release starts here:

```bash
npm run release:check
```

That gate covers:

- embedded profile verification
- JavaScript tests
- cross-language conformance
- JavaScript packlist verification
- JavaScript packed-artifact smoke testing

Official publish helpers run the same gate automatically unless CI already ran it and passes `--skip-check`.

## Versioning Policy

All first-party SDKs track the same logical alpha line, but each registry uses its native version syntax:

| Ecosystem | Release version |
|---|---|
| npm | `0.1.0-alpha.2` |
| PyPI | `0.1.0a2` |
| crates.io | `0.1.0-alpha.2` |
| Go module tag | `packages/go/v0.1.0-alpha.2` |
| Maven Central | `0.1.0-alpha.2` |
| NuGet | `0.1.0-alpha.2` |

The canonical release number is driven from the JavaScript SDK version for this alpha line. When the logical release changes, update every first-party package version before tagging or uploading.

## Release Waves

| Wave | Ecosystems | Goal |
|---|---|---|
| 1 | npm | first public package |
| 2 | PyPI, crates.io, Go tags | broaden first-party SDK availability once metadata and dry-runs are clean |
| 3 | Maven Central, NuGet | publish after registry-specific packaging hardening and credential setup |

## Readiness Matrix

Readiness states:

- `publish-now`: metadata and dry-run path are in place; the remaining blocker is release credentials and execution
- `publish-after-hardening`: SDK exists, but registry-facing metadata or packaging flow still needs work
- `not-ready`: runtime exists but there is no supported first-party release path yet

Current rollout state:

| SDK | Channel | Wave | Readiness | Registry status |
|---|---|---|---|---|
| JavaScript / TypeScript | npm `tokid` | 1 | `publish-now` | live on npm as `0.1.0-alpha.1` |
| Python | PyPI `tokid` | 2 | `publish-now` | not yet published |
| Go | `github.com/Tetra-Research/tokid/packages/go` | 2 | `publish-now` | not yet tagged |
| Rust | crates.io `tokid` | 2 | `publish-now` | not yet published |
| Java / Kotlin | Maven Central `io.tokid:tokid` | 3 | `publish-now` | not yet published |
| C# / .NET | NuGet `Tokid` | 3 | `publish-now` | not yet published |

## Publish Commands

Dry-run commands:

```bash
npm run release:npm:dry-run
npm run release:pypi:dry-run
npm run release:go:dry-run
npm run release:rust:dry-run
npm run release:maven:dry-run
npm run release:nuget:dry-run
```

Official release commands:

```bash
npm run release:npm
npm run release:pypi
npm run release:go -- --push
npm run release:rust
npm run release:maven
npm run release:nuget
```

Trusted-publishing release path for npm and PyPI:

```bash
git tag v0.1.0-alpha.2
git push origin v0.1.0-alpha.2
```

Notes by ecosystem:

- `.github/workflows/publish.yml` is the preferred live release path for npm and PyPI now that both registries are configured for GitHub Actions trusted publishing.
- `release:npm` remains useful for local dry-runs and manual fallback publishes; in CI it publishes the `packages/js` package to npm with the `alpha` dist-tag.
- `release:pypi` remains a manual fallback path; it builds an sdist and wheel in a temporary release venv, runs `twine check`, then uploads with `twine`.
- `release:go -- --push` creates and pushes the submodule tag that Go consumers resolve by semver.
- `release:rust` runs `cargo publish`.
- `release:maven` runs the Central-ready Maven profile. Dry-run uses `verify`; live release uses `deploy`.
- `release:nuget` packs the `.nupkg` first and only pushes after a successful pack.

## Registry-Specific Notes

- npm trusted publishing is configured against `.github/workflows/publish.yml`; official CI releases no longer require `NPM_TOKEN`.
- PyPI has a pending trusted publisher configured against `.github/workflows/publish.yml`; the first successful CI publish will create the `tokid` project.
- Manual `release:pypi` runs still require credentials accepted by `twine upload`.
- crates.io publish requires a cargo registry token.
- Go release tagging requires a clean tree and git push access.
- Maven Central requires credentials plus a usable GPG signing setup.
- NuGet requires a valid API key for `dotnet nuget push`.

## Blockers To Record, Not Hide

If a registry is blocked, keep the SDK in its current readiness state and update the status note instead of weakening the shared gate.

Current known blockers from this checkout:

- npm is already live; the next npm release should go through the trusted-publishing workflow
- PyPI is pending first live publish; the trusted publisher is configured but the project does not exist yet
- crates.io publish is blocked locally until a cargo token is configured
- official Go release tagging is blocked until the current release hardening changes are committed and pushed
- Maven Central deploy is blocked locally until credentials and signing are configured
- NuGet push is blocked locally until a NuGet API key is configured
