import {
  DEFAULT_PROFILE_ID,
  DEFAULT_TOKID_LENGTH,
  createTokidFactory,
  getProfile,
  listProfiles,
  parse,
  toEnvelope,
  toPrompt,
  toTransport,
  type TokidFormat,
} from "./index.js";

type Command =
  | "generate"
  | "prompt"
  | "transport"
  | "envelope"
  | "parse"
  | "inspect"
  | "profile"
  | "profiles"
  | "vocab";

function printUsage(): void {
  console.log(`tokid

Usage:
  tokid [generate] [--profile ID] [--length N] [--format envelope|prompt|transport]
  tokid prompt <value> [--profile ID]
  tokid transport <value> [--profile ID]
  tokid envelope <value> [--profile ID]
  tokid parse <value> [--profile ID]
  tokid inspect <value> [--profile ID]
  tokid profiles
  tokid profile [ID]
`);
}

function parseFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function requireInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function parseFormat(value: string | undefined): TokidFormat {
  if (value === undefined || value === "envelope" || value === "prompt" || value === "transport") {
    return value ?? "envelope";
  }

  throw new Error(`Unsupported format: ${value}`);
}

function requireValue(args: string[], command: string): string {
  const value = args[0];
  if (!value) {
    throw new Error(`tokid ${command} requires a value`);
  }
  return value;
}

function runGenerate(args: string[]): void {
  const profile = parseFlag(args, "--profile") ?? DEFAULT_PROFILE_ID;
  const length = requireInteger(parseFlag(args, "--length"), "--length") ?? DEFAULT_TOKID_LENGTH;
  const format = parseFormat(parseFlag(args, "--format"));

  console.log(createTokidFactory({ profile, length }).generate({ format }));
}

function runPrompt(args: string[]): void {
  const value = requireValue(args, "prompt");
  const profile = parseFlag(args, "--profile");

  console.log(toPrompt(value, profile ? { profile } : {}));
}

function runTransport(args: string[]): void {
  const value = requireValue(args, "transport");
  const profile = parseFlag(args, "--profile");

  console.log(toTransport(value, profile ? { profile } : {}));
}

function runEnvelope(args: string[]): void {
  const value = requireValue(args, "envelope");
  const profile = parseFlag(args, "--profile");

  console.log(toEnvelope(value, profile ? { profile } : {}));
}

function runParse(args: string[]): void {
  const value = requireValue(args, "parse");
  const profile = parseFlag(args, "--profile");
  const tokid = parse(value, profile ? { profile } : {});

  if (!tokid) {
    throw new Error("Value does not decode under the selected tokid profile");
  }

  console.log(`profile: ${tokid.profileId}`);
  console.log(`atoms:   ${tokid.atoms.join(", ")}`);
}

function runInspect(args: string[]): void {
  const value = requireValue(args, "inspect");
  const profile = parseFlag(args, "--profile");
  const tokid = parse(value, profile ? { profile } : {});

  if (!tokid) {
    throw new Error("Value does not decode under the selected tokid profile");
  }

  console.log(`profile:   ${tokid.profileId}`);
  console.log(`atoms:     ${tokid.atoms.join(", ")}`);
  console.log(`prompt:    ${toPrompt(tokid)}`);
  console.log(`transport: ${toTransport(tokid)}`);
  console.log(`envelope:  ${toEnvelope(tokid)}`);
}

function runProfiles(): void {
  for (const profile of listProfiles()) {
    console.log(`${profile.profileId}\t${profile.name}`);
  }
}

function runProfile(args: string[]): void {
  const profileId = args[0] ?? DEFAULT_PROFILE_ID;
  const profile = getProfile(profileId);

  console.log(`profile_id:          ${profile.profileId}`);
  console.log(`profile_tag:         ${profile.profileTag}`);
  console.log(`profile_version:     ${profile.profileVersion}`);
  console.log(`name:                ${profile.name}`);
  console.log(`provider:            ${profile.provider}`);
  console.log(`description:         ${profile.description}`);
  console.log(`atom_count:          ${profile.entropy.atomCount}`);
  console.log(`bits_per_atom:       ${profile.entropy.bitsPerAtom.toFixed(2)}`);
  console.log(`recommended_length:  ${profile.entropy.recommendedLength}`);
  console.log(`recommended_bits:    ${profile.entropy.bitsAtRecommendedLength.toFixed(2)}`);
  console.log(`formats:             ${profile.codecs.map((codec) => codec.id).join(", ")}`);
  console.log(`recipe:              ${profile.sourceLineage.recipe}`);
  console.log(`source_artifacts:    ${profile.sourceLineage.artifacts.map((artifact) => artifact.path).join(", ")}`);
}

function main(): void {
  try {
    const [command = "generate", ...rest] = process.argv.slice(2);

    if (command === "--help" || command === "-h") {
      printUsage();
      return;
    }

    switch (command as Command) {
      case "generate":
        runGenerate(rest);
        return;
      case "prompt":
        runPrompt(rest);
        return;
      case "transport":
        runTransport(rest);
        return;
      case "envelope":
        runEnvelope(rest);
        return;
      case "parse":
        runParse(rest);
        return;
      case "inspect":
        runInspect(rest);
        return;
      case "profiles":
        runProfiles();
        return;
      case "profile":
      case "vocab":
        runProfile(rest);
        return;
      default:
        printUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`tokid: ${message}`);
    process.exitCode = 1;
  }
}

main();
