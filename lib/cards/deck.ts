// Pure deck-building helpers, kept out of the "use server" actions module so
// they can be unit-tested and reused without pulling in Supabase — a server-
// action file may only export async functions, so these can't live there.

import type { Game } from "./types";

// YGO Extra Deck home: Fusion / Synchro / Xyz / Link monsters (incl. Pendulum
// and Tuner variants — substring match against the type line). Everything else,
// and every MTG card, sits on the main board.
export function boardForCard(
  game: Game,
  type: string | null,
): "main" | "extra" {
  if (game !== "YGO" || !type) return "main";
  return /fusion|synchro|xyz|link\s+monster/i.test(type) ? "extra" : "main";
}

// Given a deck's card rows (possibly split across main/extra) and what the user
// owns, compute how many of each card still need buying. Collapses any board
// split to a single needed-count per card, sums owned quantities across
// variants, and drops cards already fully owned. This drives the wishlist
// buy-list, so the arithmetic is the money-adjacent bit worth pinning down.
export function computeMissingCards(
  deckCards: Array<{ card_id: string; quantity: number }>,
  owned: Array<{ card_id: string; quantity: number }>,
): Array<{ card_id: string; needed: number }> {
  const ownedByCard = new Map<string, number>();
  for (const o of owned) {
    ownedByCard.set(o.card_id, (ownedByCard.get(o.card_id) ?? 0) + o.quantity);
  }
  const neededByCard = new Map<string, number>();
  for (const r of deckCards) {
    neededByCard.set(
      r.card_id,
      (neededByCard.get(r.card_id) ?? 0) + r.quantity,
    );
  }
  const out: Array<{ card_id: string; needed: number }> = [];
  for (const [card_id, inDeck] of neededByCard) {
    const needed = inDeck - (ownedByCard.get(card_id) ?? 0);
    if (needed > 0) out.push({ card_id, needed });
  }
  return out;
}
