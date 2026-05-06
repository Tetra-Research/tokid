## ADDED Requirements

### Requirement: First-party distribution is defined per supported ecosystem
The system SHALL define supported distribution artifacts for each official first-party SDK ecosystem rather than treating npm as the only package boundary.

#### Scenario: Official SDK publishes runtime-focused package artifacts
- **WHEN** a first-party SDK package is prepared for publication
- **THEN** it includes the supported runtime library artifacts, generated profile assets needed by that SDK, and package-facing documentation for that ecosystem without bundling study-only repository content

### Requirement: Multi-ecosystem releases are gated by shared verification
The release workflow SHALL require manifest verification and SDK conformance verification before publishing an official first-party SDK package.

#### Scenario: Publish workflow blocks unsupported package release
- **WHEN** a first-party SDK package has stale manifest assets or fails required conformance verification
- **THEN** the system blocks publication of that package as an official first-party release

### Requirement: Consumers can inspect SDK support status
The system SHALL document the official SDK matrix, package names, and capability tier for each first-party SDK release.

#### Scenario: Consumer checks SDK support matrix
- **WHEN** a consumer evaluates whether to adopt a first-party SDK
- **THEN** the published documentation identifies the SDK language, package distribution channel, and whether that SDK is core or full

