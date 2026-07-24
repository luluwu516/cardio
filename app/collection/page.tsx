import Link from "next/link";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { applyAlias } from "@/lib/cards/aliases";
import { CollectionHeading } from "./CollectionHeading";
import { CollectionList } from "./CollectionList";
import type { CollectionRow } from "./types";

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
    description: string | null;
    attribute: string | null;
    set_name: string | null;
    race: string | null;
    level: number | null;
    colors: string[] | null;
  } | null;
}

// PostgREST caps each request at 1000 rows by default (Supabase managed
// instances). Users with bigger collections lose rows past that cap silently —
// the page-level filter/sort runs client-side over whatever subset survived,
// so missing rows just disappear from search results. Loop in 1000-row chunks,
// ordered by `id` so each window is disjoint and stable.
const FETCH_CHUNK = 1000;
// Select the derived columns (set_name/race/level/colors), NOT `raw` — this is
// the landing-page query, and pulling the multi-KB `raw` blob per row was the
// single heaviest cost here. Those columns are filled at insert time from the
// same rawFields helpers (see lib/cards/upsert.ts + schema.sql backfill).
const SELECT_COLS =
  "id, quantity, variant, created_at, card:cards(id, game, external_id, name, type, image_url, description, attribute, set_name, race, level, colors)";

export default async function CollectionPage() {
  const supabase = await createClient();

  const allRows: RawJoin[] = [];
  let error: { message: string } | null = null;
  for (let from = 0; ; from += FETCH_CHUNK) {
    const { data, error: chunkError } = await supabase
      .from("user_cards")
      .select(SELECT_COLS)
      .order("id", { ascending: true })
      .range(from, from + FETCH_CHUNK - 1);
    if (chunkError) {
      error = chunkError;
      break;
    }
    const chunk = (data ?? []) as unknown as RawJoin[];
    allRows.push(...chunk);
    if (chunk.length < FETCH_CHUNK) break;
  }

  // Sort client-side: PostgREST can't order the top-level rows by a column on
  // an embedded relation, and we want the same card's variants (e.g. Foil +
  // Nonfoil of one printing) to sit next to each other rather than being
  // scattered by insertion time.
  const rows: CollectionRow[] = allRows
    .map((r) => ({
      id: r.id,
      quantity: r.quantity,
      variant: r.variant,
      created_at: r.created_at,
      card: r.card
        ? {
            id: r.card.id,
            game: r.card.game,
            external_id: r.card.external_id,
            name: applyAlias(r.card.game, r.card.external_id, r.card.name),
            type: r.card.type,
            image_url: r.card.image_url,
            set: r.card.set_name,
            description: r.card.description,
            attribute: r.card.attribute,
            race: r.card.race,
            level: r.card.level,
            colors: r.card.colors ?? [],
          }
        : null,
    }))
    .sort((a, b) => {
      const an = a.card?.name ?? "";
      const bn = b.card?.name ?? "";
      const byName = an.localeCompare(bn);
      if (byName !== 0) return byName;
      return a.variant.localeCompare(b.variant);
    });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4">
        <CollectionHeading />
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
