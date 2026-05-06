## ADDED Requirements

### Requirement: Profile artifacts are compiled deterministically from pinned inputs
The system SHALL compile embedded profile artifacts from explicit profile recipes and pinned study artifacts rather than from manual edits or runtime derivation.

#### Scenario: Regenerating a profile reproduces the checked-in artifact
- **WHEN** a maintainer runs the profile compilation flow without changing the recipe or its pinned source artifacts
- **THEN** the generated profile artifact is byte-for-byte equivalent to the checked-in generated artifact

#### Scenario: Compiled profile records its source recipe and lineage
- **WHEN** the compiler emits an embedded profile manifest
- **THEN** the manifest includes the source artifact lineage and filter metadata needed to explain how that profile was derived

### Requirement: Profile recipes declare decoding-policy-specific reduction rules
The compiler SHALL support recipe-defined candidate filtering, ordering, and reduction rules so profiles with different transport decoding policies can be generated from the same candidate frontier.

#### Scenario: Delimiterless transport recipe enforces prefix-free reduction
- **WHEN** a recipe declares a delimiterless transport payload with prefix-free decoding
- **THEN** the compiler reduces the eligible atom set so the generated transport payload decodes deterministically

#### Scenario: Separator transport recipe retains eligible atoms without prefix-free reduction
- **WHEN** a recipe declares a separator-decoded transport payload
- **THEN** the compiler keeps the eligible atoms allowed by that recipe without applying delimiterless prefix-free reduction

### Requirement: Stale generated profile artifacts are detected before release
The system SHALL provide a verification path that fails when generated profile artifacts no longer match the current recipes and pinned source artifacts.

#### Scenario: Out-of-date generated profile fails verification
- **WHEN** a recipe or pinned source artifact changes without regenerating the profile artifact
- **THEN** the profile verification command reports the generated artifact as stale
