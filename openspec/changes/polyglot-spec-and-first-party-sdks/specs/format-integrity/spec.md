## ADDED Requirements

### Requirement: Envelope integrity behavior is portable across first-party SDKs
The system SHALL preserve the same envelope checksum framing, checksum encoding, and checksum validation behavior across first-party SDKs for the same published profile and codec.

#### Scenario: Shared payload yields the same checksum across SDKs
- **WHEN** two first-party SDKs render an envelope for the same logical tokid, profile tag, payload, and envelope codec
- **THEN** they compute the same checksum and produce the same durable envelope string

#### Scenario: Checksum mismatch is rejected consistently across SDKs
- **WHEN** a caller validates an envelope whose checksum or payload has been altered
- **THEN** every first-party SDK rejects that envelope as invalid

