## Context

The repo started as tokenizer research and now has an initial library extraction in `src/`, but that extraction still bakes policy into the core contract. The current runtime loads its default vocabulary from a study CSV, hardcodes a prompt-space view and a no-delimiter transport view, and treats rendered strings as the primary public concept instead of treating a tokid as a logical identifier with multiple codecs.

That shape is good enough to prove the transport result, but it is not stable enough for broader usage. The next step is to separate:

- the durable kernel contract
- the versioned profile artifacts that encode tokenizer-specific policy
- the study/compiler pipeline that produces those profiles

The current research gives us two constraints that matter for the design:

1. prompt-native and transport-native renderings are different concerns
2. no-delimiter transport payloads only remain round-trippable if the advertised profile is explicitly decodable

## Goals / Non-Goals

**Goals:**
- Define a small kernel API whose primary object is a logical tokid, not a single rendered string.
- Replace runtime dependence on study outputs with embedded, versioned profile manifests.
- Support profile-aware generation, parsing, rendering, inspection, and validation.
- Add a durable envelope format that carries profile/version/integrity metadata for persisted and shared IDs.
- Keep the existing OpenAI-derived behavior as the first profile, not as the universal core model.

**Non-Goals:**
- Prove optimality across every model family in this change.
- Finalize the forever-default vocabulary.
- Implement UUID migration or reversible legacy-ID encoding.
- Add every possible transport rendering in the first cut.
- Split the repo into multiple packages immediately.

## Decisions

### 1. The kernel will model a logical tokid separately from its renderings

The core record will represent the identifier as structured data with explicit profile identity and atom sequence. Rendered strings will be derived views.

Proposed logical shape:

```ts
type TokidId = {
  profileId: string;
  atoms: readonly string[];
};
```

Why:
- keeps the stable contract centered on identity rather than presentation
- allows multiple codecs for the same logical ID
- avoids baking one tokenizer study result into the object model

Alternatives considered:
- Keep `{ atoms, prompt, transport }` as the primary object.
  Rejected because it makes current render choices look foundational when they are really profile policy.

### 2. Profiles will be embedded, versioned artifacts compiled from study outputs

The runtime package will no longer read `study/**/results/*.csv` to define behavior. Instead it will load checked-in profile manifests under a stable package path.

Each profile manifest will include:
- profile id and human-readable name
- profile version / format version
- atom vocabulary
- entropy metadata
- codec declarations
- source lineage pointing back to the study inputs used to compile it
- constraints needed for parsing, such as prefix-free transport payload support

Why:
- makes package behavior reproducible
- supports durable production usage
- creates a clean seam for future Anthropic/Gemini/portable profiles

Alternatives considered:
- Continue deriving defaults from study artifacts at runtime.
  Rejected because it makes package behavior depend on mutable research files.

### 3. Payload codecs and durable envelopes will be separate layers

The research result says that the best transport-safe atom joiner is no delimiter, while the best prompt-native joiner is a space. The kernel should preserve that result, but persisted/shared IDs still need versioning and typo detection.

To avoid conflating those concerns, the design will separate:
- payload codec: how atoms become a compact payload string
- envelope codec: how a payload is wrapped with profile/version/integrity metadata

Initial expectation:
- prompt payload: space-joined atoms
- transport payload: delimiterless concatenation for profiles that support greedy decoding
- durable transport envelope: a sparse-wrapper format that carries profile/version/checksum around the payload

Why:
- preserves tokenizer wins discovered by the studies
- allows versioning/checksum without paying a delimiter tax between every atom
- gives users a clearer choice between bare payloads and durable exchange formats

Alternatives considered:
- Add integrity markers between every atom.
  Rejected because it would erase the measured transport advantage.
- Treat the bare transport payload as the only wire format.
  Rejected because it gives weak production ergonomics and no version/integrity story.

### 4. The first profile set will be intentionally narrow

This change will establish the profile system and ship at least one embedded OpenAI-cross profile derived from the existing research. It will not claim broad provider optimality yet.

Why:
- lets the microkernel land without overpromising portability
- keeps the first implementation grounded in measured results

Alternatives considered:
- Delay the kernel until multiple providers are fully studied.
  Rejected because the kernel contract is the prerequisite for scaling profile work cleanly.

## Risks / Trade-offs

- [Profile system increases complexity] → Keep the kernel small and defer profile-compilation tooling polish to follow-up changes.
- [Checksum/envelope design could add noticeable token overhead] → Keep integrity markers outside the atom payload and measure the resulting formats before locking defaults.
- [Auto-detection across payload/envelope variants may become ambiguous] → Prefer explicit profile/codec selection in the core API and keep auto-detect limited to well-defined cases.
- [The current OpenAI-derived profile may bias the kernel] → Treat it as one embedded profile with stable metadata, not as the shape of the core interfaces.
- [Users may confuse bare transport payloads with durable external IDs] → Document the difference clearly and expose distinct APIs for bare payload render vs durable envelope render.

## Migration Plan

1. Introduce profile manifests and logical tokid types alongside the current API.
2. Refactor generation/parsing/rendering internals to flow through profile-aware kernel primitives.
3. Embed the first stable profile artifact compiled from existing study outputs.
4. Add durable envelope rendering and validation with version/integrity metadata.
5. Update CLI, exports, tests, and README examples to prefer logical IDs and profile-aware rendering.
6. Remove runtime dependence on study CSV inputs from the library path.

Rollback strategy:
- the code remains in one package, so rollback is a normal git revert if the new kernel shape proves too disruptive before release
- no published compatibility promise exists yet, so this change can still reshape the pre-release API safely

## Open Questions

- What checksum strategy gives the best trade-off between typo detection and token overhead?
- Should profile identity be encoded as a short textual tag, a compact prefix, or explicit out-of-band parse configuration?
- Do we want one durable envelope format in the first release or a small family of named codecs?
- How much auto-detection should the public API perform versus requiring explicit profile/codec inputs?
