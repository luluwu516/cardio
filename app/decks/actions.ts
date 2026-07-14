"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fetchCardRow } from "@/lib/cards/upsert";
import type { Game } from "@/lib/cards/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function parseGame(raw: FormDataEntryValue | null): Game | null {
  return raw === "YGO" || raw === "MTG" ? raw : null;
}

// Server-side caps so a crafted request can't bypass the client maxLength and
// store unbounded text (the inputs are RLS-scoped to the user, so this is
// robustness, not a cross-user risk).
const NAME_MAX = 80;
const NOTE_MAX = 120;

// Bump a deck's updated_at so the Decks list "Updated …" and its ordering
// reflect card/note edits, not just renames. deck_cards changes don't touch
// the decks row on their own, so the updated_at trigger never fires for them.
async function touchDeck(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  deckId: string,
) {
  await supabase
    .from("decks")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", deckId);
}

export async function createDeck(formData: FormData) {
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX);
  const game = parseGame(formData.get("game"));
  if (!name || !game) return;
  const isWishlist = formData.get("type") === "wishlist";

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("decks")
    .insert({ user_id: user.id, name, game, is_wishlist: isWishlist })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/decks");
  redirect(`/decks/${data.id}`);
}

export async function renameDeck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, NAME_MAX);
  if (!id || !name) return;

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("decks")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw error;

  revalidatePath("/decks");
  revalidatePath(`/decks/${id}`);
}

// YGO Extra Deck home: Fusion / Synchro / Xyz / Link monsters (incl.
// Pendulum and Tuner variants — substring match against the type line).
function boardForCard(game: Game, type: string | null): "main" | "extra" {
  if (game !== "YGO" || !type) return "main";
  return /fusion|synchro|xyz|link\s+monster/i.test(type) ? "extra" : "main";
}

/**
 * Apply a delta to the quantity of (game, externalId) in the given deck.
 * The board is decided server-side from the card type (YGO extra-deck
 * monsters route to "extra", everything else to "main"). delta > 0 inserts/
 * increments and caches the card master row if needed; delta < 0 decrements,
 * deleting the row when it hits zero.
 */
export async function changeDeckCardQuantity(
  deckId: string,
  game: Game,
  externalId: string,
  delta: number,
) {
  if (!Number.isFinite(delta) || delta === 0) return;

  const { supabase, user } = await requireUser();

  const { data: deck } = await supabase
    .from("decks")
    .select("id, game, is_wishlist")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!deck) throw new Error("Deck not found");
  if (deck.game !== game) throw new Error("Card game does not match deck game");

  // Locate (or create) the master card row.
  const { data: existingCard } = await supabase
    .from("cards")
    .select("id, type")
    .eq("game", game)
    .eq("external_id", externalId)
    .maybeSingle();
  let cardId = existingCard?.id ?? null;
  let cardType: string | null = existingCard?.type ?? null;

  if (!cardId) {
    if (delta < 0) return;
    const row = await fetchCardRow(game, externalId);
    const { data: card, error } = await supabase
      .from("cards")
      .upsert(row, { onConflict: "game,external_id" })
      .select("id")
      .single();
    if (error) throw error;
    cardId = card.id;
    cardType = row.type;
  }

  // If the card already lives on a board in this deck, keep that board so we
  // don't ever orphan a row in main while creating a duplicate on extra (or
  // vice versa). For new entries, decide by card type — but wishlists are a
  // flat shopping list, so everything sits on 'main'.
  const { data: existing } = await supabase
    .from("deck_cards")
    .select("quantity, board")
    .eq("deck_id", deckId)
    .eq("card_id", cardId)
    .maybeSingle();

  const board: "main" | "extra" =
    (existing?.board as "main" | "extra" | undefined) ??
    (deck.is_wishlist ? "main" : boardForCard(game, cardType));

  const newQty = (existing?.quantity ?? 0) + delta;

  if (newQty <= 0) {
    if (existing) {
      await supabase
        .from("deck_cards")
        .delete()
        .eq("deck_id", deckId)
        .eq("card_id", cardId)
        .eq("board", board);
    }
  } else if (existing) {
    await supabase
      .from("deck_cards")
      .update({ quantity: newQty })
      .eq("deck_id", deckId)
      .eq("card_id", cardId)
      .eq("board", board);
  } else {
    await supabase.from("deck_cards").insert({
      deck_id: deckId,
      card_id: cardId,
      board,
      quantity: newQty,
    });
  }

  await touchDeck(supabase, deckId);
  revalidatePath(`/decks/${deckId}`);
}

// Per-item wishlist note (wanted rarity / printing). Keyed by (deck, card);
// wishlist rows are all on the 'main' board.
export async function setWishlistNote(
  deckId: string,
  cardId: string,
  note: string,
) {
  const { supabase, user } = await requireUser();

  // Ownership check via the deck (deck_cards has no user_id of its own).
  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!deck) throw new Error("Deck not found");

  const trimmed = note.trim().slice(0, NOTE_MAX);
  const { error } = await supabase
    .from("deck_cards")
    .update({ note: trimmed || null })
    .eq("deck_id", deckId)
    .eq("card_id", cardId);
  if (error) throw error;

  await touchDeck(supabase, deckId);
  revalidatePath(`/decks/${deckId}`);
}

// ─── Buylist → wishlist ──────────────────────────────────────────────────────

// The still-to-buy cards of a source deck: quantity in the deck beyond what the
// user owns. Recomputed server-side (never trust a client-sent list). Returns
// [{ card_id, needed }].
async function missingCardsOf(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  sourceDeckId: string,
): Promise<Array<{ card_id: string; needed: number }>> {
  const { data: deckCards } = await supabase
    .from("deck_cards")
    .select("card_id, quantity")
    .eq("deck_id", sourceDeckId);
  const rows = (deckCards ?? []) as Array<{ card_id: string; quantity: number }>;
  if (rows.length === 0) return [];

  const cardIds = rows.map((r) => r.card_id);
  const { data: owned } = await supabase
    .from("user_cards")
    .select("card_id, quantity")
    .eq("user_id", userId)
    .in("card_id", cardIds);
  const ownedByCard = new Map<string, number>();
  for (const o of (owned ?? []) as Array<{ card_id: string; quantity: number }>) {
    ownedByCard.set(o.card_id, (ownedByCard.get(o.card_id) ?? 0) + o.quantity);
  }

  // Collapse any main/extra split to one needed-count per card.
  const neededByCard = new Map<string, number>();
  for (const r of rows) {
    neededByCard.set(r.card_id, (neededByCard.get(r.card_id) ?? 0) + r.quantity);
  }
  const out: Array<{ card_id: string; needed: number }> = [];
  for (const [card_id, inDeck] of neededByCard) {
    const needed = inDeck - (ownedByCard.get(card_id) ?? 0);
    if (needed > 0) out.push({ card_id, needed });
  }
  return out;
}

// Create a fresh wishlist from a deck's missing cards and return its id so the
// caller can navigate to it (in Store mode).
export async function createWishlistFromDeck(
  sourceDeckId: string,
): Promise<string> {
  const { supabase, user } = await requireUser();

  const { data: src } = await supabase
    .from("decks")
    .select("id, name, game")
    .eq("id", sourceDeckId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!src) throw new Error("Deck not found");

  const missing = await missingCardsOf(supabase, user.id, sourceDeckId);
  if (missing.length === 0) throw new Error("Nothing to buy — you own it all.");

  const { data: wl, error: wlError } = await supabase
    .from("decks")
    .insert({
      user_id: user.id,
      name: `${src.name} — buylist`,
      game: src.game,
      is_wishlist: true,
    })
    .select("id")
    .single();
  if (wlError) throw wlError;

  const { error: insError } = await supabase.from("deck_cards").insert(
    missing.map((m) => ({
      deck_id: wl.id,
      card_id: m.card_id,
      board: "main",
      quantity: m.needed,
    })),
  );
  if (insError) throw insError;

  revalidatePath("/decks");
  return wl.id;
}

// Merge a deck's missing cards into an existing wishlist (increment quantities).
export async function addMissingToWishlist(
  sourceDeckId: string,
  targetWishlistId: string,
): Promise<string> {
  const { supabase, user } = await requireUser();

  const { data: target } = await supabase
    .from("decks")
    .select("id, is_wishlist")
    .eq("id", targetWishlistId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!target || !target.is_wishlist) throw new Error("Wishlist not found");

  const missing = await missingCardsOf(supabase, user.id, sourceDeckId);
  if (missing.length === 0) throw new Error("Nothing to buy — you own it all.");

  // Read current quantities so we can increment (deck_cards has no upsert-add).
  const cardIds = missing.map((m) => m.card_id);
  const { data: existing } = await supabase
    .from("deck_cards")
    .select("card_id, quantity")
    .eq("deck_id", targetWishlistId)
    .in("card_id", cardIds);
  const curByCard = new Map<string, number>();
  for (const e of (existing ?? []) as Array<{ card_id: string; quantity: number }>) {
    curByCard.set(e.card_id, e.quantity);
  }

  const rows = missing.map((m) => ({
    deck_id: targetWishlistId,
    card_id: m.card_id,
    board: "main",
    quantity: (curByCard.get(m.card_id) ?? 0) + m.needed,
  }));
  const { error } = await supabase
    .from("deck_cards")
    .upsert(rows, { onConflict: "deck_id,card_id,board" });
  if (error) throw error;

  await touchDeck(supabase, targetWishlistId);
  revalidatePath(`/decks/${targetWishlistId}`);
  return targetWishlistId;
}

export async function deleteDeck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, user } = await requireUser();
  await supabase.from("decks").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/decks");
  redirect("/decks");
}
