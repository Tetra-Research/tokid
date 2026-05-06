package io.tokid;

import java.util.List;

public record Tokid(String profileId, List<String> atoms) {
  public Tokid {
    atoms = List.copyOf(atoms);
  }
}
