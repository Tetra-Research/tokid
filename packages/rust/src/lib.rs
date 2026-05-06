use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::PathBuf;

pub type RandomBytesFn = dyn FnMut(usize) -> Result<Vec<u8>, TokidError>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tokid {
    #[serde(rename = "profileId")]
    pub profile_id: String,
    pub atoms: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokidPayloadDecodability {
    pub mode: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokidEnvelopeChecksumManifest {
    pub algorithm: String,
    pub length: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokidCodecManifest {
    pub id: String,
    pub kind: String,
    pub description: String,
    pub separator: String,
    #[serde(default)]
    pub normalization: Option<String>,
    #[serde(rename = "transportSafe", default)]
    pub transport_safe: Option<bool>,
    #[serde(default)]
    pub decodability: Option<TokidPayloadDecodability>,
    #[serde(rename = "payloadCodecId", default)]
    pub payload_codec_id: Option<String>,
    #[serde(default)]
    pub prefix: Option<String>,
    #[serde(rename = "formatVersion", default)]
    pub format_version: Option<u32>,
    #[serde(default)]
    pub checksum: Option<TokidEnvelopeChecksumManifest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokidProfileVocabularyManifest {
    pub syntax: String,
    pub atoms: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokidSourceArtifactLineage {
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokidSourceLineage {
    pub recipe: String,
    pub studies: Vec<String>,
    pub artifacts: Vec<TokidSourceArtifactLineage>,
    pub filters: Vec<String>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TokidEntropyMetadata {
    #[serde(rename = "atomCount")]
    pub atom_count: usize,
    #[serde(rename = "bitsPerAtom")]
    pub bits_per_atom: f64,
    #[serde(rename = "recommendedLength")]
    pub recommended_length: usize,
    #[serde(rename = "bitsAtRecommendedLength")]
    pub bits_at_recommended_length: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TokidProfileManifest {
    #[serde(rename = "profileId")]
    pub profile_id: String,
    #[serde(rename = "profileVersion")]
    pub profile_version: u32,
    #[serde(rename = "profileTag")]
    pub profile_tag: String,
    pub name: String,
    pub description: String,
    pub provider: String,
    pub vocabulary: TokidProfileVocabularyManifest,
    pub codecs: Vec<TokidCodecManifest>,
    pub entropy: TokidEntropyMetadata,
    #[serde(rename = "sourceLineage")]
    pub source_lineage: TokidSourceLineage,
}

#[derive(Debug, Clone, Deserialize)]
struct PortableRegistryEntry {
    #[serde(rename = "profileId")]
    _profile_id: String,
    manifest: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PortableRegistry {
    #[serde(rename = "defaultProfileId")]
    default_profile_id: String,
    profiles: Vec<PortableRegistryEntry>,
}

#[derive(Debug, Clone)]
struct TrieNode {
    atom: Option<String>,
    children: BTreeMap<char, TrieNode>,
}

#[derive(Debug, Clone)]
struct ProfileRuntime {
    manifest: TokidProfileManifest,
    syntax: regex::Regex,
    atom_set: BTreeSet<String>,
    payload_codecs: BTreeMap<String, TokidCodecManifest>,
    envelope_codecs: BTreeMap<String, TokidCodecManifest>,
    delimiterless_tries: BTreeMap<String, TrieNode>,
}

#[derive(Debug, Clone)]
pub struct TokidKernel {
    pub default_profile_id: String,
    runtimes: BTreeMap<String, ProfileRuntime>,
}

#[derive(Debug, Clone)]
pub struct TokidFactory {
    pub profile_id: String,
    pub length: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokidError(pub String);

impl std::fmt::Display for TokidError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for TokidError {}

fn generated_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("generated")
}

fn load_default_profiles() -> Result<(Vec<TokidProfileManifest>, String), TokidError> {
    let registry: PortableRegistry = serde_json::from_str(
        &fs::read_to_string(generated_dir().join("registry.json")).map_err(|error| TokidError(error.to_string()))?,
    )
    .map_err(|error| TokidError(error.to_string()))?;

    let mut profiles = Vec::with_capacity(registry.profiles.len());
    for entry in &registry.profiles {
        let manifest: TokidProfileManifest = serde_json::from_str(
            &fs::read_to_string(generated_dir().join(&entry.manifest))
                .map_err(|error| TokidError(error.to_string()))?,
        )
        .map_err(|error| TokidError(error.to_string()))?;
        profiles.push(manifest);
    }

    Ok((profiles, registry.default_profile_id))
}

fn build_trie(atoms: &[String]) -> Result<TrieNode, TokidError> {
    let mut root = TrieNode {
        atom: None,
        children: BTreeMap::new(),
    };

    for atom in atoms {
        let mut node = &mut root;
        for char in atom.chars() {
            if let Some(existing) = &node.atom {
                return Err(TokidError(format!(
                    "Vocabulary is not prefix-free: \"{existing}\" is a prefix of \"{atom}\""
                )));
            }
            node = node.children.entry(char).or_insert(TrieNode {
                atom: None,
                children: BTreeMap::new(),
            });
        }

        if node.atom.is_some() {
            return Err(TokidError(format!("Duplicate atom in vocabulary: \"{atom}\"")));
        }
        if !node.children.is_empty() {
            return Err(TokidError(format!(
                "Vocabulary is not prefix-free: \"{atom}\" is a prefix of another atom"
            )));
        }
        node.atom = Some(atom.clone());
    }

    Ok(root)
}

pub fn validate_profile_manifest(manifest: &TokidProfileManifest) -> Result<(), TokidError> {
    let profile_id_re = regex::Regex::new(r"^[a-z0-9-]+$").unwrap();
    let profile_tag_re = regex::Regex::new(r"^[a-z0-9]+$").unwrap();
    let hash_re = regex::Regex::new(r"^[0-9a-f]{64}$").unwrap();

    if !profile_id_re.is_match(&manifest.profile_id) {
        return Err(TokidError(format!(
            "Invalid profile id \"{}\". Profile ids must be lowercase ASCII slugs.",
            manifest.profile_id
        )));
    }
    if !profile_tag_re.is_match(&manifest.profile_tag) {
        return Err(TokidError(format!(
            "Invalid profile tag \"{}\". Profile tags must be lowercase base36-safe text.",
            manifest.profile_tag
        )));
    }
    if manifest.profile_version == 0 {
        return Err(TokidError(format!(
            "Invalid profile version for \"{}\"",
            manifest.profile_id
        )));
    }
    if manifest.vocabulary.atoms.is_empty() {
        return Err(TokidError(format!(
            "Profile \"{}\" must contain at least one atom",
            manifest.profile_id
        )));
    }
    if manifest.source_lineage.recipe.is_empty() {
        return Err(TokidError(format!(
            "Profile \"{}\" must declare a source recipe",
            manifest.profile_id
        )));
    }
    if manifest.source_lineage.artifacts.is_empty() {
        return Err(TokidError(format!(
            "Profile \"{}\" must declare at least one source artifact",
            manifest.profile_id
        )));
    }

    let syntax = regex::Regex::new(&manifest.vocabulary.syntax)
        .map_err(|error| TokidError(format!("Invalid syntax pattern for profile \"{}\": {error}", manifest.profile_id)))?;

    let mut atom_set = BTreeSet::new();
    let mut payload_codec_ids = BTreeSet::new();
    let mut requires_prefix_free = false;

    for artifact in &manifest.source_lineage.artifacts {
        if artifact.path.is_empty() {
            return Err(TokidError(format!(
                "Profile \"{}\" contains an empty source artifact path",
                manifest.profile_id
            )));
        }
        if !hash_re.is_match(&artifact.sha256) {
            return Err(TokidError(format!(
                "Profile \"{}\" contains invalid source artifact digest for \"{}\"",
                manifest.profile_id, artifact.path
            )));
        }
    }

    for atom in &manifest.vocabulary.atoms {
        if !atom_set.insert(atom.clone()) {
            return Err(TokidError(format!(
                "Duplicate atom in profile \"{}\": \"{}\"",
                manifest.profile_id, atom
            )));
        }
        if !syntax.is_match(atom) {
            return Err(TokidError(format!(
                "Atom \"{}\" violates syntax constraints for profile \"{}\"",
                atom, manifest.profile_id
            )));
        }
    }

    let codec_id_re = regex::Regex::new(r"^[a-z0-9-]+$").unwrap();
    let prefix_re = regex::Regex::new(r"^[a-z0-9]+$").unwrap();
    let mut codec_ids = BTreeSet::new();
    for codec in &manifest.codecs {
        if !codec_id_re.is_match(&codec.id) {
            return Err(TokidError(format!(
                "Invalid codec id \"{}\" in profile \"{}\"",
                codec.id, manifest.profile_id
            )));
        }
        if !codec_ids.insert(codec.id.clone()) {
            return Err(TokidError(format!(
                "Duplicate codec id \"{}\" in profile \"{}\"",
                codec.id, manifest.profile_id
            )));
        }

        if codec.kind == "payload" {
            if codec.decodability.as_ref().map(|value| value.mode.as_str()) == Some("prefix-free") {
                if !codec.separator.is_empty() {
                    return Err(TokidError(format!(
                        "Profile \"{}\" declares prefix-free decoding for codec \"{}\" but also sets a separator",
                        manifest.profile_id, codec.id
                    )));
                }
                requires_prefix_free = true;
            } else if codec.separator.is_empty() {
                return Err(TokidError(format!(
                    "Profile \"{}\" declares separator decoding for codec \"{}\" but does not define a separator",
                    manifest.profile_id, codec.id
                )));
            }
            payload_codec_ids.insert(codec.id.clone());
            continue;
        }

        let prefix = codec.prefix.clone().unwrap_or_default();
        if !prefix_re.is_match(&prefix) {
            return Err(TokidError(format!(
                "Invalid envelope prefix \"{}\" in profile \"{}\"",
                prefix, manifest.profile_id
            )));
        }
        if codec.separator.is_empty() {
            return Err(TokidError(format!(
                "Envelope codec \"{}\" in profile \"{}\" must use a separator",
                codec.id, manifest.profile_id
            )));
        }
        if codec.checksum.as_ref().map(|value| value.algorithm.as_str()) != Some("sha256-base36") {
            return Err(TokidError(format!(
                "Unsupported checksum algorithm \"{}\" in profile \"{}\"",
                codec.checksum
                    .as_ref()
                    .map(|value| value.algorithm.as_str())
                    .unwrap_or(""),
                manifest.profile_id
            )));
        }
    }

    for codec in &manifest.codecs {
        if codec.kind == "envelope" && !payload_codec_ids.contains(codec.payload_codec_id.as_deref().unwrap_or("")) {
            return Err(TokidError(format!(
                "Envelope codec \"{}\" in profile \"{}\" references missing payload codec \"{}\"",
                codec.id,
                manifest.profile_id,
                codec.payload_codec_id.clone().unwrap_or_default()
            )));
        }
    }

    if requires_prefix_free {
        build_trie(&manifest.vocabulary.atoms)?;
    }
    if manifest.entropy.atom_count != manifest.vocabulary.atoms.len() {
        return Err(TokidError(format!(
            "Entropy atom count mismatch for profile \"{}\"",
            manifest.profile_id
        )));
    }
    let expected_bits = (manifest.vocabulary.atoms.len() as f64).log2();
    if (manifest.entropy.bits_per_atom - expected_bits).abs() > 1e-9 {
        return Err(TokidError(format!(
            "Entropy bits-per-atom mismatch for profile \"{}\"",
            manifest.profile_id
        )));
    }
    Ok(())
}

fn build_profile_runtime(manifest: TokidProfileManifest) -> Result<ProfileRuntime, TokidError> {
    validate_profile_manifest(&manifest)?;
    let syntax = regex::Regex::new(&manifest.vocabulary.syntax).unwrap();
    let mut atom_set = BTreeSet::new();
    let mut payload_codecs = BTreeMap::new();
    let mut envelope_codecs = BTreeMap::new();
    let mut delimiterless_tries = BTreeMap::new();

    for atom in &manifest.vocabulary.atoms {
        atom_set.insert(atom.clone());
    }
    for codec in &manifest.codecs {
        if codec.kind == "payload" {
            payload_codecs.insert(codec.id.clone(), codec.clone());
            if codec
                .decodability
                .as_ref()
                .map(|value| value.mode.as_str())
                == Some("prefix-free")
                && codec.separator.is_empty()
            {
                delimiterless_tries.insert(codec.id.clone(), build_trie(&manifest.vocabulary.atoms)?);
            }
        } else {
            envelope_codecs.insert(codec.id.clone(), codec.clone());
        }
    }

    Ok(ProfileRuntime {
        manifest,
        syntax,
        atom_set,
        payload_codecs,
        envelope_codecs,
        delimiterless_tries,
    })
}

impl TokidKernel {
    pub fn new(profiles: Option<Vec<TokidProfileManifest>>, default_profile_id: Option<String>) -> Result<Self, TokidError> {
        let (profiles, loaded_default) = match profiles {
            Some(profiles) => (profiles, String::new()),
            None => load_default_profiles()?,
        };

        if profiles.is_empty() {
            return Err(TokidError("TokidKernel requires at least one profile".into()));
        }

        let mut runtimes = BTreeMap::new();
        for manifest in profiles {
            let runtime = build_profile_runtime(manifest)?;
            if runtimes.contains_key(&runtime.manifest.profile_id) {
                return Err(TokidError(format!(
                    "Duplicate profile id in kernel: \"{}\"",
                    runtime.manifest.profile_id
                )));
            }
            runtimes.insert(runtime.manifest.profile_id.clone(), runtime);
        }

        let default_profile_id = default_profile_id.unwrap_or_else(|| {
            if loaded_default.is_empty() {
                runtimes
                    .keys()
                    .next()
                    .cloned()
                    .unwrap_or_else(|| "".to_string())
            } else {
                loaded_default
            }
        });

        if !runtimes.contains_key(&default_profile_id) {
            return Err(TokidError(format!(
                "Unknown default profile \"{}\"",
                default_profile_id
            )));
        }

        Ok(Self {
            default_profile_id,
            runtimes,
        })
    }

    fn runtime(&self, profile_id: &str) -> Result<&ProfileRuntime, TokidError> {
        self.runtimes
            .get(profile_id)
            .ok_or_else(|| TokidError(format!("Unsupported tokid profile \"{}\"", profile_id)))
    }

    pub fn list_profiles(&self) -> Vec<TokidProfileManifest> {
        self.runtimes.values().map(|runtime| runtime.manifest.clone()).collect()
    }

    pub fn get_profile(&self, profile_id: Option<&str>) -> Result<TokidProfileManifest, TokidError> {
        Ok(self.runtime(profile_id.unwrap_or(&self.default_profile_id))?.manifest.clone())
    }

    pub fn generate_tokid(
        &self,
        profile_id: Option<&str>,
        length: Option<usize>,
        random_bytes: Option<&mut RandomBytesFn>,
    ) -> Result<Tokid, TokidError> {
        let runtime = self.runtime(profile_id.unwrap_or(&self.default_profile_id))?;
        let length = length.unwrap_or(runtime.manifest.entropy.recommended_length);
        if length == 0 {
            return Err(TokidError("Tokid length must be a positive integer".into()));
        }

        let mut default_rng = rand::thread_rng();
        let mut fallback = move |requested: usize| {
            let mut bytes = vec![0u8; requested];
            default_rng.fill_bytes(&mut bytes);
            Ok(bytes)
        };
        let random_bytes: &mut RandomBytesFn = match random_bytes {
            Some(random_bytes) => random_bytes,
            None => &mut fallback,
        };

        let mut atoms = Vec::with_capacity(length);
        for _ in 0..length {
            let index = pick_uniform_index(runtime.manifest.vocabulary.atoms.len(), random_bytes)?;
            atoms.push(runtime.manifest.vocabulary.atoms[index].clone());
        }

        Ok(Tokid {
            profile_id: runtime.manifest.profile_id.clone(),
            atoms,
        })
    }

    fn render_payload(&self, tokid: &Tokid, runtime: &ProfileRuntime, codec_id: &str) -> Result<String, TokidError> {
        if tokid.profile_id != runtime.manifest.profile_id {
            return Err(TokidError(format!(
                "Tokid profile mismatch: record uses \"{}\" but runtime is \"{}\"",
                tokid.profile_id, runtime.manifest.profile_id
            )));
        }
        let codec = runtime
            .payload_codecs
            .get(codec_id)
            .ok_or_else(|| TokidError(format!("Unsupported payload codec \"{}\"", codec_id)))?;

        for atom in &tokid.atoms {
            if !runtime.atom_set.contains(atom) || !runtime.syntax.is_match(atom) {
                return Err(TokidError(format!(
                    "Tokid contains atom \"{}\" outside profile \"{}\"",
                    atom, runtime.manifest.profile_id
                )));
            }
        }
        Ok(tokid.atoms.join(&codec.separator))
    }

    pub fn render_tokid(&self, tokid: &Tokid, codec_id: Option<&str>) -> Result<String, TokidError> {
        let codec_id = codec_id.unwrap_or("transport");
        let runtime = self.runtime(&tokid.profile_id)?;
        if runtime.payload_codecs.contains_key(codec_id) {
            return self.render_payload(tokid, runtime, codec_id);
        }
        let codec = runtime
            .envelope_codecs
            .get(codec_id)
            .ok_or_else(|| TokidError(format!("Unsupported codec \"{}\"", codec_id)))?;
        let payload = self.render_payload(tokid, runtime, codec.payload_codec_id.as_deref().unwrap_or("transport"))?;
        let checksum = compute_checksum(codec, &runtime.manifest.profile_tag, &payload);
        Ok([
            codec.prefix.clone().unwrap_or_default(),
            runtime.manifest.profile_tag.clone(),
            payload,
            checksum,
        ]
        .join(&codec.separator))
    }

    fn parse_payload(&self, value: &str, runtime: &ProfileRuntime, codec_id: &str) -> Option<Tokid> {
        let codec = runtime.payload_codecs.get(codec_id)?;
        let atoms = if codec
            .decodability
            .as_ref()
            .map(|value| value.mode.as_str())
            == Some("prefix-free")
        {
            parse_delimiterless_payload(value, runtime.delimiterless_tries.get(codec_id)?)
        } else {
            normalize_prompt_atoms(value, &codec.separator, codec.normalization.as_deref().unwrap_or("literal"))
        }?;

        if atoms.iter().any(|atom| !runtime.atom_set.contains(atom)) {
            return None;
        }
        Some(Tokid {
            profile_id: runtime.manifest.profile_id.clone(),
            atoms,
        })
    }

    fn parse_envelope(
        &self,
        value: &str,
        requested_profile_id: Option<&str>,
        requested_codec_id: Option<&str>,
    ) -> Option<Tokid> {
        for runtime in self.runtimes.values() {
            if requested_profile_id.is_some() && requested_profile_id != Some(runtime.manifest.profile_id.as_str()) {
                continue;
            }
            for codec in runtime.envelope_codecs.values() {
                if requested_codec_id.is_some() && requested_codec_id != Some(codec.id.as_str()) {
                    continue;
                }
                let parts: Vec<&str> = value.split(&codec.separator).collect();
                if parts.len() != 4 {
                    continue;
                }
                let [prefix, profile_tag, payload, checksum] = <[&str; 4]>::try_from(parts).ok()?;
                if prefix != codec.prefix.as_deref().unwrap_or("")
                    || profile_tag != runtime.manifest.profile_tag
                    || payload.is_empty()
                {
                    continue;
                }
                let checksum_re =
                    regex::Regex::new(&format!("^[0-9a-z]{{{}}}$", codec.checksum.as_ref()?.length)).ok()?;
                if !checksum_re.is_match(checksum) {
                    continue;
                }
                if compute_checksum(codec, profile_tag, payload) != checksum {
                    return None;
                }
                return self.parse_payload(payload, runtime, codec.payload_codec_id.as_deref()?);
            }
        }
        None
    }

    pub fn parse_with_codec(
        &self,
        value: &str,
        profile_id: Option<&str>,
        codec_id: Option<&str>,
    ) -> Option<Tokid> {
        match codec_id.unwrap_or("auto") {
            "auto" => {
                if let Some(envelope) = self.parse_envelope(value, profile_id, None) {
                    return Some(envelope);
                }
                let runtime = self.runtime(profile_id.unwrap_or(&self.default_profile_id)).ok()?;
                let payload_codec_id = if value.chars().any(char::is_whitespace) {
                    "prompt"
                } else {
                    "transport"
                };
                self.parse_payload(value, runtime, payload_codec_id)
            }
            explicit => {
                if let Some(profile_id) = profile_id {
                    let runtime = self.runtime(profile_id).ok()?;
                    if runtime.envelope_codecs.contains_key(explicit) {
                        self.parse_envelope(value, Some(profile_id), Some(explicit))
                    } else {
                        self.parse_payload(value, runtime, explicit)
                    }
                } else {
                    for runtime in self.runtimes.values() {
                        let parsed = if runtime.envelope_codecs.contains_key(explicit) {
                            self.parse_envelope(value, Some(&runtime.manifest.profile_id), Some(explicit))
                        } else {
                            self.parse_payload(value, runtime, explicit)
                        };
                        if parsed.is_some() {
                            return parsed;
                        }
                    }
                    None
                }
            }
        }
    }

    pub fn validate_tokid(&self, value: &str, profile_id: Option<&str>) -> bool {
        self.parse_with_codec(value, profile_id, None).is_some()
    }
}

impl TokidFactory {
    pub fn new(profile_id: Option<&str>, length: Option<usize>) -> Result<Self, TokidError> {
        let profile_id = profile_id.unwrap_or(default_profile_id()).to_string();
        let length = length.unwrap_or(default_tokid_length());
        Ok(Self { profile_id, length })
    }

    pub fn generate(&self, length: Option<usize>, format: Option<&str>) -> Result<String, TokidError> {
        let mut no_rng: Option<&mut RandomBytesFn> = None;
        let logical = default_kernel().generate_tokid(Some(&self.profile_id), length.or(Some(self.length)), no_rng.take())?;
        default_kernel().render_tokid(&logical, Some(format.unwrap_or("envelope")))
    }

    pub fn parse(&self, value: &str) -> Option<Tokid> {
        default_kernel().parse_with_codec(value, Some(&self.profile_id), None)
    }
}

fn pick_uniform_index(max_exclusive: usize, random_bytes: &mut RandomBytesFn) -> Result<usize, TokidError> {
    if max_exclusive == 0 {
        return Err(TokidError("Vocabulary size must be a positive integer".into()));
    }
    let bound = 1u64 << 32;
    let threshold = bound - (bound % max_exclusive as u64);
    loop {
        let raw = random_bytes(4)?;
        if raw.len() < 4 {
            return Err(TokidError("randomBytes must return the requested number of bytes".into()));
        }
        let candidate = u32::from_be_bytes([raw[0], raw[1], raw[2], raw[3]]) as u64;
        if candidate < threshold {
            return Ok((candidate % max_exclusive as u64) as usize);
        }
    }
}

fn compute_checksum(codec: &TokidCodecManifest, profile_tag: &str, payload: &str) -> String {
    let digest = Sha256::digest(
        format!(
            "{}|{}|{}|{}",
            codec.prefix.clone().unwrap_or_default(),
            codec.format_version.unwrap_or_default(),
            profile_tag,
            payload
        )
        .as_bytes(),
    );
    let encoded = encode_base36(&digest[..6]);
    let length = codec.checksum.as_ref().map(|checksum| checksum.length).unwrap_or(0);
    if encoded.len() >= length {
        encoded[..length].to_string()
    } else {
        format!("{}{}", "0".repeat(length - encoded.len()), encoded)
    }
}

fn encode_base36(bytes: &[u8]) -> String {
    let mut value = num_bigint::BigUint::from(0u8);
    for byte in bytes {
        value = (value << 8usize) + num_bigint::BigUint::from(*byte);
    }
    value.to_str_radix(36)
}

fn normalize_prompt_atoms(value: &str, separator: &str, normalization: &str) -> Option<Vec<String>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    let atoms = if normalization == "whitespace" && separator == " " {
        trimmed.split_whitespace().map(ToString::to_string).collect::<Vec<_>>()
    } else {
        trimmed.split(separator).map(ToString::to_string).collect::<Vec<_>>()
    };
    if atoms.iter().any(|atom| atom.is_empty()) {
        return None;
    }
    Some(atoms)
}

fn parse_delimiterless_payload(value: &str, trie: &TrieNode) -> Option<Vec<String>> {
    if value.is_empty() {
        return None;
    }
    let chars = value.chars().collect::<Vec<_>>();
    let mut atoms = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        let mut node = trie;
        let mut cursor = index;
        let mut matched_atom = None;
        while cursor < chars.len() {
            let next = node.children.get(&chars[cursor])?;
            node = next;
            cursor += 1;
            if let Some(atom) = &node.atom {
                matched_atom = Some(atom.clone());
                break;
            }
        }
        let matched_atom = matched_atom?;
        index += matched_atom.chars().count();
        atoms.push(matched_atom);
    }
    Some(atoms)
}

pub fn default_kernel() -> &'static TokidKernel {
    use std::sync::OnceLock;
    static INSTANCE: OnceLock<TokidKernel> = OnceLock::new();
    INSTANCE.get_or_init(|| TokidKernel::new(None, None).expect("default kernel"))
}

pub fn default_profile_id() -> &'static str {
    &default_kernel().default_profile_id
}

pub fn default_tokid_length() -> usize {
    default_kernel()
        .get_profile(Some(default_profile_id()))
        .expect("default profile")
        .entropy
        .recommended_length
}

pub fn create_tokid_factory(profile_id: Option<&str>, length: Option<usize>) -> Result<TokidFactory, TokidError> {
    TokidFactory::new(profile_id, length)
}

pub fn generate(profile_id: Option<&str>, length: Option<usize>, format: Option<&str>) -> Result<String, TokidError> {
    create_tokid_factory(profile_id, length)?.generate(length, format)
}

pub fn parse(value: &str, profile_id: Option<&str>) -> Option<Tokid> {
    default_kernel().parse_with_codec(value, profile_id, None)
}

pub fn is_tokid(value: &str, profile_id: Option<&str>) -> bool {
    default_kernel().validate_tokid(value, profile_id)
}

pub fn to_prompt(value: impl Into<TokidInput>, profile_id: Option<&str>) -> Result<String, TokidError> {
    default_kernel().render_tokid(&resolve_tokid(value.into(), profile_id)?, Some("prompt"))
}

pub fn to_transport(value: impl Into<TokidInput>, profile_id: Option<&str>) -> Result<String, TokidError> {
    default_kernel().render_tokid(&resolve_tokid(value.into(), profile_id)?, Some("transport"))
}

pub fn to_envelope(value: impl Into<TokidInput>, profile_id: Option<&str>) -> Result<String, TokidError> {
    default_kernel().render_tokid(&resolve_tokid(value.into(), profile_id)?, Some("envelope"))
}

pub fn list_profiles() -> Vec<TokidProfileManifest> {
    default_kernel().list_profiles()
}

pub fn get_profile(profile_id: Option<&str>) -> Result<TokidProfileManifest, TokidError> {
    default_kernel().get_profile(profile_id)
}

#[derive(Debug, Clone)]
pub enum TokidInput {
    Value(String),
    Logical(Tokid),
}

impl From<String> for TokidInput {
    fn from(value: String) -> Self {
        Self::Value(value)
    }
}

impl From<&str> for TokidInput {
    fn from(value: &str) -> Self {
        Self::Value(value.to_string())
    }
}

impl From<Tokid> for TokidInput {
    fn from(value: Tokid) -> Self {
        Self::Logical(value)
    }
}

fn resolve_tokid(value: TokidInput, profile_id: Option<&str>) -> Result<Tokid, TokidError> {
    match value {
        TokidInput::Logical(tokid) => Ok(tokid),
        TokidInput::Value(value) => default_kernel()
            .parse_with_codec(&value, profile_id, None)
            .ok_or_else(|| TokidError("Invalid tokid value".into())),
    }
}

pub fn decode_random_hex(hex: &str) -> Result<impl FnMut(usize) -> Result<Vec<u8>, TokidError>, TokidError> {
    let bytes = hex::decode(hex).map_err(|error| TokidError(error.to_string()))?;
    let mut offset = 0usize;
    Ok(move |length: usize| {
        let end = (offset + length).min(bytes.len());
        let chunk = bytes[offset..end].to_vec();
        offset = end;
        Ok(chunk)
    })
}
