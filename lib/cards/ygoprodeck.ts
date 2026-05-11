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

export async function searchYgo(
  query: string,
  limit = 20,
): Promise<YgoCard[]> {
  // YGOPRODeck returns 400 when fname has no matches; treat that as "no results".
  const url = `${BASE}/cardinfo.php?fname=${encodeURIComponent(query)}&num=${limit}&offset=0`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (res.status === 400) return [];
  if (!res.ok) throw new Error(`YGOPRODeck search ${res.status}`);
  const data = (await res.json()) as YgoSearchResponse;
  return data.data ?? [];
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
