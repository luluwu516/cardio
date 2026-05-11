const BASE = "https://api.scryfall.com";

const headers = {
  // Scryfall asks every client to identify itself.
  "User-Agent": "cardIO/0.1 (https://github.com/cardio)",
  Accept: "application/json;q=0.9,*/*;q=0.8",
};

export interface ScryfallCard {
  id: string;
  name: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  frame?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
  };
  card_faces?: Array<{
    name: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: ScryfallCard["image_uris"];
  }>;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
  };
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
  };
  legalities?: Record<string, string>;
}

interface ScryfallSearchResponse {
  data: ScryfallCard[];
  has_more: boolean;
}

export async function searchScryfall(query: string): Promise<ScryfallCard[]> {
  const url = `${BASE}/cards/search?q=${encodeURIComponent(query)}&order=name&unique=cards`;
  const res = await fetch(url, { headers, next: { revalidate: 60 } });
  if (res.status === 404) return []; // Scryfall returns 404 for no-match
  if (!res.ok) throw new Error(`Scryfall search ${res.status}`);
  const data = (await res.json()) as ScryfallSearchResponse;
  return data.data ?? [];
}

export async function getScryfallById(id: string): Promise<ScryfallCard> {
  const url = `${BASE}/cards/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Scryfall fetch ${res.status}`);
  return (await res.json()) as ScryfallCard;
}

export function scryfallImage(c: ScryfallCard): string | null {
  return (
    c.image_uris?.normal ??
    c.image_uris?.large ??
    c.image_uris?.small ??
    c.card_faces?.[0]?.image_uris?.normal ??
    null
  );
}
