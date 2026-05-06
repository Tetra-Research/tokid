## ADDED Requirements

### Requirement: Profile compilation emits portable manifests before language-specific outputs
The compiler SHALL emit canonical portable manifest artifacts as the primary published build output from profile recipes and pinned study artifacts.

#### Scenario: Portable manifest is generated during profile compilation
- **WHEN** a maintainer runs the profile compilation flow
- **THEN** the build produces the portable manifest artifact before or alongside any generated language-specific profile source files

### Requirement: Language-specific profile outputs are derived from portable manifests
The compiler SHALL generate any language-specific profile registries or source modules from the same canonical portable manifest set.

#### Scenario: TypeScript profile registry reflects canonical manifest set
- **WHEN** the compiler generates the TypeScript runtime registry
- **THEN** it uses the same published profile data and default-profile designation as the canonical portable manifests

#### Scenario: Additional SDK outputs reflect canonical manifest set
- **WHEN** the compiler generates profile artifacts for another first-party SDK
- **THEN** those artifacts reflect the same vocabulary, codec metadata, entropy metadata, and lineage recorded in the canonical portable manifests

