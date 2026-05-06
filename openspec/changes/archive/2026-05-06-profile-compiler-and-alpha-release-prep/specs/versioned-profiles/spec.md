## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Embedded profiles can vary transport decoding policy
The runtime SHALL support embedded profiles that share a provider family and candidate lineage but use different transport decoding policies.

#### Scenario: Delimiterless profile declares deterministic transport decoding
- **WHEN** a caller inspects a delimiterless transport profile
- **THEN** the manifest declares the decodability metadata needed for deterministic parsing of that transport payload

#### Scenario: Separator-based profile declares separator transport decoding
- **WHEN** a caller inspects a separator-based transport profile
- **THEN** the manifest declares a separator-decoded transport payload without requiring delimiterless prefix-free semantics
