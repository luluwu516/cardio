"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  getScryfallById,
  scryfallImage,
  type ScryfallCard,
} from "@/lib/cards/scryfall";
import {
  getYgoById,
  ygoImage,
  type YgoCard,
} from "@/lib/cards/ygoprodeck";
import type { Game } from "@/lib/cards/types";

interface CardRow {
  game: Game;
  external_id: string;
  name: string;
  type: string | null;
  frame_type: string | null;
  description: string | null;
  image_url: string | null;
  mana_cost: string | null;
  attribute: string | null;
  raw: ScryfallCard | YgoCard;
}

function mtgRow(c: ScryfallCard): CardRow {
  return {
    game: "MTG",
    external_id: c.id,
    name: c.name,
    type: c.type_line ?? null,
    frame_type: c.frame ?? null,
    description: c.oracle_text ?? null,
    image_url: scryfallImage(c),
    mana_cost: c.mana_cost ?? null,
    attribute: null,
    raw: c,
  };
}

function ygoRow(c: YgoCard): CardRow {
  return {
    game: "YGO",
    external_id: String(c.id),
    name: c.name,
    type: c.type ?? null,
    frame_type: c.frameType ?? null,
    description: c.desc ?? null,
    image_url: ygoImage(c),
    mana_cost: null,
    attribute: c.attribute ?? null,
    raw: c,
  };
}

async function fetchCardRow(
  game: Game,
  externalId: string,
): Promise<CardRow> {
  if (game === "MTG") {
    return mtgRow(await getScryfallById(externalId));
  }
  const c = await getYgoById(externalId);
  if (!c) throw new Error("YGO card not found");
  return ygoRow(c);
}

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
