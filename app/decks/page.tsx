import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { createDeck } from "./actions";

interface DeckRow {
  id: string;
  name: string;
  game: "YGO" | "MTG";
  updated_at: string;
  created_at: string;
}

export default async function DecksPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id, name, game, updated_at, created_at")
    .order("updated_at", { ascending: false });

  const decks = (data ?? []) as DeckRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Decks</h1>

      <form
        action={createDeck}
        className="mb-5 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <p className="mb-2 text-sm font-medium">New deck</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Deck name"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            name="game"
            defaultValue="YGO"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="YGO">YGO</option>
            <option value="MTG">MTG</option>
          </select>
          <button className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
            Create
          </button>
        </div>
      </form>

      {error ? (
        <p className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      ) : null}

      {decks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No decks yet — create your first deck above.
        </p>
      ) : (
        <ul className="space-y-2">
          {decks.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <Link
                href={`/decks/${d.id}`}
                className="flex items-center justify-between gap-2 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-zinc-500">
                    Updated {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {d.game}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
