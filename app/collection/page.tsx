import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { CollectionList, type CollectionRow } from "./CollectionList";

export default async function CollectionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "id, quantity, condition, foil, created_at, card:cards(id, game, external_id, name, type, image_url)",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as CollectionRow[];

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
        <CollectionList rows={rows} />
      )}
    </main>
  );
}
