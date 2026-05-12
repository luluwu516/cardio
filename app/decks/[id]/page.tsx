import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/BackButton";
import type { Game } from "@/lib/cards/types";
import { deleteDeck, renameDeck } from "../actions";
import { DeckEditor, type DeckCardDisplay } from "./DeckEditor";

interface Deck {
  id: string;
  name: string;
  game: Game;
  format: string | null;
  created_at: string;
  updated_at: string;
}

interface JoinedDeckCard {
  quantity: number;
  board: string;
  card: {
    id: string;
    external_id: string;
    name: string;
    type: string | null;
    image_url: string | null;
    game: Game;
    raw: unknown;
  } | null;
}

function ygoMaxCopies(banTcg: string | null): number {
  // YGOPRODeck's tags: "Forbidden" | "Limited" | "Semi-Limited" (never "Banned").
  switch (banTcg) {
    case "Forbidden":
      return 0;
    case "Limited":
      return 1;
    case "Semi-Limited":
      return 2;
    default:
      return 3;
  }
}

function ygoViolation(inDeck: number, banTcg: string | null): string | null {
  if (inDeck <= ygoMaxCopies(banTcg)) return null;
  switch (banTcg) {
    case "Forbidden":
      return "Forbidden in TCG";
    case "Limited":
      return "Limited to 1 in TCG";
    case "Semi-Limited":
      return "Semi-Limited to 2 in TCG";
    default:
      return "Max 3 copies per deck";
  }
}

// Fresh banlist > cached banlist_info on each card.raw, because the YGOPRODeck
// payload we cached when the card first hit the collection has the banlist
// state at *that* moment — but Konami publishes new banlists quarterly.
async function fetchYgoBanlist(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const res = await fetch(
      "https://db.ygoprodeck.com/api/v7/cardinfo.php?banlist=tcg",
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return out;
    const json = (await res.json()) as {
      data?: Array<{ id: number; banlist_info?: { ban_tcg?: string } }>;
    };
    for (const c of json.data ?? []) {
      const tag = c.banlist_info?.ban_tcg;
      if (tag) out.set(String(c.id), tag);
    }
  } catch {
    // banlist check just becomes a no-op
  }
  return out;
}

function parsePrice(raw: unknown): number | null {
  if (typeof raw !== "string" || raw === "") return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function extractPriceInfo(
  game: Game,
  name: string,
  raw: unknown,
): { estPriceUsd: number | null; tcgplayerUrl: string | null } {
  if (game === "MTG") {
    const r = raw as {
      prices?: { usd?: string | null };
      purchase_uris?: { tcgplayer?: string };
    } | null;
    return {
      estPriceUsd: parsePrice(r?.prices?.usd),
      tcgplayerUrl: r?.purchase_uris?.tcgplayer ?? null,
    };
  }
  const r = raw as {
    card_prices?: Array<{ tcgplayer_price?: string }>;
  } | null;
  return {
    estPriceUsd: parsePrice(r?.card_prices?.[0]?.tcgplayer_price),
    tcgplayerUrl: `https://www.tcgplayer.com/search/yugioh/product?q=${encodeURIComponent(name)}`,
  };
}

export default async function DeckEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Round-trip 1: just the deck row — everything else fans out from its id/game.
  const { data: deckRow } = await supabase
    .from("decks")
    .select("id, name, game, format, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!deckRow) notFound();
  const deck = deckRow as Deck;

  // Round-trip 2: deck contents and the banlist are independent; YGO banlist
  // is a remote fetch (cached 24h) so don't block on it for MTG decks.
  const [{ data: rawDeckCards }, ygoBanlist] = await Promise.all([
    supabase
      .from("deck_cards")
      .select(
        "quantity, board, card:cards!inner(id, external_id, name, type, image_url, game, raw)",
      )
      .eq("deck_id", deck.id),
    deck.game === "YGO" ? fetchYgoBanlist() : Promise.resolve(new Map<string, string>()),
  ]);
  const deckCards = (rawDeckCards ?? []) as unknown as JoinedDeckCard[];

  // Round-trip 3: owned counts — depends on the card ids we just discovered.
  const cardIds = deckCards
    .map((dc) => dc.card?.id)
    .filter((x): x is string => !!x);
  const ownedByCard = new Map<string, number>();
  if (cardIds.length > 0) {
    const { data: owned } = await supabase
      .from("user_cards")
      .select("card_id, quantity")
      .in("card_id", cardIds);
    for (const row of owned ?? []) {
      ownedByCard.set(
        row.card_id,
        (ownedByCard.get(row.card_id) ?? 0) + row.quantity,
      );
    }
  }

  function toDisplay(dc: JoinedDeckCard): DeckCardDisplay | null {
    if (!dc.card) return null;
    const c = dc.card;
    const banTcg = c.game === "YGO" ? ygoBanlist.get(c.external_id) ?? null : null;
    const price = extractPriceInfo(c.game, c.name, c.raw);
    return {
      cardId: c.id,
      externalId: c.external_id,
      game: c.game,
      name: c.name,
      type: c.type,
      image_url: c.image_url,
      inDeck: dc.quantity,
      owned: ownedByCard.get(c.id) ?? 0,
      violation: c.game === "YGO" ? ygoViolation(dc.quantity, banTcg) : null,
      estPriceUsd: price.estPriceUsd,
      tcgplayerUrl: price.tcgplayerUrl,
    };
  }

  const mainCards: DeckCardDisplay[] = deckCards
    .filter((dc) => dc.board === "main")
    .map(toDisplay)
    .filter((x): x is DeckCardDisplay => !!x)
    .sort((a, b) => a.name.localeCompare(b.name));

  const extraCards: DeckCardDisplay[] = deckCards
    .filter((dc) => dc.board === "extra")
    .map(toDisplay)
    .filter((x): x is DeckCardDisplay => !!x)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4">
        <BackButton fallback="/decks" />
      </div>

      <div className="mb-5 flex items-center gap-2">
        <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {deck.game}
        </span>
        <form action={renameDeck} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={deck.id} />
          <input
            name="name"
            defaultValue={deck.name}
            required
            maxLength={80}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-base font-medium outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Save
          </button>
        </form>
      </div>

      <DeckEditor
        deckId={deck.id}
        deckName={deck.name}
        deckGame={deck.game}
        mainCards={mainCards}
        extraCards={extraCards}
      />

      <form
        action={deleteDeck}
        className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      >
        <input type="hidden" name="id" value={deck.id} />
        <button className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
          Delete deck
        </button>
      </form>
    </main>
  );
}
