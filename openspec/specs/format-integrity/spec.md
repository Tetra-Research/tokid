# format-integrity Specification

## Purpose
TBD - created by archiving change extract-tokid-microkernel. Update Purpose after archive.
## Requirements
### Requirement: The system provides a durable tokid envelope format
The system SHALL provide at least one durable envelope format for persisted and shared tokids that carries explicit profile/version metadata around the token payload.

#### Scenario: Render durable envelope
- **WHEN** a caller renders a logical tokid using the durable envelope codec
- **THEN** the rendered value includes the information needed to identify the intended profile and format version

#### Scenario: Parse durable envelope
- **WHEN** a caller parses a valid durable envelope
- **THEN** the system reconstructs the original logical tokid and reports the profile and codec used

### Requirement: Durable envelopes include integrity metadata
The durable envelope format SHALL include integrity metadata that allows the runtime to detect malformed, truncated, or mistyped IDs.

#### Scenario: Typo is detected during validation
- **WHEN** a caller validates an envelope whose payload or integrity metadata has been altered
- **THEN** the system rejects the value as invalid

#### Scenario: Truncated envelope is rejected
- **WHEN** a caller parses an envelope missing required payload or integrity content
- **THEN** the system rejects the value as invalid

### Requirement: Bare payload codecs remain available separately from durable envelopes
The system SHALL preserve access to bare prompt and transport payload renderings without forcing callers to use the durable envelope format in all contexts.

#### Scenario: Caller requests bare transport payload
- **WHEN** a caller renders a logical tokid using the bare transport payload codec
- **THEN** the system returns the compact payload without durable envelope metadata

#### Scenario: Caller chooses between payload and envelope explicitly
- **WHEN** a caller renders or parses a tokid
- **THEN** the API distinguishes whether the operation targets a bare payload codec or a durable envelope codec

