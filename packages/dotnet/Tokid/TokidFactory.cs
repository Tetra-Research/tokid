using System;

namespace Tokid
{
    public sealed class TokidFactory
    {
        private readonly TokidRandomBytes _randomBytes;

        public string ProfileId { get; }
        public int Length { get; }

        public TokidFactory(string profileId = null, int? length = null)
            : this(profileId, length, null)
        {
        }

        internal TokidFactory(string profileId, int? length, TokidRandomBytes randomBytes)
        {
            ProfileId = profileId ?? TokidKernel.Default.DefaultProfileId;
            Length = length ?? TokidKernel.Default.Profile(ProfileId).Entropy.RecommendedLength;
            _randomBytes = randomBytes;
        }

        public string Generate(int? length = null, string format = "envelope")
        {
            var logical = TokidKernel.Default.GenerateTokid(ProfileId, length ?? Length, _randomBytes);
            return TokidKernel.Default.RenderTokid(logical, format);
        }

        public Tokid Parse(string value)
        {
            return TokidKernel.Default.ParseWithCodec(value, ProfileId, null);
        }

        public bool IsTokid(string value)
        {
            return TokidKernel.Default.ValidateTokid(value, ProfileId);
        }

        public string Prompt(object value)
        {
            return TokidSdk.ToPrompt(value, ProfileId);
        }

        public string Transport(object value)
        {
            return TokidSdk.ToTransport(value, ProfileId);
        }

        public string Envelope(object value)
        {
            return TokidSdk.ToEnvelope(value, ProfileId);
        }
    }
}
