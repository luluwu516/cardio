"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { SearchInput } from "@/components/SearchInput";
import { changeQuantity, removeFromCollection } from "./actions";

export interface CollectionRow {
  id: string;
  quantity: number;
  condition: string;
  foil: boolean;
  created_at: string;
  card: {
    id: string;
    game: "YGO" | "MTG";
    external_id: string;
    name: string;
    type: string | null;
    image_url: string | null;
  } | null;
}

type GameFilter = "All" | "YGO" | "MTG";
const FILTERS: GameFilter[] = ["All", "YGO", "MTG"];

export function CollectionList({ rows }: { rows: CollectionRow[] }) {
  const [query, setQuery] = useState("");
  const [gameFilter, setGameFilter] = useState<GameFilter>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!row.card) return false;
      if (gameFilter !== "All" && row.card.game !== gameFilter) return false;
      if (q && !row.card.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, gameFilter]);

  return (
    <>
      <div className="mb-3 space-y-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search your collection by name"
        />
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
      </div>

      <p className="mb-2 text-xs text-zinc-500">
        {filtered.length} of {rows.length} card{rows.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No matches.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => {
            const card = row.card!;
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Link
                  href={`/cards/${card.game}/${encodeURIComponent(card.external_id)}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                    {card.image_url ? (
                      <Image
                        src={card.image_url}
                        alt={card.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{card.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {card.game} · {card.type ?? ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {row.condition}
                      {row.foil ? " · foil" : ""}
                    </p>
                  </div>
                </Link>
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
            );
          })}
        </ul>
      )}
    </>
  );
}
