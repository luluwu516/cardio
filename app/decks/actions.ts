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

export async function createDeck(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const game = parseGame(formData.get("game"));
  if (!name || !game) return;

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("decks")
    .insert({ user_id: user.id, name, game })
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath("/decks");
  redirect(`/decks/${data.id}`);
}

export async function renameDeck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
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
    .select("id, game")
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
  // vice versa). For new entries, decide by card type.
  const { data: existing } = await supabase
    .from("deck_cards")
    .select("quantity, board")
    .eq("deck_id", deckId)
    .eq("card_id", cardId)
    .maybeSingle();

  const board: "main" | "extra" =
    (existing?.board as "main" | "extra" | undefined) ??
    boardForCard(game, cardType);

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

  revalidatePath(`/decks/${deckId}`);
}

export async function deleteDeck(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, user } = await requireUser();
  await supabase.from("decks").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/decks");
  redirect("/decks");
}
