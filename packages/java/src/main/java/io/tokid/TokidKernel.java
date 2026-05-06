package io.tokid;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class TokidKernel {
  private static final Pattern PROFILE_ID_PATTERN = Pattern.compile("^[a-z0-9-]+$");
  private static final Pattern PROFILE_TAG_PATTERN = Pattern.compile("^[a-z0-9]+$");
  private static final Pattern HASH_PATTERN = Pattern.compile("^[0-9a-f]{64}$");
  private static final TokidKernel DEFAULT_KERNEL =
      new TokidKernel(GeneratedProfiles.EMBEDDED_PROFILES, GeneratedProfiles.DEFAULT_PROFILE_ID);

  private final String defaultProfileId;
  private final LinkedHashMap<String, ProfileRuntime> runtimes;

  TokidKernel(List<TokidProfileManifest> profiles, String defaultProfileId) {
    if (profiles.isEmpty()) {
      throw new IllegalArgumentException("TokidKernel requires at least one profile");
    }

    this.runtimes = new LinkedHashMap<>();
    for (TokidProfileManifest profile : profiles) {
      ProfileRuntime runtime = buildRuntime(profile);
      if (runtimes.containsKey(profile.profileId())) {
        throw new IllegalArgumentException("Duplicate profile id in kernel: \"" + profile.profileId() + "\"");
      }
      runtimes.put(profile.profileId(), runtime);
    }

    this.defaultProfileId = defaultProfileId == null || defaultProfileId.isEmpty() ? profiles.get(0).profileId() : defaultProfileId;
    if (!runtimes.containsKey(this.defaultProfileId)) {
      throw new IllegalArgumentException("Unknown default profile \"" + this.defaultProfileId + "\"");
    }
  }

  static TokidKernel defaultKernel() {
    return DEFAULT_KERNEL;
  }

  static void validateProfileManifest(TokidProfileManifest manifest) {
    if (!PROFILE_ID_PATTERN.matcher(manifest.profileId()).matches()) {
      throw new IllegalArgumentException("Invalid profile id \"" + manifest.profileId() + "\". Profile ids must be lowercase ASCII slugs.");
    }
    if (!PROFILE_TAG_PATTERN.matcher(manifest.profileTag()).matches()) {
      throw new IllegalArgumentException("Invalid profile tag \"" + manifest.profileTag() + "\". Profile tags must be lowercase base36-safe text.");
    }
    if (manifest.profileVersion() <= 0) {
      throw new IllegalArgumentException("Invalid profile version for \"" + manifest.profileId() + "\"");
    }
    if (manifest.vocabulary().atoms().isEmpty()) {
      throw new IllegalArgumentException("Profile \"" + manifest.profileId() + "\" must contain at least one atom");
    }
    if (manifest.sourceLineage().recipe().isEmpty()) {
      throw new IllegalArgumentException("Profile \"" + manifest.profileId() + "\" must declare a source recipe");
    }
    if (manifest.sourceLineage().artifacts().isEmpty()) {
      throw new IllegalArgumentException("Profile \"" + manifest.profileId() + "\" must declare at least one source artifact");
    }

    Pattern syntax = Pattern.compile(manifest.vocabulary().syntax());
    Set<String> atomSet = new HashSet<>();
    boolean requiresPrefixFree = false;
    Set<String> payloadCodecIds = new HashSet<>();

    for (TokidSourceArtifactLineage artifact : manifest.sourceLineage().artifacts()) {
      if (artifact.path().isEmpty()) {
        throw new IllegalArgumentException("Profile \"" + manifest.profileId() + "\" contains an empty source artifact path");
      }
      if (!HASH_PATTERN.matcher(artifact.sha256()).matches()) {
        throw new IllegalArgumentException(
            "Profile \"" + manifest.profileId() + "\" contains invalid source artifact digest for \"" + artifact.path() + "\"");
      }
    }

    for (String atom : manifest.vocabulary().atoms()) {
      if (!atomSet.add(atom)) {
        throw new IllegalArgumentException("Duplicate atom in profile \"" + manifest.profileId() + "\": \"" + atom + "\"");
      }
      if (!syntax.matcher(atom).matches()) {
        throw new IllegalArgumentException("Atom \"" + atom + "\" violates syntax constraints for profile \"" + manifest.profileId() + "\"");
      }
    }

    Set<String> codecIds = new HashSet<>();
    for (TokidCodecManifest codec : manifest.codecs()) {
      if (!PROFILE_ID_PATTERN.matcher(codec.id()).matches()) {
        throw new IllegalArgumentException("Invalid codec id \"" + codec.id() + "\" in profile \"" + manifest.profileId() + "\"");
      }
      if (!codecIds.add(codec.id())) {
        throw new IllegalArgumentException("Duplicate codec id \"" + codec.id() + "\" in profile \"" + manifest.profileId() + "\"");
      }

      if (codec instanceof TokidPayloadCodecManifest payloadCodec) {
        if (payloadCodec.decodabilityMode() == TokidDecodabilityMode.PREFIX_FREE) {
          if (!payloadCodec.separator().isEmpty()) {
            throw new IllegalArgumentException(
                "Profile \"" + manifest.profileId() + "\" declares prefix-free decoding for codec \"" + codec.id() + "\" but also sets a separator");
          }
          requiresPrefixFree = true;
        } else if (payloadCodec.separator().isEmpty()) {
          throw new IllegalArgumentException(
              "Profile \"" + manifest.profileId() + "\" declares separator decoding for codec \"" + codec.id() + "\" but does not define a separator");
        }
        payloadCodecIds.add(payloadCodec.id());
        continue;
      }

      TokidEnvelopeCodecManifest envelopeCodec = (TokidEnvelopeCodecManifest) codec;
      if (!PROFILE_TAG_PATTERN.matcher(envelopeCodec.prefix()).matches()) {
        throw new IllegalArgumentException("Invalid envelope prefix \"" + envelopeCodec.prefix() + "\" in profile \"" + manifest.profileId() + "\"");
      }
      if (envelopeCodec.separator().isEmpty()) {
        throw new IllegalArgumentException("Envelope codec \"" + envelopeCodec.id() + "\" in profile \"" + manifest.profileId() + "\" must use a separator");
      }
      if (!"sha256-base36".equals(envelopeCodec.checksum().algorithm())) {
        throw new IllegalArgumentException(
            "Unsupported checksum algorithm \"" + envelopeCodec.checksum().algorithm() + "\" in profile \"" + manifest.profileId() + "\"");
      }
    }

    for (TokidCodecManifest codec : manifest.codecs()) {
      if (codec instanceof TokidEnvelopeCodecManifest envelopeCodec
          && !payloadCodecIds.contains(envelopeCodec.payloadCodecId())) {
        throw new IllegalArgumentException(
            "Envelope codec \"" + envelopeCodec.id() + "\" in profile \"" + manifest.profileId() + "\" references missing payload codec \"" + envelopeCodec.payloadCodecId() + "\"");
      }
    }

    if (requiresPrefixFree) {
      buildTrie(manifest.vocabulary().atoms());
    }
  }

  String defaultProfileId() {
    return defaultProfileId;
  }

  List<String> listProfileIds() {
    return List.copyOf(runtimes.keySet());
  }

  TokidProfileManifest profile(String profileId) {
    ProfileRuntime runtime = runtimes.get(profileId);
    if (runtime == null) {
      throw new IllegalArgumentException("Unsupported tokid profile \"" + profileId + "\"");
    }
    return runtime.manifest();
  }

  Tokid generateTokid(String profileId, int length, TokidRandomBytes randomBytes) {
    ProfileRuntime runtime = runtime(profileId == null ? defaultProfileId : profileId);
    int actualLength = length <= 0 ? runtime.manifest().entropy().recommendedLength() : length;
    TokidRandomBytes bytes = randomBytes == null ? TokidKernel::defaultRandomBytes : randomBytes;

    List<String> atoms = new ArrayList<>(actualLength);
    for (int index = 0; index < actualLength; index += 1) {
      int pick = pickUniformIndex(runtime.manifest().vocabulary().atoms().size(), bytes);
      atoms.add(runtime.manifest().vocabulary().atoms().get(pick));
    }

    return new Tokid(runtime.manifest().profileId(), atoms);
  }

  String renderTokid(Tokid tokid, String codecId) {
    ProfileRuntime runtime = runtime(tokid.profileId());
    String actualCodecId = codecId == null ? "transport" : codecId;
    TokidPayloadCodecManifest payloadCodec = runtime.payloadCodecs().get(actualCodecId);
    if (payloadCodec != null) {
      return renderPayload(tokid, runtime, payloadCodec);
    }

    TokidEnvelopeCodecManifest envelopeCodec = runtime.envelopeCodecs().get(actualCodecId);
    if (envelopeCodec == null) {
      throw new IllegalArgumentException("Unsupported codec \"" + actualCodecId + "\" for profile \"" + tokid.profileId() + "\"");
    }
    String payload = renderPayload(tokid, runtime, runtime.payloadCodecs().get(envelopeCodec.payloadCodecId()));
    String checksum = computeChecksum(envelopeCodec, runtime.manifest().profileTag(), payload);
    return String.join(envelopeCodec.separator(), List.of(envelopeCodec.prefix(), runtime.manifest().profileTag(), payload, checksum));
  }

  Tokid parseWithCodec(String value, String profileId, String codecId) {
    String actualCodecId = codecId == null ? "auto" : codecId;
    if ("auto".equals(actualCodecId)) {
      Tokid envelope = parseEnvelope(value, profileId, null);
      if (envelope != null) {
        return envelope;
      }
      ProfileRuntime runtime = runtime(profileId == null ? defaultProfileId : profileId);
      String payloadCodecId = value.chars().anyMatch(Character::isWhitespace) ? "prompt" : "transport";
      return parsePayload(value, runtime, runtime.payloadCodecs().get(payloadCodecId));
    }

    if (profileId != null) {
      ProfileRuntime runtime = runtime(profileId);
      if (runtime.envelopeCodecs().containsKey(actualCodecId)) {
        return parseEnvelope(value, profileId, actualCodecId);
      }
      return parsePayload(value, runtime, runtime.payloadCodecs().get(actualCodecId));
    }

    for (ProfileRuntime runtime : runtimes.values()) {
      Tokid parsed =
          runtime.envelopeCodecs().containsKey(actualCodecId)
              ? parseEnvelope(value, runtime.manifest().profileId(), actualCodecId)
              : parsePayload(value, runtime, runtime.payloadCodecs().get(actualCodecId));
      if (parsed != null) {
        return parsed;
      }
    }
    return null;
  }

  boolean validateTokid(String value, String profileId) {
    return parseWithCodec(value, profileId, null) != null;
  }

  private ProfileRuntime runtime(String profileId) {
    ProfileRuntime runtime = runtimes.get(profileId);
    if (runtime == null) {
      throw new IllegalArgumentException("Unsupported tokid profile \"" + profileId + "\"");
    }
    return runtime;
  }

  private static ProfileRuntime buildRuntime(TokidProfileManifest manifest) {
    validateProfileManifest(manifest);
    Pattern syntax = Pattern.compile(manifest.vocabulary().syntax());
    Set<String> atomSet = new HashSet<>(manifest.vocabulary().atoms());
    Map<String, TokidPayloadCodecManifest> payloadCodecs = new HashMap<>();
    Map<String, TokidEnvelopeCodecManifest> envelopeCodecs = new HashMap<>();
    Map<String, TrieNode> tries = new HashMap<>();

    for (TokidCodecManifest codec : manifest.codecs()) {
      if (codec instanceof TokidPayloadCodecManifest payloadCodec) {
        payloadCodecs.put(payloadCodec.id(), payloadCodec);
        if (payloadCodec.decodabilityMode() == TokidDecodabilityMode.PREFIX_FREE && payloadCodec.separator().isEmpty()) {
          tries.put(payloadCodec.id(), buildTrie(manifest.vocabulary().atoms()));
        }
      } else {
        TokidEnvelopeCodecManifest envelopeCodec = (TokidEnvelopeCodecManifest) codec;
        envelopeCodecs.put(envelopeCodec.id(), envelopeCodec);
      }
    }

    return new ProfileRuntime(manifest, syntax, atomSet, payloadCodecs, envelopeCodecs, tries);
  }

  private static String renderPayload(Tokid tokid, ProfileRuntime runtime, TokidPayloadCodecManifest codec) {
    if (!runtime.manifest().profileId().equals(tokid.profileId())) {
      throw new IllegalArgumentException(
          "Tokid profile mismatch: record uses \"" + tokid.profileId() + "\" but runtime is \"" + runtime.manifest().profileId() + "\"");
    }
    for (String atom : tokid.atoms()) {
      if (!runtime.atomSet().contains(atom) || !runtime.syntax().matcher(atom).matches()) {
        throw new IllegalArgumentException(
            "Tokid contains atom \"" + atom + "\" outside profile \"" + runtime.manifest().profileId() + "\"");
      }
    }
    return String.join(codec.separator(), tokid.atoms());
  }

  private static Tokid parsePayload(String value, ProfileRuntime runtime, TokidPayloadCodecManifest codec) {
    List<String> atoms =
        codec.decodabilityMode() == TokidDecodabilityMode.PREFIX_FREE
            ? parseDelimiterlessPayload(value, runtime.delimiterlessTries().get(codec.id()))
            : normalizePromptAtoms(value, codec.separator(), codec.normalization());
    if (atoms == null || atoms.isEmpty()) {
      return null;
    }
    for (String atom : atoms) {
      if (!runtime.atomSet().contains(atom)) {
        return null;
      }
    }
    return new Tokid(runtime.manifest().profileId(), atoms);
  }

  private Tokid parseEnvelope(String value, String requestedProfileId, String requestedCodecId) {
    for (ProfileRuntime runtime : runtimes.values()) {
      if (requestedProfileId != null && !runtime.manifest().profileId().equals(requestedProfileId)) {
        continue;
      }
      for (TokidEnvelopeCodecManifest codec : runtime.envelopeCodecs().values()) {
        if (requestedCodecId != null && !codec.id().equals(requestedCodecId)) {
          continue;
        }
        String[] parts = value.split(Pattern.quote(codec.separator()), -1);
        if (parts.length != 4) {
          continue;
        }
        if (!parts[0].equals(codec.prefix()) || !parts[1].equals(runtime.manifest().profileTag()) || parts[2].isEmpty()) {
          continue;
        }
        if (!Pattern.compile("^[0-9a-z]{" + codec.checksum().length() + "}$").matcher(parts[3]).matches()) {
          continue;
        }
        String expectedChecksum = computeChecksum(codec, parts[1], parts[2]);
        if (!expectedChecksum.equals(parts[3])) {
          return null;
        }
        return parsePayload(parts[2], runtime, runtime.payloadCodecs().get(codec.payloadCodecId()));
      }
    }
    return null;
  }

  private static List<String> normalizePromptAtoms(String value, String separator, TokidPayloadNormalization normalization) {
    String trimmed = value.trim();
    if (trimmed.isEmpty()) {
      return null;
    }
    List<String> atoms =
        normalization == TokidPayloadNormalization.WHITESPACE && " ".equals(separator)
            ? List.of(trimmed.split("\\s+"))
            : List.of(trimmed.split(Pattern.quote(separator), -1));
    return atoms.stream().anyMatch(String::isEmpty) ? null : atoms;
  }

  private static TrieNode buildTrie(List<String> atoms) {
    TrieNode root = new TrieNode();
    for (String atom : atoms) {
      TrieNode node = root;
      for (int index = 0; index < atom.length(); index += 1) {
        if (node.atom() != null) {
          throw new IllegalArgumentException(
              "Vocabulary is not prefix-free: \"" + node.atom() + "\" is a prefix of \"" + atom + "\"");
        }
        node = node.children().computeIfAbsent(atom.charAt(index), ignored -> new TrieNode());
      }
      if (node.atom() != null) {
        throw new IllegalArgumentException("Duplicate atom in vocabulary: \"" + atom + "\"");
      }
      if (!node.children().isEmpty()) {
        throw new IllegalArgumentException("Vocabulary is not prefix-free: \"" + atom + "\" is a prefix of another atom");
      }
      node.atom(atom);
    }
    return root;
  }

  private static List<String> parseDelimiterlessPayload(String value, TrieNode trie) {
    if (value.isEmpty()) {
      return null;
    }
    List<String> atoms = new ArrayList<>();
    int index = 0;
    while (index < value.length()) {
      TrieNode node = trie;
      int cursor = index;
      String matchedAtom = null;
      while (cursor < value.length()) {
        node = node.children().get(value.charAt(cursor));
        if (node == null) {
          break;
        }
        cursor += 1;
        if (node.atom() != null) {
          matchedAtom = node.atom();
          break;
        }
      }
      if (matchedAtom == null) {
        return null;
      }
      atoms.add(matchedAtom);
      index += matchedAtom.length();
    }
    return atoms;
  }

  private static int pickUniformIndex(int maxExclusive, TokidRandomBytes randomBytes) {
    long bound = 1L << 32;
    long threshold = bound - (bound % maxExclusive);
    while (true) {
      byte[] bytes = randomBytes.read(4);
      if (bytes.length < 4) {
        throw new IllegalArgumentException("randomBytes must return the requested number of bytes");
      }
      long candidate =
          ((bytes[0] & 0xffL) << 24)
              | ((bytes[1] & 0xffL) << 16)
              | ((bytes[2] & 0xffL) << 8)
              | (bytes[3] & 0xffL);
      if (candidate < threshold) {
        return (int) (candidate % maxExclusive);
      }
    }
  }

  private static String computeChecksum(TokidEnvelopeCodecManifest codec, String profileTag, String payload) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] raw =
          digest.digest(
              (codec.prefix() + "|" + codec.formatVersion() + "|" + profileTag + "|" + payload)
                  .getBytes(StandardCharsets.UTF_8));
      byte[] truncated = new byte[6];
      System.arraycopy(raw, 0, truncated, 0, 6);
      String encoded = new BigInteger(1, truncated).toString(36);
      if (encoded.length() < codec.checksum().length()) {
        encoded = "0".repeat(codec.checksum().length() - encoded.length()) + encoded;
      }
      return encoded.substring(0, codec.checksum().length());
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException(error);
    }
  }

  private static byte[] defaultRandomBytes(int length) {
    byte[] bytes = new byte[length];
    new java.security.SecureRandom().nextBytes(bytes);
    return bytes;
  }
}

@FunctionalInterface
interface TokidRandomBytes {
  byte[] read(int length);
}

enum TokidPayloadNormalization {
  LITERAL,
  WHITESPACE
}

enum TokidDecodabilityMode {
  SEPARATOR,
  PREFIX_FREE
}

sealed interface TokidCodecManifest permits TokidPayloadCodecManifest, TokidEnvelopeCodecManifest {
  String id();

  String description();
}

record TokidPayloadCodecManifest(
    String id,
    String description,
    String separator,
    TokidPayloadNormalization normalization,
    boolean transportSafe,
    TokidDecodabilityMode decodabilityMode)
    implements TokidCodecManifest {}

record TokidEnvelopeChecksumManifest(String algorithm, int length) {}

record TokidEnvelopeCodecManifest(
    String id,
    String description,
    String payloadCodecId,
    String prefix,
    String separator,
    int formatVersion,
    TokidEnvelopeChecksumManifest checksum)
    implements TokidCodecManifest {}

record TokidProfileVocabularyManifest(String syntax, List<String> atoms) {
  TokidProfileVocabularyManifest {
    atoms = List.copyOf(atoms);
  }
}

record TokidSourceArtifactLineage(String path, String sha256) {}

record TokidSourceLineage(
    String recipe,
    List<String> studies,
    List<TokidSourceArtifactLineage> artifacts,
    List<String> filters,
    List<String> notes) {
  TokidSourceLineage {
    studies = List.copyOf(studies);
    artifacts = List.copyOf(artifacts);
    filters = List.copyOf(filters);
    notes = List.copyOf(notes);
  }
}

record TokidEntropyMetadata(int atomCount, double bitsPerAtom, int recommendedLength, double bitsAtRecommendedLength) {}

record TokidProfileManifest(
    String profileId,
    int profileVersion,
    String profileTag,
    String name,
    String description,
    String provider,
    TokidProfileVocabularyManifest vocabulary,
    List<TokidCodecManifest> codecs,
    TokidEntropyMetadata entropy,
    TokidSourceLineage sourceLineage) {
  TokidProfileManifest {
    codecs = List.copyOf(codecs);
  }
}

record ProfileRuntime(
    TokidProfileManifest manifest,
    Pattern syntax,
    Set<String> atomSet,
    Map<String, TokidPayloadCodecManifest> payloadCodecs,
    Map<String, TokidEnvelopeCodecManifest> envelopeCodecs,
    Map<String, TrieNode> delimiterlessTries) {}

final class TrieNode {
  private String atom;
  private final Map<Character, TrieNode> children = new HashMap<>();

  String atom() {
    return atom;
  }

  void atom(String atom) {
    this.atom = atom;
  }

  Map<Character, TrieNode> children() {
    return children;
  }
}
