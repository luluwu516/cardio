import { describe, it, expect } from "vitest";

import { boardForCard, computeMissingCards } from "./deck";

describe("boardForCard", () => {
  it("sends every MTG card to main, even if the type mentions a keyword", () => {
    // The game guard short-circuits before the YGO regex, so an MTG type line
    // that happens to contain "Fusion" must not route to extra.
    expect(boardForCard("MTG", "Legendary Creature — Fusion")).toBe("main");
    expect(boardForCard("MTG", "Instant")).toBe("main");
  });

  it("treats a null/empty type as main", () => {
    expect(boardForCard("YGO", null)).toBe("main");
    expect(boardForCard("YGO", "")).toBe("main");
  });

  it("routes the four extra-deck monster kinds to extra", () => {
    expect(boardForCard("YGO", "Fusion Monster")).toBe("extra");
    expect(boardForCard("YGO", "Synchro Monster")).toBe("extra");
    expect(boardForCard("YGO", "XYZ Monster")).toBe("extra");
    expect(boardForCard("YGO", "Link Monster")).toBe("extra");
  });

  it("routes extra-deck Pendulum / Tuner variants to extra too", () => {
    expect(boardForCard("YGO", "Synchro Tuner Monster")).toBe("extra");
    expect(boardForCard("YGO", "Xyz Pendulum Effect Monster")).toBe("extra");
  });

  it("keeps main-deck monsters, spells and traps on main", () => {
    expect(boardForCard("YGO", "Normal Monster")).toBe("main");
    expect(boardForCard("YGO", "Effect Monster")).toBe("main");
    expect(boardForCard("YGO", "Pendulum Effect Monster")).toBe("main");
    expect(boardForCard("YGO", "Spell Card")).toBe("main");
    expect(boardForCard("YGO", "Trap Card")).toBe("main");
  });

  it("matches the keyword case-insensitively", () => {
    expect(boardForCard("YGO", "fusion monster")).toBe("extra");
    expect(boardForCard("YGO", "LINK MONSTER")).toBe("extra");
  });

  it("requires 'link' to be followed by 'monster', not just present", () => {
    // The regex is `link\s+monster`, so a bare "link" in some other context
    // stays on main. This pins that boundary so a future loosening to /link/
    // gets caught.
    expect(boardForCard("YGO", "Blinking Effect Monster")).toBe("main");
  });
});

describe("computeMissingCards", () => {
  it("returns nothing for an empty deck", () => {
    expect(computeMissingCards([], [])).toEqual([]);
  });

  it("needs the full quantity when the user owns none", () => {
    expect(
      computeMissingCards([{ card_id: "a", quantity: 3 }], []),
    ).toEqual([{ card_id: "a", needed: 3 }]);
  });

  it("subtracts what the user already owns", () => {
    expect(
      computeMissingCards(
        [{ card_id: "a", quantity: 3 }],
        [{ card_id: "a", quantity: 1 }],
      ),
    ).toEqual([{ card_id: "a", needed: 2 }]);
  });

  it("drops cards the user fully owns", () => {
    expect(
      computeMissingCards(
        [{ card_id: "a", quantity: 2 }],
        [{ card_id: "a", quantity: 2 }],
      ),
    ).toEqual([]);
  });

  it("drops cards owned in excess (never returns a negative need)", () => {
    expect(
      computeMissingCards(
        [{ card_id: "a", quantity: 1 }],
        [{ card_id: "a", quantity: 5 }],
      ),
    ).toEqual([]);
  });

  it("collapses a main/extra split into one needed-count per card", () => {
    // The same card can appear on both boards (a Link monster copied into a
    // side plan, etc). Deck rows sum before the owned subtraction.
    expect(
      computeMissingCards(
        [
          { card_id: "a", quantity: 1 },
          { card_id: "a", quantity: 2 },
        ],
        [{ card_id: "a", quantity: 1 }],
      ),
    ).toEqual([{ card_id: "a", needed: 2 }]);
  });

  it("sums owned quantities across variants of the same card", () => {
    // A user can own the same card in two rarities/finishes (separate rows).
    expect(
      computeMissingCards(
        [{ card_id: "a", quantity: 4 }],
        [
          { card_id: "a", quantity: 1 },
          { card_id: "a", quantity: 2 },
        ],
      ),
    ).toEqual([{ card_id: "a", needed: 1 }]);
  });

  it("handles a mix, keeping only the still-needed cards", () => {
    const result = computeMissingCards(
      [
        { card_id: "a", quantity: 3 },
        { card_id: "b", quantity: 2 },
        { card_id: "c", quantity: 1 },
      ],
      [
        { card_id: "a", quantity: 1 },
        { card_id: "b", quantity: 2 },
      ],
    );
    // a: 3-1=2 kept, b: 2-2=0 dropped, c: 1-0=1 kept.
    expect(result).toEqual([
      { card_id: "a", needed: 2 },
      { card_id: "c", needed: 1 },
    ]);
  });
});
