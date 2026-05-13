import { NextResponse } from "next/server";

import {
  scryfallImage,
  searchScryfall,
  type ScryfallCard,
  type MtgSearchFilters,
} from "@/lib/cards/scryfall";
import {
  searchYgo,
  ygoImage,
  type YgoCard,
  type YgoSearchFilters,
} from "@/lib/cards/ygoprodeck";
import { MAX_SEARCH_RESULTS, type Game, type SearchHit } from "@/lib/cards/types";
import { createClient } from "@/lib/supabase/server";

function isGame(g: string): g is Game {
  return g === "YGO" || g === "MTG";
}

function intParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function dirParam(value: string | null): "asc" | "desc" | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

function readYgoFilters(p: URLSearchParams): YgoSearchFilters {
  return {
    type: p.get("type") ?? undefined,
    attribute: p.get("attribute") ?? undefined,
    race: p.get("race") ?? undefined,
    level: intParam(p.get("level")),
    atkMin: intParam(p.get("atkMin")),
    atkMax: intParam(p.get("atkMax")),
    defMin: intParam(p.get("defMin")),
    defMax: intParam(p.get("defMax")),
    set: p.get("set") ?? undefined,
    desc: p.get("desc") ?? undefined,
    sort: p.get("sort") ?? undefined,
    dir: dirParam(p.get("dir")),
  };
}

function readMtgFilters(p: URLSearchParams): MtgSearchFilters {
  return {
    type: p.get("type") ?? undefined,
    colors: p.get("colors") ?? undefined,
    cmcMin: intParam(p.get("cmcMin")),
    cmcMax: intParam(p.get("cmcMax")),
    powerMin: intParam(p.get("powerMin")),
    powerMax: intParam(p.get("powerMax")),
    toughMin: intParam(p.get("toughMin")),
    toughMax: intParam(p.get("toughMax")),
    set: p.get("set") ?? undefined,
    desc: p.get("desc") ?? undefined,
    sort: p.get("sort") ?? undefined,
    dir: dirParam(p.get("dir")),
  };
}

function hasAnyValue(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(
    (v) => v !== undefined && v !== null && v !== "",
  );
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

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  // Either a real query (≥ 2 chars) or at least one advanced filter must be
  // present — otherwise an empty filter set would page through everything.
  const filtersRaw =
    game === "YGO" ? readYgoFilters(url.searchParams) : readMtgFilters(url.searchParams);
  const hasFilters = hasAnyValue(filtersRaw as Record<string, unknown>);
  if (q.length < 2 && !hasFilters) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results =
      game === "MTG"
        ? (await searchScryfall(q, filtersRaw as MtgSearchFilters))
            .slice(0, MAX_SEARCH_RESULTS)
            .map(mtgHit)
        : (
            await searchYgo(q, MAX_SEARCH_RESULTS, filtersRaw as YgoSearchFilters)
          ).map(ygoHit);
    await attachOwnedCounts(game, results);
    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
