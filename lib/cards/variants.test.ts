import { describe, it, expect } from "vitest";

import { ygoVariantsForCard } from "./variants";
import type { YgoCard } from "./ygoprodeck";

// ygoVariantsForCard is the public surface over the (private) rarity
// normalizer, so testing it exercises the junk denylist, canonical mapping,
// unknown-kept behaviour, dedupe and ordering in one place.
function card(rarities: Array<string | undefined>): YgoCard {
  return {
    card_sets: rarities.map((r) => ({ set_rarity: r })),
  } as unknown as YgoCard;
}

describe("ygoVariantsForCard", () => {
  it("drops junk rarities like 'New' and falls back to Common", () => {
    expect(ygoVariantsForCard(card(["New"]))).toEqual(["Common"]);
  });

  it("drops non-letter values", () => {
    expect(ygoVariantsForCard(card(["123"]))).toEqual(["Common"]);
  });

  it("canonicalises casing and spacing", () => {
    expect(ygoVariantsForCard(card(["super  rare"]))).toEqual(["Super Rare"]);
  });

  it("orders known rarities by hierarchy regardless of input order", () => {
    expect(ygoVariantsForCard(card(["Ultra Rare", "Common"]))).toEqual([
      "Common",
      "Ultra Rare",
    ]);
  });

  it("dedupes repeated rarities", () => {
    expect(ygoVariantsForCard(card(["Rare", "Rare"]))).toEqual(["Rare"]);
  });

  it("keeps an unknown-but-plausible rarity, appended after known ones", () => {
    const out = ygoVariantsForCard(card(["Mega Rare", "Common"]));
    expect(out[0]).toBe("Common");
    expect(out).toContain("Mega Rare");
  });

  it("defaults to Common when a card has no printings", () => {
    expect(ygoVariantsForCard(card([]))).toEqual(["Common"]);
  });
});
