## 1. Profile Artifacts

- [x] 1.1 Define typed profile manifest structures for vocabularies, codec declarations, source lineage, and entropy metadata.
- [x] 1.2 Generate and check in the first embedded OpenAI-cross profile artifact from the current study outputs instead of reading `study/**/results` at runtime.
- [x] 1.3 Add profile validation logic for duplicate atoms, syntax constraints, and delimiterless transport decodability.
- [x] 1.4 Add tests that load the embedded profile artifact and reject malformed custom profiles.

## 2. Kernel Refactor

- [x] 2.1 Introduce a logical tokid record centered on `profileId` and ordered atoms.
- [x] 2.2 Refactor generation, parsing, rendering, validation, and inspection APIs to be explicitly profile-aware kernel operations.
- [x] 2.3 Separate payload codecs from logical ID storage so prompt and transport renderings become derived views.
- [x] 2.4 Update existing tests to verify that multiple renderings resolve back to the same logical tokid record.

## 3. Durable Envelope And Integrity

- [x] 3.1 Define the first durable envelope codec with explicit profile/version signaling around the payload.
- [x] 3.2 Implement envelope render, parse, and validate flows with integrity metadata for typo/truncation detection.
- [x] 3.3 Preserve bare prompt and bare transport payload rendering as explicit codec choices alongside the durable envelope.
- [x] 3.4 Add tests covering valid envelopes, altered payloads, altered integrity metadata, and truncated values.

## 4. Public Surface And Verification

- [x] 4.1 Update CLI commands, package exports, and examples to use profile-aware kernel concepts instead of string-first helpers.
- [x] 4.2 Rewrite README guidance to explain the microkernel model, the first embedded profile, and the difference between payloads and durable envelopes.
- [x] 4.3 Verify the change with `npm test` and targeted CLI checks for profile inspection, generation, and parsing.
