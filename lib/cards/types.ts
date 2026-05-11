// Shared types for the search UI. Intentionally minimal — MTG and YGO cards
// do not share a full schema; full game-specific fields live on each game's
// own client module (ScryfallCard, YgoCard).

export type Game = "YGO" | "MTG";

export interface SearchHit {
  game: Game;
  external_id: string;
  name: string;
  type: string;
  image_url: string | null;
  /** Total quantity the current user already owns across all variants. */
  owned: number;
}
