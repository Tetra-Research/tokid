## 1. Release Contract

- [x] 1.1 Add a repo-level readiness matrix that marks each first-party SDK as `publish-now`, `publish-after-hardening`, or `not-ready`
- [x] 1.2 Document the official release order, versioning policy, and per-ecosystem publish commands in the root and package-facing docs
- [x] 1.3 Update release workflows and helper scripts so official publish actions require the shared release gate before proceeding

## 2. Wave 1: npm

- [x] 2.1 Finalize npm package metadata and confirm the JavaScript SDK remains publishable after a packed-artifact dry run
- [x] 2.2 Publish the JavaScript package as the first public alpha release and update docs to mark npm as live

## 3. Wave 2: Python, Rust, and Go

- [x] 3.1 Add missing PyPI metadata and a repeatable build/upload dry-run path for the Python SDK
- [x] 3.2 Add missing crates.io metadata and a repeatable publish dry-run path for the Rust SDK
- [x] 3.3 Define the Go module versioning and tagging policy, then document and execute the first official Go module release tag
- [x] 3.4 Publish or tag the Wave 2 SDKs that pass their registry-specific hardening checks and update docs to reflect their live status

## 4. Wave 3: Maven Central and NuGet

- [x] 4.1 Add Maven Central-required package metadata, artifact generation, and documented deploy steps for the JVM SDK
- [x] 4.2 Add NuGet-required package metadata and a repeatable pack/push workflow for the .NET SDK
- [ ] 4.3 Reclassify the JVM and .NET SDKs from `publish-after-hardening` to live only after their registry-specific release checks pass
  Current todo:
  Maven Central is still blocked because Sonatype is not resolving public key fingerprint `479D41DBDF301A4C66FA292A06A4E02A1FD498FB` during deployment validation.
  NuGet is still blocked because there is no nuget.org account/API key configured yet.

## 5. Post-Release Status

- [x] 5.1 Update the support matrix and package READMEs after each successful registry release so published versus planned ecosystems stay explicit
- [x] 5.2 Record any blocked registries, missing metadata, or registry-specific follow-up work without weakening the shared release gate
