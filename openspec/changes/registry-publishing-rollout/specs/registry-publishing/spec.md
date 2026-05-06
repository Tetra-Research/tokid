## ADDED Requirements

### Requirement: The project defines an official first-party registry rollout
The system SHALL define the official release order and readiness state for each first-party SDK ecosystem rather than implying that every SDK is equally publishable at the same time.

#### Scenario: Maintainer checks registry rollout plan
- **WHEN** a maintainer prepares a `tokid` release
- **THEN** the documentation identifies which SDK ecosystems are `publish-now`, `publish-after-hardening`, or `not-ready`, and describes the intended release order for those ecosystems

### Requirement: Official publishes are gated by shared verification
Every official first-party publish action SHALL require the shared release gate to pass before a registry upload, release tag, or equivalent official release step is executed.

#### Scenario: Shared release gate fails before publish
- **WHEN** manifest verification, runtime tests, conformance checks, or required package verification fails
- **THEN** the publish workflow blocks the official release for that SDK ecosystem

### Requirement: Registry-specific publish paths are explicit
The system SHALL define the release command and registry-specific release mechanism for each first-party SDK ecosystem.

#### Scenario: Maintainer releases a first-party SDK
- **WHEN** a maintainer publishes or tags an official first-party SDK release
- **THEN** the repo provides a documented and repeatable release path for that ecosystem, including whether release occurs by package upload, git tag, or another registry-specific mechanism

### Requirement: First-party release status is documented per ecosystem
The system SHALL document whether each first-party SDK is already published, planned for the next wave, or blocked on additional hardening.

#### Scenario: Consumer evaluates an SDK package channel
- **WHEN** a consumer reads the repo-level SDK matrix or release documentation
- **THEN** it is clear whether that ecosystem is already live, planned for a later wave, or not yet ready for official publication
