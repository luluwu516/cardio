// Local name corrections for cards whose upstream API name lags behind the
// official English name — e.g. YGOPRODeck still carrying the community's literal
// translation from a card's Japanese release. Keyed by passcode (YGO) /
// Scryfall id (MTG), which never change, so corrections survive any upstream
// rename and never touch collection / deck references.
//
// Applied to both display and search so users can see *and* find these cards by
// their official name even though the upstream source can't. When upstream
// finally adopts the official name the entry becomes a harmless no-op (the two
// names match) — delete it whenever.

import type { Game } from "./types";

export interface CardAlias {
  game: Game;
  externalId: string;
  /** Official name to display and let users search by. */
  name: string;
  /** What the upstream API currently returns — documentation only. */
  upstreamName?: string;
}

export const CARD_ALIASES: CardAlias[] = [
  {
    game: "YGO",
    externalId: "95506252",
    name: "Shadowreaver Knight 21",
    upstreamName: "Black Jack the Shadow-Armored Knight",
  },
  {
    game: "YGO",
    externalId: "58995660",
    name: "First Striker Advantage",
    upstreamName: "Early Palm Gets the Win",
  },
];

const byKey = new Map<string, CardAlias>(
  CARD_ALIASES.map((a) => [`${a.game}:${a.externalId}`, a]),
);

/** The official display name for a card, or the given name if not aliased. */
export function applyAlias(
  game: Game,
  externalId: string,
  name: string,
): string {
  return byKey.get(`${game}:${externalId}`)?.name ?? name;
}

/**
 * Aliases whose official name matches the query — used to surface cards in
 * search that the upstream source can't return under their official name.
 * Case-insensitive substring, mirroring the upstream fuzzy-name search.
 */
export function aliasesMatching(game: Game, query: string): CardAlias[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return CARD_ALIASES.filter(
    (a) => a.game === game && a.name.toLowerCase().includes(q),
  );
}
