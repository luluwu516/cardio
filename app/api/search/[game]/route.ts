import { NextResponse } from "next/server";

import {
  scryfallImage,
  searchScryfall,
  type ScryfallCard,
} from "@/lib/cards/scryfall";
import {
  searchYgo,
  ygoImage,
  type YgoCard,
} from "@/lib/cards/ygoprodeck";
import type { Game, SearchHit } from "@/lib/cards/types";
import { createClient } from "@/lib/supabase/server";

const MAX_RESULTS = 20;

function isGame(g: string): g is Game {
  return g === "YGO" || g === "MTG";
}

function mtgHit(c: ScryfallCard): SearchHit {
  return {
    game: "MTG",
    external_id: c.id,
    name: c.name,
    type: c.type_line ?? "",
    image_url: scryfallImage(c),
    owned: 0,
  };
}

function ygoHit(c: YgoCard): SearchHit {
  return {
    game: "YGO",
    external_id: String(c.id),
    name: c.name,
    type: c.type,
    image_url: ygoImage(c),
    owned: 0,
  };
}

interface OwnedJoin {
  quantity: number;
  card: { game: string; external_id: string } | null;
}

async function attachOwnedCounts(
  game: Game,
  hits: SearchHit[],
): Promise<void> {
  if (hits.length === 0) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const externalIds = hits.map((h) => h.external_id);
  const { data } = await supabase
    .from("user_cards")
    .select("quantity, card:cards!inner(game, external_id)")
    .eq("user_id", user.id)
    .eq("card.game", game)
    .in("card.external_id", externalIds);

  const owned = new Map<string, number>();
  for (const row of (data ?? []) as unknown as OwnedJoin[]) {
    const ext = row.card?.external_id;
    if (!ext) continue;
    owned.set(ext, (owned.get(ext) ?? 0) + row.quantity);
  }
  for (const hit of hits) {
    hit.owned = owned.get(hit.external_id) ?? 0;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ game: string }> },
) {
  const { game } = await params;
  if (!isGame(game)) {
    return NextResponse.json(
      { error: "Invalid game. Use YGO or MTG." },
      { status: 400 },
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results =
      game === "MTG"
        ? (await searchScryfall(q)).slice(0, MAX_RESULTS).map(mtgHit)
        : (await searchYgo(q, MAX_RESULTS)).map(ygoHit);
    await attachOwnedCounts(game, results);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
