package io.tokid;

import java.util.List;

public final class ConformanceMain {
  private ConformanceMain() {}

  public static void main(String[] args) {
    require("openai-cross-v1".equals(TokidSdk.defaultProfileId()), "default profile id mismatch");
    require(
        TokidSdk.listProfiles().equals(List.of("openai-cross-v1", "openai-cross-underscore-v1")),
        "profile list mismatch");

    TokidProfileManifest defaultProfile = TokidKernel.defaultKernel().profile("openai-cross-v1");
    TokidProfileManifest underscoreProfile = TokidKernel.defaultKernel().profile("openai-cross-underscore-v1");
    require("oa1".equals(defaultProfile.profileTag()), "default profile tag mismatch");
    require(1 == defaultProfile.profileVersion(), "default profile version mismatch");
    require("oa1u".equals(underscoreProfile.profileTag()), "underscore profile tag mismatch");

    expectInvalid(
        duplicateAtomProfile(defaultProfile),
        "Duplicate atom");
    expectInvalid(
        prefixAmbiguousProfile(defaultProfile),
        "prefix-free");

    assertRoundTrip(
        new Tokid("openai-cross-v1", List.of("about", "their", "there", "which")),
        "about their there which",
        "abouttheirtherewhich",
        "tk1_oa1_abouttheirtherewhich_29jd7");

    assertRoundTrip(
        new Tokid("openai-cross-underscore-v1", List.of("about", "their", "there", "which")),
        "about their there which",
        "about_their_there_which",
        "tk1~oa1u~about_their_there_which~1gp02");

    assertRoundTrip(
        new Tokid("openai-cross-v1", List.of("other", "think", "really", "great")),
        "other think really great",
        "otherthinkreallygreat",
        "tk1_oa1_otherthinkreallygreat_2r2zw");

    require(TokidKernel.defaultKernel().parseWithCodec("", "openai-cross-v1", "prompt") == null, "empty prompt decoded");
    require(
        TokidKernel.defaultKernel().parseWithCodec("aboutzzz", "openai-cross-v1", "transport") == null,
        "invalid transport decoded");
    require(
        TokidKernel.defaultKernel().parseWithCodec("about__their", "openai-cross-underscore-v1", "transport") == null,
        "double separator decoded");

    require(TokidSdk.parse("tk1_oa1_abouttheirtherewhich_29jd0", "openai-cross-v1") == null, "bad checksum decoded");
    require(TokidSdk.parse("zz1_oa1_abouttheirtherewhich_29jd7", "openai-cross-v1") == null, "bad prefix decoded");
    require(
        TokidSdk.parse("tk1~oa1u~about_their_there_which~1gp00", "openai-cross-underscore-v1") == null,
        "underscore bad checksum decoded");
    require(
        TokidSdk.parse("zz1~oa1u~about_their_there_which~1gp02", "openai-cross-underscore-v1") == null,
        "underscore bad prefix decoded");

    Tokid generated =
        TokidKernel.defaultKernel().generateTokid("openai-cross-v1", 4, scriptedRandomBytes());
    require(generated.equals(new Tokid("openai-cross-v1", List.of("about", "their", "there", "which"))), "generated tokid mismatch");
    require(
        "tk1_oa1_abouttheirtherewhich_29jd7".equals(TokidSdk.toEnvelope(generated, null)),
        "generated envelope mismatch");

    Tokid generatedUnderscore =
        TokidKernel.defaultKernel().generateTokid("openai-cross-underscore-v1", 4, scriptedRandomBytes());
    require(
        generatedUnderscore.equals(new Tokid("openai-cross-underscore-v1", List.of("about", "their", "there", "which"))),
        "generated underscore tokid mismatch");
    require(
        "tk1~oa1u~about_their_there_which~1gp02".equals(TokidSdk.toEnvelope(generatedUnderscore, null)),
        "generated underscore envelope mismatch");

    System.out.println("{\"sdk\":\"java\",\"capability\":\"core\",\"passed\":true}");
  }

  private static TokidRandomBytes scriptedRandomBytes() {
    byte[] values =
        new byte[] {
          0, 0, 0, 0,
          0, 0, 0, 1,
          0, 0, 0, 2,
          0, 0, 0, 3
        };
    final int[] offset = new int[] {0};
    return length -> {
      byte[] chunk = new byte[length];
      System.arraycopy(values, offset[0], chunk, 0, length);
      offset[0] += length;
      return chunk;
    };
  }

  private static void assertRoundTrip(Tokid logical, String prompt, String transport, String envelope) {
    require(logical.equals(TokidSdk.parse(prompt, logical.profileId())), "prompt round-trip mismatch");
    require(logical.equals(TokidSdk.parse(transport, logical.profileId())), "transport round-trip mismatch");
    require(logical.equals(TokidSdk.parse(envelope, logical.profileId())), "envelope round-trip mismatch");
    require(prompt.equals(TokidSdk.toPrompt(logical, null)), "prompt rendering mismatch");
    require(transport.equals(TokidSdk.toTransport(logical, null)), "transport rendering mismatch");
    require(envelope.equals(TokidSdk.toEnvelope(logical, null)), "envelope rendering mismatch");
  }

  private static void expectInvalid(TokidProfileManifest manifest, String errorContains) {
    try {
      TokidKernel.validateProfileManifest(manifest);
      throw new IllegalStateException("invalid profile was accepted");
    } catch (IllegalArgumentException error) {
      require(error.getMessage().toLowerCase().contains(errorContains.toLowerCase()), "unexpected invalid-profile error");
    }
  }

  private static TokidProfileManifest duplicateAtomProfile(TokidProfileManifest base) {
    return new TokidProfileManifest(
        "invalid-duplicate-v1",
        base.profileVersion(),
        "dup1",
        base.name(),
        base.description(),
        base.provider(),
        new TokidProfileVocabularyManifest(base.vocabulary().syntax(), List.of("alpha", "alpha")),
        base.codecs(),
        new TokidEntropyMetadata(2, 1, 8, 8),
        base.sourceLineage());
  }

  private static TokidProfileManifest prefixAmbiguousProfile(TokidProfileManifest base) {
    return new TokidProfileManifest(
        "invalid-prefix-v1",
        base.profileVersion(),
        "pfx1",
        base.name(),
        base.description(),
        base.provider(),
        new TokidProfileVocabularyManifest(base.vocabulary().syntax(), List.of("alpha", "alphabet")),
        base.codecs(),
        new TokidEntropyMetadata(2, 1, 8, 8),
        base.sourceLineage());
  }

  private static void require(boolean condition, String message) {
    if (!condition) {
      throw new IllegalStateException(message);
    }
  }
}
