using System;
using System.Collections.Generic;
using Tokid;

internal static class Program
{
    private static void Main()
    {
        Require(TokidSdk.DefaultProfileId == "openai-cross-v1", "default profile mismatch");
        Require(EqualStrings(TokidSdk.ListProfiles(), new[] { "openai-cross-v1", "openai-cross-underscore-v1" }), "profile list mismatch");

        var defaultProfile = TokidKernel.Default.Profile("openai-cross-v1");
        var underscoreProfile = TokidKernel.Default.Profile("openai-cross-underscore-v1");
        Require(defaultProfile.ProfileTag == "oa1", "default profile tag mismatch");
        Require(underscoreProfile.ProfileTag == "oa1u", "underscore profile tag mismatch");

        ExpectInvalid(DuplicateAtomProfile(defaultProfile), "Duplicate atom");
        ExpectInvalid(PrefixAmbiguousProfile(defaultProfile), "prefix-free");

        AssertRoundTrip(
            new Tokid.Tokid("openai-cross-v1", new[] { "about", "their", "there", "which" }),
            "about their there which",
            "abouttheirtherewhich",
            "tk1_oa1_abouttheirtherewhich_29jd7");

        AssertRoundTrip(
            new Tokid.Tokid("openai-cross-underscore-v1", new[] { "about", "their", "there", "which" }),
            "about their there which",
            "about_their_there_which",
            "tk1~oa1u~about_their_there_which~1gp02");

        Require(TokidKernel.Default.ParseWithCodec(string.Empty, "openai-cross-v1", "prompt") == null, "empty prompt decoded");
        Require(TokidKernel.Default.ParseWithCodec("aboutzzz", "openai-cross-v1", "transport") == null, "invalid transport decoded");
        Require(TokidKernel.Default.ParseWithCodec("about__their", "openai-cross-underscore-v1", "transport") == null, "double separator decoded");

        Require(TokidSdk.Parse("tk1_oa1_abouttheirtherewhich_29jd0", "openai-cross-v1") == null, "bad checksum decoded");
        Require(TokidSdk.Parse("zz1_oa1_abouttheirtherewhich_29jd7", "openai-cross-v1") == null, "bad prefix decoded");

        var reader = ScriptedRandomBytes();
        var generated = TokidKernel.Default.GenerateTokid("openai-cross-v1", 4, reader);
        Require(generated.Equals(new Tokid.Tokid("openai-cross-v1", new[] { "about", "their", "there", "which" })), "generated tokid mismatch");
        Require(TokidSdk.ToEnvelope(generated, null) == "tk1_oa1_abouttheirtherewhich_29jd7", "generated envelope mismatch");

        var readerUnderscore = ScriptedRandomBytes();
        var generatedUnderscore = TokidKernel.Default.GenerateTokid("openai-cross-underscore-v1", 4, readerUnderscore);
        Require(generatedUnderscore.Equals(new Tokid.Tokid("openai-cross-underscore-v1", new[] { "about", "their", "there", "which" })), "generated underscore mismatch");
        Require(TokidSdk.ToEnvelope(generatedUnderscore, null) == "tk1~oa1u~about_their_there_which~1gp02", "generated underscore envelope mismatch");

        Console.WriteLine("{\"sdk\":\"csharp\",\"capability\":\"core\",\"passed\":true}");
    }

    private static TokidRandomBytes ScriptedRandomBytes()
    {
        var values = new byte[] { 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3 };
        var offset = 0;
        return length =>
        {
            var chunk = new byte[length];
            Array.Copy(values, offset, chunk, 0, length);
            offset += length;
            return chunk;
        };
    }

    private static void AssertRoundTrip(Tokid.Tokid logical, string prompt, string transport, string envelope)
    {
        Require(logical.Equals(TokidSdk.Parse(prompt, logical.ProfileId)), "prompt round-trip mismatch");
        Require(logical.Equals(TokidSdk.Parse(transport, logical.ProfileId)), "transport round-trip mismatch");
        Require(logical.Equals(TokidSdk.Parse(envelope, logical.ProfileId)), "envelope round-trip mismatch");
        Require(TokidSdk.ToPrompt(logical, null) == prompt, "prompt render mismatch");
        Require(TokidSdk.ToTransport(logical, null) == transport, "transport render mismatch");
        Require(TokidSdk.ToEnvelope(logical, null) == envelope, "envelope render mismatch");
    }

    private static void ExpectInvalid(TokidProfileManifest manifest, string errorContains)
    {
        try
        {
            TokidKernel.ValidateProfileManifest(manifest);
            throw new Exception("invalid profile was accepted");
        }
        catch (ArgumentException error)
        {
            Require(error.Message.ToLowerInvariant().Contains(errorContains.ToLowerInvariant()), "unexpected invalid-profile error");
        }
    }

    private static TokidProfileManifest DuplicateAtomProfile(TokidProfileManifest baseProfile)
    {
        return new TokidProfileManifest(
            "invalid-duplicate-v1",
            baseProfile.ProfileVersion,
            "dup1",
            baseProfile.Name,
            baseProfile.Description,
            baseProfile.Provider,
            new TokidProfileVocabularyManifest(baseProfile.Vocabulary.Syntax, new List<string> { "alpha", "alpha" }),
            baseProfile.Codecs,
            new TokidEntropyMetadata(2, 1, 8, 8),
            baseProfile.SourceLineage);
    }

    private static TokidProfileManifest PrefixAmbiguousProfile(TokidProfileManifest baseProfile)
    {
        return new TokidProfileManifest(
            "invalid-prefix-v1",
            baseProfile.ProfileVersion,
            "pfx1",
            baseProfile.Name,
            baseProfile.Description,
            baseProfile.Provider,
            new TokidProfileVocabularyManifest(baseProfile.Vocabulary.Syntax, new List<string> { "alpha", "alphabet" }),
            baseProfile.Codecs,
            new TokidEntropyMetadata(2, 1, 8, 8),
            baseProfile.SourceLineage);
    }

    private static bool EqualStrings(IReadOnlyList<string> left, IReadOnlyList<string> right)
    {
        if (left.Count != right.Count)
        {
            return false;
        }

        for (var index = 0; index < left.Count; index += 1)
        {
            if (left[index] != right[index])
            {
                return false;
            }
        }

        return true;
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new Exception(message);
        }
    }
}
