## ADDED Requirements

### Requirement: Shared conformance vectors define portable tokid behavior
The system SHALL publish a language-neutral conformance suite with deterministic fixtures for the runtime behaviors that first-party SDKs must implement consistently.

#### Scenario: Conformance suite covers successful round-trips
- **WHEN** a maintainer runs the shared conformance suite
- **THEN** it includes fixtures for prompt, transport, and envelope renderings that decode back to the same logical tokid

#### Scenario: Conformance suite covers invalid inputs
- **WHEN** a maintainer runs the shared conformance suite
- **THEN** it includes fixtures for malformed profiles, malformed payloads, malformed envelopes, checksum failures, and decoding ambiguities that must be rejected

### Requirement: Deterministic generation parity is proven with scripted randomness
The conformance suite SHALL include deterministic generation vectors that prove every first-party SDK performs the same atom selection and rendering for the same profile and byte stream.

#### Scenario: Shared byte stream yields the same logical tokid
- **WHEN** two first-party SDKs generate a tokid from the same profile, requested length, and scripted random byte stream
- **THEN** they produce the same logical tokid atom sequence

#### Scenario: Shared byte stream yields the same envelope rendering
- **WHEN** two first-party SDKs render the deterministically generated tokid as an envelope
- **THEN** they produce the same envelope string

### Requirement: First-party releases are gated by conformance
Every first-party SDK SHALL pass the shared conformance suite before it is released as an official package.

#### Scenario: SDK release is blocked by conformance failure
- **WHEN** a first-party SDK fails any required conformance vector
- **THEN** that SDK is not eligible for release as a conforming official package

