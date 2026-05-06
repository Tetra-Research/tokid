## 1. Profile Compiler

- [x] 1.1 Define the internal profile recipe format and add pinned recipe files for the OpenAI-derived profile family
- [x] 1.2 Implement a deterministic profile compilation command that reads recipe inputs and emits generated profile artifacts under `src/profiles/`
- [x] 1.3 Add a profile verification command that fails when generated artifacts are stale relative to the current recipes or pinned source artifacts

## 2. Embedded Profile Set

- [x] 2.1 Regenerate `openai-cross-v1` through the compiler so the current default profile is compiler-owned rather than hand-frozen
- [x] 2.2 Add the conservative underscore transport profile variant and generate its embedded manifest from the same candidate frontier
- [x] 2.3 Update the profile registry, CLI inspection output, and tests to cover multiple embedded profiles and distinct transport decoding policies

## 3. Publish Surface

- [x] 3.1 Split runtime packaging from repo/study build output so publishable artifacts exclude studies, tests, and agent/OpenSpec files
- [x] 3.2 Tighten `package.json` metadata, exports, and dependency scopes so normal runtime installation does not require study-only packages
- [x] 3.3 Add a packlist verification step that checks the alpha tarball contains only the supported runtime surface

## 4. Alpha Contract

- [x] 4.1 Update package-facing docs to describe the embedded profile set, profile immutability, durable-envelope compatibility, and checksum/tokenizer-scope non-goals
- [x] 4.2 Document the second profile as an opt-in transport variant unless the implementation work demonstrates it should replace the current default
- [x] 4.3 Run end-to-end verification for profile compilation, tests, and dry-run packaging and record the exact commands in the change notes

## Verification

- `node tools/profile-compiler.mjs build`
- `npm test`
- `npm install --package-lock-only`
- `npm run verify:profiles`
- `npm run verify:pack`
- `node dist/package/cli.js profiles`
- `node dist/package/cli.js profile openai-cross-underscore-v1`
- `node dist/package/cli.js generate --profile openai-cross-underscore-v1 --length 4 --codec envelope`
- `node dist/package/cli.js parse 'tk1~oa1u~output_force_dirty_noise~16srn' --codec envelope`
