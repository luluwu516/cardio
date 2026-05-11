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

export async function addToCollection(game: Game, externalId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let row: CardRow;
  if (game === "MTG") {
    row = mtgRow(await getScryfallById(externalId));
  } else {
    const c = await getYgoById(externalId);
    if (!c) throw new Error("YGO card not found");
    row = ygoRow(c);
  }

  const { data: card, error: cardError } = await supabase
    .from("cards")
    .upsert(row, { onConflict: "game,external_id" })
    .select("id")
    .single();
  if (cardError) throw cardError;

  // user_cards has unique(user_id, card_id, condition, foil); for the MVP we
  // always add as NM / non-foil and bump quantity if the row already exists.
  const { data: existing } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("card_id", card.id)
    .eq("condition", "NM")
    .eq("foil", false)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_cards")
      .update({ quantity: existing.quantity + 1 })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("user_cards")
      .insert({ user_id: user.id, card_id: card.id, quantity: 1 });
    if (error) throw error;
  }

  revalidatePath("/collection");
}
