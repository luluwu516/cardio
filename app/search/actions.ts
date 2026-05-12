"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { fetchCardRow } from "@/lib/cards/upsert";
import type { Game } from "@/lib/cards/types";

/**
 * Apply a relative change to the user's owned quantity of a specific variant
 * (YGO rarity / MTG finish) of (game, externalId). Used by the card-detail
 * variant picker.
 *
 * - delta > 0 fetches and caches the master card row if not yet in `cards`.
 * - delta < 0 is a no-op when nothing of that variant is owned.
 * - resulting quantity ≤ 0 deletes the row entirely.
 */
export async function applyDelta(
  game: Game,
  externalId: string,
  variant: string,
  delta: number,
) {
  if (!Number.isFinite(delta) || delta === 0) return;
  if (!variant) throw new Error("variant is required");

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

  const { data: existing } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("card_id", cardId)
    .eq("variant", variant)
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
      variant,
      quantity: newQty,
    });
  }

  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
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
