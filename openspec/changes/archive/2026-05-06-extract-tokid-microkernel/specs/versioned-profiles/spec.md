## ADDED Requirements

### Requirement: The runtime ships embedded versioned profile manifests
The system SHALL ship profile manifests as package artifacts embedded with the runtime rather than deriving runtime behavior from mutable study outputs.

#### Scenario: Default profile loads without study artifacts
- **WHEN** a caller uses the default profile in an installed runtime package
- **THEN** the profile loads successfully without reading files from `study/`

#### Scenario: Profile manifest is inspectable
- **WHEN** a caller inspects an embedded profile
- **THEN** the system returns profile identifier, profile version, source lineage, atom count, and entropy metadata

### Requirement: Profile manifests declare parsing and rendering constraints
Each profile manifest SHALL declare the codec metadata and vocabulary constraints required for generation, parsing, and validation.

#### Scenario: Delimiterless transport requires explicit decodability metadata
- **WHEN** a profile advertises a delimiterless transport payload codec
- **THEN** the profile also declares the constraints needed for deterministic decoding of that payload

#### Scenario: Unsupported profile is rejected deterministically
- **WHEN** a caller requests a profile identifier that is not embedded or registered
- **THEN** the system rejects the request with a deterministic error

### Requirement: Invalid profiles are rejected before use
The system SHALL validate embedded or user-supplied profiles before permitting generation or parsing through them.

#### Scenario: Prefix collision makes profile invalid for delimiterless transport
- **WHEN** a profile contains atoms that make its declared delimiterless transport codec ambiguous
- **THEN** the system rejects the profile as invalid

#### Scenario: Duplicate or malformed atoms are rejected
- **WHEN** a profile contains duplicate atoms or atoms outside its declared syntax constraints
- **THEN** the system rejects the profile as invalid
