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
  };
}

function ygoHit(c: YgoCard): SearchHit {
  return {
    game: "YGO",
    external_id: String(c.id),
    name: c.name,
    type: c.type,
    image_url: ygoImage(c),
  };
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
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
