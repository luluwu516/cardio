import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/BackButton";
import { getScryfallById } from "@/lib/cards/scryfall";
import { tcgPlayerSearchUrl } from "@/lib/cards/tcgplayer";
import { getYgoById } from "@/lib/cards/ygoprodeck";
import { applyAlias } from "@/lib/cards/aliases";
import type { Game } from "@/lib/cards/types";
import { deleteDeck, renameDeck } from "../actions";
import { DeckEditor, type DeckCardDisplay } from "./DeckEditor";

interface Deck {
  id: string;
  name: string;
  game: Game;
  format: string | null;
  is_wishlist: boolean;
  created_at: string;
  updated_at: string;
}

interface JoinedDeckCard {
  quantity: number;
  board: string;
  note: string | null;
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

// The set/printing to show a shop clerk in Store mode. MTG cards are cached
// per printing, so set_name is a single exact value. YGO cards list every
// printing in card_sets — take the first (the original set) since any valid
// set lets the clerk find the card on the shelf.
function extractSetName(game: Game, raw: unknown): string | null {
  if (game === "MTG") {
    const r = raw as { set_name?: string } | null;
    return r?.set_name ?? null;
  }
  const r = raw as { card_sets?: Array<{ set_name?: string }> } | null;
  return r?.card_sets?.[0]?.set_name ?? null;
}

function extractPriceInfo(
  game: Game,
  name: string,
  raw: unknown,
): { estPriceUsd: number | null; tcgplayerUrl: string } {
  // Always a search URL (vs. a specific-product page) so the buylist row lets
  // the user choose printing / condition on TCGPlayer's side. Matches the
  // detail-page treatment.
  const tcgplayerUrl = tcgPlayerSearchUrl(game, name);
  if (game === "MTG") {
    const r = raw as { prices?: { usd?: string | null } } | null;
    return { estPriceUsd: parsePrice(r?.prices?.usd), tcgplayerUrl };
  }
  const r = raw as {
    card_prices?: Array<{ tcgplayer_price?: string }>;
  } | null;
  return {
    estPriceUsd: parsePrice(r?.card_prices?.[0]?.tcgplayer_price),
    tcgplayerUrl,
  };
}

export default async function DeckEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: renameError } = await searchParams;
  const supabase = await createClient();

  // Round-trip 1: just the deck row — everything else fans out from its id/game.
  const { data: deckRow } = await supabase
    .from("decks")
    .select("id, name, game, format, is_wishlist, created_at, updated_at")
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
        "quantity, board, note, card:cards!inner(id, external_id, name, type, image_url, game, raw)",
      )
      .eq("deck_id", deck.id),
    // Wishlists don't need the banlist (they're a shopping list, not a legal
    // deck), and YGO banlist is a remote fetch — skip it for wishlists.
    deck.game === "YGO" && !deck.is_wishlist
      ? fetchYgoBanlist()
      : Promise.resolve(new Map<string, string>()),
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

  // Round-trip 4: refetch live card payloads for the rows that will land on
  // the buylist (inDeck > owned). cards.raw is frozen at first cache write —
  // could be months old by the time the user opens this deck — and prices
  // are the only thing that genuinely needs to be fresh. We skip cards the
  // user already has enough of: their prices don't enter the CSV. Both
  // getters use next.revalidate=3600, so repeat opens within an hour stay
  // free.
  //
  // Wishlists skip this entirely: almost every card is "missing" (owned 0), so
  // a big wishlist would fan out into dozens of parallel upstream calls on a
  // cold load — enough to be slow and to risk YGOPRODeck's rate limit. Cached
  // `raw` prices are plenty fresh for a shopping estimate.
  const freshRawByExt = new Map<string, unknown>();
  if (!deck.is_wishlist) {
    const missingFetches = deckCards
      .filter((dc) => {
        if (!dc.card) return false;
        return dc.quantity > (ownedByCard.get(dc.card.id) ?? 0);
      })
      .map(async (dc) => {
        const c = dc.card!;
        try {
          if (c.game === "MTG") {
            const fresh = await getScryfallById(c.external_id);
            return { ext: c.external_id, raw: fresh as unknown };
          }
          const fresh = await getYgoById(c.external_id);
          return fresh ? { ext: c.external_id, raw: fresh as unknown } : null;
        } catch {
          // Network / upstream hiccup → fall back to the cached raw below.
          return null;
        }
      });
    for (const r of await Promise.all(missingFetches)) {
      if (r) freshRawByExt.set(r.ext, r.raw);
    }
  }

  function toDisplay(dc: JoinedDeckCard): DeckCardDisplay | null {
    if (!dc.card) return null;
    const c = dc.card;
    const banTcg = c.game === "YGO" ? ygoBanlist.get(c.external_id) ?? null : null;
    // Fresh payload if we refetched it above; cached raw otherwise. Cards
    // not on the buylist never read their price, so the staleness on the
    // fallback path is harmless.
    const rawForPrice = freshRawByExt.get(c.external_id) ?? c.raw;
    // Official name drives display and the TCGPlayer search link (TCGPlayer
    // indexes the official name). The price number comes from rawForPrice, not
    // the name, so aliasing the name doesn't affect pricing accuracy.
    const displayName = applyAlias(c.game, c.external_id, c.name);
    const price = extractPriceInfo(c.game, displayName, rawForPrice);
    return {
      cardId: c.id,
      externalId: c.external_id,
      game: c.game,
      name: displayName,
      type: c.type,
      setName: extractSetName(c.game, rawForPrice),
      image_url: c.image_url,
      inDeck: dc.quantity,
      owned: ownedByCard.get(c.id) ?? 0,
      note: dc.note,
      // Wishlists are a shopping list, not a legal deck — no banlist nag.
      violation:
        c.game === "YGO" && !deck.is_wishlist
          ? ygoViolation(dc.quantity, banTcg)
          : null,
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

  // For a normal deck, offer to push its buylist into an existing wishlist of
  // the same game. (Wishlists themselves don't show that action.)
  let wishlists: Array<{ id: string; name: string }> = [];
  if (!deck.is_wishlist) {
    const { data: wl } = await supabase
      .from("decks")
      .select("id, name")
      .eq("is_wishlist", true)
      .eq("game", deck.game)
      .order("updated_at", { ascending: false });
    wishlists = (wl ?? []) as Array<{ id: string; name: string }>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4">
        <BackButton fallback="/decks" />
      </div>

      {/* Badges on their own row, then the name field + Save below — otherwise
          the Wishlist badge eats the input's width and pushes Save off-screen
          on a phone. */}
      <div className="mb-5 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {deck.game}
          </span>
          {deck.is_wishlist ? (
            <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              Wishlist
            </span>
          ) : null}
        </div>
        <form action={renameDeck} className="flex items-center gap-2">
          <input type="hidden" name="id" value={deck.id} />
          <input
            name="name"
            defaultValue={deck.name}
            required
            maxLength={80}
            placeholder="Deck name"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-base font-medium outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Save
          </button>
        </form>
        {renameError ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {renameError}
          </p>
        ) : null}
      </div>

      <DeckEditor
        deckId={deck.id}
        deckGame={deck.game}
        isWishlist={deck.is_wishlist}
        wishlists={wishlists}
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
