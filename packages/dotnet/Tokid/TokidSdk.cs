using System.Collections.Generic;

namespace Tokid
{
    public static class TokidSdk
    {
        public static string DefaultProfileId => TokidKernel.Default.DefaultProfileId;
        public static int DefaultTokidLength => TokidKernel.Default.Profile(DefaultProfileId).Entropy.RecommendedLength;

        public static TokidFactory CreateFactory(string profileId = null, int? length = null)
        {
            return new TokidFactory(profileId, length);
        }

        public static string Generate(string profileId = null, int? length = null, string format = "envelope")
        {
            return CreateFactory(profileId, length).Generate(length, format);
        }

        public static Tokid Parse(string value, string profileId = null)
        {
            return TokidKernel.Default.ParseWithCodec(value, profileId, null);
        }

        public static bool IsTokid(string value, string profileId = null)
        {
            return TokidKernel.Default.ValidateTokid(value, profileId);
        }

        public static string ToPrompt(object value, string profileId = null)
        {
            return TokidKernel.Default.RenderTokid(ResolveTokid(value, profileId), "prompt");
        }

        public static string ToTransport(object value, string profileId = null)
        {
            return TokidKernel.Default.RenderTokid(ResolveTokid(value, profileId), "transport");
        }

        public static string ToEnvelope(object value, string profileId = null)
        {
            return TokidKernel.Default.RenderTokid(ResolveTokid(value, profileId), "envelope");
        }

        public static IReadOnlyList<string> ListProfiles()
        {
            return TokidKernel.Default.ListProfileIds();
        }

        private static Tokid ResolveTokid(object value, string profileId)
        {
            var tokid = value as Tokid;
            if (tokid != null)
            {
                return tokid;
            }

            var rendered = value as string;
            if (rendered != null)
            {
                var parsed = Parse(rendered, profileId);
                if (parsed == null)
                {
                    throw new System.ArgumentException("Invalid tokid value");
                }
                return parsed;
            }

            throw new System.ArgumentException("Unsupported tokid input");
        }
    }
}
