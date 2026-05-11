// Shared helpers for turning external API card payloads into rows for the
// `cards` table. Used by both the collection (search/actions.ts) and the
// deck builder (decks/actions.ts) when caching a freshly-seen card.

import {
  getScryfallById,
  scryfallImage,
  type ScryfallCard,
} from "./scryfall";
import { getYgoById, ygoImage, type YgoCard } from "./ygoprodeck";
import type { Game } from "./types";

export interface CardRow {
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

export function mtgRow(c: ScryfallCard): CardRow {
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

export function ygoRow(c: YgoCard): CardRow {
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

export async function fetchCardRow(
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
