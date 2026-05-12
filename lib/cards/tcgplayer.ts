import type { Game } from "./types";

// Always link to TCGPlayer's search page (not a specific product) so the user
// can pick the printing / condition they want on TCGPlayer's side. Same shape
// for both games, just a different category segment in the URL.
export function tcgPlayerSearchUrl(game: Game, name: string): string {
  const segment = game === "MTG" ? "magic" : "yugioh";
  return `https://www.tcgplayer.com/search/${segment}/product?q=${encodeURIComponent(name)}`;
}
