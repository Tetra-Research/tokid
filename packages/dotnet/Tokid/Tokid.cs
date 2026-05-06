using System;
using System.Collections.Generic;
using System.Linq;

namespace Tokid
{
    public sealed class Tokid
    {
        public string ProfileId { get; }
        public IReadOnlyList<string> Atoms { get; }

        public Tokid(string profileId, IEnumerable<string> atoms)
        {
            ProfileId = profileId;
            Atoms = atoms.ToList().AsReadOnly();
        }

        public override bool Equals(object obj)
        {
            var other = obj as Tokid;
            if (other == null || ProfileId != other.ProfileId || Atoms.Count != other.Atoms.Count)
            {
                return false;
            }

            for (var index = 0; index < Atoms.Count; index += 1)
            {
                if (Atoms[index] != other.Atoms[index])
                {
                    return false;
                }
            }

            return true;
        }

        public override int GetHashCode()
        {
            var hash = ProfileId.GetHashCode();
            foreach (var atom in Atoms)
            {
                hash = (hash * 397) ^ atom.GetHashCode();
            }
            return hash;
        }
    }
}
