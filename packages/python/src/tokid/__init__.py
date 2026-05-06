from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import re
import secrets
from typing import Any, Callable, Iterable


RandomBytesFn = Callable[[int], bytes]


@dataclass(frozen=True)
class Tokid:
    profile_id: str
    atoms: tuple[str, ...]


def _module_dir() -> Path:
    return Path(__file__).resolve().parent


def _generated_dir() -> Path:
    return _module_dir() / "generated"


def _load_registry() -> dict[str, Any]:
    return json.loads((_generated_dir() / "registry.json").read_text())


def _load_manifest(manifest_path: str) -> dict[str, Any]:
    return json.loads((_generated_dir() / manifest_path).read_text())


def _encode_base36(raw: bytes) -> str:
    value = 0
    for byte in raw:
        value = (value << 8) + byte
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"

    encoded = []
    while value > 0:
        value, remainder = divmod(value, 36)
        encoded.append(digits[remainder])
    return "".join(reversed(encoded))


def _compute_checksum(codec: dict[str, Any], profile_tag: str, payload: str) -> str:
    digest = sha256(f"{codec['prefix']}|{codec['formatVersion']}|{profile_tag}|{payload}".encode("utf8")).digest()[:6]
    return _encode_base36(digest).rjust(codec["checksum"]["length"], "0")[: codec["checksum"]["length"]]


def _pick_uniform_index(max_exclusive: int, random_bytes: RandomBytesFn) -> int:
    if max_exclusive <= 0:
        raise ValueError("Vocabulary size must be a positive integer")

    bound = 1 << 32
    threshold = bound - (bound % max_exclusive)

    while True:
        raw = random_bytes(4)
        if len(raw) < 4:
            raise ValueError("random_bytes must return the requested number of bytes")
        candidate = int.from_bytes(raw[:4], "big", signed=False)
        if candidate < threshold:
            return candidate % max_exclusive


def _normalize_prompt_atoms(value: str, separator: str, normalization: str) -> list[str] | None:
    trimmed = value.strip()
    if not trimmed:
        return None

    if normalization == "whitespace" and separator == " ":
        atoms = re.split(r"\s+", trimmed)
    else:
        atoms = trimmed.split(separator)

    return atoms if all(atom for atom in atoms) else None


def _build_trie(atoms: Iterable[str]) -> dict[str, Any]:
    root: dict[str, Any] = {"atom": None, "children": {}}
    for atom in atoms:
        node = root
        for char in atom:
            if node["atom"] is not None:
                raise ValueError(f'Vocabulary is not prefix-free: "{node["atom"]}" is a prefix of "{atom}"')
            node = node["children"].setdefault(char, {"atom": None, "children": {}})
        if node["atom"] is not None:
            raise ValueError(f'Duplicate atom in vocabulary: "{atom}"')
        if node["children"]:
            raise ValueError(f'Vocabulary is not prefix-free: "{atom}" is a prefix of another atom')
        node["atom"] = atom
    return root


def _parse_delimiterless_payload(value: str, trie: dict[str, Any]) -> list[str] | None:
    if not value:
        return None

    atoms: list[str] = []
    index = 0
    while index < len(value):
        node = trie
        cursor = index
        matched_atom: str | None = None
        while cursor < len(value):
            char = value[cursor]
            next_node = node["children"].get(char)
            if next_node is None:
                break
            node = next_node
            cursor += 1
            if node["atom"] is not None:
                matched_atom = node["atom"]
                break
        if matched_atom is None:
            return None
        atoms.append(matched_atom)
        index += len(matched_atom)

    return atoms


def validate_profile_manifest(manifest: dict[str, Any]) -> None:
    profile_id = manifest["profileId"]
    profile_tag = manifest["profileTag"]

    if not re.fullmatch(r"[a-z0-9-]+", profile_id):
        raise ValueError(f'Invalid profile id "{profile_id}". Profile ids must be lowercase ASCII slugs.')
    if not re.fullmatch(r"[a-z0-9]+", profile_tag):
        raise ValueError(f'Invalid profile tag "{profile_tag}". Profile tags must be lowercase base36-safe text.')
    if not isinstance(manifest["profileVersion"], int) or manifest["profileVersion"] <= 0:
        raise ValueError(f'Invalid profile version for "{profile_id}"')

    atoms = manifest["vocabulary"]["atoms"]
    if not atoms:
        raise ValueError(f'Profile "{profile_id}" must contain at least one atom')
    if not manifest["sourceLineage"]["recipe"]:
        raise ValueError(f'Profile "{profile_id}" must declare a source recipe')
    if not manifest["sourceLineage"]["artifacts"]:
        raise ValueError(f'Profile "{profile_id}" must declare at least one source artifact')

    syntax = re.compile(manifest["vocabulary"]["syntax"])
    atom_set: set[str] = set()
    requires_prefix_free = False
    payload_codecs: dict[str, dict[str, Any]] = {}

    for artifact in manifest["sourceLineage"]["artifacts"]:
        if not artifact["path"]:
            raise ValueError(f'Profile "{profile_id}" contains an empty source artifact path')
        if not re.fullmatch(r"[0-9a-f]{64}", artifact["sha256"]):
            raise ValueError(
                f'Profile "{profile_id}" contains invalid source artifact digest for "{artifact["path"]}"'
            )

    for atom in atoms:
        if atom in atom_set:
            raise ValueError(f'Duplicate atom in profile "{profile_id}": "{atom}"')
        if not syntax.fullmatch(atom):
            raise ValueError(f'Atom "{atom}" violates syntax constraints for profile "{profile_id}"')
        atom_set.add(atom)

    codec_ids: set[str] = set()
    for codec in manifest["codecs"]:
        codec_id = codec["id"]
        if not re.fullmatch(r"[a-z0-9-]+", codec_id):
            raise ValueError(f'Invalid codec id "{codec_id}" in profile "{profile_id}"')
        if codec_id in codec_ids:
            raise ValueError(f'Duplicate codec id "{codec_id}" in profile "{profile_id}"')
        codec_ids.add(codec_id)

        if codec["kind"] == "payload":
            if codec["decodability"]["mode"] == "prefix-free":
                if codec["separator"]:
                    raise ValueError(
                        f'Profile "{profile_id}" declares prefix-free decoding for codec "{codec_id}" but also sets a separator'
                    )
                requires_prefix_free = True
            elif not codec["separator"]:
                raise ValueError(
                    f'Profile "{profile_id}" declares separator decoding for codec "{codec_id}" but does not define a separator'
                )
            payload_codecs[codec_id] = codec
            continue

        if not re.fullmatch(r"[a-z0-9]+", codec["prefix"]):
            raise ValueError(f'Invalid envelope prefix "{codec["prefix"]}" in profile "{profile_id}"')
        if not codec["separator"]:
            raise ValueError(f'Envelope codec "{codec_id}" in profile "{profile_id}" must use a separator')
        if codec["checksum"]["algorithm"] != "sha256-base36":
            raise ValueError(
                f'Unsupported checksum algorithm "{codec["checksum"]["algorithm"]}" in profile "{profile_id}"'
            )
        if codec["payloadCodecId"] not in {candidate["id"] for candidate in manifest["codecs"] if candidate["kind"] == "payload"}:
            raise ValueError(
                f'Envelope codec "{codec_id}" in profile "{profile_id}" references missing payload codec "{codec["payloadCodecId"]}"'
            )

    if requires_prefix_free:
        _build_trie(atoms)

    entropy = manifest["entropy"]
    if entropy["atomCount"] != len(atoms):
        raise ValueError(f'Entropy atom count mismatch for profile "{profile_id}"')

    bits_per_atom = entropy["bitsPerAtom"]
    expected_bits_per_atom = len(atoms).bit_length() - 1 if len(atoms) and len(atoms) & (len(atoms) - 1) == 0 else None
    if expected_bits_per_atom is not None and abs(bits_per_atom - expected_bits_per_atom) > 1e-9:
        raise ValueError(f'Entropy bits-per-atom mismatch for profile "{profile_id}"')


class TokidKernel:
    def __init__(self, profiles: list[dict[str, Any]] | None = None, default_profile_id: str | None = None) -> None:
        registry = _load_registry()
        if profiles is None:
            profiles = [_load_manifest(entry["manifest"]) for entry in registry["profiles"]]
        if not profiles:
            raise ValueError("TokidKernel requires at least one profile")

        self._runtimes: dict[str, dict[str, Any]] = {}
        self._runtimes_by_tag: dict[str, dict[str, Any]] = {}

        for manifest in profiles:
            runtime = self._build_runtime(manifest)
            if manifest["profileId"] in self._runtimes:
                raise ValueError(f'Duplicate profile id in kernel: "{manifest["profileId"]}"')
            if manifest["profileTag"] in self._runtimes_by_tag:
                raise ValueError(f'Duplicate profile tag in kernel: "{manifest["profileTag"]}"')
            self._runtimes[manifest["profileId"]] = runtime
            self._runtimes_by_tag[manifest["profileTag"]] = runtime

        self.default_profile_id = default_profile_id or registry["defaultProfileId"]
        if self.default_profile_id not in self._runtimes:
            raise ValueError(f'Unknown default profile "{self.default_profile_id}"')

    def _build_runtime(self, manifest: dict[str, Any]) -> dict[str, Any]:
        validate_profile_manifest(manifest)
        payload_codecs = {codec["id"]: codec for codec in manifest["codecs"] if codec["kind"] == "payload"}
        envelope_codecs = {codec["id"]: codec for codec in manifest["codecs"] if codec["kind"] == "envelope"}
        delimiterless_tries = {
            codec_id: _build_trie(manifest["vocabulary"]["atoms"])
            for codec_id, codec in payload_codecs.items()
            if codec["decodability"]["mode"] == "prefix-free" and codec["separator"] == ""
        }
        return {
            "manifest": manifest,
            "syntax": re.compile(manifest["vocabulary"]["syntax"]),
            "atom_set": set(manifest["vocabulary"]["atoms"]),
            "payload_codecs": payload_codecs,
            "envelope_codecs": envelope_codecs,
            "delimiterless_tries": delimiterless_tries,
        }

    def _runtime(self, profile_id: str) -> dict[str, Any]:
        runtime = self._runtimes.get(profile_id)
        if runtime is None:
            raise ValueError(f'Unsupported tokid profile "{profile_id}"')
        return runtime

    def list_profiles(self) -> list[dict[str, Any]]:
        return [runtime["manifest"] for runtime in self._runtimes.values()]

    def get_profile(self, profile_id: str | None = None) -> dict[str, Any]:
        return self._runtime(profile_id or self.default_profile_id)["manifest"]

    def _assert_tokid(self, tokid: Tokid, runtime: dict[str, Any]) -> None:
        if tokid.profile_id != runtime["manifest"]["profileId"]:
            raise ValueError(
                f'Tokid profile mismatch: record uses "{tokid.profile_id}" but runtime is "{runtime["manifest"]["profileId"]}"'
            )
        if not tokid.atoms:
            raise ValueError("Tokid values must contain at least one atom")
        for atom in tokid.atoms:
            if atom not in runtime["atom_set"] or runtime["syntax"].fullmatch(atom) is None:
                raise ValueError(f'Tokid contains atom "{atom}" outside profile "{runtime["manifest"]["profileId"]}"')

    def generate_tokid(
        self,
        profile_id: str | None = None,
        length: int | None = None,
        random_bytes: RandomBytesFn | None = None,
    ) -> Tokid:
        runtime = self._runtime(profile_id or self.default_profile_id)
        actual_length = length or runtime["manifest"]["entropy"]["recommendedLength"]
        if actual_length <= 0:
            raise ValueError("Tokid length must be a positive integer")

        rng = random_bytes or secrets.token_bytes
        atoms = []
        vocabulary = runtime["manifest"]["vocabulary"]["atoms"]
        for _ in range(actual_length):
            atoms.append(vocabulary[_pick_uniform_index(len(vocabulary), rng)])
        return Tokid(runtime["manifest"]["profileId"], tuple(atoms))

    def _render_payload(self, tokid: Tokid, runtime: dict[str, Any], codec_id: str) -> str:
        codec = runtime["payload_codecs"][codec_id]
        self._assert_tokid(tokid, runtime)
        return codec["separator"].join(tokid.atoms)

    def render_tokid(self, tokid: Tokid, codec_id: str = "transport") -> str:
        runtime = self._runtime(tokid.profile_id)
        if codec_id in runtime["payload_codecs"]:
            return self._render_payload(tokid, runtime, codec_id)
        codec = runtime["envelope_codecs"][codec_id]
        payload = self._render_payload(tokid, runtime, codec["payloadCodecId"])
        checksum = _compute_checksum(codec, runtime["manifest"]["profileTag"], payload)
        return codec["separator"].join([codec["prefix"], runtime["manifest"]["profileTag"], payload, checksum])

    def _parse_payload(self, value: str, runtime: dict[str, Any], codec_id: str) -> Tokid | None:
        codec = runtime["payload_codecs"][codec_id]
        if codec["decodability"]["mode"] == "prefix-free":
            atoms = _parse_delimiterless_payload(value, runtime["delimiterless_tries"][codec_id])
        else:
            atoms = _normalize_prompt_atoms(value, codec["separator"], codec["normalization"])
        if not atoms or any(atom not in runtime["atom_set"] for atom in atoms):
            return None
        return Tokid(runtime["manifest"]["profileId"], tuple(atoms))

    def _parse_envelope(
        self,
        value: str,
        requested_profile_id: str | None = None,
        requested_codec_id: str | None = None,
    ) -> Tokid | None:
        for runtime in self._runtimes.values():
            if requested_profile_id and runtime["manifest"]["profileId"] != requested_profile_id:
                continue
            for codec in runtime["envelope_codecs"].values():
                if requested_codec_id and codec["id"] != requested_codec_id:
                    continue
                parts = value.split(codec["separator"])
                if len(parts) != 4:
                    continue
                prefix, profile_tag, payload, checksum = parts
                if prefix != codec["prefix"] or profile_tag != runtime["manifest"]["profileTag"] or not payload:
                    continue
                if re.fullmatch(rf"[0-9a-z]{{{codec['checksum']['length']}}}", checksum) is None:
                    continue
                if _compute_checksum(codec, profile_tag, payload) != checksum:
                    return None
                return self._parse_payload(payload, runtime, codec["payloadCodecId"])
        return None

    def parse_with_codec(
        self,
        value: str,
        profile_id: str | None = None,
        codec_id: str | None = None,
    ) -> Tokid | None:
        actual_codec_id = codec_id or "auto"
        if actual_codec_id == "auto":
            envelope = self._parse_envelope(value, profile_id)
            if envelope is not None:
                return envelope
            runtime = self._runtime(profile_id or self.default_profile_id)
            payload_codec_id = "prompt" if re.search(r"\s", value) else "transport"
            return self._parse_payload(value, runtime, payload_codec_id)

        if profile_id:
            runtime = self._runtime(profile_id)
            if actual_codec_id in runtime["envelope_codecs"]:
                return self._parse_envelope(value, profile_id, actual_codec_id)
            return self._parse_payload(value, runtime, actual_codec_id)

        for runtime in self._runtimes.values():
            if actual_codec_id in runtime["envelope_codecs"]:
                parsed = self._parse_envelope(value, runtime["manifest"]["profileId"], actual_codec_id)
            else:
                parsed = self._parse_payload(value, runtime, actual_codec_id)
            if parsed is not None:
                return parsed
        return None

    def validate_tokid(self, value: str, profile_id: str | None = None) -> bool:
        return self.parse_with_codec(value, profile_id) is not None


DEFAULT_KERNEL = TokidKernel()
DEFAULT_PROFILE_ID = DEFAULT_KERNEL.default_profile_id
DEFAULT_TOKID_LENGTH = DEFAULT_KERNEL.get_profile()["entropy"]["recommendedLength"]


class TokidFactory:
    def __init__(
        self,
        profile: str = DEFAULT_PROFILE_ID,
        length: int | None = None,
        random_bytes: RandomBytesFn | None = None,
    ) -> None:
        self.profile_id = profile
        self.length = length or DEFAULT_KERNEL.get_profile(profile)["entropy"]["recommendedLength"]
        self._random_bytes = random_bytes

    def generate(self, length: int | None = None, format: str = "envelope") -> str:
        logical = DEFAULT_KERNEL.generate_tokid(self.profile_id, length or self.length, self._random_bytes)
        return DEFAULT_KERNEL.render_tokid(logical, _codec_for_format(format))

    def parse(self, value: str) -> Tokid | None:
        return DEFAULT_KERNEL.parse_with_codec(value, self.profile_id)

    def is_tokid(self, value: str) -> bool:
        return DEFAULT_KERNEL.validate_tokid(value, self.profile_id)

    def prompt(self, value: str | Tokid) -> str:
        return to_prompt(value, profile=self.profile_id)

    def transport(self, value: str | Tokid) -> str:
        return to_transport(value, profile=self.profile_id)

    def envelope(self, value: str | Tokid) -> str:
        return to_envelope(value, profile=self.profile_id)

    def profile(self) -> dict[str, Any]:
        return DEFAULT_KERNEL.get_profile(self.profile_id)


def _codec_for_format(format: str) -> str:
    if format not in {"prompt", "transport", "envelope"}:
        raise ValueError(f"Unsupported format: {format}")
    return format


def _resolve_tokid(value: str | Tokid, profile: str | None = None) -> Tokid:
    if isinstance(value, Tokid):
        return value
    parsed = DEFAULT_KERNEL.parse_with_codec(value, profile)
    if parsed is None:
        raise ValueError("Invalid tokid value")
    return parsed


def create_tokid_factory(
    profile: str = DEFAULT_PROFILE_ID,
    length: int | None = None,
    random_bytes: RandomBytesFn | None = None,
) -> TokidFactory:
    return TokidFactory(profile=profile, length=length, random_bytes=random_bytes)


def generate(
    profile: str = DEFAULT_PROFILE_ID,
    length: int | None = None,
    format: str = "envelope",
    random_bytes: RandomBytesFn | None = None,
) -> str:
    return create_tokid_factory(profile=profile, length=length, random_bytes=random_bytes).generate(
        length=length,
        format=format,
    )


def parse(value: str, profile: str | None = None) -> Tokid | None:
    return DEFAULT_KERNEL.parse_with_codec(value, profile)


def is_tokid(value: str, profile: str | None = None) -> bool:
    return DEFAULT_KERNEL.validate_tokid(value, profile)


def to_prompt(value: str | Tokid, profile: str | None = None) -> str:
    return DEFAULT_KERNEL.render_tokid(_resolve_tokid(value, profile), "prompt")


def to_transport(value: str | Tokid, profile: str | None = None) -> str:
    return DEFAULT_KERNEL.render_tokid(_resolve_tokid(value, profile), "transport")


def to_envelope(value: str | Tokid, profile: str | None = None) -> str:
    return DEFAULT_KERNEL.render_tokid(_resolve_tokid(value, profile), "envelope")


def list_profiles() -> list[dict[str, Any]]:
    return DEFAULT_KERNEL.list_profiles()


def get_profile(profile: str = DEFAULT_PROFILE_ID) -> dict[str, Any]:
    return DEFAULT_KERNEL.get_profile(profile)
