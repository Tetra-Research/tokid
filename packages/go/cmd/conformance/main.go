package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Tetra-Research/tokid/packages/go/tokid"
)

type conformanceSuite struct {
	Registry struct {
		DefaultProfileID string `json:"defaultProfileId"`
		Profiles         []struct {
			ProfileID string `json:"profileId"`
		} `json:"profiles"`
	} `json:"registry"`
	ValidProfiles []struct {
		ProfileID      string   `json:"profileId"`
		ProfileTag     string   `json:"profileTag"`
		ProfileVersion int      `json:"profileVersion"`
		Codecs         []string `json:"codecs"`
	} `json:"validProfiles"`
	InvalidProfiles []struct {
		ID            string                   `json:"id"`
		ErrorContains string                   `json:"errorContains"`
		Manifest      tokid.TokidProfileManifest `json:"manifest"`
	} `json:"invalidProfiles"`
	RoundTrips []struct {
		Logical struct {
			ProfileID string   `json:"profileId"`
			Atoms     []string `json:"atoms"`
		} `json:"logical"`
		Renderings struct {
			Prompt    string `json:"prompt"`
			Transport string `json:"transport"`
			Envelope  string `json:"envelope"`
		} `json:"renderings"`
	} `json:"roundTrips"`
	InvalidPayloads []struct {
		ProfileID string `json:"profileId"`
		CodecID   string `json:"codecId"`
		Value     string `json:"value"`
	} `json:"invalidPayloads"`
	InvalidEnvelopes []struct {
		ProfileID string `json:"profileId"`
		Value     string `json:"value"`
	} `json:"invalidEnvelopes"`
	DeterministicGeneration []struct {
		ProfileID string `json:"profileId"`
		Length    int    `json:"length"`
		RandomHex string `json:"randomHex"`
		Logical   struct {
			ProfileID string   `json:"profileId"`
			Atoms     []string `json:"atoms"`
		} `json:"logical"`
		Renderings struct {
			Prompt    string `json:"prompt"`
			Transport string `json:"transport"`
			Envelope  string `json:"envelope"`
		} `json:"renderings"`
	} `json:"deterministicGeneration"`
}

func must(condition bool, message string) {
	if !condition {
		panic(message)
	}
}

func main() {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		panic(err)
	}

	raw, err := os.ReadFile(filepath.Join(root, "conformance", "fixtures", "suite.json"))
	if err != nil {
		panic(err)
	}

	var suite conformanceSuite
	if err := json.Unmarshal(raw, &suite); err != nil {
		panic(err)
	}

	must(tokid.DefaultProfileID == suite.Registry.DefaultProfileID, "default profile id mismatch")

	profiles := tokid.ListProfiles()
	must(len(profiles) == len(suite.Registry.Profiles), "profile count mismatch")

	for _, profile := range suite.ValidProfiles {
		actual := tokid.GetProfile(profile.ProfileID)
		must(actual.ProfileTag == profile.ProfileTag, "profile tag mismatch")
		must(actual.ProfileVersion == profile.ProfileVersion, "profile version mismatch")
	}

	for _, invalid := range suite.InvalidProfiles {
		err := tokid.ValidateProfileManifest(invalid.Manifest)
		if err == nil || !contains(err.Error(), invalid.ErrorContains) {
			panic(fmt.Sprintf("invalid profile %q was not rejected as expected", invalid.ID))
		}
	}

	for _, roundTrip := range suite.RoundTrips {
		logical := tokid.Tokid{ProfileID: roundTrip.Logical.ProfileID, Atoms: roundTrip.Logical.Atoms}
		prompt := tokid.Parse(roundTrip.Renderings.Prompt, roundTrip.Logical.ProfileID)
		transport := tokid.Parse(roundTrip.Renderings.Transport, roundTrip.Logical.ProfileID)
		envelope := tokid.Parse(roundTrip.Renderings.Envelope, roundTrip.Logical.ProfileID)
		must(prompt != nil && transport != nil && envelope != nil, "round-trip parse returned nil")
		must(equalTokid(*prompt, logical), "prompt round-trip mismatch")
		must(equalTokid(*transport, logical), "transport round-trip mismatch")
		must(equalTokid(*envelope, logical), "envelope round-trip mismatch")

		actualPrompt, err := tokid.ToPrompt(logical, "")
		if err != nil {
			panic(err)
		}
		actualTransport, err := tokid.ToTransport(logical, "")
		if err != nil {
			panic(err)
		}
		actualEnvelope, err := tokid.ToEnvelope(logical, "")
		if err != nil {
			panic(err)
		}
		must(actualPrompt == roundTrip.Renderings.Prompt, "prompt rendering mismatch")
		must(actualTransport == roundTrip.Renderings.Transport, "transport rendering mismatch")
		must(actualEnvelope == roundTrip.Renderings.Envelope, "envelope rendering mismatch")
	}

	for _, invalid := range suite.InvalidPayloads {
		must(tokid.ParseWithCodecForConformance(invalid.Value, invalid.ProfileID, invalid.CodecID) == nil, "invalid payload decoded")
	}

	for _, invalid := range suite.InvalidEnvelopes {
		must(tokid.Parse(invalid.Value, invalid.ProfileID) == nil, "invalid envelope decoded")
	}

	for _, generation := range suite.DeterministicGeneration {
		randomBytes, err := tokid.DecodeRandomHex(generation.RandomHex)
		if err != nil {
			panic(err)
		}
		factory := tokid.CreateFactory(generation.ProfileID, generation.Length, randomBytes)
		envelope, err := factory.Generate(0, "envelope")
		if err != nil {
			panic(err)
		}
		logical := tokid.Parse(envelope, generation.ProfileID)
		must(logical != nil, "generated envelope did not parse")
		must(equalTokid(*logical, tokid.Tokid{ProfileID: generation.Logical.ProfileID, Atoms: generation.Logical.Atoms}), "generated logical mismatch")
		must(envelope == generation.Renderings.Envelope, "generated envelope mismatch")
	}

	result, err := json.Marshal(map[string]any{
		"sdk":        "go",
		"capability": "core",
		"passed":     true,
	})
	if err != nil {
		panic(err)
	}
	fmt.Println(string(result))
}

func equalTokid(left tokid.Tokid, right tokid.Tokid) bool {
	if left.ProfileID != right.ProfileID || len(left.Atoms) != len(right.Atoms) {
		return false
	}
	for index := range left.Atoms {
		if left.Atoms[index] != right.Atoms[index] {
			return false
		}
	}
	return true
}

func contains(value string, substring string) bool {
	return strings.Contains(strings.ToLower(value), strings.ToLower(substring))
}
