# tokid Python SDK

Python SDK for the `tokid` portable profile format.

`tokid` is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

Status: early alpha.
Capability tier: `core`.
Runtime target: Python `3.11+`.
Registry readiness: `publish-now`.
Registry status: live on PyPI as `0.1.0a4`.
Package name: `tokid` on PyPI.

## What You Get

This SDK supports the stable day-to-day surface:

- generate tokids in prompt, transport, or envelope format
- parse and validate existing tokids
- convert between prompt, transport, and envelope renderings
- pin a profile once with a factory

The current alpha ships two built-in profiles:

- `openai-cross-v1`
- `openai-cross-underscore-v1`

## Install

```bash
pip install tokid
```

For local development against a checkout:

```bash
pip install ./packages/python
```

## Quick Start

```python
from tokid import generate, is_tokid, to_prompt, to_transport

tokid = generate()

if not is_tokid(tokid):
    raise ValueError("invalid tokid")

prompt = to_prompt(tokid)
transport = to_transport(tokid)
```

`generate()` returns the durable envelope form by default. That is the form you should store, exchange, and pass across boundaries unless you have a strong reason not to.

## Factory API

Bind profile choice and default length once:

```python
from tokid import create_tokid_factory

tokid = create_tokid_factory(
    profile="openai-cross-v1",
    length=8,
)

identifier = tokid.generate()
logical = tokid.parse(identifier)
prompt = tokid.prompt(identifier)
transport = tokid.transport(identifier)
```

You can also inspect the active profile:

```python
profile = tokid.profile()
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

Example:

```python
from tokid import create_tokid_factory

tokid = create_tokid_factory(profile="openai-cross-underscore-v1")
identifier = tokid.generate()
transport = tokid.transport(identifier)
```

## When To Use It

Use `tokid` when most of these are true:

- your application regularly sends IDs through prompts or tool calls
- you care about token cost inside JSON, logs, URLs, or text-heavy transports
- you want a stable external envelope plus alternate prompt and transport renderings
- you are comfortable pinning an explicit profile in your application

Choose something else when minimal byte length, ecosystem standardization, sortable IDs, or authentication-grade secrets matter more than token behavior.

## Runtime Notes

- Python `3.11+`
- the current built-in profiles are OpenAI-derived
- this SDK intentionally documents the `core` surface first even though lower-level runtime types exist

## Maintainer Release

Dry-run:

```bash
npm run release:pypi:dry-run
```

Official upload:

```bash
npm run release:pypi
```
