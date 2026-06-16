"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { csvEscape } from "@/lib/csv";

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

export async function changeQuantity(id: string, delta: number) {
  if (!id || !Number.isFinite(delta) || delta === 0) return;

  const { supabase, user } = await requireUser();

  const { data: row, error } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !row) return;

  const next = row.quantity + delta;
  if (next <= 0) {
    await supabase.from("user_cards").delete().eq("id", id);
  } else {
    await supabase.from("user_cards").update({ quantity: next }).eq("id", id);
  }
  revalidatePath("/collection");
  revalidatePath("/cards", "layout");
}
