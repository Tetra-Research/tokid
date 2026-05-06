from __future__ import annotations

import json
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "packages" / "python" / "src"))

from tokid import (  # noqa: E402
    DEFAULT_KERNEL,
    DEFAULT_PROFILE_ID,
    Tokid,
    create_tokid_factory,
    get_profile,
    list_profiles,
    parse,
    to_envelope,
    to_prompt,
    to_transport,
    validate_profile_manifest,
)


def scripted_random_bytes(hex_bytes: str):
    data = bytes.fromhex(hex_bytes)
    offset = 0

    def reader(length: int) -> bytes:
        nonlocal offset
        chunk = data[offset : offset + length]
        offset += length
        return chunk

    return reader


def logical_tuple(tokid: Tokid) -> tuple[str, tuple[str, ...]]:
    return (tokid.profile_id, tokid.atoms)


def main() -> None:
    suite = json.loads((REPO_ROOT / "conformance" / "fixtures" / "suite.json").read_text())

    registry_profile_ids = [profile["profileId"] for profile in suite["registry"]["profiles"]]
    assert DEFAULT_PROFILE_ID == suite["registry"]["defaultProfileId"]
    assert [profile["profileId"] for profile in list_profiles()] == registry_profile_ids

    for case in suite["validProfiles"]:
        profile = get_profile(case["profileId"])
        assert profile["profileTag"] == case["profileTag"]
        assert profile["profileVersion"] == case["profileVersion"]

    for case in suite["invalidProfiles"]:
        try:
            validate_profile_manifest(case["manifest"])
        except Exception as error:  # noqa: BLE001
            assert case["errorContains"] in str(error)
        else:
            raise AssertionError(f'invalid profile "{case["id"]}" was accepted')

    for case in suite["roundTrips"]:
        logical = Tokid(case["logical"]["profileId"], tuple(case["logical"]["atoms"]))
        prompt = case["renderings"]["prompt"]
        transport = case["renderings"]["transport"]
        envelope = case["renderings"]["envelope"]

        assert logical_tuple(parse(prompt, logical.profile_id)) == logical_tuple(logical)
        assert logical_tuple(parse(transport, logical.profile_id)) == logical_tuple(logical)
        assert logical_tuple(parse(envelope, logical.profile_id)) == logical_tuple(logical)
        assert to_prompt(logical) == prompt
        assert to_transport(logical) == transport
        assert to_envelope(logical) == envelope

    for case in suite["invalidPayloads"]:
        assert DEFAULT_KERNEL.parse_with_codec(case["value"], case["profileId"], case["codecId"]) is None

    for case in suite["invalidEnvelopes"]:
        assert parse(case["value"], case["profileId"]) is None

    for case in suite["deterministicGeneration"]:
        factory = create_tokid_factory(
            profile=case["profileId"],
            length=case["length"],
            random_bytes=scripted_random_bytes(case["randomHex"]),
        )
        envelope = factory.generate()
        logical = parse(envelope, case["profileId"])
        assert logical is not None
        assert logical_tuple(logical) == (
            case["logical"]["profileId"],
            tuple(case["logical"]["atoms"]),
        )
        assert envelope == case["renderings"]["envelope"]
        assert to_prompt(logical) == case["renderings"]["prompt"]
        assert to_transport(logical) == case["renderings"]["transport"]

    print(
        json.dumps(
            {
                "sdk": "python",
                "capability": "core",
                "passed": True,
                "profiles": registry_profile_ids,
            }
        )
    )


if __name__ == "__main__":
    main()
