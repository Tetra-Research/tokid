## ADDED Requirements

### Requirement: The project defines an official first-party SDK matrix
The system SHALL define the supported first-party SDK languages for the polyglot `tokid` format.

#### Scenario: Supported SDK matrix is published
- **WHEN** a consumer reads the first-party SDK documentation
- **THEN** it lists TypeScript/JavaScript, Python, Go, Rust, Java/Kotlin, and C# as the official first-party SDK matrix for this change

### Requirement: Every first-party SDK exposes the core runtime contract
Every first-party SDK SHALL expose an idiomatic API for generation, parsing, validation, profile selection, and prompt, transport, and envelope rendering.

#### Scenario: Core SDK supports simple generation and parsing
- **WHEN** a caller uses any first-party SDK
- **THEN** the SDK provides a supported path to generate a tokid, validate a rendered value, parse it back to the logical tokid form, and convert between prompt, transport, and envelope renderings

#### Scenario: Core SDK supports published profile selection
- **WHEN** a caller selects a published profile in any first-party SDK
- **THEN** the SDK can generate and parse tokids according to that profile without relying on study artifacts at runtime

### Requirement: Capability tiers are explicit for first-party SDKs
The system SHALL distinguish between the minimum core SDK surface and the fuller advanced SDK surface so uneven maturity does not create ambiguous support claims.

#### Scenario: Core SDK omits advanced features explicitly
- **WHEN** a first-party SDK does not yet expose custom kernel construction or custom profile validation helpers
- **THEN** its documentation identifies that SDK as core-only rather than implying full parity with the most feature-rich SDKs

#### Scenario: Full SDK exposes advanced profile-aware operations
- **WHEN** a first-party SDK is documented as full
- **THEN** it exposes advanced operations for profile inspection, custom profile loading or validation, or equivalent profile-aware kernel usage

