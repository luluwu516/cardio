// Variant axis for owned cards:
//   YGO → rarity (Common, Secret Rare, …) sourced from card_sets[*].set_rarity
//   MTG → finish (Nonfoil, Foil, Etched) sourced from card.finishes
//
// Persisted in user_cards.variant as plain text. Both API payloads are
// available either at card-load time (detail page) or via the `raw` jsonb
// blob cached on the cards row, so callers pass whichever they have.

import type { ScryfallCard } from "./scryfall";
import type { YgoCard } from "./ygoprodeck";

// Canonical rarity names in hierarchy order. Exported so the variant picker
// can offer them as a dropdown when the user adds a rarity the card's API
// payload didn't list.
export const YGO_RARITY_ORDER = [
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

// Values YGOPRODeck has been observed to stuff into `set_rarity` that are not
// rarities at all (matched case-insensitively after trimming). e.g. Dragunity
// Falchion's only printing reports a rarity of "New".
const YGO_RARITY_JUNK = new Set(["new"]);

function rarityKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Canonical lookup keyed by the normalized form so casing / spacing variants
// ("super rare", "Super  Rare") all resolve to one display name. Seeded from
// the hierarchy above; add alias keys here as new alternate spellings surface.
const YGO_RARITY_BY_KEY = new Map<string, string>(
  YGO_RARITY_ORDER.map((r) => [rarityKey(r), r]),
);

// Normalize a raw set_rarity into a canonical name, or null if it isn't a
// usable rarity. Unknown-but-plausible values (a real promo rarity we haven't
// catalogued) are kept verbatim rather than dropped, so we only discard the
// values we're confident are junk.
function normalizeYgoRarity(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = rarityKey(trimmed);
  if (YGO_RARITY_JUNK.has(key)) return null;
  // Every real rarity name has at least one letter; drop stray numerics etc.
  if (!/[A-Za-z]/.test(trimmed)) return null;
  return YGO_RARITY_BY_KEY.get(key) ?? trimmed;
}

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

export function ygoVariantsForCard(card: YgoCard): string[] {
  const cleaned = (card.card_sets ?? [])
    .map((s) => normalizeYgoRarity(s.set_rarity))
    .filter((r): r is string => r !== null);
  if (cleaned.length === 0) return ["Common"];
  const unique = dedupeOrdered(cleaned);
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
