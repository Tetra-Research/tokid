# tokid Go SDK

Go SDK for the `tokid` portable profile format.

`tokid` is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

Status: early alpha.
Capability tier: `core`.
Runtime target: Go `1.22+`.
Module path: `github.com/Tetra-Research/tokid/packages/go`.
Registry readiness: `publish-now`.
Registry status: Wave 2 target, not yet tagged.

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

During alpha, use a local checkout with a `replace` directive:

```go
require github.com/Tetra-Research/tokid/packages/go v0.0.0

replace github.com/Tetra-Research/tokid/packages/go => ../tokid/packages/go
```

Import the package as:

```go
import "github.com/Tetra-Research/tokid/packages/go/tokid"
```

## Quick Start

```go
package main

import (
	"fmt"

	"github.com/Tetra-Research/tokid/packages/go/tokid"
)

func main() {
	id, err := tokid.Generate("", 0, "", nil)
	if err != nil {
		panic(err)
	}

	if !tokid.IsTokid(id, "") {
		panic("invalid tokid")
	}

	prompt, err := tokid.ToPrompt(id, "")
	if err != nil {
		panic(err)
	}

	transport, err := tokid.ToTransport(id, "")
	if err != nil {
		panic(err)
	}

	fmt.Println(id, prompt, transport)
}
```

`Generate` returns the durable envelope form by default. That is the form you should store, exchange, and pass across boundaries unless you have a strong reason not to.

## Factory API

Bind profile choice and default length once:

```go
factory := tokid.CreateFactory("openai-cross-v1", 8, nil)

id, err := factory.Generate(0, "")
if err != nil {
	panic(err)
}

logical := factory.Parse(id)
prompt, err := factory.Prompt(id)
transport, err := factory.Transport(id)
profile := factory.Profile()
```

`0` means “use the default” for `length` and `format`.

After tagged public releases begin, you will be able to depend on the module directly by version.

The first planned public tag is:

```bash
go get github.com/Tetra-Research/tokid/packages/go@v0.1.0-alpha.2
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

- Go `1.22+`
- the current built-in profiles are OpenAI-derived
- this SDK intentionally documents the `core` surface first even though profile manifests are also available

## Maintainer Release

Dry-run:

```bash
npm run release:go:dry-run
```

Official tag:

```bash
npm run release:go -- --push
```
