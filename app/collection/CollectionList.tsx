"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

type GameFilter = "YGO" | "MTG";
const FILTERS: GameFilter[] = ["YGO", "MTG"];

function parseGameParam(v: string | null): GameFilter {
  return v === "MTG" ? "MTG" : "YGO";
}

export function CollectionList({ rows }: { rows: CollectionRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Seed from URL so navigating back from a card detail page restores the
  // tab/query the user was on.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [gameFilter, setGameFilter] = useState<GameFilter>(() =>
    parseGameParam(searchParams.get("game")),
  );

  // Mirror state → URL (debounced) so the back-navigation restore works.
  useEffect(() => {
    const params = new URLSearchParams();
    if (gameFilter !== "YGO") params.set("game", gameFilter);
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    const target = params.toString() ? `/collection?${params}` : "/collection";
    const t = setTimeout(() => {
      router.replace(target, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [gameFilter, query, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!row.card) return false;
      if (row.card.game !== gameFilter) return false;
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
                    {card.type ? (
                      <p className="truncate text-xs text-zinc-500">
                        {card.type}
                      </p>
                    ) : null}
                    {row.foil ? (
                      <p className="text-xs text-zinc-500">foil</p>
                    ) : null}
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
