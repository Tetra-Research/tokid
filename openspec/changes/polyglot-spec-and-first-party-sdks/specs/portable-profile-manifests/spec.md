## ADDED Requirements

### Requirement: The compiler emits canonical portable profile manifests
The system SHALL compile published profile data into a language-neutral manifest format that is independent of any single SDK implementation language.

#### Scenario: Portable manifest is emitted from a published recipe
- **WHEN** a maintainer compiles a published profile recipe
- **THEN** the build produces a canonical portable manifest artifact containing the profile identity, vocabulary, codec metadata, entropy metadata, and source lineage

#### Scenario: Portable registry identifies the published default profile
- **WHEN** a caller or SDK loads the portable profile registry
- **THEN** the registry identifies the published profile set and the default profile without requiring language-specific generated code

### Requirement: Portable manifests retain full runtime semantics
Each portable profile manifest SHALL contain the data required for generation, rendering, parsing, validation, and inspection in every first-party SDK.

#### Scenario: SDK loads transport decoding metadata from manifest
- **WHEN** a first-party SDK loads a portable manifest for a delimiterless or separator-decoded profile
- **THEN** it can determine the transport decoding mode and the payload or envelope separators from manifest data alone

#### Scenario: SDK loads profile lineage from manifest
- **WHEN** a caller inspects a portable manifest in any first-party SDK
- **THEN** the SDK can report the profile version, profile tag, source recipe, and source artifact lineage recorded in the canonical manifest

### Requirement: Language-specific bindings are derived from portable manifests
The system SHALL treat generated language bindings and registries as derived outputs of the portable manifests rather than as the canonical source of published profile behavior.

#### Scenario: Language-specific registry matches portable manifest set
- **WHEN** the build generates language-specific profile registry artifacts
- **THEN** those artifacts reflect the same published profile set and default profile declared by the portable registry

