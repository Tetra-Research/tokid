## MODIFIED Requirements

### Requirement: The alpha package ships only supported runtime artifacts
Each official first-party package SHALL ship a runtime-focused artifact set rather than the full research repository.

#### Scenario: Published package excludes research and agent files
- **WHEN** an official first-party package artifact is generated for publication
- **THEN** it excludes study outputs, tests, OpenSpec artifacts, and assistant-integration files that are not part of the supported runtime surface for that SDK

#### Scenario: Published package includes runtime entrypoints and embedded profiles
- **WHEN** an official first-party package artifact is generated for publication
- **THEN** it includes the runtime library entrypoints, generated profile assets needed by that SDK, and package-facing documentation required to use them

### Requirement: Runtime installation does not require study-only dependencies
Official first-party runtime packages SHALL avoid requiring tokenizer-analysis and vocabulary-ingestion dependencies for normal library and CLI use.

#### Scenario: Runtime consumer installs a first-party SDK package
- **WHEN** a consumer installs an official first-party SDK package to generate, render, parse, or validate tokids
- **THEN** those runtime operations do not depend on study-only packages that are only needed for research, profile compilation, or release engineering workflows

### Requirement: The alpha package documents its compatibility contract
Each official first-party package SHALL document the guarantees, non-goals, and current release status that apply to its published profiles and durable envelopes.

#### Scenario: Consumer reads package guarantees and release status
- **WHEN** a consumer reads the package-facing documentation for an official first-party SDK
- **THEN** it states that published profile identifiers are immutable, durable envelopes remain parseable for published profiles across future alpha releases, checksum metadata detects accidental corruption rather than providing authentication, tokenizer-optimization claims are limited to the documented study scope, and the SDK's current release status is explicit

## ADDED Requirements

### Requirement: Publishable first-party packages declare registry-required metadata
An official first-party SDK SHALL not be considered publishable until it includes the minimum package metadata required by its target registry and release workflow.

#### Scenario: Registry metadata is incomplete
- **WHEN** a maintainer attempts to mark a first-party SDK as publishable
- **THEN** the SDK remains blocked until its target registry metadata, package identity, and release plumbing meet the documented minimum contract for that ecosystem
