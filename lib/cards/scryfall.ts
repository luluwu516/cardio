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
  set?: string;
  set_name?: string;
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

export interface MtgSearchFilters {
  type?: string; // Scryfall t: token (e.g. "creature")
  colors?: string; // concatenation of W/U/B/R/G or "C" for colorless
  cmcMin?: number;
  cmcMax?: number;
  powerMin?: number;
  powerMax?: number;
  toughMin?: number;
  toughMax?: number;
  set?: string;
  desc?: string; // oracle-text substring (Scryfall `o:` operator)
  sort?: string; // name | cmc | power | toughness | usd | released
  dir?: "asc" | "desc";
}

const MTG_SORT_FIELDS = new Set([
  "name",
  "cmc",
  "power",
  "toughness",
  "usd",
  "released",
  "rarity",
  "color",
]);

function buildScryfallQuery(name: string, f: MtgSearchFilters): string {
  const parts: string[] = [];
  if (name) parts.push(name);
  if (f.type) parts.push(`t:${escapeToken(f.type)}`);
  if (f.colors && f.colors.length > 0) {
    // Colorless is exclusive: `c=c` matches exactly-colorless. Otherwise use
    // `c>=wu` (AND semantics — color identity contains at least W and U).
    const upper = f.colors.toUpperCase();
    if (upper === "C") {
      parts.push("c=c");
    } else {
      const concrete = upper.replace(/C/g, "");
      if (concrete) parts.push(`c>=${concrete.toLowerCase()}`);
    }
  }
  if (f.cmcMin !== undefined) parts.push(`cmc>=${f.cmcMin}`);
  if (f.cmcMax !== undefined) parts.push(`cmc<=${f.cmcMax}`);
  if (f.powerMin !== undefined) parts.push(`pow>=${f.powerMin}`);
  if (f.powerMax !== undefined) parts.push(`pow<=${f.powerMax}`);
  if (f.toughMin !== undefined) parts.push(`tou>=${f.toughMin}`);
  if (f.toughMax !== undefined) parts.push(`tou<=${f.toughMax}`);
  if (f.set) parts.push(`set:${escapeToken(f.set)}`);
  if (f.desc) parts.push(`o:${escapeToken(f.desc)}`);
  return parts.join(" ");
}

function escapeToken(value: string): string {
  // Quote multi-word values so Scryfall takes them as a single token.
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export async function searchScryfall(
  query: string,
  filters: MtgSearchFilters = {},
): Promise<ScryfallCard[]> {
  const composed = buildScryfallQuery(query, filters);
  if (!composed) return [];
  const params = new URLSearchParams({
    q: composed,
    unique: "cards",
  });
  if (filters.sort && MTG_SORT_FIELDS.has(filters.sort)) {
    params.set("order", filters.sort);
  } else {
    params.set("order", "name");
  }
  if (filters.dir === "desc") params.set("dir", "desc");

  const res = await fetch(`${BASE}/cards/search?${params}`, {
    headers,
    next: { revalidate: 60 },
  });
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
