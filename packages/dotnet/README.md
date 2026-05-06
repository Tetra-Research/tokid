# tokid .NET SDK

C# / .NET SDK for the `tokid` portable profile format.

`tokid` is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `Guid`, `Ulid`, `NanoId`, or `Sqids`.

Status: early alpha.
Capability tier: `core`.
Runtime target: .NET `8+`.
Registry readiness: `publish-now`.
Registry status: TODO. Publish after a nuget.org account exists and a NuGet API key is configured.
Package name: `Tokid` on NuGet.

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

Until the first NuGet release is published, reference the project directly from a local checkout:

```bash
dotnet add reference ./packages/dotnet/Tokid/Tokid.csproj
```

After publish, the package command will be:

```bash
dotnet add package Tokid
```

## Quick Start

```csharp
using System;
using Tokid;

var id = TokidSdk.Generate();

if (!TokidSdk.IsTokid(id))
{
    throw new InvalidOperationException("invalid tokid");
}

var prompt = TokidSdk.ToPrompt(id);
var transport = TokidSdk.ToTransport(id);
```

`Generate()` returns the durable envelope form by default. That is the form you should store, exchange, and pass across boundaries unless you have a strong reason not to.

## Factory API

Bind profile choice and default length once:

```csharp
using Tokid;

var tokid = TokidSdk.CreateFactory("openai-cross-v1", 8);

var id = tokid.Generate();
var logical = tokid.Parse(id);
var prompt = tokid.Prompt(id);
var transport = tokid.Transport(id);
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

## When To Use It

Use `tokid` when most of these are true:

- your application regularly sends IDs through prompts or tool calls
- you care about token cost inside JSON, logs, URLs, or text-heavy transports
- you want a stable external envelope plus alternate prompt and transport renderings
- you are comfortable pinning an explicit profile in your application

Choose something else when minimal byte length, ecosystem standardization, sortable IDs, or authentication-grade secrets matter more than token behavior.

## Runtime Notes

- .NET `8+`
- namespace: `Tokid`
- the current built-in profiles are OpenAI-derived
- this SDK intentionally documents the `core` surface first

## Maintainer Release

Dry-run:

```bash
npm run release:nuget:dry-run
```

Official publish:

```bash
npm run release:nuget
```
