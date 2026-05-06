## 1. Shared Foundations

- [x] 1.1 Restructure the repo around shared spec assets, portable manifests, conformance fixtures, and per-language package roots.
- [x] 1.2 Define the canonical portable manifest and registry locations that all first-party SDKs will consume.
- [x] 1.3 Preserve the existing study pipeline while decoupling it from the runtime package layout.

## 2. Portable Manifest Pipeline

- [x] 2.1 Extend the profile compiler to emit canonical portable manifest artifacts and a portable registry from the existing recipes and pinned study inputs.
- [x] 2.2 Update profile verification to fail when portable manifests or derived language-specific artifacts are stale.
- [x] 2.3 Regenerate the current published profiles through the portable manifest pipeline and record the canonical output set.

## 3. Conformance Suite

- [x] 3.1 Define the shared conformance fixture format for valid and invalid profiles, payloads, envelopes, and deterministic generation cases.
- [x] 3.2 Generate cross-language vectors for prompt, transport, envelope, checksum, and scripted-randomness behavior.
- [x] 3.3 Add a reusable conformance runner contract so each first-party SDK can report pass or fail against the same fixture set.

## 4. TypeScript / JavaScript SDK Migration

- [x] 4.1 Move the current JS/TS runtime into the new package structure and update it to consume the portable manifest artifacts.
- [x] 4.2 Verify that the JS/TS SDK passes the shared conformance suite without relying on TypeScript-generated profile modules as the canonical source of truth.
- [x] 4.3 Update the JS/TS package documentation and packaging metadata to describe it as one first-party SDK in the larger matrix.

## 5. Python, Go, and Rust SDKs

- [x] 5.1 Implement the Python SDK core runtime surface and wire it into the shared conformance suite.
- [x] 5.2 Implement the Go SDK core runtime surface and wire it into the shared conformance suite.
- [x] 5.3 Implement the Rust SDK full runtime surface and wire it into the shared conformance suite.

## 6. Java / Kotlin and C# SDKs

- [x] 6.1 Implement the Java/Kotlin SDK core runtime surface and wire it into the shared conformance suite.
- [x] 6.2 Implement the C# SDK core runtime surface and wire it into the shared conformance suite.
- [x] 6.3 Document the capability tier and supported profile set for the JVM and .NET SDK releases.

## 7. Release and Documentation

- [x] 7.1 Add CI jobs that verify portable manifests and run required conformance checks for every first-party SDK.
- [x] 7.2 Add release workflows or release scripts for npm, PyPI, Go module tagging, crates.io, Maven Central, and NuGet.
- [x] 7.3 Publish a package-facing support matrix that lists official SDKs, package channels, profile support, and core versus full capability tier.
