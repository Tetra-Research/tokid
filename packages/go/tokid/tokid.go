package tokid

import (
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"path"
	"regexp"
	"slices"
	"strings"
)

//go:embed generated/registry.json generated/profiles/*.json
var generatedFS embed.FS

type RandomBytesFn func(length int) ([]byte, error)

type Tokid struct {
	ProfileID string
	Atoms     []string
}

type TokidPayloadDecodability struct {
	Mode string `json:"mode"`
}

type TokidEnvelopeChecksumManifest struct {
	Algorithm string `json:"algorithm"`
	Length    int    `json:"length"`
}

type TokidCodecManifest struct {
	ID             string                        `json:"id"`
	Kind           string                        `json:"kind"`
	Description    string                        `json:"description"`
	Separator      string                        `json:"separator"`
	Normalization  string                        `json:"normalization,omitempty"`
	TransportSafe  bool                          `json:"transportSafe,omitempty"`
	Decodability   TokidPayloadDecodability      `json:"decodability,omitempty"`
	PayloadCodecID string                        `json:"payloadCodecId,omitempty"`
	Prefix         string                        `json:"prefix,omitempty"`
	FormatVersion  int                           `json:"formatVersion,omitempty"`
	Checksum       TokidEnvelopeChecksumManifest `json:"checksum,omitempty"`
}

type TokidProfileVocabularyManifest struct {
	Syntax string   `json:"syntax"`
	Atoms  []string `json:"atoms"`
}

type TokidSourceArtifactLineage struct {
	Path   string `json:"path"`
	Sha256 string `json:"sha256"`
}

type TokidSourceLineage struct {
	Recipe    string                      `json:"recipe"`
	Studies   []string                    `json:"studies"`
	Artifacts []TokidSourceArtifactLineage `json:"artifacts"`
	Filters   []string                    `json:"filters"`
	Notes     []string                    `json:"notes,omitempty"`
}

type TokidEntropyMetadata struct {
	AtomCount               int     `json:"atomCount"`
	BitsPerAtom             float64 `json:"bitsPerAtom"`
	RecommendedLength       int     `json:"recommendedLength"`
	BitsAtRecommendedLength float64 `json:"bitsAtRecommendedLength"`
}

type TokidProfileManifest struct {
	ProfileID     string                       `json:"profileId"`
	ProfileVersion int                         `json:"profileVersion"`
	ProfileTag    string                       `json:"profileTag"`
	Name          string                       `json:"name"`
	Description   string                       `json:"description"`
	Provider      string                       `json:"provider"`
	Vocabulary    TokidProfileVocabularyManifest `json:"vocabulary"`
	Codecs        []TokidCodecManifest         `json:"codecs"`
	Entropy       TokidEntropyMetadata         `json:"entropy"`
	SourceLineage TokidSourceLineage          `json:"sourceLineage"`
}

type portableRegistry struct {
	SchemaVersion  int `json:"schemaVersion"`
	DefaultProfileID string `json:"defaultProfileId"`
	Profiles []struct {
		ProfileID string `json:"profileId"`
		Manifest  string `json:"manifest"`
	} `json:"profiles"`
}

type trieNode struct {
	Atom     string
	Children map[rune]*trieNode
}

type profileRuntime struct {
	Manifest          TokidProfileManifest
	Syntax            *regexp.Regexp
	AtomSet           map[string]struct{}
	PayloadCodecs     map[string]TokidCodecManifest
	EnvelopeCodecs    map[string]TokidCodecManifest
	DelimiterlessTrie map[string]*trieNode
}

type TokidKernel struct {
	DefaultProfileID string
	Runtimes         map[string]*profileRuntime
}

type TokidFactory struct {
	ProfileID   string
	Length      int
	RandomBytes RandomBytesFn
}

var (
	defaultKernel       = mustDefaultKernel()
	DefaultProfileID    = defaultKernel.DefaultProfileID
	DefaultTokidLength  = defaultKernel.GetProfile(DefaultProfileID).Entropy.RecommendedLength
	profileIDPattern    = regexp.MustCompile(`^[a-z0-9-]+$`)
	profileTagPattern   = regexp.MustCompile(`^[a-z0-9]+$`)
	checksumDigitsCache = map[int]*regexp.Regexp{}
)

func mustDefaultKernel() *TokidKernel {
	kernel, err := NewTokidKernel(nil, "")
	if err != nil {
		panic(err)
	}
	return kernel
}

func readGeneratedJSON(relativePath string, target any) error {
	raw, err := generatedFS.ReadFile(relativePath)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, target)
}

func loadDefaultProfiles() ([]TokidProfileManifest, string, error) {
	var registry portableRegistry
	if err := readGeneratedJSON("generated/registry.json", &registry); err != nil {
		return nil, "", err
	}

	profiles := make([]TokidProfileManifest, 0, len(registry.Profiles))
	for _, entry := range registry.Profiles {
		var manifest TokidProfileManifest
		if err := readGeneratedJSON(path.Join("generated", entry.Manifest), &manifest); err != nil {
			return nil, "", err
		}
		profiles = append(profiles, manifest)
	}

	return profiles, registry.DefaultProfileID, nil
}

func ValidateProfileManifest(manifest TokidProfileManifest) error {
	if !profileIDPattern.MatchString(manifest.ProfileID) {
		return fmt.Errorf("invalid profile id %q. profile ids must be lowercase ASCII slugs", manifest.ProfileID)
	}
	if !profileTagPattern.MatchString(manifest.ProfileTag) {
		return fmt.Errorf("invalid profile tag %q. profile tags must be lowercase base36-safe text", manifest.ProfileTag)
	}
	if manifest.ProfileVersion <= 0 {
		return fmt.Errorf("invalid profile version for %q", manifest.ProfileID)
	}
	if len(manifest.Vocabulary.Atoms) == 0 {
		return fmt.Errorf("profile %q must contain at least one atom", manifest.ProfileID)
	}
	if manifest.SourceLineage.Recipe == "" {
		return fmt.Errorf("profile %q must declare a source recipe", manifest.ProfileID)
	}
	if len(manifest.SourceLineage.Artifacts) == 0 {
		return fmt.Errorf("profile %q must declare at least one source artifact", manifest.ProfileID)
	}

	syntax, err := regexp.Compile(manifest.Vocabulary.Syntax)
	if err != nil {
		return fmt.Errorf("invalid syntax pattern for profile %q: %w", manifest.ProfileID, err)
	}

	atomSet := map[string]struct{}{}
	requiresPrefixFree := false
	payloadCodecIDs := map[string]struct{}{}

	for _, artifact := range manifest.SourceLineage.Artifacts {
		if artifact.Path == "" {
			return fmt.Errorf("profile %q contains an empty source artifact path", manifest.ProfileID)
		}
		if matched, _ := regexp.MatchString(`^[0-9a-f]{64}$`, artifact.Sha256); !matched {
			return fmt.Errorf(
				"profile %q contains invalid source artifact digest for %q",
				manifest.ProfileID,
				artifact.Path,
			)
		}
	}

	for _, atom := range manifest.Vocabulary.Atoms {
		if _, exists := atomSet[atom]; exists {
			return fmt.Errorf("duplicate atom in profile %q: %q", manifest.ProfileID, atom)
		}
		if !syntax.MatchString(atom) {
			return fmt.Errorf("atom %q violates syntax constraints for profile %q", atom, manifest.ProfileID)
		}
		atomSet[atom] = struct{}{}
	}

	codecIDs := map[string]struct{}{}
	for _, codec := range manifest.Codecs {
		if matched, _ := regexp.MatchString(`^[a-z0-9-]+$`, codec.ID); !matched {
			return fmt.Errorf("invalid codec id %q in profile %q", codec.ID, manifest.ProfileID)
		}
		if _, exists := codecIDs[codec.ID]; exists {
			return fmt.Errorf("duplicate codec id %q in profile %q", codec.ID, manifest.ProfileID)
		}
		codecIDs[codec.ID] = struct{}{}

		if codec.Kind == "payload" {
			if codec.Decodability.Mode == "prefix-free" {
				if codec.Separator != "" {
					return fmt.Errorf(
						"profile %q declares prefix-free decoding for codec %q but also sets a separator",
						manifest.ProfileID,
						codec.ID,
					)
				}
				requiresPrefixFree = true
			} else if codec.Separator == "" {
				return fmt.Errorf(
					"profile %q declares separator decoding for codec %q but does not define a separator",
					manifest.ProfileID,
					codec.ID,
				)
			}
			payloadCodecIDs[codec.ID] = struct{}{}
			continue
		}

		if matched, _ := regexp.MatchString(`^[a-z0-9]+$`, codec.Prefix); !matched {
			return fmt.Errorf("invalid envelope prefix %q in profile %q", codec.Prefix, manifest.ProfileID)
		}
		if codec.Separator == "" {
			return fmt.Errorf("envelope codec %q in profile %q must use a separator", codec.ID, manifest.ProfileID)
		}
		if codec.Checksum.Algorithm != "sha256-base36" {
			return fmt.Errorf(
				"unsupported checksum algorithm %q in profile %q",
				codec.Checksum.Algorithm,
				manifest.ProfileID,
			)
		}
	}

	for _, codec := range manifest.Codecs {
		if codec.Kind == "envelope" {
			if _, ok := payloadCodecIDs[codec.PayloadCodecID]; !ok {
				return fmt.Errorf(
					"envelope codec %q in profile %q references missing payload codec %q",
					codec.ID,
					manifest.ProfileID,
					codec.PayloadCodecID,
				)
			}
		}
	}

	if requiresPrefixFree {
		if _, err := buildTrie(manifest.Vocabulary.Atoms); err != nil {
			return err
		}
	}

	if manifest.Entropy.AtomCount != len(manifest.Vocabulary.Atoms) {
		return fmt.Errorf("entropy atom count mismatch for profile %q", manifest.ProfileID)
	}
	if math.Abs(manifest.Entropy.BitsPerAtom-math.Log2(float64(len(manifest.Vocabulary.Atoms)))) > 1e-9 {
		return fmt.Errorf("entropy bits-per-atom mismatch for profile %q", manifest.ProfileID)
	}
	return nil
}

func buildTrie(atoms []string) (*trieNode, error) {
	root := &trieNode{Children: map[rune]*trieNode{}}
	for _, atom := range atoms {
		node := root
		for _, char := range atom {
			if node.Atom != "" {
				return nil, fmt.Errorf("Vocabulary is not prefix-free: %q is a prefix of %q", node.Atom, atom)
			}
			next := node.Children[char]
			if next == nil {
				next = &trieNode{Children: map[rune]*trieNode{}}
				node.Children[char] = next
			}
			node = next
		}
		if node.Atom != "" {
			return nil, fmt.Errorf("Duplicate atom in vocabulary: %q", atom)
		}
		if len(node.Children) > 0 {
			return nil, fmt.Errorf("Vocabulary is not prefix-free: %q is a prefix of another atom", atom)
		}
		node.Atom = atom
	}
	return root, nil
}

func NewTokidKernel(profiles []TokidProfileManifest, defaultProfileID string) (*TokidKernel, error) {
	if profiles == nil {
		loadedProfiles, loadedDefault, err := loadDefaultProfiles()
		if err != nil {
			return nil, err
		}
		profiles = loadedProfiles
		if defaultProfileID == "" {
			defaultProfileID = loadedDefault
		}
	}
	if len(profiles) == 0 {
		return nil, errors.New("TokidKernel requires at least one profile")
	}

	kernel := &TokidKernel{Runtimes: map[string]*profileRuntime{}}
	for _, manifest := range profiles {
		runtime, err := buildProfileRuntime(manifest)
		if err != nil {
			return nil, err
		}
		if _, exists := kernel.Runtimes[manifest.ProfileID]; exists {
			return nil, fmt.Errorf("duplicate profile id in kernel: %q", manifest.ProfileID)
		}
		kernel.Runtimes[manifest.ProfileID] = runtime
	}

	if defaultProfileID == "" {
		defaultProfileID = profiles[0].ProfileID
	}
	if _, ok := kernel.Runtimes[defaultProfileID]; !ok {
		return nil, fmt.Errorf("unknown default profile %q", defaultProfileID)
	}
	kernel.DefaultProfileID = defaultProfileID
	return kernel, nil
}

func buildProfileRuntime(manifest TokidProfileManifest) (*profileRuntime, error) {
	if err := ValidateProfileManifest(manifest); err != nil {
		return nil, err
	}
	syntax, _ := regexp.Compile(manifest.Vocabulary.Syntax)
	payloadCodecs := map[string]TokidCodecManifest{}
	envelopeCodecs := map[string]TokidCodecManifest{}
	delimiterlessTries := map[string]*trieNode{}
	atomSet := map[string]struct{}{}

	for _, atom := range manifest.Vocabulary.Atoms {
		atomSet[atom] = struct{}{}
	}

	for _, codec := range manifest.Codecs {
		if codec.Kind == "payload" {
			payloadCodecs[codec.ID] = codec
			if codec.Decodability.Mode == "prefix-free" && codec.Separator == "" {
				trie, err := buildTrie(manifest.Vocabulary.Atoms)
				if err != nil {
					return nil, err
				}
				delimiterlessTries[codec.ID] = trie
			}
		} else {
			envelopeCodecs[codec.ID] = codec
		}
	}

	return &profileRuntime{
		Manifest:          manifest,
		Syntax:            syntax,
		AtomSet:           atomSet,
		PayloadCodecs:     payloadCodecs,
		EnvelopeCodecs:    envelopeCodecs,
		DelimiterlessTrie: delimiterlessTries,
	}, nil
}

func (kernel *TokidKernel) runtime(profileID string) (*profileRuntime, error) {
	runtime := kernel.Runtimes[profileID]
	if runtime == nil {
		return nil, fmt.Errorf("unsupported tokid profile %q", profileID)
	}
	return runtime, nil
}

func (kernel *TokidKernel) ListProfiles() []TokidProfileManifest {
	profiles := make([]TokidProfileManifest, 0, len(kernel.Runtimes))
	for _, runtime := range kernel.Runtimes {
		profiles = append(profiles, runtime.Manifest)
	}
	slices.SortFunc(profiles, func(left, right TokidProfileManifest) int {
		return strings.Compare(left.ProfileID, right.ProfileID)
	})
	return profiles
}

func (kernel *TokidKernel) GetProfile(profileID string) TokidProfileManifest {
	runtime, err := kernel.runtime(profileID)
	if err != nil {
		panic(err)
	}
	return runtime.Manifest
}

func defaultRandomBytes(length int) ([]byte, error) {
	bytes := make([]byte, length)
	_, err := rand.Read(bytes)
	return bytes, err
}

func (kernel *TokidKernel) GenerateTokid(profileID string, length int, randomBytes RandomBytesFn) (Tokid, error) {
	if profileID == "" {
		profileID = kernel.DefaultProfileID
	}
	runtime, err := kernel.runtime(profileID)
	if err != nil {
		return Tokid{}, err
	}
	if length == 0 {
		length = runtime.Manifest.Entropy.RecommendedLength
	}
	if length <= 0 {
		return Tokid{}, errors.New("Tokid length must be a positive integer")
	}
	if randomBytes == nil {
		randomBytes = defaultRandomBytes
	}

	atoms := make([]string, 0, length)
	for index := 0; index < length; index++ {
		pick, err := pickUniformIndex(len(runtime.Manifest.Vocabulary.Atoms), randomBytes)
		if err != nil {
			return Tokid{}, err
		}
		atoms = append(atoms, runtime.Manifest.Vocabulary.Atoms[pick])
	}

	return Tokid{ProfileID: profileID, Atoms: atoms}, nil
}

func pickUniformIndex(maxExclusive int, randomBytes RandomBytesFn) (int, error) {
	if maxExclusive <= 0 {
		return 0, errors.New("Vocabulary size must be a positive integer")
	}
	bound := uint64(1) << 32
	threshold := bound - (bound % uint64(maxExclusive))

	for {
		raw, err := randomBytes(4)
		if err != nil {
			return 0, err
		}
		if len(raw) < 4 {
			return 0, errors.New("randomBytes must return the requested number of bytes")
		}
		candidate := uint64(raw[0])<<24 | uint64(raw[1])<<16 | uint64(raw[2])<<8 | uint64(raw[3])
		if candidate < threshold {
			return int(candidate % uint64(maxExclusive)), nil
		}
	}
}

func (kernel *TokidKernel) renderPayload(tokid Tokid, runtime *profileRuntime, codecID string) (string, error) {
	if tokid.ProfileID != runtime.Manifest.ProfileID {
		return "", fmt.Errorf(
			"Tokid profile mismatch: record uses %q but runtime is %q",
			tokid.ProfileID,
			runtime.Manifest.ProfileID,
		)
	}
	codec, ok := runtime.PayloadCodecs[codecID]
	if !ok {
		return "", fmt.Errorf("unsupported payload codec %q for profile %q", codecID, runtime.Manifest.ProfileID)
	}
	for _, atom := range tokid.Atoms {
		if _, ok := runtime.AtomSet[atom]; !ok || !runtime.Syntax.MatchString(atom) {
			return "", fmt.Errorf("Tokid contains atom %q outside profile %q", atom, runtime.Manifest.ProfileID)
		}
	}
	return strings.Join(tokid.Atoms, codec.Separator), nil
}

func (kernel *TokidKernel) RenderTokid(tokid Tokid, codecID string) (string, error) {
	if codecID == "" {
		codecID = "transport"
	}
	runtime, err := kernel.runtime(tokid.ProfileID)
	if err != nil {
		return "", err
	}
	if _, ok := runtime.PayloadCodecs[codecID]; ok {
		return kernel.renderPayload(tokid, runtime, codecID)
	}
	codec, ok := runtime.EnvelopeCodecs[codecID]
	if !ok {
		return "", fmt.Errorf("unsupported codec %q for profile %q", codecID, runtime.Manifest.ProfileID)
	}
	payload, err := kernel.renderPayload(tokid, runtime, codec.PayloadCodecID)
	if err != nil {
		return "", err
	}
	checksum := computeChecksum(codec, runtime.Manifest.ProfileTag, payload)
	return strings.Join([]string{codec.Prefix, runtime.Manifest.ProfileTag, payload, checksum}, codec.Separator), nil
}

func computeChecksum(codec TokidCodecManifest, profileTag string, payload string) string {
	digest := sha256.Sum256([]byte(fmt.Sprintf("%s|%d|%s|%s", codec.Prefix, codec.FormatVersion, profileTag, payload)))
	encoded := encodeBase36(digest[:6])
	if len(encoded) < codec.Checksum.Length {
		encoded = strings.Repeat("0", codec.Checksum.Length-len(encoded)) + encoded
	}
	return encoded[:codec.Checksum.Length]
}

func encodeBase36(bytes []byte) string {
	value := big.NewInt(0)
	for _, b := range bytes {
		value.Lsh(value, 8)
		value.Add(value, big.NewInt(int64(b)))
	}
	return strings.ToLower(value.Text(36))
}

func normalizePromptAtoms(value string, separator string, normalization string) []string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	if normalization == "whitespace" && separator == " " {
		return strings.Fields(trimmed)
	}
	parts := strings.Split(trimmed, separator)
	for _, part := range parts {
		if part == "" {
			return nil
		}
	}
	return parts
}

func parseDelimiterlessPayload(value string, trie *trieNode) []string {
	if value == "" {
		return nil
	}
	atoms := []string{}
	runes := []rune(value)
	index := 0
	for index < len(runes) {
		node := trie
		cursor := index
		matchedAtom := ""
		for cursor < len(runes) {
			next := node.Children[runes[cursor]]
			if next == nil {
				break
			}
			node = next
			cursor++
			if node.Atom != "" {
				matchedAtom = node.Atom
				break
			}
		}
		if matchedAtom == "" {
			return nil
		}
		atoms = append(atoms, matchedAtom)
		index += len([]rune(matchedAtom))
	}
	return atoms
}

func (kernel *TokidKernel) parsePayload(value string, runtime *profileRuntime, codecID string) *Tokid {
	codec := runtime.PayloadCodecs[codecID]
	var atoms []string
	if codec.Decodability.Mode == "prefix-free" {
		atoms = parseDelimiterlessPayload(value, runtime.DelimiterlessTrie[codecID])
	} else {
		atoms = normalizePromptAtoms(value, codec.Separator, codec.Normalization)
	}
	if len(atoms) == 0 {
		return nil
	}
	for _, atom := range atoms {
		if _, ok := runtime.AtomSet[atom]; !ok {
			return nil
		}
	}
	return &Tokid{ProfileID: runtime.Manifest.ProfileID, Atoms: atoms}
}

func checksumRegexp(length int) *regexp.Regexp {
	if pattern, ok := checksumDigitsCache[length]; ok {
		return pattern
	}
	pattern := regexp.MustCompile(fmt.Sprintf("^[0-9a-z]{%d}$", length))
	checksumDigitsCache[length] = pattern
	return pattern
}

func (kernel *TokidKernel) parseEnvelope(value string, requestedProfileID string, requestedCodecID string) *Tokid {
	for _, runtime := range kernel.Runtimes {
		if requestedProfileID != "" && runtime.Manifest.ProfileID != requestedProfileID {
			continue
		}
		for _, codec := range runtime.EnvelopeCodecs {
			if requestedCodecID != "" && codec.ID != requestedCodecID {
				continue
			}
			parts := strings.Split(value, codec.Separator)
			if len(parts) != 4 {
				continue
			}
			prefix, profileTag, payload, checksum := parts[0], parts[1], parts[2], parts[3]
			if prefix != codec.Prefix || profileTag != runtime.Manifest.ProfileTag || payload == "" {
				continue
			}
			if !checksumRegexp(codec.Checksum.Length).MatchString(checksum) {
				continue
			}
			if computeChecksum(codec, profileTag, payload) != checksum {
				return nil
			}
			return kernel.parsePayload(payload, runtime, codec.PayloadCodecID)
		}
	}
	return nil
}

func (kernel *TokidKernel) ParseWithCodec(value string, profileID string, codecID string) *Tokid {
	if codecID == "" || codecID == "auto" {
		if envelope := kernel.parseEnvelope(value, profileID, ""); envelope != nil {
			return envelope
		}
		runtime, err := kernel.runtime(defaultIfEmpty(profileID, kernel.DefaultProfileID))
		if err != nil {
			return nil
		}
		payloadCodecID := "transport"
		if strings.IndexFunc(value, func(r rune) bool { return r == ' ' || r == '\t' || r == '\n' || r == '\r' }) >= 0 {
			payloadCodecID = "prompt"
		}
		return kernel.parsePayload(value, runtime, payloadCodecID)
	}

	if profileID != "" {
		runtime, err := kernel.runtime(profileID)
		if err != nil {
			return nil
		}
		if _, ok := runtime.EnvelopeCodecs[codecID]; ok {
			return kernel.parseEnvelope(value, profileID, codecID)
		}
		return kernel.parsePayload(value, runtime, codecID)
	}

	for _, runtime := range kernel.Runtimes {
		if _, ok := runtime.EnvelopeCodecs[codecID]; ok {
			if parsed := kernel.parseEnvelope(value, runtime.Manifest.ProfileID, codecID); parsed != nil {
				return parsed
			}
			continue
		}
		if parsed := kernel.parsePayload(value, runtime, codecID); parsed != nil {
			return parsed
		}
	}
	return nil
}

func (kernel *TokidKernel) ValidateTokid(value string, profileID string) bool {
	return kernel.ParseWithCodec(value, profileID, "") != nil
}

func defaultIfEmpty(value string, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func CreateFactory(profileID string, length int, randomBytes RandomBytesFn) *TokidFactory {
	if profileID == "" {
		profileID = DefaultProfileID
	}
	if length == 0 {
		length = defaultKernel.GetProfile(profileID).Entropy.RecommendedLength
	}
	return &TokidFactory{ProfileID: profileID, Length: length, RandomBytes: randomBytes}
}

func (factory *TokidFactory) Generate(length int, format string) (string, error) {
	if length == 0 {
		length = factory.Length
	}
	if format == "" {
		format = "envelope"
	}
	logical, err := defaultKernel.GenerateTokid(factory.ProfileID, length, factory.RandomBytes)
	if err != nil {
		return "", err
	}
	return defaultKernel.RenderTokid(logical, format)
}

func (factory *TokidFactory) Parse(value string) *Tokid {
	return defaultKernel.ParseWithCodec(value, factory.ProfileID, "")
}

func (factory *TokidFactory) IsTokid(value string) bool {
	return defaultKernel.ValidateTokid(value, factory.ProfileID)
}

func (factory *TokidFactory) Prompt(value any) (string, error) {
	return ToPrompt(value, factory.ProfileID)
}

func (factory *TokidFactory) Transport(value any) (string, error) {
	return ToTransport(value, factory.ProfileID)
}

func (factory *TokidFactory) Envelope(value any) (string, error) {
	return ToEnvelope(value, factory.ProfileID)
}

func (factory *TokidFactory) Profile() TokidProfileManifest {
	return defaultKernel.GetProfile(factory.ProfileID)
}

func resolveTokid(value any, profileID string) (Tokid, error) {
	switch typed := value.(type) {
	case Tokid:
		return typed, nil
	case *Tokid:
		return *typed, nil
	case string:
		parsed := defaultKernel.ParseWithCodec(typed, profileID, "")
		if parsed == nil {
			return Tokid{}, errors.New("invalid tokid value")
		}
		return *parsed, nil
	default:
		return Tokid{}, errors.New("unsupported tokid input")
	}
}

func Generate(profileID string, length int, format string, randomBytes RandomBytesFn) (string, error) {
	return CreateFactory(profileID, length, randomBytes).Generate(length, format)
}

func Parse(value string, profileID string) *Tokid {
	return defaultKernel.ParseWithCodec(value, profileID, "")
}

func ParseWithCodecForConformance(value string, profileID string, codecID string) *Tokid {
	return defaultKernel.ParseWithCodec(value, profileID, codecID)
}

func IsTokid(value string, profileID string) bool {
	return defaultKernel.ValidateTokid(value, profileID)
}

func ToPrompt(value any, profileID string) (string, error) {
	logical, err := resolveTokid(value, profileID)
	if err != nil {
		return "", err
	}
	return defaultKernel.RenderTokid(logical, "prompt")
}

func ToTransport(value any, profileID string) (string, error) {
	logical, err := resolveTokid(value, profileID)
	if err != nil {
		return "", err
	}
	return defaultKernel.RenderTokid(logical, "transport")
}

func ToEnvelope(value any, profileID string) (string, error) {
	logical, err := resolveTokid(value, profileID)
	if err != nil {
		return "", err
	}
	return defaultKernel.RenderTokid(logical, "envelope")
}

func ListProfiles() []TokidProfileManifest {
	return defaultKernel.ListProfiles()
}

func GetProfile(profileID string) TokidProfileManifest {
	if profileID == "" {
		profileID = DefaultProfileID
	}
	return defaultKernel.GetProfile(profileID)
}

func DecodeRandomHex(raw string) (RandomBytesFn, error) {
	bytes, err := hex.DecodeString(raw)
	if err != nil {
		return nil, err
	}
	offset := 0
	return func(length int) ([]byte, error) {
		end := offset + length
		if end > len(bytes) {
			end = len(bytes)
		}
		chunk := bytes[offset:end]
		offset = end
		return chunk, nil
	}, nil
}
