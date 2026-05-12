import Link from "next/link";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { CollectionList, type CollectionRow } from "./CollectionList";

// Pull the most useful printing-set name out of the cached external payload.
// MTG → top-level set_name. YGO → first card_sets entry.
function pickSet(game: string, raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (game === "MTG") {
    return typeof r.set_name === "string"
      ? r.set_name
      : typeof r.set === "string"
        ? r.set
        : null;
  }
  const sets = Array.isArray(r.card_sets)
    ? (r.card_sets as Array<Record<string, unknown>>)
    : [];
  const first = sets[0];
  return first && typeof first.set_name === "string"
    ? (first.set_name as string)
    : null;
}

interface RawJoin {
  id: string;
  quantity: number;
  variant: string;
  created_at: string;
  card: {
    id: string;
    game: "YGO" | "MTG";
    external_id: string;
    name: string;
    type: string | null;
    image_url: string | null;
    raw: unknown;
  } | null;
}

export default async function CollectionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "id, quantity, variant, created_at, card:cards(id, game, external_id, name, type, image_url, raw)",
    )
    .order("created_at", { ascending: false });

  const rows: CollectionRow[] = ((data ?? []) as unknown as RawJoin[]).map(
    (r) => ({
      id: r.id,
      quantity: r.quantity,
      variant: r.variant,
      created_at: r.created_at,
      card: r.card
        ? {
            id: r.card.id,
            game: r.card.game,
            external_id: r.card.external_id,
            name: r.card.name,
            type: r.card.type,
            image_url: r.card.image_url,
            set: pickSet(r.card.game, r.card.raw),
          }
        : null,
    }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Collection</h1>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          <p>No cards yet.</p>
          <Link
            href="/search"
            className="mt-2 inline-block font-medium text-zinc-900 underline dark:text-zinc-100"
          >
            Search and add your first card →
          </Link>
        </div>
      ) : (
        <Suspense fallback={null}>
          <CollectionList rows={rows} />
        </Suspense>
      )}
    </main>
  );
}
