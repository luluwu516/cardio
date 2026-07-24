"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { csvEscape } from "@/lib/csv";
import {
  pickMtgColors,
  pickSetName,
  pickYgoLevel,
  pickYgoRace,
} from "@/lib/cards/rawFields";
import type { Game } from "@/lib/cards/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// PostgREST caps each request at 1000 rows; loop in chunks ordered by id so
// each window is disjoint (same approach as the collection page loader).
const FETCH_CHUNK = 1000;

// Full self-contained backup of the user's collection. Carries the entire
// cards row (including `raw`) alongside the owned variant/quantity, so a
// restore can rebuild both `cards` and `user_cards` WITHOUT re-hitting the
// YGOPRODeck / Scryfall APIs. The lighter, human-readable per-game export
// (for Excel / Numbers) is built client-side from data already on the page.
const BACKUP_HEADER = [
  "game",
  "external_id",
  "name",
  "type",
  "frame_type",
  "description",
  "image_url",
  "mana_cost",
  "attribute",
  "raw",
  "variant",
  "quantity",
  "created_at",
] as const;

interface BackupJoin {
  quantity: number;
  variant: string;
  created_at: string;
  card: {
    game: string;
    external_id: string;
    name: string;
    type: string | null;
    frame_type: string | null;
    description: string | null;
    image_url: string | null;
    mana_cost: string | null;
    attribute: string | null;
    raw: unknown;
  } | null;
}

export async function exportCollectionBackup(): Promise<string> {
  const { supabase, user } = await requireUser();

  const lines: string[] = [BACKUP_HEADER.join(",")];
  for (let from = 0; ; from += FETCH_CHUNK) {
    const { data, error } = await supabase
      .from("user_cards")
      .select(
        "quantity, variant, created_at, card:cards!inner(game, external_id, name, type, frame_type, description, image_url, mana_cost, attribute, raw)",
      )
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .range(from, from + FETCH_CHUNK - 1);
    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as unknown as BackupJoin[];
    for (const row of chunk) {
      const c = row.card;
      if (!c) continue;
      lines.push(
        [
          c.game,
          csvEscape(c.external_id),
          csvEscape(c.name),
          csvEscape(c.type),
          csvEscape(c.frame_type),
          csvEscape(c.description),
          csvEscape(c.image_url),
          csvEscape(c.mana_cost),
          csvEscape(c.attribute),
          csvEscape(c.raw == null ? "" : JSON.stringify(c.raw)),
          csvEscape(row.variant),
          row.quantity,
          csvEscape(row.created_at),
        ].join(","),
      );
    }
    if (chunk.length < FETCH_CHUNK) break;
  }

  return lines.join("\n");
}

// ─── Restore import ──────────────────────────────────────────────────────────

// One parsed backup row. `raw` is the already-JSON-parsed payload (or null).
// The client parses the CSV and sends rows in small batches to stay under the
// server-action body limit; this action is idempotent so batches are safe.
export interface ImportRow {
  game: string;
  external_id: string;
  name: string;
  type: string | null;
  frame_type: string | null;
  description: string | null;
  image_url: string | null;
  mana_cost: string | null;
  attribute: string | null;
  raw: unknown;
  variant: string;
  quantity: number;
  created_at: string | null;
}

export interface ImportResult {
  cards: number;
  entries: number;
  skipped: number;
}

export async function importCollectionBackup(
  rows: ImportRow[],
): Promise<ImportResult> {
  const { supabase, user } = await requireUser();

  // 1. Rebuild the shared `cards` cache (deduped by game+external_id) straight
  //    from the backup — no API calls. Skip rows missing the identity keys.
  const cardByKey = new Map<
    string,
    {
      game: Game;
      external_id: string;
      name: string;
      type: string | null;
      frame_type: string | null;
      description: string | null;
      image_url: string | null;
      mana_cost: string | null;
      attribute: string | null;
      set_name: string | null;
      race: string | null;
      level: number | null;
      colors: string[] | null;
      raw: unknown;
    }
  >();
  for (const r of rows) {
    if ((r.game !== "YGO" && r.game !== "MTG") || !r.external_id) continue;
    const key = `${r.game}:${r.external_id}`;
    if (cardByKey.has(key)) continue;
    const raw = r.raw ?? null;
    cardByKey.set(key, {
      game: r.game,
      external_id: r.external_id,
      name: r.name,
      type: r.type,
      frame_type: r.frame_type,
      description: r.description,
      image_url: r.image_url,
      mana_cost: r.mana_cost,
      attribute: r.attribute,
      // Derive the same columns the insert path fills (schema.sql keeps them
      // in sync via its backfill) so imported cards sort/filter correctly.
      set_name: pickSetName(r.game, raw),
      race: r.game === "YGO" ? pickYgoRace(raw) : null,
      level: r.game === "YGO" ? pickYgoLevel(raw) : null,
      colors: r.game === "MTG" ? pickMtgColors(raw) : null,
      raw,
    });
  }

  const idByKey = new Map<string, string>();
  if (cardByKey.size > 0) {
    // Insert only the cards that don't exist yet — `ignoreDuplicates` means an
    // existing (shared) card is never overwritten with the client's payload, so
    // one user's import can't poison another user's view of a card. Missing
    // cards are still filled in from the backup, preserving the zero-API
    // restore. (Refreshing a card's data stays the job of applyDelta, which
    // upserts from the authoritative API.)
    const { error: upsertError } = await supabase
      .from("cards")
      .upsert([...cardByKey.values()], {
        onConflict: "game,external_id",
        ignoreDuplicates: true,
      });
    if (upsertError) throw new Error(upsertError.message);

    // Resolve ids for every card in the batch — both freshly inserted and
    // pre-existing (ignoreDuplicates doesn't return the skipped rows). Keyed by
    // game:external_id from the returned rows, so overlapping ids across games
    // stay disambiguated.
    const externalIds = [...cardByKey.values()].map((c) => c.external_id);
    const { data, error } = await supabase
      .from("cards")
      .select("id, game, external_id")
      .in("external_id", externalIds);
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as Array<{
      id: string;
      game: string;
      external_id: string;
    }>) {
      idByKey.set(`${c.game}:${c.external_id}`, c.id);
    }
  }

  // 2. Restore ownership. Dedupe by (card_id, variant) so a single upsert batch
  //    never touches the same conflict target twice (Postgres rejects that),
  //    keeping the last occurrence.
  let skipped = 0;
  const ucByKey = new Map<
    string,
    {
      user_id: string;
      card_id: string;
      variant: string;
      quantity: number;
      created_at?: string;
    }
  >();
  for (const r of rows) {
    const cardId = idByKey.get(`${r.game}:${r.external_id}`);
    const qty = Math.floor(Number(r.quantity));
    if (!cardId || !r.variant || !Number.isFinite(qty) || qty <= 0) {
      skipped += 1;
      continue;
    }
    ucByKey.set(`${cardId}:${r.variant}`, {
      user_id: user.id,
      card_id: cardId,
      variant: r.variant,
      quantity: qty,
      ...(r.created_at ? { created_at: r.created_at } : {}),
    });
  }

  if (ucByKey.size > 0) {
    const { error } = await supabase
      .from("user_cards")
      .upsert([...ucByKey.values()], { onConflict: "user_id,card_id,variant" });
    if (error) throw new Error(error.message);
  }

  return { cards: cardByKey.size, entries: ucByKey.size, skipped };
}

export async function changeQuantity(id: string, delta: number) {
  if (!id || !Number.isFinite(delta) || delta === 0) return;

  const { supabase, user } = await requireUser();

  const { data: row, error } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  // Surface failures instead of silently no-oping. CollectionItem clears its
  // pending delta optimistically before calling this, so a quiet `return`
  // makes the change vanish from the screen with no explanation. Throwing lets
  // the client restore the delta and show the message.
  if (error) throw new Error(error.message);
  if (!row) throw new Error("This card is no longer in your collection.");

  const next = row.quantity + delta;
  const { error: writeError } =
    next <= 0
      ? await supabase.from("user_cards").delete().eq("id", id)
      : await supabase
          .from("user_cards")
          .update({ quantity: next })
          .eq("id", id);
  if (writeError) throw new Error(writeError.message);

  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
}
