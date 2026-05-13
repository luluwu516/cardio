// Shared types for the search UI. Intentionally minimal — MTG and YGO cards
// do not share a full schema; full game-specific fields live on each game's
// own client module (ScryfallCard, YgoCard).

export type Game = "YGO" | "MTG";

// Lenient parser for the `?game=` URL param. Defaults to YGO when missing
// or invalid so callers never have to think about the fallback. Lives next
// to the Game type because /search and /collection both round-trip it.
export function parseGameParam(v: string | null): Game {
  return v === "MTG" ? "MTG" : "YGO";
}

// Upper bound on cards returned from any single search endpoint
// (/api/search/[game] and /api/collection/search). Centralised so both stay
// in lockstep with the search UI grid.
export const MAX_SEARCH_RESULTS = 30;

export interface SearchHit {
  game: Game;
  external_id: string;
  name: string;
  type: string;
  image_url: string | null;
  /** Total quantity the current user already owns across all variants. */
  owned: number;
}
