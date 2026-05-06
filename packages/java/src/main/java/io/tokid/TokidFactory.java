package io.tokid;

public final class TokidFactory {
  private final String profileId;
  private final int length;
  private final TokidRandomBytes randomBytes;

  public TokidFactory(String profileId, Integer length) {
    this(profileId, length, null);
  }

  TokidFactory(String profileId, Integer length, TokidRandomBytes randomBytes) {
    this.profileId = profileId == null ? TokidKernel.defaultKernel().defaultProfileId() : profileId;
    this.length =
        length == null
            ? TokidKernel.defaultKernel().profile(this.profileId).entropy().recommendedLength()
            : length;
    this.randomBytes = randomBytes;
  }

  public String profileId() {
    return profileId;
  }

  public int length() {
    return length;
  }

  public String generate() {
    return generate(null, null);
  }

  public String generate(Integer requestedLength, String format) {
    Tokid tokid =
        TokidKernel.defaultKernel()
            .generateTokid(profileId, requestedLength == null ? length : requestedLength, randomBytes);
    return TokidKernel.defaultKernel().renderTokid(tokid, format == null ? "envelope" : format);
  }

  public Tokid parse(String value) {
    return TokidKernel.defaultKernel().parseWithCodec(value, profileId, null);
  }

  public boolean isTokid(String value) {
    return TokidKernel.defaultKernel().validateTokid(value, profileId);
  }

  public String prompt(Object value) {
    return TokidSdk.toPrompt(value, profileId);
  }

  public String transport(Object value) {
    return TokidSdk.toTransport(value, profileId);
  }

  public String envelope(Object value) {
    return TokidSdk.toEnvelope(value, profileId);
  }
}
