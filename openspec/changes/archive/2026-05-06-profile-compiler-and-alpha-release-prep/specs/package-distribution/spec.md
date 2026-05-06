## ADDED Requirements

### Requirement: The alpha package ships only supported runtime artifacts
The published alpha package SHALL ship a runtime-focused artifact set rather than the full research repository.

#### Scenario: Packaged tarball excludes research and agent files
- **WHEN** the package tarball is generated for publication
- **THEN** it excludes study outputs, tests, OpenSpec artifacts, and assistant-integration files that are not part of the supported runtime surface

#### Scenario: Packaged tarball includes runtime entrypoints and embedded profiles
- **WHEN** the package tarball is generated for publication
- **THEN** it includes the runtime library entrypoints, CLI entrypoint, generated profile artifacts, and package-facing documentation required to use them

### Requirement: Runtime installation does not require study-only dependencies
The published runtime package SHALL avoid requiring tokenizer-analysis and vocabulary-ingestion dependencies for normal library and CLI use.

#### Scenario: Runtime consumer installs the package
- **WHEN** a consumer installs the published package to generate, render, parse, or validate tokids
- **THEN** those runtime operations do not depend on study-only packages that are only needed for research or profile compilation workflows

### Requirement: The alpha package documents its compatibility contract
The package SHALL document the guarantees and non-goals that apply to published profiles and durable envelopes.

#### Scenario: Consumer reads package guarantees
- **WHEN** a consumer reads the package-facing documentation
- **THEN** it states that published profile identifiers are immutable, durable envelopes remain parseable for published profiles across future alpha releases, checksum metadata detects accidental corruption rather than providing authentication, and tokenizer-optimization claims are limited to the documented study scope
