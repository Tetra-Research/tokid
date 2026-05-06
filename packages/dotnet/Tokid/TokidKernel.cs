using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Tokid
{
    internal delegate byte[] TokidRandomBytes(int length);

    internal sealed class TokidKernel
    {
        private static readonly Regex ProfileIdPattern = new Regex("^[a-z0-9-]+$", RegexOptions.Compiled);
        private static readonly Regex ProfileTagPattern = new Regex("^[a-z0-9]+$", RegexOptions.Compiled);
        private static readonly Regex HashPattern = new Regex("^[0-9a-f]{64}$", RegexOptions.Compiled);
        internal static readonly TokidKernel Default = new TokidKernel(GeneratedProfiles.EmbeddedProfiles, GeneratedProfiles.DefaultProfileId);

        private readonly Dictionary<string, ProfileRuntime> _runtimes;

        internal TokidKernel(IReadOnlyList<TokidProfileManifest> profiles, string defaultProfileId)
        {
            if (profiles.Count == 0)
            {
                throw new ArgumentException("TokidKernel requires at least one profile");
            }

            _runtimes = new Dictionary<string, ProfileRuntime>();
            foreach (var profile in profiles)
            {
                var runtime = BuildRuntime(profile);
                if (_runtimes.ContainsKey(profile.ProfileId))
                {
                    throw new ArgumentException("Duplicate profile id in kernel: \"" + profile.ProfileId + "\"");
                }
                _runtimes[profile.ProfileId] = runtime;
            }

            DefaultProfileId = string.IsNullOrEmpty(defaultProfileId) ? profiles[0].ProfileId : defaultProfileId;
            if (!_runtimes.ContainsKey(DefaultProfileId))
            {
                throw new ArgumentException("Unknown default profile \"" + DefaultProfileId + "\"");
            }
        }

        internal string DefaultProfileId { get; }

        internal static void ValidateProfileManifest(TokidProfileManifest manifest)
        {
            if (!ProfileIdPattern.IsMatch(manifest.ProfileId))
            {
                throw new ArgumentException("Invalid profile id \"" + manifest.ProfileId + "\". Profile ids must be lowercase ASCII slugs.");
            }
            if (!ProfileTagPattern.IsMatch(manifest.ProfileTag))
            {
                throw new ArgumentException("Invalid profile tag \"" + manifest.ProfileTag + "\". Profile tags must be lowercase base36-safe text.");
            }
            if (manifest.ProfileVersion <= 0)
            {
                throw new ArgumentException("Invalid profile version for \"" + manifest.ProfileId + "\"");
            }
            if (manifest.Vocabulary.Atoms.Count == 0)
            {
                throw new ArgumentException("Profile \"" + manifest.ProfileId + "\" must contain at least one atom");
            }
            if (string.IsNullOrEmpty(manifest.SourceLineage.Recipe))
            {
                throw new ArgumentException("Profile \"" + manifest.ProfileId + "\" must declare a source recipe");
            }
            if (manifest.SourceLineage.Artifacts.Count == 0)
            {
                throw new ArgumentException("Profile \"" + manifest.ProfileId + "\" must declare at least one source artifact");
            }

            var syntax = new Regex(manifest.Vocabulary.Syntax, RegexOptions.Compiled);
            var atomSet = new HashSet<string>();
            var payloadCodecIds = new HashSet<string>();
            var requiresPrefixFree = false;

            foreach (var artifact in manifest.SourceLineage.Artifacts)
            {
                if (string.IsNullOrEmpty(artifact.Path))
                {
                    throw new ArgumentException("Profile \"" + manifest.ProfileId + "\" contains an empty source artifact path");
                }
                if (!HashPattern.IsMatch(artifact.Sha256))
                {
                    throw new ArgumentException(
                        "Profile \"" + manifest.ProfileId + "\" contains invalid source artifact digest for \"" + artifact.Path + "\"");
                }
            }

            foreach (var atom in manifest.Vocabulary.Atoms)
            {
                if (!atomSet.Add(atom))
                {
                    throw new ArgumentException("Duplicate atom in profile \"" + manifest.ProfileId + "\": \"" + atom + "\"");
                }
                if (!syntax.IsMatch(atom))
                {
                    throw new ArgumentException("Atom \"" + atom + "\" violates syntax constraints for profile \"" + manifest.ProfileId + "\"");
                }
            }

            var codecIds = new HashSet<string>();
            foreach (var codec in manifest.Codecs)
            {
                if (!ProfileIdPattern.IsMatch(codec.Id))
                {
                    throw new ArgumentException("Invalid codec id \"" + codec.Id + "\" in profile \"" + manifest.ProfileId + "\"");
                }
                if (!codecIds.Add(codec.Id))
                {
                    throw new ArgumentException("Duplicate codec id \"" + codec.Id + "\" in profile \"" + manifest.ProfileId + "\"");
                }

                var payloadCodec = codec as TokidPayloadCodecManifest;
                if (payloadCodec != null)
                {
                    if (payloadCodec.DecodabilityMode == TokidDecodabilityMode.PrefixFree)
                    {
                        if (!string.IsNullOrEmpty(payloadCodec.Separator))
                        {
                            throw new ArgumentException(
                                "Profile \"" + manifest.ProfileId + "\" declares prefix-free decoding for codec \"" + codec.Id + "\" but also sets a separator");
                        }
                        requiresPrefixFree = true;
                    }
                    else if (string.IsNullOrEmpty(payloadCodec.Separator))
                    {
                        throw new ArgumentException(
                            "Profile \"" + manifest.ProfileId + "\" declares separator decoding for codec \"" + codec.Id + "\" but does not define a separator");
                    }
                    payloadCodecIds.Add(payloadCodec.Id);
                    continue;
                }

                var envelopeCodec = (TokidEnvelopeCodecManifest)codec;
                if (!ProfileTagPattern.IsMatch(envelopeCodec.Prefix))
                {
                    throw new ArgumentException("Invalid envelope prefix \"" + envelopeCodec.Prefix + "\" in profile \"" + manifest.ProfileId + "\"");
                }
                if (string.IsNullOrEmpty(envelopeCodec.Separator))
                {
                    throw new ArgumentException("Envelope codec \"" + envelopeCodec.Id + "\" in profile \"" + manifest.ProfileId + "\" must use a separator");
                }
                if (envelopeCodec.Checksum.Algorithm != "sha256-base36")
                {
                    throw new ArgumentException(
                        "Unsupported checksum algorithm \"" + envelopeCodec.Checksum.Algorithm + "\" in profile \"" + manifest.ProfileId + "\"");
                }
            }

            foreach (var envelopeCodec in manifest.Codecs.OfType<TokidEnvelopeCodecManifest>())
            {
                if (!payloadCodecIds.Contains(envelopeCodec.PayloadCodecId))
                {
                    throw new ArgumentException(
                        "Envelope codec \"" + envelopeCodec.Id + "\" in profile \"" + manifest.ProfileId + "\" references missing payload codec \"" + envelopeCodec.PayloadCodecId + "\"");
                }
            }

            if (requiresPrefixFree)
            {
                BuildTrie(manifest.Vocabulary.Atoms);
            }
        }

        internal TokidProfileManifest Profile(string profileId)
        {
            return Runtime(profileId).Manifest;
        }

        internal IReadOnlyList<string> ListProfileIds()
        {
            return _runtimes.Keys.ToList().AsReadOnly();
        }

        internal Tokid GenerateTokid(string profileId, int length, TokidRandomBytes randomBytes)
        {
            var runtime = Runtime(profileId ?? DefaultProfileId);
            var actualLength = length <= 0 ? runtime.Manifest.Entropy.RecommendedLength : length;
            var reader = randomBytes ?? DefaultRandomBytes;
            var atoms = new List<string>(actualLength);
            for (var index = 0; index < actualLength; index += 1)
            {
                atoms.Add(runtime.Manifest.Vocabulary.Atoms[PickUniformIndex(runtime.Manifest.Vocabulary.Atoms.Count, reader)]);
            }
            return new Tokid(runtime.Manifest.ProfileId, atoms);
        }

        internal string RenderTokid(Tokid tokid, string codecId)
        {
            var runtime = Runtime(tokid.ProfileId);
            var actualCodecId = codecId ?? "transport";
            TokidPayloadCodecManifest payloadCodec;
            if (runtime.PayloadCodecs.TryGetValue(actualCodecId, out payloadCodec))
            {
                return RenderPayload(tokid, runtime, payloadCodec);
            }

            TokidEnvelopeCodecManifest envelopeCodec;
            if (!runtime.EnvelopeCodecs.TryGetValue(actualCodecId, out envelopeCodec))
            {
                throw new ArgumentException("Unsupported codec \"" + actualCodecId + "\" for profile \"" + tokid.ProfileId + "\"");
            }

            var payload = RenderPayload(tokid, runtime, runtime.PayloadCodecs[envelopeCodec.PayloadCodecId]);
            var checksum = ComputeChecksum(envelopeCodec, runtime.Manifest.ProfileTag, payload);
            return string.Join(envelopeCodec.Separator, new[] { envelopeCodec.Prefix, runtime.Manifest.ProfileTag, payload, checksum });
        }

        internal Tokid ParseWithCodec(string value, string profileId, string codecId)
        {
            var actualCodecId = codecId ?? "auto";
            if (actualCodecId == "auto")
            {
                var envelope = ParseEnvelope(value, profileId, null);
                if (envelope != null)
                {
                    return envelope;
                }

                var runtime = Runtime(profileId ?? DefaultProfileId);
                var payloadCodecId = value.Any(char.IsWhiteSpace) ? "prompt" : "transport";
                return ParsePayload(value, runtime, runtime.PayloadCodecs[payloadCodecId]);
            }

            if (profileId != null)
            {
                var runtime = Runtime(profileId);
                return runtime.EnvelopeCodecs.ContainsKey(actualCodecId)
                    ? ParseEnvelope(value, profileId, actualCodecId)
                    : ParsePayload(value, runtime, runtime.PayloadCodecs[actualCodecId]);
            }

            foreach (var runtime in _runtimes.Values)
            {
                var parsed = runtime.EnvelopeCodecs.ContainsKey(actualCodecId)
                    ? ParseEnvelope(value, runtime.Manifest.ProfileId, actualCodecId)
                    : ParsePayload(value, runtime, runtime.PayloadCodecs[actualCodecId]);
                if (parsed != null)
                {
                    return parsed;
                }
            }
            return null;
        }

        internal bool ValidateTokid(string value, string profileId)
        {
            return ParseWithCodec(value, profileId, null) != null;
        }

        private ProfileRuntime Runtime(string profileId)
        {
            ProfileRuntime runtime;
            if (!_runtimes.TryGetValue(profileId, out runtime))
            {
                throw new ArgumentException("Unsupported tokid profile \"" + profileId + "\"");
            }
            return runtime;
        }

        private static ProfileRuntime BuildRuntime(TokidProfileManifest manifest)
        {
            ValidateProfileManifest(manifest);

            var payloadCodecs = manifest.Codecs.OfType<TokidPayloadCodecManifest>().ToDictionary(codec => codec.Id, codec => codec);
            var envelopeCodecs = manifest.Codecs.OfType<TokidEnvelopeCodecManifest>().ToDictionary(codec => codec.Id, codec => codec);
            var tries = new Dictionary<string, TrieNode>();
            foreach (var payloadCodec in payloadCodecs.Values)
            {
                if (payloadCodec.DecodabilityMode == TokidDecodabilityMode.PrefixFree && payloadCodec.Separator == string.Empty)
                {
                    tries[payloadCodec.Id] = BuildTrie(manifest.Vocabulary.Atoms);
                }
            }

            return new ProfileRuntime(
                manifest,
                new Regex(manifest.Vocabulary.Syntax, RegexOptions.Compiled),
                new HashSet<string>(manifest.Vocabulary.Atoms),
                payloadCodecs,
                envelopeCodecs,
                tries);
        }

        private static string RenderPayload(Tokid tokid, ProfileRuntime runtime, TokidPayloadCodecManifest codec)
        {
            if (tokid.ProfileId != runtime.Manifest.ProfileId)
            {
                throw new ArgumentException(
                    "Tokid profile mismatch: record uses \"" + tokid.ProfileId + "\" but runtime is \"" + runtime.Manifest.ProfileId + "\"");
            }

            foreach (var atom in tokid.Atoms)
            {
                if (!runtime.AtomSet.Contains(atom) || !runtime.Syntax.IsMatch(atom))
                {
                    throw new ArgumentException(
                        "Tokid contains atom \"" + atom + "\" outside profile \"" + runtime.Manifest.ProfileId + "\"");
                }
            }

            return string.Join(codec.Separator, tokid.Atoms);
        }

        private static Tokid ParsePayload(string value, ProfileRuntime runtime, TokidPayloadCodecManifest codec)
        {
            List<string> atoms = codec.DecodabilityMode == TokidDecodabilityMode.PrefixFree
                ? ParseDelimiterlessPayload(value, runtime.DelimiterlessTries[codec.Id])
                : NormalizePromptAtoms(value, codec.Separator, codec.Normalization);
            if (atoms == null || atoms.Count == 0 || atoms.Any(atom => !runtime.AtomSet.Contains(atom)))
            {
                return null;
            }
            return new Tokid(runtime.Manifest.ProfileId, atoms);
        }

        private Tokid ParseEnvelope(string value, string requestedProfileId, string requestedCodecId)
        {
            foreach (var runtime in _runtimes.Values)
            {
                if (requestedProfileId != null && runtime.Manifest.ProfileId != requestedProfileId)
                {
                    continue;
                }

                foreach (var codec in runtime.EnvelopeCodecs.Values)
                {
                    if (requestedCodecId != null && codec.Id != requestedCodecId)
                    {
                        continue;
                    }

                    var parts = value.Split(new[] { codec.Separator }, StringSplitOptions.None);
                    if (parts.Length != 4)
                    {
                        continue;
                    }
                    if (parts[0] != codec.Prefix || parts[1] != runtime.Manifest.ProfileTag || string.IsNullOrEmpty(parts[2]))
                    {
                        continue;
                    }
                    if (!Regex.IsMatch(parts[3], "^[0-9a-z]{" + codec.Checksum.Length + "}$"))
                    {
                        continue;
                    }
                    if (ComputeChecksum(codec, parts[1], parts[2]) != parts[3])
                    {
                        return null;
                    }
                    return ParsePayload(parts[2], runtime, runtime.PayloadCodecs[codec.PayloadCodecId]);
                }
            }
            return null;
        }

        private static List<string> NormalizePromptAtoms(string value, string separator, TokidPayloadNormalization normalization)
        {
            var trimmed = value.Trim();
            if (trimmed.Length == 0)
            {
                return null;
            }

            var atoms = normalization == TokidPayloadNormalization.Whitespace && separator == " "
                ? trimmed.Split((char[])null, StringSplitOptions.RemoveEmptyEntries).ToList()
                : trimmed.Split(new[] { separator }, StringSplitOptions.None).ToList();

            return atoms.Any(atom => atom.Length == 0) ? null : atoms;
        }

        private static TrieNode BuildTrie(IReadOnlyList<string> atoms)
        {
            var root = new TrieNode();
            foreach (var atom in atoms)
            {
                var node = root;
                for (var index = 0; index < atom.Length; index += 1)
                {
                    if (node.Atom != null)
                    {
                        throw new ArgumentException("Vocabulary is not prefix-free: \"" + node.Atom + "\" is a prefix of \"" + atom + "\"");
                    }

                    TrieNode next;
                    if (!node.Children.TryGetValue(atom[index], out next))
                    {
                        next = new TrieNode();
                        node.Children[atom[index]] = next;
                    }
                    node = next;
                }

                if (node.Atom != null)
                {
                    throw new ArgumentException("Duplicate atom in vocabulary: \"" + atom + "\"");
                }
                if (node.Children.Count > 0)
                {
                    throw new ArgumentException("Vocabulary is not prefix-free: \"" + atom + "\" is a prefix of another atom");
                }
                node.Atom = atom;
            }

            return root;
        }

        private static List<string> ParseDelimiterlessPayload(string value, TrieNode trie)
        {
            if (string.IsNullOrEmpty(value))
            {
                return null;
            }

            var atoms = new List<string>();
            var index = 0;
            while (index < value.Length)
            {
                var node = trie;
                var cursor = index;
                string matchedAtom = null;
                while (cursor < value.Length)
                {
                    TrieNode next;
                    if (!node.Children.TryGetValue(value[cursor], out next))
                    {
                        break;
                    }
                    node = next;
                    cursor += 1;
                    if (node.Atom != null)
                    {
                        matchedAtom = node.Atom;
                        break;
                    }
                }
                if (matchedAtom == null)
                {
                    return null;
                }
                atoms.Add(matchedAtom);
                index += matchedAtom.Length;
            }
            return atoms;
        }

        private static int PickUniformIndex(int maxExclusive, TokidRandomBytes randomBytes)
        {
            var bound = 1L << 32;
            var threshold = bound - (bound % maxExclusive);
            while (true)
            {
                var bytes = randomBytes(4);
                if (bytes.Length < 4)
                {
                    throw new ArgumentException("randomBytes must return the requested number of bytes");
                }
                var candidate =
                    ((bytes[0] & 0xffL) << 24)
                    | ((bytes[1] & 0xffL) << 16)
                    | ((bytes[2] & 0xffL) << 8)
                    | (bytes[3] & 0xffL);
                if (candidate < threshold)
                {
                    return (int)(candidate % maxExclusive);
                }
            }
        }

        private static string ComputeChecksum(TokidEnvelopeCodecManifest codec, string profileTag, string payload)
        {
            using (var sha = SHA256.Create())
            {
                var raw = sha.ComputeHash(Encoding.UTF8.GetBytes(codec.Prefix + "|" + codec.FormatVersion + "|" + profileTag + "|" + payload));
                var truncated = new byte[7];
                Array.Copy(raw, 0, truncated, 1, 6);
                var encoded = EncodeBase36(new BigInteger(truncated.Reverse().ToArray()));
                if (encoded.Length < codec.Checksum.Length)
                {
                    encoded = new string('0', codec.Checksum.Length - encoded.Length) + encoded;
                }
                return encoded.Substring(0, codec.Checksum.Length);
            }
        }

        private static string EncodeBase36(BigInteger value)
        {
            const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
            if (value.Sign == 0)
            {
                return "0";
            }

            var builder = new StringBuilder();
            while (value > 0)
            {
                BigInteger remainder;
                value = BigInteger.DivRem(value, 36, out remainder);
                builder.Insert(0, digits[(int)remainder]);
            }
            return builder.ToString();
        }

        private static byte[] DefaultRandomBytes(int length)
        {
            var bytes = new byte[length];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(bytes);
            }
            return bytes;
        }
    }

    internal enum TokidPayloadNormalization
    {
        Literal,
        Whitespace
    }

    internal enum TokidDecodabilityMode
    {
        Separator,
        PrefixFree
    }

    internal abstract class TokidCodecManifest
    {
        protected TokidCodecManifest(string id, string description)
        {
            Id = id;
            Description = description;
        }

        public string Id { get; }
        public string Description { get; }
    }

    internal sealed class TokidPayloadCodecManifest : TokidCodecManifest
    {
        public TokidPayloadCodecManifest(string id, string description, string separator, TokidPayloadNormalization normalization, bool transportSafe, TokidDecodabilityMode decodabilityMode)
            : base(id, description)
        {
            Separator = separator;
            Normalization = normalization;
            TransportSafe = transportSafe;
            DecodabilityMode = decodabilityMode;
        }

        public string Separator { get; }
        public TokidPayloadNormalization Normalization { get; }
        public bool TransportSafe { get; }
        public TokidDecodabilityMode DecodabilityMode { get; }
    }

    internal sealed class TokidEnvelopeChecksumManifest
    {
        public TokidEnvelopeChecksumManifest(string algorithm, int length)
        {
            Algorithm = algorithm;
            Length = length;
        }

        public string Algorithm { get; }
        public int Length { get; }
    }

    internal sealed class TokidEnvelopeCodecManifest : TokidCodecManifest
    {
        public TokidEnvelopeCodecManifest(string id, string description, string payloadCodecId, string prefix, string separator, int formatVersion, TokidEnvelopeChecksumManifest checksum)
            : base(id, description)
        {
            PayloadCodecId = payloadCodecId;
            Prefix = prefix;
            Separator = separator;
            FormatVersion = formatVersion;
            Checksum = checksum;
        }

        public string PayloadCodecId { get; }
        public string Prefix { get; }
        public string Separator { get; }
        public int FormatVersion { get; }
        public TokidEnvelopeChecksumManifest Checksum { get; }
    }

    internal sealed class TokidProfileVocabularyManifest
    {
        public TokidProfileVocabularyManifest(string syntax, IEnumerable<string> atoms)
        {
            Syntax = syntax;
            Atoms = atoms.ToList().AsReadOnly();
        }

        public string Syntax { get; }
        public IReadOnlyList<string> Atoms { get; }
    }

    internal sealed class TokidSourceArtifactLineage
    {
        public TokidSourceArtifactLineage(string path, string sha256)
        {
            Path = path;
            Sha256 = sha256;
        }

        public string Path { get; }
        public string Sha256 { get; }
    }

    internal sealed class TokidSourceLineage
    {
        public TokidSourceLineage(string recipe, IEnumerable<string> studies, IEnumerable<TokidSourceArtifactLineage> artifacts, IEnumerable<string> filters, IEnumerable<string> notes)
        {
            Recipe = recipe;
            Studies = studies.ToList().AsReadOnly();
            Artifacts = artifacts.ToList().AsReadOnly();
            Filters = filters.ToList().AsReadOnly();
            Notes = notes.ToList().AsReadOnly();
        }

        public string Recipe { get; }
        public IReadOnlyList<string> Studies { get; }
        public IReadOnlyList<TokidSourceArtifactLineage> Artifacts { get; }
        public IReadOnlyList<string> Filters { get; }
        public IReadOnlyList<string> Notes { get; }
    }

    internal sealed class TokidEntropyMetadata
    {
        public TokidEntropyMetadata(int atomCount, double bitsPerAtom, int recommendedLength, double bitsAtRecommendedLength)
        {
            AtomCount = atomCount;
            BitsPerAtom = bitsPerAtom;
            RecommendedLength = recommendedLength;
            BitsAtRecommendedLength = bitsAtRecommendedLength;
        }

        public int AtomCount { get; }
        public double BitsPerAtom { get; }
        public int RecommendedLength { get; }
        public double BitsAtRecommendedLength { get; }
    }

    internal sealed class TokidProfileManifest
    {
        public TokidProfileManifest(string profileId, int profileVersion, string profileTag, string name, string description, string provider, TokidProfileVocabularyManifest vocabulary, IEnumerable<TokidCodecManifest> codecs, TokidEntropyMetadata entropy, TokidSourceLineage sourceLineage)
        {
            ProfileId = profileId;
            ProfileVersion = profileVersion;
            ProfileTag = profileTag;
            Name = name;
            Description = description;
            Provider = provider;
            Vocabulary = vocabulary;
            Codecs = codecs.ToList().AsReadOnly();
            Entropy = entropy;
            SourceLineage = sourceLineage;
        }

        public string ProfileId { get; }
        public int ProfileVersion { get; }
        public string ProfileTag { get; }
        public string Name { get; }
        public string Description { get; }
        public string Provider { get; }
        public TokidProfileVocabularyManifest Vocabulary { get; }
        public IReadOnlyList<TokidCodecManifest> Codecs { get; }
        public TokidEntropyMetadata Entropy { get; }
        public TokidSourceLineage SourceLineage { get; }
    }

    internal sealed class ProfileRuntime
    {
        public ProfileRuntime(
            TokidProfileManifest manifest,
            Regex syntax,
            HashSet<string> atomSet,
            Dictionary<string, TokidPayloadCodecManifest> payloadCodecs,
            Dictionary<string, TokidEnvelopeCodecManifest> envelopeCodecs,
            Dictionary<string, TrieNode> delimiterlessTries)
        {
            Manifest = manifest;
            Syntax = syntax;
            AtomSet = atomSet;
            PayloadCodecs = payloadCodecs;
            EnvelopeCodecs = envelopeCodecs;
            DelimiterlessTries = delimiterlessTries;
        }

        public TokidProfileManifest Manifest { get; }
        public Regex Syntax { get; }
        public HashSet<string> AtomSet { get; }
        public Dictionary<string, TokidPayloadCodecManifest> PayloadCodecs { get; }
        public Dictionary<string, TokidEnvelopeCodecManifest> EnvelopeCodecs { get; }
        public Dictionary<string, TrieNode> DelimiterlessTries { get; }
    }

    internal sealed class TrieNode
    {
        public string Atom { get; set; }
        public Dictionary<char, TrieNode> Children { get; } = new Dictionary<char, TrieNode>();
    }
}
