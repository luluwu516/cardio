import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { MAX_SEARCH_RESULTS, type Game, type SearchHit } from "@/lib/cards/types";

function isGame(g: string): g is Game {
  return g === "YGO" || g === "MTG";
}

interface JoinedRow {
  quantity: number;
  card: {
    external_id: string;
    name: string;
    type: string | null;
    image_url: string | null;
    game: string;
  } | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game") ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!isGame(game)) {
    return NextResponse.json(
      { error: "Invalid game. Use YGO or MTG." },
      { status: 400 },
    );
  }
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "quantity, card:cards!inner(external_id, name, type, image_url, game)",
    )
    .eq("user_id", user.id)
    .eq("card.game", game)
    .ilike("card.name", `%${q}%`)
    .limit(100);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Roll up multiple variant rows (e.g. Common + Secret Rare of the same
  // YGO card) into one hit so the deck builder doesn't list duplicates.
  const ownedByExt = new Map<string, SearchHit>();
  for (const row of (data ?? []) as unknown as JoinedRow[]) {
    if (!row.card) continue;
    const ext = row.card.external_id;
    const existing = ownedByExt.get(ext);
    if (existing) {
      existing.owned += row.quantity;
    } else {
      ownedByExt.set(ext, {
        game,
        external_id: ext,
        name: row.card.name,
        type: row.card.type ?? "",
        image_url: row.card.image_url,
        owned: row.quantity,
      });
    }
  }

  const results = Array.from(ownedByExt.values()).slice(0, MAX_SEARCH_RESULTS);
  return NextResponse.json({ results });
}
