import Image from "next/image";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { changeQuantity, removeFromCollection } from "./actions";

interface CollectionRow {
  id: string;
  quantity: number;
  condition: string;
  foil: boolean;
  created_at: string;
  card: {
    id: string;
    game: "YGO" | "MTG";
    name: string;
    type: string | null;
    image_url: string | null;
  } | null;
}

export default async function CollectionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_cards")
    .select(
      "id, quantity, condition, foil, created_at, card:cards(id, game, name, type, image_url)",
    )
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as CollectionRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Collection</h1>
        <p className="text-sm text-zinc-500">{rows.length} unique</p>
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
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                {row.card?.image_url ? (
                  <Image
                    src={row.card.image_url}
                    alt={row.card?.name ?? ""}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.card?.name ?? "Unknown card"}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {row.card?.game} · {row.card?.type ?? ""}
                </p>
                <p className="text-xs text-zinc-500">
                  {row.condition}
                  {row.foil ? " · foil" : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <form action={changeQuantity}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="delta" value="-1" />
                  <button
                    aria-label="Decrease quantity"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    −
                  </button>
                </form>
                <span className="w-6 text-center text-sm font-medium tabular-nums">
                  {row.quantity}
                </span>
                <form action={changeQuantity}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="delta" value="1" />
                  <button
                    aria-label="Increase quantity"
                    className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    +
                  </button>
                </form>
                <form action={removeFromCollection} className="ml-2">
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    aria-label="Remove from collection"
                    className="h-8 rounded-md border border-zinc-300 px-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
