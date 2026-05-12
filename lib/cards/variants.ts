// Variant axis for owned cards:
//   YGO → rarity (Common, Secret Rare, …) sourced from card_sets[*].set_rarity
//   MTG → finish (Nonfoil, Foil, Etched) sourced from card.finishes
//
// Persisted in user_cards.variant as plain text. Both API payloads are
// available either at card-load time (detail page) or via the `raw` jsonb
// blob cached on the cards row, so callers pass whichever they have.

import type { Game } from "./types";
import type { ScryfallCard } from "./scryfall";
import type { YgoCard } from "./ygoprodeck";

const YGO_RARITY_ORDER = [
  "Common",
  "Short Print",
  "Super Short Print",
  "Rare",
  "Super Rare",
  "Ultra Rare",
  "Ultimate Rare",
  "Secret Rare",
  "Prismatic Secret Rare",
  "Ghost Rare",
  "Platinum Secret Rare",
  "Starlight Rare",
  "Quarter Century Secret Rare",
  "Collector's Rare",
];

const MTG_FINISH_ORDER = ["nonfoil", "foil", "etched"];

function dedupeOrdered<T>(xs: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of xs) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

// YGOPRODeck's card_sets occasionally has junk in `set_rarity` (we've seen
// stray numerics like "2"). Filter to strings that contain at least one
// letter — every real rarity name has at least one.
function looksLikeRarity(r: string | undefined | null): r is string {
  return !!r && /[A-Za-z]/.test(r);
}

export function ygoVariantsForCard(card: YgoCard): string[] {
  const raw = (card.card_sets ?? [])
    .map((s) => s.set_rarity?.trim())
    .filter(looksLikeRarity);
  if (raw.length === 0) return ["Common"];
  const unique = dedupeOrdered(raw);
  // Stable display order: known rarities first by hierarchy, unknown rarities
  // (rare promotional names) appended in the order we saw them.
  const known: string[] = [];
  const unknown: string[] = [];
  for (const r of unique) {
    if (YGO_RARITY_ORDER.includes(r)) known.push(r);
    else unknown.push(r);
  }
  known.sort(
    (a, b) => YGO_RARITY_ORDER.indexOf(a) - YGO_RARITY_ORDER.indexOf(b),
  );
  return [...known, ...unknown];
}

export function mtgVariantsForCard(card: ScryfallCard): string[] {
  const raw = (card.finishes ?? []).filter((f) => typeof f === "string");
  const unique = dedupeOrdered(raw);
  if (unique.length === 0) return ["Nonfoil"];
  unique.sort(
    (a, b) => MTG_FINISH_ORDER.indexOf(a) - MTG_FINISH_ORDER.indexOf(b),
  );
  return unique.map(prettyMtgFinish);
}

function prettyMtgFinish(f: string): string {
  if (f === "nonfoil") return "Nonfoil";
  if (f === "foil") return "Foil";
  if (f === "etched") return "Etched";
  return f.charAt(0).toUpperCase() + f.slice(1);
}

export function ygoVariantsFromRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return ["Common"];
  return ygoVariantsForCard(raw as YgoCard);
}

export function mtgVariantsFromRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return ["Nonfoil"];
  return mtgVariantsForCard(raw as ScryfallCard);
}

/** First variant in the canonical display order — used as the auto-pick when
 *  Search's "Add" button lands on the detail page. */
export function defaultVariant(game: Game, variants: string[]): string {
  if (variants.length === 0) return game === "YGO" ? "Common" : "Nonfoil";
  return variants[0];
}
