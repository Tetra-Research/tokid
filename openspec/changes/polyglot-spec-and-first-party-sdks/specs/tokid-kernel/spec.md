## ADDED Requirements

### Requirement: Kernel semantics are portable across first-party SDKs
The system SHALL define kernel behavior in language-neutral terms so every first-party SDK produces the same logical tokid outcomes for the same manifest inputs.

#### Scenario: Same logical tokid renders identically across SDKs
- **WHEN** two first-party SDKs render the same logical tokid with the same published profile and codec
- **THEN** they produce the same rendered value

#### Scenario: Same rendered tokid parses identically across SDKs
- **WHEN** two first-party SDKs parse the same valid prompt, transport, or envelope rendering for the same published profile
- **THEN** they reconstruct the same logical tokid record

### Requirement: Auto-parse behavior is portable across first-party SDKs
The system SHALL preserve the same codec auto-detection rules across first-party SDKs.

#### Scenario: Envelope parsing is attempted before payload parsing
- **WHEN** a caller parses a rendered value using automatic codec detection
- **THEN** each first-party SDK attempts durable envelope parsing before applying payload heuristics

#### Scenario: Payload auto-detection distinguishes prompt from transport consistently
- **WHEN** automatic codec detection falls back to payload parsing
- **THEN** each first-party SDK treats whitespace-containing values as prompt payloads and non-whitespace values as transport payloads

