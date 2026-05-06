use serde::Deserialize;
use tokid::{
    create_tokid_factory, decode_random_hex, default_profile_id, get_profile, list_profiles, parse,
    to_envelope, to_prompt, to_transport, validate_profile_manifest, Tokid, TokidProfileManifest,
};

#[derive(Debug, Deserialize)]
struct Suite {
    registry: Registry,
    #[serde(rename = "validProfiles")]
    valid_profiles: Vec<ValidProfileCase>,
    #[serde(rename = "invalidProfiles")]
    invalid_profiles: Vec<InvalidProfileCase>,
    #[serde(rename = "roundTrips")]
    round_trips: Vec<RoundTripCase>,
    #[serde(rename = "invalidPayloads")]
    invalid_payloads: Vec<InvalidPayloadCase>,
    #[serde(rename = "invalidEnvelopes")]
    invalid_envelopes: Vec<InvalidEnvelopeCase>,
    #[serde(rename = "deterministicGeneration")]
    deterministic_generation: Vec<DeterministicGenerationCase>,
}

#[derive(Debug, Deserialize)]
struct Registry {
    #[serde(rename = "defaultProfileId")]
    default_profile_id: String,
    profiles: Vec<RegistryProfile>,
}

#[derive(Debug, Deserialize)]
struct RegistryProfile {
    #[serde(rename = "profileId")]
    profile_id: String,
}

#[derive(Debug, Deserialize)]
struct ValidProfileCase {
    #[serde(rename = "profileId")]
    profile_id: String,
    #[serde(rename = "profileTag")]
    profile_tag: String,
    #[serde(rename = "profileVersion")]
    profile_version: u32,
}

#[derive(Debug, Deserialize)]
struct InvalidProfileCase {
    id: String,
    #[serde(rename = "errorContains")]
    error_contains: String,
    manifest: TokidProfileManifest,
}

#[derive(Debug, Deserialize)]
struct LogicalCase {
    #[serde(rename = "profileId")]
    profile_id: String,
    atoms: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RenderingCase {
    prompt: String,
    transport: String,
    envelope: String,
}

#[derive(Debug, Deserialize)]
struct RoundTripCase {
    logical: LogicalCase,
    renderings: RenderingCase,
}

#[derive(Debug, Deserialize)]
struct InvalidPayloadCase {
    #[serde(rename = "profileId")]
    profile_id: String,
    #[serde(rename = "codecId")]
    codec_id: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct InvalidEnvelopeCase {
    #[serde(rename = "profileId")]
    profile_id: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct DeterministicGenerationCase {
    #[serde(rename = "profileId")]
    profile_id: String,
    length: usize,
    #[serde(rename = "randomHex")]
    random_hex: String,
    logical: LogicalCase,
    renderings: RenderingCase,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent().unwrap().parent().unwrap();
    let suite: Suite = serde_json::from_str(
        &std::fs::read_to_string(repo_root.join("conformance").join("fixtures").join("suite.json"))?,
    )?;

    assert_eq!(default_profile_id(), suite.registry.default_profile_id);
    let mut actual_profiles = list_profiles()
        .into_iter()
        .map(|profile| profile.profile_id)
        .collect::<Vec<_>>();
    actual_profiles.sort();
    let mut expected_profiles = suite
        .registry
        .profiles
        .into_iter()
        .map(|profile| profile.profile_id)
        .collect::<Vec<_>>();
    expected_profiles.sort();
    assert_eq!(actual_profiles, expected_profiles);

    for case in &suite.valid_profiles {
        let profile = get_profile(Some(&case.profile_id))?;
        assert_eq!(profile.profile_tag, case.profile_tag);
        assert_eq!(profile.profile_version, case.profile_version);
    }

    for case in &suite.invalid_profiles {
        let error = validate_profile_manifest(&case.manifest).expect_err("invalid profile should fail");
        assert!(error.to_string().to_lowercase().contains(&case.error_contains.to_lowercase()), "{}", case.id);
    }

    for case in &suite.round_trips {
        let logical = Tokid {
            profile_id: case.logical.profile_id.clone(),
            atoms: case.logical.atoms.clone(),
        };
        assert_eq!(parse(&case.renderings.prompt, Some(&case.logical.profile_id)), Some(logical.clone()));
        assert_eq!(
            parse(&case.renderings.transport, Some(&case.logical.profile_id)),
            Some(logical.clone())
        );
        assert_eq!(
            parse(&case.renderings.envelope, Some(&case.logical.profile_id)),
            Some(logical.clone())
        );
        assert_eq!(to_prompt(logical.clone(), None)?, case.renderings.prompt);
        assert_eq!(to_transport(logical.clone(), None)?, case.renderings.transport);
        assert_eq!(to_envelope(logical, None)?, case.renderings.envelope);
    }

    for case in &suite.invalid_payloads {
        assert!(
            tokid::default_kernel().parse_with_codec(&case.value, Some(&case.profile_id), Some(&case.codec_id)).is_none()
        );
    }

    for case in &suite.invalid_envelopes {
        assert!(parse(&case.value, Some(&case.profile_id)).is_none());
    }

    for case in &suite.deterministic_generation {
        let mut reader = decode_random_hex(&case.random_hex)?;
        let logical = tokid::default_kernel().generate_tokid(Some(&case.profile_id), Some(case.length), Some(&mut reader))?;
        assert_eq!(
            logical,
            Tokid {
                profile_id: case.logical.profile_id.clone(),
                atoms: case.logical.atoms.clone(),
            }
        );
        assert_eq!(to_prompt(logical.clone(), None)?, case.renderings.prompt);
        assert_eq!(to_transport(logical.clone(), None)?, case.renderings.transport);
        assert_eq!(to_envelope(logical, None)?, case.renderings.envelope);
        let factory = create_tokid_factory(Some(&case.profile_id), Some(case.length))?;
        let _ = factory;
    }

    println!(r#"{{"sdk":"rust","capability":"full","passed":true}}"#);
    Ok(())
}
