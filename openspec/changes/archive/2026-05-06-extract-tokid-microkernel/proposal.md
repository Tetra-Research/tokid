## Why

`tokid` has now proved the core idea well enough to justify a real library, but the current extraction is still too tied to one OpenAI-shaped default vocabulary and one set of rendering policies. If this is going to survive broader usage and future model churn, the stable part of the project needs to become a small versioned microkernel with pluggable profiles rather than a package whose core contract is implicitly defined by the current study artifacts.

## What Changes

- Refactor the library around a logical tokid model that is distinct from any one rendered string view.
- Introduce embedded, versioned profile manifests that define atom vocabularies, render codecs, and entropy metadata as stable package artifacts instead of runtime study inputs.
- Add explicit parse, render, generate, inspect, and validate semantics keyed by profile and format version.
- Add format integrity features for persisted and shared IDs, including version signaling and typo-detection support.
- Re-scope the current OpenAI-tuned behavior as an initial profile rather than the universal core model.
- Clarify the public documentation so the package is positioned as a token-native ID microkernel with replaceable profiles, not a one-off OpenAI wordlist experiment.

## Capabilities

### New Capabilities
- `tokid-kernel`: Logical tokid records with stable generate, parse, render, validate, and inspect behavior independent of any specific tokenizer study output.
- `versioned-profiles`: Embedded profile manifests with explicit identifiers, vocabulary metadata, codec metadata, and compatibility/version information.
- `format-integrity`: Versioned tokid wire formats with integrity metadata suitable for durable transport, persistence, and user-facing validation.

### Modified Capabilities

None.

## Impact

- Affected code: `src/`, CLI entrypoints, tests, package exports, and generated profile artifacts.
- Affected docs: `README.md` and future profile-specific documentation.
- Affected studies/artifacts: study outputs remain the source material for profile compilation, but no longer define runtime behavior directly.
- API impact: the current prompt/transport string-first API will be reshaped around logical IDs and profile-aware rendering; this is likely a breaking public API change before a real release.
