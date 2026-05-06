package io.tokid;

import java.util.List;

public final class TokidSdk {
  private TokidSdk() {}

  public static String defaultProfileId() {
    return TokidKernel.defaultKernel().defaultProfileId();
  }

  public static int defaultTokidLength() {
    return TokidKernel.defaultKernel().profile(defaultProfileId()).entropy().recommendedLength();
  }

  public static TokidFactory createFactory(String profileId, Integer length) {
    return new TokidFactory(profileId, length, null);
  }

  public static String generate() {
    return generate(null, null, null);
  }

  public static String generate(String profileId, Integer length, String format) {
    return createFactory(profileId, length).generate(length, format);
  }

  public static Tokid parse(String value, String profileId) {
    return TokidKernel.defaultKernel().parseWithCodec(value, profileId, null);
  }

  public static boolean isTokid(String value, String profileId) {
    return TokidKernel.defaultKernel().validateTokid(value, profileId);
  }

  public static String toPrompt(Object value, String profileId) {
    return TokidKernel.defaultKernel().renderTokid(resolveTokid(value, profileId), "prompt");
  }

  public static String toTransport(Object value, String profileId) {
    return TokidKernel.defaultKernel().renderTokid(resolveTokid(value, profileId), "transport");
  }

  public static String toEnvelope(Object value, String profileId) {
    return TokidKernel.defaultKernel().renderTokid(resolveTokid(value, profileId), "envelope");
  }

  public static List<String> listProfiles() {
    return TokidKernel.defaultKernel().listProfileIds();
  }

  static Tokid resolveTokid(Object value, String profileId) {
    if (value instanceof Tokid tokid) {
      return tokid;
    }
    if (value instanceof String rendered) {
      Tokid parsed = parse(rendered, profileId);
      if (parsed == null) {
        throw new IllegalArgumentException("Invalid tokid value");
      }
      return parsed;
    }
    throw new IllegalArgumentException("Unsupported tokid input");
  }
}
