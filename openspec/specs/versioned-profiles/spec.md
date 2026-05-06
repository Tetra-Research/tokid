# versioned-profiles Specification

## Purpose
Define the embedded, versioned profile manifests that the `tokid` runtime ships and validates.

## Requirements

### Requirement: The runtime ships embedded versioned profile manifests
The system SHALL ship a published set of embedded profile manifests as package artifacts rather than deriving runtime behavior from mutable study outputs or manual runtime generation.

#### Scenario: Default profile loads without study artifacts
- **WHEN** a caller uses the default profile in an installed runtime package
- **THEN** the profile loads successfully without reading files from `study/`

#### Scenario: Multiple embedded profiles are available to callers
- **WHEN** a caller lists or inspects the embedded profiles in an installed runtime package
- **THEN** the runtime exposes every published embedded profile manifest that ships with that package version

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

### Requirement: Embedded profiles can vary transport decoding policy
The runtime SHALL support embedded profiles that share a provider family and candidate lineage but use different transport decoding policies.

#### Scenario: Delimiterless profile declares deterministic transport decoding
- **WHEN** a caller inspects a delimiterless transport profile
- **THEN** the manifest declares the decodability metadata needed for deterministic parsing of that transport payload

#### Scenario: Separator-based profile declares separator transport decoding
- **WHEN** a caller inspects a separator-based transport profile
- **THEN** the manifest declares a separator-decoded transport payload without requiring delimiterless prefix-free semantics
