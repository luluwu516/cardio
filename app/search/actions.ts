"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fetchCardRow } from "@/lib/cards/upsert";
import type { Game } from "@/lib/cards/types";

/**
 * Apply a relative change to the user's owned quantity for the NM / non-foil
 * variant of (game, externalId). Used by the search page's batched "Confirm"
 * flow and by the detail page's single-step Add / Remove one buttons.
 *
 * - delta > 0 fetches and caches the card if not yet in `cards`.
 * - delta < 0 is a no-op when the user owns nothing.
 * - resulting quantity ≤ 0 deletes the row entirely.
 */
export async function applyDelta(
  game: Game,
  externalId: string,
  delta: number,
) {
  if (!Number.isFinite(delta) || delta === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Locate (or create) the master card row.
  const { data: existingCard } = await supabase
    .from("cards")
    .select("id")
    .eq("game", game)
    .eq("external_id", externalId)
    .maybeSingle();
  let cardId = existingCard?.id ?? null;

  if (!cardId) {
    if (delta < 0) return; // nothing to remove
    const row = await fetchCardRow(game, externalId);
    const { data: card, error } = await supabase
      .from("cards")
      .upsert(row, { onConflict: "game,external_id" })
      .select("id")
      .single();
    if (error) throw error;
    cardId = card.id;
  }

  // Apply against the NM / non-foil row (MVP variant assumption).
  const { data: existing } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("card_id", cardId)
    .eq("condition", "NM")
    .eq("foil", false)
    .maybeSingle();

  const newQty = (existing?.quantity ?? 0) + delta;

  if (newQty <= 0) {
    if (existing) {
      await supabase.from("user_cards").delete().eq("id", existing.id);
    }
  } else if (existing) {
    await supabase
      .from("user_cards")
      .update({ quantity: newQty })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_cards").insert({
      user_id: user.id,
      card_id: cardId,
      quantity: newQty,
    });
  }

  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
}

export async function addToCollection(game: Game, externalId: string) {
  await applyDelta(game, externalId, 1);
}

export async function removeOneFromCollection(
  game: Game,
  externalId: string,
) {
  await applyDelta(game, externalId, -1);
}

/** Hard remove: deletes every user_cards row for this card, all variants. */
export async function removeAllFromCollection(
  game: Game,
  externalId: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: card } = await supabase
    .from("cards")
    .select("id")
    .eq("game", game)
    .eq("external_id", externalId)
    .maybeSingle();
  if (!card) return;

  await supabase
    .from("user_cards")
    .delete()
    .eq("user_id", user.id)
    .eq("card_id", card.id);

  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
}
