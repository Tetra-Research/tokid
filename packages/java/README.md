# tokid JVM SDK

Java / Kotlin SDK for the `tokid` portable profile format.

`tokid` is for the narrow case where identifiers regularly pass through prompts, tool calls, JSON payloads, logs, or URLs and token cost matters.

It is not a shorter UUID.
It is not a universal replacement for `uuid`, `ulid`, `nanoid`, or `sqids`.

Status: early alpha.
Capability tier: `core`.
Runtime target: Java `20+`.
Registry readiness: `publish-now`.
Registry status: Wave 3 target, not yet published.
Coordinates: `io.tetraresearch.tokid:tokid` on Maven Central.

## What You Get

This SDK supports the stable day-to-day surface:

- generate tokids in prompt, transport, or envelope format
- parse and validate existing tokids
- convert between prompt, transport, and envelope renderings
- pin a profile once with a factory

The same Java API is intended for Kotlin use as well.

The current alpha ships two built-in profiles:

- `openai-cross-v1`
- `openai-cross-underscore-v1`

## Install

Until the first Maven Central release is published, build and install from a local checkout:

```bash
cd packages/java
mvn install
```

After publish, the dependency will be:

```xml
  <dependency>
  <groupId>io.tetraresearch.tokid</groupId>
  <artifactId>tokid</artifactId>
  <version>0.1.0-alpha.3</version>
</dependency>
```

The Maven coordinates change independently from the Java package names, so imports remain under `io.tokid.*`.

## Quick Start

```java
import io.tokid.TokidSdk;

String id = TokidSdk.generate();

if (!TokidSdk.isTokid(id, null)) {
  throw new IllegalStateException("invalid tokid");
}

String prompt = TokidSdk.toPrompt(id, null);
String transport = TokidSdk.toTransport(id, null);
```

`generate()` returns the durable envelope form by default. That is the form you should store, exchange, and pass across boundaries unless you have a strong reason not to.

## Factory API

Bind profile choice and default length once:

```java
import io.tokid.Tokid;
import io.tokid.TokidFactory;
import io.tokid.TokidSdk;

TokidFactory tokid = TokidSdk.createFactory("openai-cross-v1", 8);

String id = tokid.generate();
Tokid logical = tokid.parse(id);
String prompt = tokid.prompt(id);
String transport = tokid.transport(id);
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

- Java `20+`
- Kotlin should use the same surface through the Java classes
- the current built-in profiles are OpenAI-derived
- this SDK intentionally documents the `core` surface first

## Maintainer Release

Dry-run:

```bash
npm run release:maven:dry-run
```

Official deploy:

```bash
npm run release:maven
```

The live deploy path assumes Maven Central credentials and a usable GPG signing setup.
