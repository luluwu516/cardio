import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/BackButton";
import { deleteDeck, renameDeck } from "../actions";

interface Deck {
  id: string;
  name: string;
  game: "YGO" | "MTG";
  format: string | null;
  created_at: string;
  updated_at: string;
}

export default async function DeckEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("decks")
    .select("id, name, game, format, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const deck = data as Deck;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <div className="mb-4">
        <BackButton fallback="/decks" />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {deck.game}
        </span>
        <form action={renameDeck} className="flex flex-1 items-center gap-2">
          <input type="hidden" name="id" value={deck.id} />
          <input
            name="name"
            defaultValue={deck.name}
            required
            maxLength={80}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-base font-medium outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Save
          </button>
        </form>
      </div>

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Main</h2>
          <span className="text-xs text-zinc-500">0 cards</span>
        </div>
        <p className="rounded-md border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
          Card adding lands in Sprint 5.2.
        </p>
      </section>

      <form
        action={deleteDeck}
        className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      >
        <input type="hidden" name="id" value={deck.id} />
        <button className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400">
          Delete deck
        </button>
      </form>
    </main>
  );
}
