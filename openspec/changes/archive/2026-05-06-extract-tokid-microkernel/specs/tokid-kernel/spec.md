## ADDED Requirements

### Requirement: Logical tokids are profile-aware structured identifiers
The system SHALL represent a tokid as a logical identifier that includes its profile identity and ordered atom sequence, independent of any rendered string form.

#### Scenario: Generated tokid returns a logical identifier
- **WHEN** a caller generates a tokid for a specific profile
- **THEN** the system returns a logical tokid record containing the profile identifier and ordered atoms

#### Scenario: Rendering does not change logical identity
- **WHEN** a caller renders the same logical tokid into multiple supported views
- **THEN** each rendered value resolves back to the same logical tokid record

### Requirement: Kernel operations are defined in terms of profiles and codecs
The system SHALL expose generation, parsing, rendering, validation, and inspection behavior through explicit profile-aware kernel operations rather than through string-only helpers.

#### Scenario: Parse with explicit profile and codec
- **WHEN** a caller parses a rendered tokid with a specified profile and codec
- **THEN** the system decodes the value into a logical tokid record or returns a validation failure

#### Scenario: Inspect logical tokid metadata
- **WHEN** a caller inspects a logical tokid
- **THEN** the system reports profile identifier, atom count, supported renderings, and entropy metadata for that profile

### Requirement: Renderings are derived views, not primary storage
The system SHALL treat prompt, transport, and future representations as codecs applied to a logical tokid instead of as separate primary identifier types.

#### Scenario: Unsupported codec is rejected
- **WHEN** a caller requests rendering with a codec that the active profile does not advertise
- **THEN** the system rejects the request with a deterministic error

#### Scenario: Validation distinguishes logical and rendered forms
- **WHEN** a caller validates a rendered tokid string
- **THEN** the system evaluates it against the selected profile and codec rules rather than only checking that it is non-empty text
