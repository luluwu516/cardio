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
  } | null;
}

export default async function DeckEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: deckRow } = await supabase
    .from("decks")
    .select("id, name, game, format, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!deckRow) notFound();
  const deck = deckRow as Deck;

  const { data: rawDeckCards } = await supabase
    .from("deck_cards")
    .select(
      "quantity, board, card:cards!inner(id, external_id, name, type, image_url, game)",
    )
    .eq("deck_id", deck.id);
  const deckCards = (rawDeckCards ?? []) as unknown as JoinedDeckCard[];

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
    return {
      cardId: c.id,
      externalId: c.external_id,
      game: c.game,
      name: c.name,
      type: c.type,
      image_url: c.image_url,
      inDeck: dc.quantity,
      owned: ownedByCard.get(c.id) ?? 0,
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
