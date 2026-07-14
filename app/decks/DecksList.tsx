"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface DeckListRow {
  id: string;
  name: string;
  game: "YGO" | "MTG";
  is_wishlist: boolean;
  updated_at: string;
}

type GameFilter = "YGO" | "MTG";
const FILTERS: GameFilter[] = ["YGO", "MTG"];
type KindFilter = "deck" | "wishlist";

export function DecksList({ decks }: { decks: DeckListRow[] }) {
  const [gameFilter, setGameFilter] = useState<GameFilter>("YGO");
  const [kindFilter, setKindFilter] = useState<KindFilter>("deck");

  const filtered = useMemo(
    () =>
      decks.filter(
        (d) =>
          d.game === gameFilter &&
          d.is_wishlist === (kindFilter === "wishlist"),
      ),
    [decks, gameFilter, kindFilter],
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setGameFilter(f)}
              className={
                "rounded px-3 py-1 text-xs font-medium transition-colors " +
                (gameFilter === f
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "text-zinc-700 dark:text-zinc-300")
              }
            >
              {f}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
          {(["deck", "wishlist"] as KindFilter[]).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={
                "rounded px-3 py-1 text-xs font-medium transition-colors " +
                (kindFilter === k
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "text-zinc-700 dark:text-zinc-300")
              }
            >
              {k === "deck" ? "Decks" : "Wishlists"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No {gameFilter} {kindFilter === "wishlist" ? "wishlists" : "decks"} yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((d) => (
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
                <div className="flex shrink-0 items-center gap-1">
                  {d.is_wishlist ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Wishlist
                    </span>
                  ) : null}
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {d.game}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
