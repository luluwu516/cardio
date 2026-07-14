import { describe, it, expect } from "vitest";

import { applyAlias, aliasesMatching } from "./aliases";

describe("applyAlias", () => {
  it("returns the official name for an aliased card", () => {
    // Upstream still returns "Black Jack the Shadow-Armored Knight".
    expect(applyAlias("YGO", "95506252", "Black Jack the Shadow-Armored Knight")).toBe(
      "Shadowreaver Knight 21",
    );
  });

  it("passes non-aliased cards through unchanged", () => {
    expect(applyAlias("YGO", "89631139", "Blue-Eyes White Dragon")).toBe(
      "Blue-Eyes White Dragon",
    );
  });

  it("is scoped by game (an MTG id must not hit a YGO alias)", () => {
    expect(applyAlias("MTG", "95506252", "Some Card")).toBe("Some Card");
  });
});

describe("aliasesMatching", () => {
  it("matches the official name case-insensitively by substring", () => {
    const hits = aliasesMatching("YGO", "shadowreaver");
    expect(hits.map((a) => a.externalId)).toContain("95506252");
  });

  it("ignores queries shorter than two characters", () => {
    expect(aliasesMatching("YGO", "s")).toEqual([]);
  });

  it("does not match the outdated upstream name", () => {
    expect(aliasesMatching("YGO", "black jack")).toEqual([]);
  });

  it("is scoped by game", () => {
    expect(aliasesMatching("MTG", "shadowreaver")).toEqual([]);
  });
});
