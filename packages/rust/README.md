# tokid Rust SDK

Rust SDK for the `tokid` portable profile format.

`tokid` is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

Status: early alpha.
Capability tier: `full`.
Runtime target: current stable Rust.
Planned crate name: `tokid` on crates.io.

## What You Get

This SDK supports the stable day-to-day surface:

- generate tokids in prompt, transport, or envelope format
- parse and validate existing tokids
- convert between prompt, transport, and envelope renderings
- pin a profile once with a factory

It also exposes the lower-level manifest and kernel APIs for profile-aware tooling.

The current alpha ships two built-in profiles:

- `openai-cross-v1`
- `openai-cross-underscore-v1`

## Install

Until the first crates.io release is published, use a path dependency from a local checkout:

```toml
[dependencies]
tokid = { path = "../tokid/packages/rust" }
```

After publish, the dependency will be:

```toml
[dependencies]
tokid = "0.1.0-alpha.1"
```

## Quick Start

```rust
use tokid::{generate, is_tokid, to_prompt, to_transport};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let id = generate(None, None, None)?;

    if !is_tokid(&id, None) {
        return Err("invalid tokid".into());
    }

    let prompt = to_prompt(id.clone(), None)?;
    let transport = to_transport(id.clone(), None)?;

    println!("{id} {prompt} {transport}");
    Ok(())
}
```

`generate` returns the durable envelope form by default. That is the form you should store, exchange, and pass across boundaries unless you have a strong reason not to.

## Factory API

Bind profile choice and default length once:

```rust
use tokid::create_tokid_factory;

fn main() -> Result<(), tokid::TokidError> {
    let tokid = create_tokid_factory(Some("openai-cross-v1"), Some(8))?;

    let id = tokid.generate(None, None)?;
    let logical = tokid.parse(&id);
    let prompt = tokid.prompt(id.clone())?;
    let transport = tokid.transport(id.clone())?;
    let profile = tokid.profile()?;

    let _ = (logical, prompt, transport, profile);
    Ok(())
}
```

## Prompt, Transport, Envelope

Every tokid has one logical identity and three useful renderings:

- `prompt`: best when a human or LLM reads the ID in natural text
- `transport`: best when the ID must survive URLs, JSON, logs, or APIs
- `envelope`: best when the ID must be stored, exchanged, validated, and parsed later

If you only remember one rule, use this one:

- use `envelope` at persistence and network boundaries

## Profile Choice

### `openai-cross-v1`

Default profile.

- prompt uses spaces
- transport uses raw concatenation
- best when token cost is the main concern

### `openai-cross-underscore-v1`

Opt-in profile.

- prompt still uses spaces
- transport uses `_`
- best when visual segmentation matters more than the last bit of transport efficiency

## Advanced Surface

Rust is one of the `full` capability SDKs. In addition to the simple helpers, it also exposes:

- `TokidKernel`
- `TokidProfileManifest`
- `validate_profile_manifest`
- `get_profile`
- `list_profiles`

Use that surface when you need manifest-aware tooling or kernel-level validation. For normal application code, start with `generate`, `parse`, and `create_tokid_factory`.

## When To Use It

Use `tokid` when most of these are true:

- your application regularly sends IDs through prompts or tool calls
- you care about token cost inside JSON, logs, URLs, or text-heavy transports
- you want a stable external envelope plus alternate prompt and transport renderings
- you are comfortable pinning an explicit profile in your application

Choose something else when minimal byte length, ecosystem standardization, sortable IDs, or authentication-grade secrets matter more than token behavior.

## Runtime Notes

- current stable Rust
- the current built-in profiles are OpenAI-derived
- the crate ships the same portable profile contract as the other first-party SDKs
