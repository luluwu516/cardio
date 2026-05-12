const BASE = "https://db.ygoprodeck.com/api/v7";

export interface YgoCard {
  id: number; // passcode
  name: string;
  type: string;
  desc: string;
  frameType: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  archetype?: string;
  card_images: Array<{
    id: number;
    image_url: string;
    image_url_small: string;
  }>;
  card_sets?: Array<{
    set_name: string;
    set_code: string;
    set_rarity?: string;
    set_price?: string;
  }>;
  card_prices?: Array<{
    tcgplayer_price: string;
    cardmarket_price: string;
    coolstuffinc_price: string;
    ebay_price: string;
    amazon_price: string;
  }>;
  banlist_info?: {
    ban_tcg?: string;
    ban_ocg?: string;
    ban_goat?: string;
  };
}

interface YgoSearchResponse {
  data?: YgoCard[];
  error?: string;
}

export interface YgoSearchFilters {
  type?: string;
  attribute?: string;
  race?: string;
  atkMin?: number;
  atkMax?: number;
  defMin?: number;
  defMax?: number;
  set?: string;
  desc?: string; // card-text substring (YGOPRODeck `desc=`)
  sort?: string; // atk | def | level | name | type | id | new
  dir?: "asc" | "desc";
}

const YGO_SORT_FIELDS = new Set([
  "atk",
  "def",
  "level",
  "name",
  "type",
  "id",
  "new",
]);

// Archetype-name fallback: lets users find e.g. "Evil★Twin" archetype cards by
// typing "Evil Twin", and "@Ignister" by typing "Ignister", without entering
// the special characters that appear in the actual card names.
async function fetchYgoArchetypes(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE}/archetypes.php`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ archetype_name: string }>;
    return data.map((a) => a.archetype_name);
  } catch {
    return [];
  }
}

function normalizeForArchetype(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findMatchingArchetype(
  query: string,
  archetypes: string[],
): string | null {
  const nq = normalizeForArchetype(query);
  // 4+ chars to avoid spurious wide matches like "dark" → "Dark Magician".
  if (nq.length < 4) return null;
  for (const a of archetypes) {
    if (normalizeForArchetype(a) === nq) return a;
  }
  // Then accept "archetype is a prefix of query" (e.g. typing
  // "Evil Twin Lil-la" still hits Evil★Twin). Skip very short archetype names.
  for (const a of archetypes) {
    const na = normalizeForArchetype(a);
    if (na.length >= 4 && nq.startsWith(na)) return a;
  }
  return null;
}

function buildBaseYgoParams(
  filters: YgoSearchFilters,
  wireLimit: number,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("num", String(wireLimit));
  params.set("offset", "0");
  if (filters.type) params.set("type", filters.type);
  if (filters.attribute) params.set("attribute", filters.attribute);
  if (filters.race) params.set("race", filters.race);
  if (filters.set) params.set("cardset", filters.set);
  if (filters.desc) params.set("desc", filters.desc);
  // ATK / DEF support a single comparator each. We use gte for "min" and
  // post-filter to enforce "max" when present.
  if (filters.atkMin !== undefined) params.set("atk", `gte${filters.atkMin}`);
  if (filters.defMin !== undefined) params.set("def", `gte${filters.defMin}`);
  if (filters.sort && YGO_SORT_FIELDS.has(filters.sort)) {
    params.set("sort", filters.sort);
  }
  return params;
}

async function fetchYgoCards(params: URLSearchParams): Promise<YgoCard[]> {
  const res = await fetch(`${BASE}/cardinfo.php?${params}`, {
    next: { revalidate: 60 },
  });
  if (res.status === 400) return [];
  if (!res.ok) throw new Error(`YGOPRODeck search ${res.status}`);
  const data = (await res.json()) as YgoSearchResponse;
  return data.data ?? [];
}

export async function searchYgo(
  query: string,
  limit = 20,
  filters: YgoSearchFilters = {},
): Promise<YgoCard[]> {
  // Over-fetch when post-filtering ATK / DEF max bounds since the upstream API
  // only accepts a single comparator per field.
  const needsPostFilter =
    filters.atkMax !== undefined || filters.defMax !== undefined;
  const wireLimit = needsPostFilter ? Math.max(limit * 4, 80) : limit;

  const baseParams = buildBaseYgoParams(filters, wireLimit);

  // Fname request: by-name fuzzy search.
  const fnamePromise: Promise<YgoCard[]> = (async () => {
    const p = new URLSearchParams(baseParams);
    if (query) p.set("fname", query);
    return fetchYgoCards(p);
  })();

  // Archetype request: in parallel, look up whether the query maps onto a
  // known archetype with special characters we can't expect users to type.
  const archetypePromise: Promise<YgoCard[]> = (async () => {
    if (!query || normalizeForArchetype(query).length < 4) return [];
    const archetypes = await fetchYgoArchetypes();
    const match = findMatchingArchetype(query, archetypes);
    if (!match) return [];
    const p = new URLSearchParams(baseParams);
    p.set("archetype", match);
    return fetchYgoCards(p);
  })();

  const [fnameCards, archetypeCards] = await Promise.all([
    fnamePromise,
    archetypePromise,
  ]);

  // Merge, dedupe by passcode; fname results listed first.
  const seen = new Set<number>();
  let cards: YgoCard[] = [];
  for (const c of [...fnameCards, ...archetypeCards]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push(c);
  }

  if (filters.atkMax !== undefined) {
    const max = filters.atkMax;
    cards = cards.filter((c) => (c.atk ?? 0) <= max);
  }
  if (filters.defMax !== undefined) {
    const max = filters.defMax;
    cards = cards.filter((c) => (c.def ?? 0) <= max);
  }

  // YGOPRODeck's `sort` covers ascending only; flip ourselves for desc.
  if (filters.dir === "desc" && filters.sort) {
    cards = [...cards].reverse();
  }

  return cards.slice(0, limit);
}

export async function getYgoById(
  passcode: string | number,
): Promise<YgoCard | null> {
  const url = `${BASE}/cardinfo.php?id=${encodeURIComponent(String(passcode))}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (res.status === 400) return null;
  if (!res.ok) throw new Error(`YGOPRODeck fetch ${res.status}`);
  const data = (await res.json()) as YgoSearchResponse;
  return data.data?.[0] ?? null;
}

export function ygoImage(c: YgoCard): string | null {
  return c.card_images?.[0]?.image_url ?? null;
}
