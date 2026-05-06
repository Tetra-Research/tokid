## ADDED Requirements

### Requirement: Published profile identity is preserved across first-party SDKs
The system SHALL preserve the same published profile identifiers, tags, versions, vocabulary, and codec metadata across all first-party SDKs that ship a given profile.

#### Scenario: Same published profile appears identically in multiple SDKs
- **WHEN** a consumer inspects a published profile in two different first-party SDKs
- **THEN** both SDKs report the same profile identifier, profile tag, profile version, codec set, and vocabulary-derived entropy metadata

### Requirement: Profile additions and removals are reflected deliberately across the SDK matrix
The system SHALL make profile availability an explicit part of each first-party SDK release rather than allowing silent divergence in the published profile set.

#### Scenario: SDK release declares supported published profiles
- **WHEN** a first-party SDK is released
- **THEN** its release artifacts or documentation identify which published profiles from the canonical manifest set it supports

